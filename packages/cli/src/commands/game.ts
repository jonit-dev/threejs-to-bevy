import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import {
  applyAuthoringRecipe,
  createGameQualityReport,
  GAME_WORKFLOW_PHASE_IDS,
  listAuthoringRecipeIds,
  loadAuthoringProject,
  probeGameAssetProviders,
  validateGameQualityReport,
  type GameProductionMode,
  type IGameWorkflowReport,
} from "@threenative/authoring";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { buildCommand } from "./build.js";
import { doctorCommand } from "./doctor.js";
import { playtestCommand } from "./playtest.js";
import { recordCommand, screenshotCommand } from "./visualProof.js";

interface IGamePlanStep {
  id: string;
  phase: string;
  recipe?: string;
  recipeArgs?: Record<string, unknown>;
  command?: string;
  apply: boolean;
  summary: string;
}

interface IGamePlan {
  code: "TN_GAME_PLAN";
  diagnostics: unknown[];
  goal: string;
  message: string;
  mutate: false;
  phases: Array<{ id: string; order: number; summary: string }>;
  proofCommands: string[];
  recipeIds: string[];
  steps: IGamePlanStep[];
}

interface IGameProofStepSpec {
  args: readonly string[];
  command: "artifact-check" | "build" | "doctor" | "playtest" | "record" | "screenshot";
  id: string;
  phase: "debug" | "gameplay" | "qa" | "release" | "ui" | "visuals";
  required: boolean;
  summary: string;
}

interface IGameProofStepResult {
  args: readonly string[];
  code: string;
  command: string;
  diagnostics: Array<{ code: string; message: string; phase: string; severity: "error" | "warning"; suggestedFix?: string }>;
  durationMs: number;
  exitCode: number;
  id: string;
  phase: string;
  stderr: string;
  stdout: string;
  summary: string;
}

interface IGameProofRun {
  diagnostics: Array<{ code: string; message: string; phase: string; severity: "error" | "warning"; suggestedFix?: string }>;
  ok: boolean;
  steps: IGameProofStepResult[];
}

interface IGameCommandOptions {
  proofRunner?: (step: IGameProofStepSpec, options: { projectPath: string }) => Promise<ICommandResult>;
}

export async function gameCommand(argv: readonly string[], options: IGameCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const [subcommand] = normalizedArgv;
  const json = normalizedArgv.includes("--json");

  if (subcommand === undefined || subcommand === "--help" || subcommand === "-h") {
    return {
      exitCode: 0,
      stdout: renderGameHelp(json),
    };
  }

  if (subcommand === "providers") {
    return gameProvidersCommand(normalizedArgv.slice(1));
  }
  if (subcommand === "score") {
    return gameScoreCommand(normalizedArgv.slice(1), "score", options);
  }
  if (subcommand === "qa") {
    return gameScoreCommand(normalizedArgv.slice(1), "qa", options);
  }
  if (subcommand === "release") {
    return gameScoreCommand(normalizedArgv.slice(1), "release", options);
  }
  if (subcommand === "plan") {
    return gamePlanCommand(normalizedArgv.slice(1));
  }
  if (subcommand === "improve") {
    return gameImproveCommand(normalizedArgv.slice(1));
  }

  return diagnosticResult(
    {
      code: "TN_GAME_SUBCOMMAND_UNKNOWN",
      message: `Unknown game workflow subcommand '${subcommand}'.`,
      subcommand,
      usage: "tn game <plan|improve|providers|score|qa|release> [--project <path>] [--json]",
    },
    { exitCode: 1, json, stderr: !json },
  );
}

async function gameScoreCommand(argv: readonly string[], mode: GameProductionMode, options: IGameCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  const proofRun = mode === "qa" && normalizedArgv.includes("--run-proof")
    ? await runGameQaProof(normalizedArgv, projectPath, options)
    : undefined;
  const report = await createGameQualityReport({ mode, projectPath, providerEnvironment: process.env });
  const validationDiagnostics = validateGameQualityReport(report);
  const payload = validationDiagnostics.length === 0
    ? report
    : {
        ...report,
        diagnostics: [...report.diagnostics, ...validationDiagnostics],
        ok: false,
      };

  const withProofRun = proofRun === undefined ? payload : { ...payload, proofRun };

  if (mode === "qa" || mode === "release") {
    const out = readFlag(normalizedArgv, "--out") ?? `artifacts/game-production/${mode}-report.json`;
    const outPath = isAbsolute(out) ? out : resolve(projectPath, out);
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(withProofRun, null, 2)}\n`, "utf8");
    const withArtifact = {
      ...withProofRun,
      reportPath: outPath,
    };
    return {
      exitCode: withArtifact.ok ? 0 : 1,
      stdout: json ? `${JSON.stringify(withArtifact, null, 2)}\n` : renderReport(withArtifact),
    };
  }

  return {
    exitCode: payload.ok ? 0 : 1,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderReport(payload),
  };
}

async function gameProvidersCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const payload = {
    code: "TN_GAME_PROVIDER_PROBES",
    message: "Optional game asset/audio generation providers are local tooling only; credential values are redacted.",
    providers: probeGameAssetProviders(process.env),
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

async function gamePlanCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const goal = readFlag(normalizedArgv, "--goal");
  const projectPath = resolveProjectPath(normalizedArgv);
  if (goal === undefined || goal.trim() === "") {
    return diagnosticResult(
      {
        code: "TN_GAME_PLAN_GOAL_MISSING",
        message: "tn game plan requires --goal <text>.",
        suggestedFix: "Run tn game plan --goal \"arcade collector\" --json.",
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const recipeIds = listAuthoringRecipeIds();
  const defaults = await inferPlanDefaults(projectPath);
  const plan: IGamePlan = {
    code: "TN_GAME_PLAN",
    diagnostics: [],
    goal,
    message: "Deterministic game-production plan generated without mutating source.",
    mutate: false,
    phases: GAME_WORKFLOW_PHASE_IDS.map((id, index) => ({ id, order: index + 1, summary: phaseSummary(id) })),
    proofCommands: [
      "tn authoring validate --project . --json",
      "tn build --project . --json",
      "tn playtest --project . --entity <player-id> --press KeyboardEvent.code --frames 30 --expect-moved --json",
      "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json",
      "tn game score --project . --json",
      "tn game qa --project . --json",
      "tn game release --project . --json",
    ],
    recipeIds,
    steps: [
      {
        apply: true,
        id: "playable-loop",
        phase: "gameplay",
        recipe: "third-person-controller",
        recipeArgs: {
          cameraId: defaults.cameraId,
          entityId: defaults.playerId,
          sceneId: defaults.sceneId,
        },
        summary: "Create or verify a player verb, objective, input path, camera, and feedback loop.",
      },
      {
        apply: true,
        id: "collectible-or-goal",
        phase: "gameplay",
        recipe: "collectible",
        recipeArgs: {
          entityId: "goal",
          sceneId: defaults.sceneId,
        },
        summary: "Add a concrete objective or reward target that changes state.",
      },
      { apply: false, id: "ui-states", phase: "ui", command: "tn ui ... --json", summary: "Represent gameplay, pause, settings, loading, fail/retry, win/milestone, and touch-control states in retained UI source." },
      { apply: false, id: "asset-ledger", phase: "assets", command: "tn asset add ... --json", summary: "Record local, procedural, generated, hybrid, or blocked sourcing for player/world/reward/UI/audio surfaces." },
      { apply: false, id: "proof", phase: "qa", command: "tn game qa --project . --json", summary: "Collect screenshot, mobile, playtest, performance, and release evidence before claiming done." },
    ],
  };

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(plan, null, 2)}\n` : renderPlan(plan),
  };
}

async function gameImproveCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  const planPath = readFlag(normalizedArgv, "--apply-plan");
  if (planPath === undefined) {
    return diagnosticResult(
      {
        code: "TN_GAME_IMPROVE_PLAN_MISSING",
        message: "tn game improve requires --apply-plan <file>.",
        suggestedFix: "Generate a plan with tn game plan --goal <text> --json > artifacts/game-production/plan.json, then pass it to --apply-plan.",
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const absolutePlanPath = isAbsolute(planPath) ? planPath : resolve(projectPath, planPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(absolutePlanPath, "utf8")) as unknown;
  } catch (error) {
    return diagnosticResult(
      {
        code: "TN_GAME_IMPROVE_PLAN_READ_FAILED",
        message: `Unable to read apply plan: ${error instanceof Error ? error.message : String(error)}.`,
        path: absolutePlanPath,
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  if (!isRecord(parsed) || parsed.code !== "TN_GAME_PLAN" || parsed.mutate !== false || !Array.isArray(parsed.steps)) {
    return diagnosticResult(
      {
        code: "TN_GAME_IMPROVE_PLAN_INVALID",
        message: "Apply plan must be a JSON object produced by tn game plan and must preserve mutate:false.",
        path: absolutePlanPath,
        suggestedFix: "Regenerate the plan with tn game plan --goal <text> --json.",
      },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const steps = parsed.steps.filter((step): step is Record<string, unknown> => isRecord(step) && step.apply === true);
  const unsupported = steps.filter((step) => typeof step.recipe !== "string" || !isRecord(step.recipeArgs));
  const applied = [];
  const diagnostics: Array<{
    code: string;
    message: string;
    path?: string;
    severity: "error" | "info" | "warning";
    value?: unknown;
  }> = unsupported.map((step, index) => ({
    code: "TN_GAME_IMPROVE_UNSUPPORTED_OPERATION",
    message: "Only structured recipe steps can be applied by tn game improve in this workflow slice.",
    path: `/steps/${index}`,
    severity: "error" as const,
    value: step,
  }));

  if (unsupported.length === 0) {
    for (const [index, step] of steps.entries()) {
      const result = await applyAuthoringRecipe({
        args: step.recipeArgs as Record<string, unknown>,
        projectPath,
        recipeId: step.recipe as string,
      });
      applied.push({
        changed: result.changed,
        filesWritten: result.filesWritten,
        index,
        ok: result.ok,
        recipe: step.recipe,
      });
      diagnostics.push(...result.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        path: diagnostic.path,
        severity: diagnostic.severity,
        value: diagnostic.value,
      })));
      if (!result.ok) {
        break;
      }
    }
  }
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const payload = {
    applied,
    code: ok ? "TN_GAME_IMPROVE_APPLIED" : "TN_GAME_IMPROVE_FAILED",
    diagnostics,
    message: ok ? "Plan recipe steps applied through bounded authoring operations." : "Plan application failed.",
    ok,
    planPath: absolutePlanPath,
    projectPath,
  };

  return {
    exitCode: payload.ok ? 0 : 1,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

function renderGameHelp(json: boolean): string {
  const payload = {
    commands: [
      "tn game plan --goal <text> [--project <path>] [--json]",
      "tn game improve --apply-plan <file> [--project <path>] [--json]",
      "tn game providers [--json]",
      "tn game score [--project <path>] [--json]",
      "tn game qa [--project <path>] [--run-proof] [--url <preview-url>] [--entity <id>] [--press <KeyboardEvent.code>] [--record] [--out <file>] [--json]",
      "tn game release [--project <path>] [--out <file>] [--json]",
    ],
    message: "ThreeNative game-production workflow commands.",
  };
  if (json) {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
  return `${payload.message}\n\n${payload.commands.map((command) => `  ${command}`).join("\n")}\n`;
}

function renderReport(report: IGameWorkflowReport & { reportPath?: string }): string {
  const phaseRows = report.phaseLedgers.map((phase) => `  ${phase.id}: ${phase.status} (${phase.score})`).join("\n");
  const artifact = report.reportPath === undefined ? "" : `\nReport: ${report.reportPath}\n`;
  return `Game production ${report.mode}: ${report.ok ? "PASS" : "FAIL"}\n${artifact}\nPhases:\n${phaseRows}\n\nDiagnostics: ${report.diagnostics.length}\n`;
}

function renderPlan(plan: IGamePlan): string {
  return `${plan.message}\n\nPhases:\n${plan.phases.map((phase) => `  ${phase.order}. ${phase.id}: ${phase.summary}`).join("\n")}\n\nProof:\n${plan.proofCommands.map((command) => `  ${command}`).join("\n")}\n`;
}

function resolveProjectPath(argv: readonly string[]): string {
  const project = readFlag(argv, "--project") ?? ".";
  const cwd = process.env.INIT_CWD ?? process.cwd();
  return isAbsolute(project) ? project : resolve(cwd, project);
}

function phaseSummary(id: string): string {
  const summaries: Record<string, string> = {
    assets: "Record local/procedural/generated/blocked asset and audio provenance.",
    debug: "Inspect authoring, runtime, browser, and asset diagnostics.",
    gameplay: "Prove real input changes game state through a playable loop.",
    qa: "Collect screenshot, mobile, interaction, and performance evidence.",
    release: "Check build artifacts, bundle budgets, debug helper risks, and residual release blockers.",
    ui: "Cover HUD, pause, settings, loading, fail/retry, win/milestone, and touch controls.",
    visuals: "Score art direction, player/world/reward surfaces, materials, lighting, VFX, UI, and performance.",
  };
  return summaries[id] ?? id;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  return argv[index + 1];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function inferPlanDefaults(projectPath: string): Promise<{ cameraId: string; playerId: string; sceneId: string }> {
  const project = await loadAuthoringProject({ projectPath });
  const scene = project.documents.find((document) => document.kind === "scene" && isRecord(document.data));
  const sceneData = isRecord(scene?.data) ? scene.data : {};
  const entities = Array.isArray(sceneData.entities) ? sceneData.entities.filter(isRecord) : [];
  const player = entities.find((entity) => typeof entity.id === "string" && entity.id.toLowerCase().includes("player"));
  const camera = entities.find((entity) => typeof entity.id === "string" && entity.id.toLowerCase().includes("camera"));
  return {
    cameraId: typeof camera?.id === "string" ? camera.id : "camera.main",
    playerId: typeof player?.id === "string" ? player.id : "player",
    sceneId: typeof sceneData.id === "string" ? sceneData.id : "arena",
  };
}

async function runGameQaProof(argv: readonly string[], projectPath: string, options: IGameCommandOptions): Promise<IGameProofRun> {
  const steps = buildQaProofSteps(argv);
  const results: IGameProofStepResult[] = [];
  for (const step of steps) {
    const startedAt = Date.now();
    const result = await (options.proofRunner ?? runDefaultProofStep)(step, { projectPath });
    results.push({
      args: step.args,
      code: readResultCode(result) ?? (result.exitCode === 0 ? "TN_GAME_QA_STEP_OK" : "TN_GAME_QA_STEP_FAILED"),
      command: step.command,
      diagnostics: proofStepDiagnostics(step, result),
      durationMs: Date.now() - startedAt,
      exitCode: result.exitCode,
      id: step.id,
      phase: step.phase,
      stderr: result.stderr ?? "",
      stdout: result.stdout,
      summary: step.summary,
    });
  }
  const diagnostics = results.flatMap((result) => result.diagnostics);
  return {
    diagnostics,
    ok: diagnostics.every((diagnostic) => diagnostic.severity !== "error"),
    steps: results,
  };
}

function buildQaProofSteps(argv: readonly string[]): IGameProofStepSpec[] {
  const url = readFlag(argv, "--url");
  const entity = readFlag(argv, "--entity");
  const press = readFlag(argv, "--press");
  const frames = readFlag(argv, "--frames") ?? "30";
  const steps: IGameProofStepSpec[] = [
    {
      args: ["--project", ".", "--json"],
      command: "doctor",
      id: "doctor",
      phase: "debug",
      required: true,
      summary: "Inspect project setup, source entrypoint, bundle files, and optional preview diagnostics.",
    },
    {
      args: ["--project", ".", "--json"],
      command: "build",
      id: "build",
      phase: "release",
      required: true,
      summary: "Build the project bundle before visual and interaction proof.",
    },
    entity !== undefined && press !== undefined
      ? {
          args: ["--project", ".", "--entity", entity, "--press", press, "--frames", frames, "--expect-moved", "--json"],
          command: "playtest",
          id: "playtest",
          phase: "gameplay",
          required: true,
          summary: "Run web input proof and assert the main input path changes state.",
        }
      : missingArgumentStep("playtest", "gameplay", "tn game qa --run-proof requires --entity and --press to execute playtest proof."),
    url !== undefined
      ? {
          args: ["--project", ".", "--url", url, "--out", "artifacts/game-production/screenshot.png", "--wait-ready", "--json"],
          command: "screenshot",
          id: "screenshot",
          phase: "visuals",
          required: true,
          summary: "Capture nonblank screenshot proof from a running web preview.",
        }
      : missingArgumentStep("screenshot", "visuals", "tn game qa --run-proof requires --url to execute screenshot proof."),
    argv.includes("--record") && url !== undefined
      ? {
          args: ["--project", ".", "--url", url, "--out", "artifacts/game-production/clip.webm", "--duration", readFlag(argv, "--duration") ?? "5", "--json"],
          command: "record",
          id: "record",
          phase: "qa",
          required: false,
          summary: "Capture short motion proof from a running web preview.",
        }
      : {
          args: ["artifacts/game-production/clip.webm"],
          command: "artifact-check",
          id: "record",
          phase: "qa",
          required: false,
          summary: "Check for existing motion proof artifact.",
        },
    {
      args: ["artifacts/game-production/mobile-viewport.json"],
      command: "artifact-check",
      id: "mobile-viewport",
      phase: "qa",
      required: true,
      summary: "Check mobile viewport proof artifact.",
    },
    {
      args: ["artifacts/game-production/performance.json"],
      command: "artifact-check",
      id: "performance",
      phase: "qa",
      required: true,
      summary: "Check performance snapshot artifact.",
    },
    {
      args: ["artifacts/game-production/ui-fit.json"],
      command: "artifact-check",
      id: "ui-fit",
      phase: "ui",
      required: true,
      summary: "Check UI fit and safe-area proof artifact.",
    },
  ];
  return steps;
}

function missingArgumentStep(id: string, phase: IGameProofStepSpec["phase"], summary: string): IGameProofStepSpec {
  return {
    args: [],
    command: "artifact-check",
    id,
    phase,
    required: true,
    summary,
  };
}

async function runDefaultProofStep(step: IGameProofStepSpec, options: { projectPath: string }): Promise<ICommandResult> {
  if (step.args.length === 0) {
    return {
      exitCode: 1,
      stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARGUMENT_MISSING", message: step.summary }, null, 2)}\n`,
    };
  }
  if (step.command === "doctor") {
    return doctorCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "build") {
    return buildCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "playtest") {
    return playtestCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "screenshot") {
    return screenshotCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  if (step.command === "record") {
    return recordCommand(rewriteProjectArg(step.args, options.projectPath));
  }
  const artifact = step.args[0];
  if (artifact === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const artifactPath = isAbsolute(artifact) ? artifact : resolve(options.projectPath, artifact);
  try {
    await access(artifactPath);
    return {
      exitCode: 0,
      stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_OK", artifactPath, message: `${step.id} artifact found.` }, null, 2)}\n`,
    };
  } catch {
    return {
      exitCode: step.required ? 1 : 0,
      stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_MISSING", artifactPath, message: `${step.id} artifact is missing.` }, null, 2)}\n`,
    };
  }
}

function rewriteProjectArg(args: readonly string[], projectPath: string): string[] {
  const rewritten = [...args];
  const index = rewritten.indexOf("--project");
  if (index !== -1) {
    rewritten[index + 1] = projectPath;
  }
  return rewritten;
}

function proofStepDiagnostics(
  step: IGameProofStepSpec,
  result: ICommandResult,
): Array<{ code: string; message: string; phase: string; severity: "error" | "warning"; suggestedFix?: string }> {
  const parsed = readResultPayload(result);
  const nestedDiagnostics = Array.isArray(parsed?.diagnostics)
    ? parsed.diagnostics.filter(isRecord).map((diagnostic) => ({
        code: typeof diagnostic.code === "string" ? diagnostic.code : stepFailureCode(step),
        message: typeof diagnostic.message === "string" ? diagnostic.message : `${step.id} proof diagnostic.`,
        phase: step.phase,
        severity: diagnostic.severity === "warning" ? "warning" as const : "error" as const,
        suggestedFix: typeof diagnostic.suggestion === "string" ? diagnostic.suggestion : undefined,
      }))
    : [];
  if (nestedDiagnostics.length > 0) {
    return nestedDiagnostics;
  }
  if (result.exitCode === 0) {
    return [];
  }
  return [
    {
      code: readResultCode(result) ?? stepFailureCode(step),
      message: readResultMessage(result) ?? `${step.summary} failed.`,
      phase: step.phase,
      severity: step.required ? "error" : "warning",
      suggestedFix: stepRepairHint(step),
    },
  ];
}

function stepFailureCode(step: IGameProofStepSpec): string {
  return `TN_GAME_QA_${step.id.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_FAILED`;
}

function stepRepairHint(step: IGameProofStepSpec): string {
  if (step.command === "artifact-check") {
    return `Create or capture ${step.args[0] ?? step.id} before rerunning tn game qa --run-proof.`;
  }
  return `Run the ${step.command} command directly with --json to inspect the failure.`;
}

function readResultPayload(result: ICommandResult): Record<string, unknown> | undefined {
  try {
    const parsed = JSON.parse(result.stdout) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function readResultCode(result: ICommandResult): string | undefined {
  const payload = readResultPayload(result);
  return typeof payload?.code === "string" ? payload.code : undefined;
}

function readResultMessage(result: ICommandResult): string | undefined {
  const payload = readResultPayload(result);
  return typeof payload?.message === "string" ? payload.message : undefined;
}
