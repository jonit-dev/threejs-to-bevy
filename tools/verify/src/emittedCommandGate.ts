import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadAuthoringProject } from "@threenative/authoring";

import { runCommand, summarize, type StepSummary, type VerificationDiagnostic } from "./runner.js";

interface IEmittedCommandCaseResult {
  archetype: string;
  commandCount: number;
  failedCommandCount: number;
  failureRate: number;
  goal: string;
  template: string;
}

interface IGamePlanPayload {
  archetypeSuggestions: Array<{ command: string }>;
  mechanicDecomposition: Array<{ command?: string; cookbookId?: string }>;
  proofCommands: string[];
  steps: Array<{ recipeProofCommands?: string[] }>;
}

const ARCHETYPE_GOALS = [
  { archetype: "top-down", goal: "top down coin collector" },
  { archetype: "third-person", goal: "third-person exploration adventure" },
  { archetype: "first-person", goal: "first-person maze escape" },
  { archetype: "side-scroller", goal: "side-scroller lane runner" },
  { archetype: "racing", goal: "checkpoint kart race with laps and retry" },
] as const;

const TEMPLATES = ["structured-source-starter", "racing-kit-rally-starter"] as const;

export async function runEmittedCommandGate(root = process.cwd()): Promise<{
  cases: IEmittedCommandCaseResult[];
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}> {
  const cliPath = resolve(root, "packages/cli/dist/index.js");
  const reportPath = resolve(root, "tools/verify/artifacts/emitted-commands/verification-report.json");
  const tempRoot = await mkdtemp(resolve(tmpdir(), "tn-emitted-commands-"));
  const cases: IEmittedCommandCaseResult[] = [];
  const diagnostics: VerificationDiagnostic[] = [];
  const steps: StepSummary[] = [];
  const caseFilter = process.env.TN_EMITTED_COMMAND_CASE;
  const keepProjects = process.env.TN_EMITTED_COMMAND_KEEP === "1";

  try {
    for (const template of TEMPLATES) {
      for (const goalCase of ARCHETYPE_GOALS) {
        const caseId = `${template}-${goalCase.archetype}`;
        if (caseFilter !== undefined && caseFilter !== caseId) {
          continue;
        }
        const projectPath = resolve(tempRoot, caseId);
        const create = await runCommand({
          args: [cliPath, "create", projectPath, "--template", template, "--json"],
          command: process.execPath,
          cwd: root,
          name: `${caseId}: create`,
          timeoutMs: 120_000,
        });
        steps.push({ ...summarize(create), name: `${caseId}: create` });
        if (create.exitCode !== 0) {
          diagnostics.push(commandFailure(caseId, "create", create.exitCode, create.stderr || create.stdout));
          cases.push({ archetype: goalCase.archetype, commandCount: 0, failedCommandCount: 1, failureRate: 1, goal: goalCase.goal, template });
          continue;
        }

        const planResult = await runCommand({
          args: [cliPath, "game", "plan", "--goal", goalCase.goal, "--project", ".", "--full-json", "--json"],
          command: process.execPath,
          cwd: projectPath,
          env: { ...process.env, INIT_CWD: projectPath },
          name: `${caseId}: plan`,
          timeoutMs: 120_000,
        });
        steps.push({ ...summarize(planResult), name: `${caseId}: plan` });
        const plan = parsePlan(planResult.stdout);
        if (planResult.exitCode !== 0 || plan === undefined) {
          diagnostics.push(commandFailure(caseId, "plan", planResult.exitCode, planResult.stderr || planResult.stdout || "Plan stdout was not valid JSON."));
          cases.push({ archetype: goalCase.archetype, commandCount: 0, failedCommandCount: 1, failureRate: 1, goal: goalCase.goal, template });
          continue;
        }

        const emittedCommands = [
          ...plan.mechanicDecomposition.flatMap((entry) => entry.command === undefined ? [] : [entry.command]),
          ...plan.archetypeSuggestions.map((entry) => entry.command),
          ...plan.steps.flatMap((step) => step.recipeProofCommands ?? []),
          ...plan.proofCommands,
          ...plan.mechanicDecomposition.flatMap((entry) => entry.cookbookId === undefined ? [] : [`tn cookbook show ${entry.cookbookId} --json`]),
        ];
        let failedCommandCount = 0;
        for (const [index, command] of emittedCommands.entries()) {
          const args = emittedCommandArgs(command);
          const name = `${caseId}: emitted ${index + 1}`;
          if (args === undefined) {
            failedCommandCount += 1;
            diagnostics.push({
              code: "TN_EMITTED_COMMAND_UNPARSEABLE",
              message: `${caseId}: emitted command is not a concrete tn command: ${command}`,
              severity: "error",
              step: name,
              suggestedFix: "Emit a concrete registry-backed command without shell quoting or placeholders.",
            });
            continue;
          }
          const semanticDiagnostic = await validateEmittedCommandSemantics(command, projectPath, caseId, name);
          if (semanticDiagnostic !== undefined) {
            failedCommandCount += 1;
            diagnostics.push(semanticDiagnostic);
            continue;
          }
          const result = await runCommand({
            args: [cliPath, ...args],
            command: process.execPath,
            cwd: projectPath,
            env: { ...process.env, INIT_CWD: projectPath },
            name,
            timeoutMs: 120_000,
          });
          steps.push({ ...summarize(result), name });
          if (result.exitCode !== 0 || !isJsonObject(result.stdout)) {
            failedCommandCount += 1;
            diagnostics.push(commandFailure(caseId, command, result.exitCode, result.stderr || result.stdout || "Command stdout was not exactly one JSON object."));
          }
        }
        cases.push({
          archetype: goalCase.archetype,
          commandCount: emittedCommands.length,
          failedCommandCount,
          failureRate: emittedCommands.length === 0 ? 0 : failedCommandCount / emittedCommands.length,
          goal: goalCase.goal,
          template,
        });
      }
    }
  } finally {
    if (!keepProjects) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: {
      cases,
      emittedCommandCount: cases.reduce((total, item) => total + item.commandCount, 0),
      emittedCommandFailureCount: cases.reduce((total, item) => total + item.failedCommandCount, 0),
      emittedCommandFailureRate: failureRate(cases),
      ...(keepProjects ? { projectRoot: tempRoot } : {}),
    },
    code: ok ? "TN_VERIFY_EMITTED_COMMANDS_OK" : "TN_VERIFY_EMITTED_COMMANDS_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools emittedCommandGate",
    ok,
    schema: "threenative.verify.emitted-commands",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps,
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { cases, diagnostics, ok, reportPath, steps };
}

function emittedCommandArgs(command: string): string[] | undefined {
  if (!command.startsWith("tn ") || command.includes("<") || command.includes("...") || /["']/u.test(command)) {
    return undefined;
  }
  return command.trim().split(/\s+/u).slice(1);
}

function parsePlan(stdout: string): IGamePlanPayload | undefined {
  try {
    const value = JSON.parse(stdout) as Partial<IGamePlanPayload>;
    return Array.isArray(value.archetypeSuggestions) && Array.isArray(value.mechanicDecomposition) && Array.isArray(value.proofCommands) && Array.isArray(value.steps)
      ? value as IGamePlanPayload
      : undefined;
  } catch {
    return undefined;
  }
}

export async function validateEmittedCommandSemantics(
  command: string,
  projectPath: string,
  caseId = "emitted-command",
  step = command,
): Promise<VerificationDiagnostic | undefined> {
  const args = command.trim().split(/\s+/u);
  if (args[0] !== "tn" || args[1] !== "playtest" || !args.includes("--expect-moved")) {
    return undefined;
  }
  const entityFlag = args.indexOf("--entity");
  const entityId = entityFlag === -1 ? undefined : args[entityFlag + 1];
  if (entityId === undefined) {
    return undefined;
  }
  let project;
  try {
    project = await loadAuthoringProject({ projectPath });
  } catch {
    return undefined;
  }
  const entity = project.documents
    .filter((document) => document.kind === "scene")
    .flatMap((document) => {
    const data = isRecord(document.data) ? document.data : undefined;
      const rows = [
        ...(data && Array.isArray(data.entities) ? data.entities : []),
        ...(data && Array.isArray(data.instances) ? data.instances : []),
      ];
      return rows.filter(isRecord);
    })
    .find((candidate) => candidate.id === entityId);
  if (!isStaticObjectiveEntity(entity)) {
    return undefined;
  }
  return {
    code: "TN_EMITTED_COMMAND_SEMANTIC_MISMATCH",
    message: `${caseId}: '${command}' targets static objective entity '${entityId}' with --expect-moved; use a pickup/contact or resource/HUD assertion instead.`,
    severity: "error",
    step,
    suggestedFix: "Use tn playtest scaffold --assert pickup|win-state, or target the movable player entity for --expect-moved.",
  };
}

function isStaticObjectiveEntity(entity: Record<string, unknown> | undefined): boolean {
  if (entity === undefined || typeof entity.id !== "string") {
    return false;
  }
  const id = entity.id.toLowerCase();
  const components = isRecord(entity.components) ? entity.components : {};
  const collider = isRecord(components.Collider) ? components.Collider : isRecord(components.collider) ? components.collider : undefined;
  const trigger = collider?.trigger === true || collider?.sensor !== undefined;
  const objectiveName = /(?:coin|pickup|collectible|goal|target|reward|checkpoint)/u.test(id);
  return trigger || objectiveName;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonObject(stdout: string): boolean {
  try {
    const value = JSON.parse(stdout) as unknown;
    return typeof value === "object" && value !== null && !Array.isArray(value);
  } catch {
    return false;
  }
}

function commandFailure(caseId: string, command: string, exitCode: number, output: string): VerificationDiagnostic {
  return {
    code: "TN_EMITTED_COMMAND_FAILED",
    message: `${caseId}: '${command}' failed with exit code ${exitCode}.`,
    severity: "error",
    step: command,
    suggestedFix: output.trim().slice(-2000) || "Run the emitted command directly and fix its owning registry or descriptor.",
  };
}

function failureRate(cases: readonly IEmittedCommandCaseResult[]): number {
  const count = cases.reduce((total, item) => total + item.commandCount, 0);
  const failures = cases.reduce((total, item) => total + item.failedCommandCount, 0);
  return count === 0 ? 0 : failures / count;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runEmittedCommandGate();
  process.stdout.write(`${JSON.stringify({
    code: result.ok ? "TN_VERIFY_EMITTED_COMMANDS_OK" : "TN_VERIFY_EMITTED_COMMANDS_FAILED",
    emittedCommandFailureRate: failureRate(result.cases),
    ok: result.ok,
    reportPath: result.reportPath,
  }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
