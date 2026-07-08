import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { resolveArtifactTargets } from "./artifacts.js";
import { runCommand, summarize, type CommandResult, type StepSummary, type VerificationDiagnostic } from "./runner.js";
import { deriveRetryChainMetrics, type CommandOutputForMetrics } from "./sessionMetrics.js";

export interface SessionCostReplayCase {
  archetype?: string;
  authoring?: "structured-source" | "typed-spec";
  goal?: string;
  id: string;
  kind: "archetype" | "recipe";
  playtest?: boolean;
  scenario?: string;
}

export interface SessionCostMeasurement {
  acceptance?: SessionCostAcceptanceProof;
  failedCommandCount: number;
  id: string;
  identicalAssertionRepeatCount: number;
  iterateOutputBytes: number;
  kind: SessionCostReplayCase["kind"];
  manualEditCount: number;
  maxConsecutiveSameDiagnostic: number;
  projectPath?: string;
  toolStepCount: number;
}

export interface SessionCostAcceptanceProof {
  authoredScenarios: 0;
  build: "pass" | "missing" | "skip";
  gamePlanApply: "pass" | "missing" | "skip";
  manualEdits: 0;
  playtest: "pass" | "missing" | "skip";
  scaffold: "pass" | "missing";
  scenario?: string;
}

export interface SessionCostGateOptions {
  cases?: readonly SessionCostReplayCase[];
  keepProjects?: boolean;
  reportPath?: string;
  root?: string;
  run?: typeof runCommand;
  thresholds?: Partial<SessionCostThresholds>;
}

export interface SessionCostGateResult {
  diagnostics: VerificationDiagnostic[];
  measurements: SessionCostMeasurement[];
  ok: boolean;
  reportPath: string;
  steps: StepSummary[];
}

export interface SessionCostThresholds {
  failedCommandCount: 0;
  identicalAssertionRepeatCount: 0;
  iterateOutputBytes: number;
  maxConsecutiveSameDiagnostic: number;
  toolStepCount: number;
}

const DEFAULT_THRESHOLDS: SessionCostThresholds = {
  failedCommandCount: 0,
  identicalAssertionRepeatCount: 0,
  iterateOutputBytes: 2 * 1024,
  maxConsecutiveSameDiagnostic: 1,
  toolStepCount: 12,
};

const DEFAULT_CASES: readonly SessionCostReplayCase[] = [
  { archetype: "top-down", id: "archetype-top-down", kind: "archetype" },
  { archetype: "third-person", id: "archetype-third-person", kind: "archetype" },
  { archetype: "first-person", id: "archetype-first-person", kind: "archetype" },
  { archetype: "side-scroller", id: "archetype-side-scroller", kind: "archetype" },
  { archetype: "racing", id: "archetype-racing", kind: "archetype" },
  { goal: "top down coin collector", id: "recipe-top-down-collector", kind: "recipe" },
  {
    authoring: "typed-spec",
    goal: "top down coin collector",
    id: "typed-spec-recipe-top-down-collector",
    kind: "recipe",
    playtest: true,
  },
  { goal: "lane runner with coins", id: "recipe-lane-runner", kind: "recipe" },
];

export async function runSessionCostGate(options: SessionCostGateOptions = {}): Promise<SessionCostGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const run = options.run ?? runCommand;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const targets = resolveArtifactTargets({ gate: "session-cost", owner: { kind: "aggregate", name: "session-cost" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const tempRoot = await mkdtemp(resolve(tmpdir(), "tn-session-cost-"));
  const diagnostics: VerificationDiagnostic[] = [];
  const measurements: SessionCostMeasurement[] = [];
  const steps: StepSummary[] = [];

  try {
    for (const replayCase of options.cases ?? DEFAULT_CASES) {
      const projectPath = resolve(tempRoot, replayCase.id);
      const measurement = await runReplayCase({
        diagnostics,
        projectPath,
        replayCase,
        root,
        run,
        steps,
        thresholds,
      });
      measurements.push(options.keepProjects === true ? measurement : { ...measurement, projectPath: undefined });
    }
  } finally {
    if (options.keepProjects !== true) {
      await rm(tempRoot, { force: true, recursive: true });
    }
  }

  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: {
      measurements,
      thresholds,
      ...(options.keepProjects === true ? { projectRoot: tempRoot } : {}),
    },
    code: ok ? "TN_VERIFY_SESSION_COST_OK" : "TN_VERIFY_SESSION_COST_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools sessionCostGate",
    ok,
    schema: "threenative.verify.session-cost",
    startedAt: new Date().toISOString(),
    status: ok ? "pass" : "fail",
    steps,
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");

  return { diagnostics, measurements, ok, reportPath, steps };
}

async function runReplayCase(options: {
  diagnostics: VerificationDiagnostic[];
  projectPath: string;
  replayCase: SessionCostReplayCase;
  root: string;
  run: typeof runCommand;
  steps: StepSummary[];
  thresholds: SessionCostThresholds;
}): Promise<SessionCostMeasurement> {
  let failedCommandCount = 0;
  let iterateOutputBytes = 0;
  let toolStepCount = 0;
  const commandOutputs: CommandOutputForMetrics[] = [];
  const completedSteps = new Map<string, CommandResult>();

  const runStep = async (name: string, args: readonly string[]): Promise<CommandResult> => {
    toolStepCount += 1;
    const result = await options.run({ args, command: process.execPath, cwd: options.root, name, timeoutMs: 120_000 });
    options.steps.push({ ...summarize(result), name });
    completedSteps.set(name, result);
    if (result.exitCode !== 0) {
      failedCommandCount += 1;
      options.diagnostics.push({
        code: "TN_VERIFY_SESSION_COST_COMMAND_FAILED",
        message: `${options.replayCase.id}: deterministic replay step '${name}' failed with exit code ${result.exitCode}.`,
        severity: "error",
        step: name,
        suggestedFix: "Fix the scaffold, recipe, or iterate command so the golden path runs without an agent repair loop.",
      });
    }
    commandOutputs.push({
      failed: result.exitCode !== 0,
      output: result.stdout.trim() !== "" ? result.stdout : result.stderr,
    });
    return result;
  };

  const createArgs = options.replayCase.kind === "archetype"
    ? cli(options.root, "create", options.projectPath, "--archetype", options.replayCase.archetype ?? "", "--json")
    : cli(options.root, "create", options.projectPath, ...authoringArgs(options.replayCase), "--json");
  const create = await runStep(`${options.replayCase.id}: create`, createArgs);
  if (create.exitCode === 0 && options.replayCase.kind === "recipe") {
    await runStep(`${options.replayCase.id}: game plan apply`, cli(options.root, "game", "plan", "--goal", options.replayCase.goal ?? "", "--project", options.projectPath, "--apply", "--json"));
  }
  if (failedCommandCount === 0) {
    const iterate = await runStep(`${options.replayCase.id}: iterate`, cli(options.root, "iterate", "--project", options.projectPath, ...iterateProofArgs(options.replayCase), "--json"));
    iterateOutputBytes = Buffer.byteLength(iterate.stdout, "utf8");
    validateIterateSummary(options.replayCase, iterate, options.diagnostics);
  }

  const retryChains = deriveRetryChainMetrics(commandOutputs);
  const acceptance = buildAcceptanceProof(options.replayCase, completedSteps);
  const measurement: SessionCostMeasurement = {
    ...(acceptance === undefined ? {} : { acceptance }),
    failedCommandCount,
    id: options.replayCase.id,
    identicalAssertionRepeatCount: retryChains.identicalAssertionRepeatCount,
    iterateOutputBytes,
    kind: options.replayCase.kind,
    manualEditCount: 0,
    maxConsecutiveSameDiagnostic: retryChains.maxConsecutiveSameDiagnostic,
    projectPath: options.projectPath,
    toolStepCount,
  };
  validateThresholds(measurement, options.thresholds, options.diagnostics);
  validateAcceptanceProof(measurement, options.diagnostics);
  return measurement;
}

function buildAcceptanceProof(replayCase: SessionCostReplayCase, completedSteps: Map<string, CommandResult>): SessionCostAcceptanceProof | undefined {
  if (replayCase.authoring !== "typed-spec" || replayCase.kind !== "recipe" || replayCase.playtest !== true) {
    return undefined;
  }
  const create = completedSteps.get(`${replayCase.id}: create`);
  const apply = completedSteps.get(`${replayCase.id}: game plan apply`);
  const iterate = completedSteps.get(`${replayCase.id}: iterate`);
  const iterateJson = iterate === undefined ? undefined : parseJson(iterate.stdout);
  return {
    authoredScenarios: 0,
    build: iterateJson?.code === "TN_ITERATE_OK" && iterateJson.ok === true ? "pass" : iterate === undefined ? "missing" : "skip",
    gamePlanApply: apply?.exitCode === 0 ? "pass" : apply === undefined ? "missing" : "skip",
    manualEdits: 0,
    playtest: iterateJson?.code === "TN_ITERATE_OK" && iterateJson.ok === true ? "pass" : iterate === undefined ? "missing" : "skip",
    scaffold: create?.exitCode === 0 ? "pass" : "missing",
    ...(replayCase.scenario === undefined ? {} : { scenario: replayCase.scenario }),
  };
}

function validateAcceptanceProof(measurement: SessionCostMeasurement, diagnostics: VerificationDiagnostic[]): void {
  const proof = measurement.acceptance;
  if (proof === undefined) {
    return;
  }
  if (proof.scaffold !== "pass" || proof.gamePlanApply !== "pass" || proof.build !== "pass" || proof.playtest !== "pass" || proof.manualEdits !== 0 || proof.authoredScenarios !== 0) {
    diagnostics.push({
      code: "TN_VERIFY_SESSION_COST_ACCEPTANCE_FAILED",
      message: `${measurement.id}: typed-spec scaffold/apply/build/playtest acceptance proof did not pass.`,
      severity: "error",
      step: measurement.id,
      suggestedFix: "Fix the deterministic typed-spec recipe path before collecting fresh benchmark repeats.",
    });
  }
}

function authoringArgs(replayCase: SessionCostReplayCase): string[] {
  return replayCase.authoring === undefined || replayCase.authoring === "structured-source" ? [] : ["--authoring", replayCase.authoring];
}

function iterateProofArgs(replayCase: SessionCostReplayCase): string[] {
  if (replayCase.playtest === true) {
    return [];
  }
  return ["--skip-playtest"];
}

function validateThresholds(measurement: SessionCostMeasurement, thresholds: SessionCostThresholds, diagnostics: VerificationDiagnostic[]): void {
  if (measurement.toolStepCount > thresholds.toolStepCount) {
    diagnostics.push({
      code: "TN_VERIFY_SESSION_COST_TOOL_STEP_BUDGET_EXCEEDED",
      message: `${measurement.id}: used ${measurement.toolStepCount} tool steps; budget is ${thresholds.toolStepCount}.`,
      severity: "error",
      step: measurement.id,
      suggestedFix: "Collapse the deterministic scaffold path or move repeated setup into one bounded CLI command.",
    });
  }
  if (measurement.failedCommandCount > thresholds.failedCommandCount) {
    diagnostics.push({
      code: "TN_VERIFY_SESSION_COST_FAILED_COMMANDS",
      message: `${measurement.id}: had ${measurement.failedCommandCount} failed command(s); budget is ${thresholds.failedCommandCount}.`,
      severity: "error",
      step: measurement.id,
      suggestedFix: "Fix the first failing deterministic command before rerunning the session-cost gate.",
    });
  }
  if (measurement.iterateOutputBytes > thresholds.iterateOutputBytes) {
    diagnostics.push({
      code: "TN_VERIFY_SESSION_COST_ITERATE_OUTPUT_BUDGET_EXCEEDED",
      message: `${measurement.id}: iterate wrote ${measurement.iterateOutputBytes} stdout bytes; budget is ${thresholds.iterateOutputBytes}.`,
      severity: "error",
      step: measurement.id,
      suggestedFix: "Keep tn iterate stdout compact and move deep details to artifact files.",
    });
  }
  if (measurement.maxConsecutiveSameDiagnostic > thresholds.maxConsecutiveSameDiagnostic) {
    diagnostics.push({
      code: "TN_VERIFY_SESSION_COST_RETRY_CHAIN_EXCEEDED",
      message: `${measurement.id}: repeated the same diagnostic ${measurement.maxConsecutiveSameDiagnostic} time(s); budget is ${thresholds.maxConsecutiveSameDiagnostic}.`,
      severity: "error",
      step: measurement.id,
      suggestedFix: "Stop retrying unchanged failing commands; inspect the first diagnostic and apply its suggested fix before rerunning.",
    });
  }
  if (measurement.identicalAssertionRepeatCount > thresholds.identicalAssertionRepeatCount) {
    diagnostics.push({
      code: "TN_VERIFY_SESSION_COST_ASSERTION_REPEAT_EXCEEDED",
      message: `${measurement.id}: repeated ${measurement.identicalAssertionRepeatCount} identical failed playtest assertion(s); budget is ${thresholds.identicalAssertionRepeatCount}.`,
      severity: "error",
      step: measurement.id,
      suggestedFix: "Use the latest playtest artifact diagnostics before rerunning the same scenario unchanged.",
    });
  }
}

function validateIterateSummary(replayCase: SessionCostReplayCase, result: CommandResult, diagnostics: VerificationDiagnostic[]): void {
  if (result.exitCode !== 0) {
    return;
  }
  const parsed = parseJson(result.stdout);
  if (parsed?.ok !== true || parsed.code !== "TN_ITERATE_OK") {
    diagnostics.push({
      code: "TN_VERIFY_SESSION_COST_ITERATE_NOT_OK",
      message: `${replayCase.id}: iterate summary did not report TN_ITERATE_OK.`,
      severity: "error",
      step: `${replayCase.id}: iterate`,
      suggestedFix: "Inspect artifacts/iterate/latest/report.json for the owning validate/build/screenshot failure.",
    });
  }
}

function cli(root: string, ...args: string[]): string[] {
  return [resolve(root, "packages/cli/dist/index.js"), ...args];
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = await runSessionCostGate({ keepProjects: process.argv.includes("--keep-projects") });
  process.stdout.write(`${JSON.stringify({
    diagnostics: result.diagnostics,
    measurements: result.measurements,
    ok: result.ok,
    reportPath: result.reportPath,
  }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
