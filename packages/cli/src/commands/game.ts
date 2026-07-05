import { access, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import {
  applyAuthoringRecipe,
  createGameAgentInventory,
  createGameQualityReport,
  GAME_WORKFLOW_PHASE_IDS,
  listAuthoringRecipeIds,
  loadAuthoringProject,
  planAuthoringRecipe,
  probeGameAssetProviders,
  supportedPrefabPrimitives,
  validateGameQualityReport,
  type GameProductionMode,
  type IGameWorkflowReport,
} from "@threenative/authoring";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { chromium } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { matchGameKitCandidates, type IGameKitCandidate } from "../game/kits.js";
import { buildProofArtifactMetadata } from "../game/proofManifest.js";
import { buildGameTaskGraph } from "../game/taskGraph.js";
import { analyzeGameScaleEntities, type IGameScaleEntityInput } from "../verify/gameScale.js";
import { analyzeNonblank, analyzeProjectedBounds, averageColor, type IPixelFrame } from "../verify/imageAnalysis.js";
import { readPngFrame } from "../verify/compareImages.js";
import { buildCommand } from "./build.js";
import { doctorCommand } from "./doctor.js";
import { playtestCommand } from "./playtest.js";
import { recordCommand, screenshotCommand } from "./visualProof.js";

interface IGamePlanStep {
  id: string;
  phase: string;
  recipe?: string;
  recipeArgs?: Record<string, unknown>;
  recipeGeneratedIds?: Record<string, string[]>;
  recipeProofCommands?: string[];
  recipeSourceOwners?: Record<string, string[]>;
  command?: string;
  apply: boolean;
  summary: string;
}

interface IGamePlan {
  acceptanceCriteria: string[];
  assetPlan: Array<{
    fallback: string;
    requiredEvidence: string[];
    searchCommand?: string;
    sourcePreference: string;
    surface: string;
  }>;
  code: "TN_GAME_PLAN";
  design: {
    controls: string[];
    failRetry: string;
    feedback: string[];
    loop: string;
    objective: string;
    progression: string;
  };
  diagnostics: unknown[];
  goal: string;
  inventory: {
    diagnostics: Array<{ code: string; message: string; path?: string; severity: string }>;
    primarySceneId?: string;
    projectKind: string;
    recommendedOperations: string[];
    sourceFamilies: Array<{ count: number; files: string[]; kind: string }>;
  };
  kitCandidates: IGameKitCandidate[];
  message: string;
  mutate: false;
  phases: Array<{ id: string; order: number; summary: string }>;
  polishPlan: Array<{
    acceptance: string;
    category: string;
    sourceSurface: string;
    treatment: string;
  }>;
  proofCommands: string[];
  recipeIds: string[];
  schema: "threenative.game-plan";
  scriptPlan: Array<{
    module: string;
    exportName: string;
    responsibility: string;
    state: string[];
    proof: string;
  }>;
  sourcePlan: Array<{
    document: string;
    path: string;
    supportedShape: string[];
    avoid: string[];
    operations: string[];
  }>;
  steps: IGamePlanStep[];
}

interface IGameProofStepSpec {
  args: readonly string[];
  command: "artifact-check" | "asset-budget-proof" | "build" | "doctor" | "performance-proof" | "playtest" | "record" | "scale-proof" | "screenshot" | "ui-fit-proof" | "visual-quality-proof";
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
  if (normalizedArgv.slice(1).some((arg) => arg === "--help" || arg === "-h")) {
    return {
      exitCode: 0,
      stdout: renderGameHelp(json, subcommand),
    };
  }

  if (subcommand === "providers") {
    return gameProvidersCommand(normalizedArgv.slice(1));
  }
  if (subcommand === "inspect") {
    return gameInspectCommand(normalizedArgv.slice(1));
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
  if (subcommand === "scale") {
    return gameScaleCommand(normalizedArgv.slice(1));
  }
  if (subcommand === "plan") {
    return gamePlanCommand(normalizedArgv.slice(1));
  }
  if (subcommand === "next") {
    return gameNextCommand(normalizedArgv.slice(1));
  }
  if (subcommand === "improve") {
    return gameImproveCommand(normalizedArgv.slice(1));
  }

  return diagnosticResult(
    {
      code: "TN_GAME_SUBCOMMAND_UNKNOWN",
      message: `Unknown game workflow subcommand '${subcommand}'.`,
      subcommand,
      usage: "tn game <inspect|plan|next|improve|providers|score|qa|release> [--project <path>] [--json]",
    },
    { exitCode: 1, json, stderr: !json },
  );
}

async function gameNextCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  const { graph, outPath } = await persistGameTaskGraph(projectPath);
  const payload = {
    ...graph,
    reportPath: outPath,
  };
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderTaskGraph(payload),
  };
}

async function persistGameTaskGraph(projectPath: string): Promise<{ graph: Awaited<ReturnType<typeof buildGameTaskGraph>>; outPath: string }> {
  const graph = await buildGameTaskGraph({ projectPath });
  const outPath = resolve(projectPath, "artifacts/game-production/task-graph.json");
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
  return { graph, outPath };
}

async function gameInspectCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  const inventory = await createGameAgentInventory({ projectPath });
  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(inventory, null, 2)}\n` : renderInventory(inventory),
  };
}

async function gameScoreCommand(argv: readonly string[], mode: GameProductionMode, options: IGameCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  const proofRun = mode === "qa" && normalizedArgv.includes("--run-proof")
    ? await runGameQaProof(normalizedArgv, projectPath, options)
    : undefined;
  if (mode === "release") {
    await ensureReleaseAssetBudgetProof(projectPath);
  }
  const report = await createGameQualityReport({ mode, projectPath, providerEnvironment: process.env });
  const validationDiagnostics = validateGameQualityReport(report);
  const payload = validationDiagnostics.length === 0
    ? report
    : {
        ...report,
        diagnostics: [...report.diagnostics, ...validationDiagnostics],
        ok: false,
      };

  const withProofRun = proofRun === undefined
    ? payload
    : {
        ...payload,
        ok: payload.ok && proofRun.ok,
        proofRun,
      };

  if (mode === "qa" || mode === "release") {
    const out = readFlag(normalizedArgv, "--out") ?? `artifacts/game-production/${mode}-report.json`;
    const outPath = isAbsolute(out) ? out : resolve(projectPath, out);
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(withProofRun, null, 2)}\n`, "utf8");
    const withArtifact = {
      ...withProofRun,
      reportPath: outPath,
    };
    if (mode === "qa") {
      await persistGameTaskGraph(projectPath);
    }
    const stdoutPayload = compactReportForStdout(withArtifact);
    return {
      exitCode: withArtifact.ok ? 0 : 1,
      stdout: json ? `${JSON.stringify(stdoutPayload, null, 2)}\n` : renderReport(withArtifact),
    };
  }

  return {
    exitCode: payload.ok ? 0 : 1,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : renderReport(payload),
  };
}

async function ensureReleaseAssetBudgetProof(projectPath: string): Promise<void> {
  const proofPath = resolve(projectPath, "artifacts/game-production/asset-budget.json");
  if (await pathExists(proofPath) || !(await pathExists(resolve(projectPath, "dist")))) {
    return;
  }
  await writeAssetBudgetProof(
    {
      args: ["artifacts/game-production/asset-budget.json"],
      command: "asset-budget-proof",
      id: "asset-budget",
      phase: "release",
      required: true,
      summary: "Write a lightweight asset and bundle budget proof artifact.",
    },
    projectPath,
    "tn game release",
  );
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
  const inventory = await createGameAgentInventory({ projectPath });
  const defaults = inferPlanDefaults(inventory);
  const gameCategory = inferGameCategory(goal);
  const kitCandidates = matchGameKitCandidates(goal);
  const plan: IGamePlan = {
    acceptanceCriteria: [
      "A player can understand the objective from the first screen and complete or fail the loop with real input.",
      "Every high-value visual surface has an asset, authored mesh, or documented fallback with provenance.",
      "Gameplay behavior lives in src/scripts/**/*.ts and every exported system is referenced from structured source.",
      "The scene has authored materials, lighting, camera framing, environment context, and set dressing instead of a placeholder floor and loose primitives.",
      "Proof includes authoring validation, build, playtest motion, screenshot, game score, QA, and release checks.",
    ],
    assetPlan: buildAssetPlan(gameCategory),
    code: "TN_GAME_PLAN",
    design: {
      controls: ["keyboard movement or equivalent primary input", "retry/pause input path", "touch-control fallback when mobile is in scope"],
      failRetry: "Define a loss, timeout, hazard, or reset condition and a retained UI retry state.",
      feedback: ["movement response", "objective progress cue", "success/fail cue", "camera or VFX emphasis for important actions"],
      loop: "Spawn, read the objective, act with real input, receive feedback, reach a win/fail state, and retry quickly.",
      objective: `Turn '${goal.trim()}' into one concrete verb, one target, and one measurable success condition.`,
      progression: "Add at least one escalation such as score, lap, wave, timer, obstacle density, or collectible count.",
    },
    diagnostics: buildPlanDiagnostics(inventory),
    goal,
    inventory: {
      diagnostics: inventory.diagnostics.map((diagnostic) => ({
        code: diagnostic.code,
        message: diagnostic.message,
        ...(diagnostic.path === undefined ? {} : { path: diagnostic.path }),
        severity: diagnostic.severity,
      })),
      ...(inventory.primaryScene === undefined ? {} : { primarySceneId: inventory.primaryScene.id }),
      projectKind: inventory.projectKind,
      recommendedOperations: inventory.recommendedOperations,
      sourceFamilies: inventory.sourceFamilies.map((family) => ({ count: family.count, files: family.files, kind: family.kind })),
    },
    kitCandidates,
    message: "Deterministic game-production plan generated without mutating source.",
    mutate: false,
    phases: GAME_WORKFLOW_PHASE_IDS.map((id, index) => ({ id, order: index + 1, summary: phaseSummary(id) })),
    polishPlan: buildPolishPlan(),
    proofCommands: [
      "tn authoring validate --project . --json",
      "tn build --project . --json",
      "tn playtest --project . --entity <player-id> --press KeyboardEvent.code --frames 30 --expect-moved --json",
      "tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json",
      "tn game score --project . --json",
      "tn game qa --project . --run-proof --json",
      "tn game release --project . --json",
    ],
    recipeIds,
    schema: "threenative.game-plan",
    scriptPlan: buildScriptPlan(inventory),
    sourcePlan: buildSourcePlan(inventory),
    steps: buildGamePlanSteps(defaults),
  };
  await persistGameTaskGraph(projectPath);

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(plan, null, 2)}\n` : renderPlan(plan),
  };
}

function buildGamePlanSteps(defaults: { cameraId: string; playerId: string; sceneId: string }): IGamePlanStep[] {
  return [
    recipeStep({
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
    }),
    recipeStep({
      apply: true,
      id: "collectible-or-goal",
      phase: "gameplay",
      recipe: "collectible",
      recipeArgs: {
        entityId: "goal",
        sceneId: defaults.sceneId,
      },
      summary: "Add a concrete objective or reward target that changes state.",
    }),
    recipeStep({
      apply: false,
      id: "top-down-collector-slice",
      phase: "gameplay",
      recipe: "top-down-collector",
      recipeArgs: {
        cameraId: defaults.cameraId,
        inputDocId: `${defaults.sceneId}-input`,
        playerId: defaults.playerId,
        sceneId: defaults.sceneId,
      },
      summary: "Use when the requested game is a compact top-down collectible loop with score feedback.",
    }),
    recipeStep({
      apply: false,
      id: "lane-runner-slice",
      phase: "gameplay",
      recipe: "lane-runner",
      recipeArgs: {
        cameraId: defaults.cameraId,
        playerId: defaults.playerId,
        sceneId: defaults.sceneId,
      },
      summary: "Use when the requested game is a lane runner with hazards, jumps, and forward motion.",
    }),
    recipeStep({
      apply: false,
      id: "vehicle-checkpoint-slice",
      phase: "gameplay",
      recipe: "vehicle-checkpoint",
      recipeArgs: {
        cameraId: defaults.cameraId,
        sceneId: defaults.sceneId,
        vehicleId: defaults.playerId,
      },
      summary: "Use when the requested game centers on a vehicle reaching checkpoint triggers.",
    }),
    recipeStep({
      apply: false,
      id: "obstacle-avoider-slice",
      phase: "gameplay",
      recipe: "obstacle-avoider",
      recipeArgs: {
        playerId: defaults.playerId,
        sceneId: defaults.sceneId,
      },
      summary: "Use when the requested game focuses on dodging or timing around clear hazards.",
    }),
    recipeStep({
      apply: false,
      id: "physics-target-slice",
      phase: "gameplay",
      recipe: "physics-target",
      recipeArgs: {
        sceneId: defaults.sceneId,
        targetId: "target.01",
      },
      summary: "Use when physical impact, projectile contact, or target knocking is central to the loop.",
    }),
    recipeStep({
      apply: false,
      id: "dressed-environment-kit",
      phase: "visuals",
      recipe: "dressed-environment-kit",
      recipeArgs: {
        sceneId: defaults.sceneId,
      },
      summary: "Use to add a bounded first pass of ground, landmark, lighting, and material context.",
    }),
    { apply: false, id: "ui-states", phase: "ui", command: "tn ui ... --json", summary: "Represent gameplay, pause, settings, loading, fail/retry, win/milestone, and touch-control states in retained UI source." },
    { apply: false, id: "asset-ledger", phase: "assets", command: "tn asset add ... --json", summary: "Record local, procedural, generated, hybrid, or blocked sourcing for player/world/reward/UI/audio surfaces." },
    { apply: false, id: "proof", phase: "qa", command: "tn game qa --project . --run-proof --json", summary: "Collect screenshot, mobile, playtest, performance, and release evidence before claiming done." },
  ];
}

function recipeStep(step: IGamePlanStep & { recipe: string; recipeArgs: Record<string, unknown> }): IGamePlanStep {
  const plan = planAuthoringRecipe({ args: step.recipeArgs, recipeId: step.recipe });
  return {
    ...step,
    recipeGeneratedIds: plan.generatedIds,
    recipeProofCommands: plan.proofCommands,
    recipeSourceOwners: plan.sourceOwners,
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
  const planDiagnostics = gamePlanEvidenceDiagnostics(parsed);
  if (planDiagnostics.length > 0) {
    const payload = {
      applied: [],
      code: "TN_GAME_IMPROVE_FAILED",
      diagnostics: planDiagnostics,
      message: "Plan application failed because the plan is incomplete generated-game production evidence.",
      ok: false,
      planPath: absolutePlanPath,
      projectPath,
    };
    return {
      exitCode: 1,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
    };
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
  const planArtifactPath = resolve(projectPath, "artifacts/game-production/plan.json");
  if (ok) {
    await mkdir(resolve(planArtifactPath, ".."), { recursive: true });
    await writeFile(planArtifactPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  }
  const payload = {
    applied,
    code: ok ? "TN_GAME_IMPROVE_APPLIED" : "TN_GAME_IMPROVE_FAILED",
    diagnostics,
    message: ok ? "Plan recipe steps applied through bounded authoring operations." : "Plan application failed.",
    ok,
    planArtifactPath: ok ? planArtifactPath : undefined,
    planPath: absolutePlanPath,
    projectPath,
  };

  return {
    exitCode: payload.ok ? 0 : 1,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

function renderGameHelp(json: boolean, subcommand?: string): string {
  const payload = {
    commands: [
      "tn game inspect [--project <path>] [--json]",
      "tn game plan --goal <text> [--project <path>] [--json]",
      "tn game next [--project <path>] [--json]",
      "tn game improve --apply-plan <file> [--project <path>] [--json]",
      "tn game providers [--json]",
      "tn game score [--project <path>] [--json]",
      "tn game scale [--project <path>] [--url <preview-url>] [--out <file>] [--json]",
      "tn game qa [--project <path>] [--run-proof] [--url <preview-url>] [--entity <id>] [--press <KeyboardEvent.code>] [--expect-axis x|y|z] [--record] [--out <file>] [--json]",
      "tn game release [--project <path>] [--out <file>] [--json]",
    ],
    subcommand,
    message: "ThreeNative game-production workflow commands. For --run-proof, --entity/--press/--expect-axis default from production.proofCommands when a tn playtest command is declared.",
  };
  if (json) {
    return `${JSON.stringify(payload, null, 2)}\n`;
  }
  return `${payload.message}\n\n${payload.commands.map((command) => `  ${command}`).join("\n")}\n`;
}

function renderInventory(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>): string {
  const primaryScene = inventory.primaryScene === undefined ? "none" : `${inventory.primaryScene.id} (${inventory.primaryScene.file})`;
  const scripts = inventory.scripts.length === 0 ? "none" : inventory.scripts.map((script) => `${script.module}#${script.exportName}`).join(", ");
  return [
    `Game agent inventory: ${inventory.projectKind}`,
    `Project: ${inventory.projectPath}`,
    `Primary scene: ${primaryScene}`,
    `Scripts: ${scripts}`,
    `Diagnostics: ${inventory.diagnostics.length}`,
    "",
  ].join("\n");
}

function renderTaskGraph(graph: Awaited<ReturnType<typeof buildGameTaskGraph>> & { reportPath: string }): string {
  const rows = graph.recommendations.map((recommendation) => `  ${recommendation.priority} ${recommendation.id}: ${recommendation.command}`).join("\n");
  return `Game task graph: ${graph.ok ? "ready" : "blocked"}\nReport: ${graph.reportPath}\n\nNext actions:\n${rows}\n\nDiagnostics: ${graph.diagnostics.length}\n`;
}

async function gameScaleCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolveProjectPath(normalizedArgv);
  const out = readFlag(normalizedArgv, "--out") ?? "artifacts/game-production/scale-analysis.json";
  const outPath = isAbsolute(out) ? out : resolve(projectPath, out);
  let server: IWebPreviewServer | undefined;

  try {
    let previewUrl = readFlag(normalizedArgv, "--url");
    if (previewUrl === undefined) {
      const config = await loadProjectConfig(projectPath);
      const build = await buildProject(projectPath);
      const report = await validateBundle(build.bundlePath);
      if (!report.ok) {
        throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
      }
      server = await startWebPreview({ bundlePath: resolve(projectPath, config.outDir), silent: true });
      previewUrl = server.url;
    }

    const renderedEntities = await readRenderedEntitiesFromPreview(previewUrl);
    const analysis = analyzeGameScaleEntities(renderedEntities);
    const artifact = {
      schema: "threenative.game-scale-analysis",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      source: "tn game scale",
      previewUrl,
      ...analysis,
      notes: "Runtime scale analysis uses loaded rendered-entity world bounds. It catches obvious relative-scale mistakes such as a player reading as tall as a train.",
    };
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
    const payload = {
      code: analysis.ok ? "TN_GAME_SCALE_OK" : "TN_GAME_SCALE_FAILED",
      artifactPath: outPath,
      message: analysis.ok ? "Runtime scale analysis passed." : "Runtime scale analysis found incoherent relative scale.",
      ...artifact,
    };
    return {
      exitCode: analysis.ok ? 0 : 1,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\nReport: ${outPath}\n`,
    };
  } catch (error) {
    return diagnosticResult({ code: "TN_GAME_SCALE_FAILED", message: error instanceof Error ? error.message : String(error) }, { exitCode: 1, json, stderr: !json });
  } finally {
    await server?.close();
  }
}

async function readRenderedEntitiesFromPreview(previewUrl: string): Promise<IGameScaleEntityInput[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(previewUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10_000 });
    const renderedEntities = await page.evaluate(() => {
      const ready = (globalThis as {
        __THREENATIVE_READY__?: {
          runtimeDiagnostics?: {
            scene?: {
              renderedEntities?: unknown;
            };
          };
        };
      }).__THREENATIVE_READY__;
      return ready?.runtimeDiagnostics?.scene?.renderedEntities ?? [];
    });
    return Array.isArray(renderedEntities) ? renderedEntities as IGameScaleEntityInput[] : [];
  } finally {
    await browser.close();
  }
}

function compactReportForStdout(report: IGameWorkflowReport & { proofRun?: IGameProofRun; reportPath?: string }): Record<string, unknown> {
  return {
    code: "TN_GAME_REPORT",
    ok: report.ok,
    mode: report.mode,
    summary: report.summary,
    diagnostics: report.diagnostics,
    phaseLedgers: report.phaseLedgers.map((phase) => ({
      id: phase.id,
      score: phase.score,
      status: phase.status,
      diagnostics: phase.diagnostics,
    })),
    productionCommands: report.productionCommands,
    release: report.release,
    proofRun: report.proofRun === undefined
      ? undefined
      : {
          diagnostics: report.proofRun.diagnostics,
          ok: report.proofRun.ok,
          steps: report.proofRun.steps.map((step) => ({
            code: step.code,
            command: step.command,
            durationMs: step.durationMs,
            exitCode: step.exitCode,
            id: step.id,
            phase: step.phase,
            summary: step.summary,
          })),
        },
    reportPath: report.reportPath,
  };
}

function renderReport(report: IGameWorkflowReport & { reportPath?: string }): string {
  const phaseRows = report.phaseLedgers.map((phase) => `  ${phase.id}: ${phase.status} (${phase.score})`).join("\n");
  const artifact = report.reportPath === undefined ? "" : `\nReport: ${report.reportPath}\n`;
  return `Game production ${report.mode}: ${report.ok ? "PASS" : "FAIL"}\n${artifact}\nPhases:\n${phaseRows}\n\nDiagnostics: ${report.diagnostics.length}\n`;
}

function renderPlan(plan: IGamePlan): string {
  return `${plan.message}\n\nDesign:\n  ${plan.design.objective}\n  ${plan.design.loop}\n\nAssets:\n${plan.assetPlan.map((asset) => `  ${asset.surface}: ${asset.sourcePreference}`).join("\n")}\n\nSource:\n${plan.sourcePlan.map((source) => `  ${source.document} (${source.path}): ${source.supportedShape[0]}`).join("\n")}\n\nScripts:\n${plan.scriptPlan.map((script) => `  ${script.module}#${script.exportName}: ${script.responsibility}`).join("\n")}\n\nPolish:\n${plan.polishPlan.map((item) => `  ${item.category}: ${item.treatment}`).join("\n")}\n\nPhases:\n${plan.phases.map((phase) => `  ${phase.order}. ${phase.id}: ${phase.summary}`).join("\n")}\n\nProof:\n${plan.proofCommands.map((command) => `  ${command}`).join("\n")}\n`;
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

function hasNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim() !== "";
}

function hasStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(hasNonEmptyString);
}

function gamePlanEvidenceDiagnostics(plan: Record<string, unknown>): Array<{
  code: string;
  message: string;
  path: string;
  severity: "error";
  value?: unknown;
}> {
  const diagnostics: Array<{
    code: string;
    message: string;
    path: string;
    severity: "error";
    value?: unknown;
  }> = [];
  const design = plan.design;
  if (!isRecord(design)
    || !hasStringArray(design.controls)
    || !hasNonEmptyString(design.failRetry)
    || !hasStringArray(design.feedback)
    || !hasNonEmptyString(design.loop)
    || !hasNonEmptyString(design.objective)
    || !hasNonEmptyString(design.progression)
  ) {
    diagnostics.push({
      code: "TN_GAME_IMPROVE_PLAN_INCOMPLETE",
      message: "Apply plan is missing generated-game design evidence.",
      path: "/design",
      severity: "error",
      value: design,
    });
  }

  const acceptanceCriteria = hasStringArray(plan.acceptanceCriteria) ? plan.acceptanceCriteria : [];
  const requiredAcceptance = [
    ["objective", "input", "complete", "fail"],
    ["asset", "provenance"],
    ["src/scripts", "structured source"],
    ["authored materials", "lighting", "set dressing"],
    ["proof", "playtest", "screenshot", "release"],
  ];
  if (!requiredAcceptance.every((terms) => acceptanceCriteria.some((entry) => terms.every((term) => entry.toLowerCase().includes(term))))) {
    diagnostics.push({
      code: "TN_GAME_IMPROVE_PLAN_INCOMPLETE",
      message: "Apply plan is missing generated-game acceptance criteria.",
      path: "/acceptanceCriteria",
      severity: "error",
      value: plan.acceptanceCriteria,
    });
  }

  const assetPlan = Array.isArray(plan.assetPlan) ? plan.assetPlan.filter(isRecord) : [];
  const requiredSurfaces = ["player-hero", "obstacle-enemy", "reward-interactable", "world-environment", "ui-hud", "audio-feedback"];
  const missingSurfaces = requiredSurfaces.filter((surface) => !assetPlan.some((entry) => entry.surface === surface && hasNonEmptyString(entry.sourcePreference) && hasNonEmptyString(entry.fallback)));
  if (missingSurfaces.length > 0 || !assetPlan.some((entry) => hasNonEmptyString(entry.searchCommand) && entry.searchCommand.includes("tn asset source search") && entry.searchCommand.includes("--direct-only") && entry.searchCommand.includes("--json"))) {
    diagnostics.push({
      code: "TN_GAME_IMPROVE_PLAN_INCOMPLETE",
      message: "Apply plan is missing generated-game asset surface inventory or catalog-search evidence.",
      path: "/assetPlan",
      severity: "error",
      value: plan.assetPlan,
    });
  }

  const sourcePlan = Array.isArray(plan.sourcePlan) ? plan.sourcePlan.filter(isRecord) : [];
  const requiredSourceDocuments = ["scene", "input", "systems", "ui", "materials", "assets"];
  const missingSourceDocuments = requiredSourceDocuments.filter((document) => !sourcePlan.some((entry) => entry.document === document && hasNonEmptyString(entry.path) && hasStringArray(entry.supportedShape)));
  if (missingSourceDocuments.length > 0) {
    diagnostics.push({
      code: "TN_GAME_IMPROVE_PLAN_INCOMPLETE",
      message: "Apply plan is missing generated-game source document guidance.",
      path: "/sourcePlan",
      severity: "error",
      value: plan.sourcePlan,
    });
  }

  const scriptPlan = Array.isArray(plan.scriptPlan) ? plan.scriptPlan.filter(isRecord) : [];
  if (!scriptPlan.some((entry) => hasNonEmptyString(entry.module) && hasNonEmptyString(entry.exportName) && hasStringArray(entry.state))) {
    diagnostics.push({
      code: "TN_GAME_IMPROVE_PLAN_INCOMPLETE",
      message: "Apply plan is missing generated-game script ownership evidence.",
      path: "/scriptPlan",
      severity: "error",
      value: plan.scriptPlan,
    });
  }

  const polishPlan = Array.isArray(plan.polishPlan) ? plan.polishPlan.filter(isRecord) : [];
  const requiredPolishCategories = ["composition", "materials", "silhouette", "lighting-environment", "motion-feedback"];
  const missingPolishCategories = requiredPolishCategories.filter((category) => !polishPlan.some((entry) => entry.category === category && hasNonEmptyString(entry.acceptance) && hasNonEmptyString(entry.treatment)));
  if (missingPolishCategories.length > 0) {
    diagnostics.push({
      code: "TN_GAME_IMPROVE_PLAN_INCOMPLETE",
      message: "Apply plan is missing generated-game polish checklist evidence.",
      path: "/polishPlan",
      severity: "error",
      value: plan.polishPlan,
    });
  }

  const proofCommands = hasStringArray(plan.proofCommands) ? plan.proofCommands : [];
  const requiredProofCommands = [
    (command: string) => command.includes("tn authoring validate"),
    (command: string) => command.includes("tn build"),
    (command: string) => command.includes("tn playtest") && command.includes("--expect-moved"),
    (command: string) => command.includes("tn screenshot"),
    (command: string) => command.includes("tn game score"),
    (command: string) => command.includes("tn game qa") && command.includes("--run-proof"),
    (command: string) => command.includes("tn game release"),
  ];
  if (!requiredProofCommands.every((matches) => proofCommands.some(matches))) {
    diagnostics.push({
      code: "TN_GAME_IMPROVE_PLAN_INCOMPLETE",
      message: "Apply plan is missing generated-game proof command evidence.",
      path: "/proofCommands",
      severity: "error",
      value: plan.proofCommands,
    });
  }
  return diagnostics;
}

function buildAssetPlan(gameCategory: string): IGamePlan["assetPlan"] {
  const categorySearch = `tn asset source search --game-category ${gameCategory} --format glb --direct-only --json`;
  const provenance = ["SQLite catalog/source id", "source URL and provenance URL", "license evidence", "downloaded date or fallback note"];
  return [
    {
      fallback: "Author a custom hero mesh with distinct silhouette, material zones, and scale cues.",
      requiredEvidence: [...provenance, "tn asset inspect or model-test result"],
      searchCommand: categorySearch,
      sourcePreference: "Use a direct GLB/glTF returned by the SQLite-backed asset source library before open web research or primitives.",
      surface: "player-hero",
    },
    {
      fallback: "Author modular hazards or opponents with readable shapes and collision affordances.",
      requiredEvidence: provenance,
      searchCommand: categorySearch,
      sourcePreference: "Use the same SQLite catalog kit/style family as the player when possible.",
      surface: "obstacle-enemy",
    },
    {
      fallback: "Create authored collectible/goal meshes with emissive or animated affordance.",
      requiredEvidence: provenance,
      searchCommand: categorySearch,
      sourcePreference: "Pick reward/interactable GLB records from the SQLite catalog that read clearly at gameplay camera distance.",
      surface: "reward-interactable",
    },
    {
      fallback: "Build a coherent environment from authored meshes, terrain, barriers, landmarks, and sky/background treatment.",
      requiredEvidence: provenance,
      searchCommand: categorySearch,
      sourcePreference: "Prefer a consistent SQLite catalog environment pack, not unrelated one-off assets.",
      surface: "world-environment",
    },
    {
      fallback: "Use retained UI source with authored typography, contrast, spacing, and state-specific labels.",
      requiredEvidence: ["UI state inventory", "text-fit/mobile proof", "source document path"],
      sourcePreference: "Use structured UI documents for HUD, pause, fail/retry, win/milestone, loading, settings, and touch controls.",
      surface: "ui-hud",
    },
    {
      fallback: "Use generated or procedural sounds only through local tooling with provenance and fallback notes.",
      requiredEvidence: ["source/provenance", "license or generation settings", "runtime trigger proof"],
      sourcePreference: "Plan feedback sounds for input, collect/hit, win/fail, and ambient loop when supported.",
      surface: "audio-feedback",
    },
  ];
}

function buildPolishPlan(): IGamePlan["polishPlan"] {
  return [
    {
      acceptance: "Screenshot shows the player, objective, bounds, and at least one landmark without empty-horizon composition.",
      category: "composition",
      sourceSurface: "content/scenes/**/*.json",
      treatment: "Frame the play space with camera placement, landmarks, readable objective placement, and environment boundaries.",
    },
    {
      acceptance: "Primary surfaces do not read as flat random colors on bare boxes.",
      category: "materials",
      sourceSurface: "content/materials/**/*.json and asset metadata",
      treatment: "Author material intent with color, roughness/metalness, texture/normal detail where available, and emissive accents only where useful.",
    },
    {
      acceptance: "Gameplay silhouettes remain readable at normal camera distance and motion direction is clear.",
      category: "silhouette",
      sourceSurface: "prefabs, meshes, and scene transforms",
      treatment: "Shape player, hazards, goals, and interactables with distinct proportions, scale, and marker treatment.",
    },
    {
      acceptance: "Scene proof does not show missing shadows, bland floors, or invisible objective cues.",
      category: "lighting-environment",
      sourceSurface: "scene lights, environment, sky/background, and terrain documents",
      treatment: "Use purposeful key/fill/ambient balance, shadows where supported, ground detail, sky/background treatment, and set dressing.",
    },
    {
      acceptance: "Input playtest and recording show smooth response and visible state changes.",
      category: "motion-feedback",
      sourceSurface: "src/scripts/**/*.ts plus retained UI/audio/VFX source",
      treatment: "Add eased movement, progress feedback, hit/collect/win/fail cues, and camera/VFX emphasis through portable contracts.",
    },
  ];
}

function buildScriptPlan(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>): IGamePlan["scriptPlan"] {
  const existingScripts = inventory.scripts.map((script) => ({
    exportName: script.exportName,
    module: script.module,
    proof: "tn playtest --project . --entity <player-id> --press KeyboardEvent.code --frames 30 --expect-moved --json",
    responsibility: "Continue the existing structured-source gameplay system and keep component/resource ownership declared.",
    state: scriptStateForInventory(inventory),
  }));
  if (existingScripts.length > 0) {
    return existingScripts;
  }
  return [
    {
      exportName: "updatePlayer",
      module: "src/scripts/player.ts",
      proof: "tn playtest --project . --entity <player-id> --press KeyboardEvent.code --frames 30 --expect-moved --json",
      responsibility: "Read portable input and move the player through smooth fixed-time motion.",
      state: ["input axes", "velocity or movement intent", "grounded/active state when relevant"],
    },
    {
      exportName: "updateGameRules",
      module: "src/scripts/rules.ts",
      proof: "tn game score --project . --json reports playable-loop evidence instead of TN_GAME_PLAYABLE_LOOP_MISSING.",
      responsibility: "Track objective progress, win/fail/retry state, scoring, and milestone events.",
      state: ["score/progress", "timer or lives when relevant", "game phase"],
    },
    {
      exportName: "updateFeedback",
      module: "src/scripts/feedback.ts",
      proof: "Screenshot or recording shows visual state changes when the player acts or reaches an objective.",
      responsibility: "Drive authored UI/resource cues, animation triggers, particles, sound events, or camera emphasis through supported portable APIs.",
      state: ["last event", "feedback cooldowns", "UI-visible status values"],
    },
  ];
}

function scriptStateForInventory(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>): string[] {
  const state = new Set<string>();
  for (const system of inventory.scriptSystems) {
    for (const item of [...system.reads, ...system.writes, ...system.resourceReads, ...system.resourceWrites]) {
      state.add(item);
    }
  }
  return state.size === 0 ? ["declared gameplay state from structured source"] : [...state].sort();
}

function buildSourcePlan(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>): IGamePlan["sourcePlan"] {
  const prefabPrimitiveList = [...supportedPrefabPrimitives].join(", ");
  return [
    {
      document: "scene",
      path: pathForFamily(inventory, "scene", "content/scenes/arena.scene.json"),
      supportedShape: [
        "Use scene entities, scene-local prefabs, resources, camera, light, MeshRenderer-compatible components, and authored transforms.",
        `Scene-local prefab primitives are limited to ${prefabPrimitiveList}.`,
        "Put gameplay-owned custom component state on entities and reference scripts through content/systems/*.systems.json.",
      ],
      avoid: [
        "Unsupported primitive names such as octahedron unless validation proves support.",
        "Raw Three.js scenes, DOM APIs, filesystem access, workers, timers, or runtime handles.",
        "Generated dist/** files as durable source.",
      ],
      operations: ["tn scene validate arena --json", "tn scene inspect arena --json", "tn scene add-entity ... --json", "tn scene add-prefab-instance ... --json"],
    },
    {
      document: "input",
      path: pathForFamily(inventory, "input", "content/input/arena.input.json"),
      supportedShape: [
        "Declare actions with string bindings such as keyboard.KeyW, keyboard.ArrowLeft, and keyboard.Space.",
        "Use stable action ids that scripts read through context.input.axis1 or context.input.action/pressed.",
      ],
      avoid: [
        "Object-shaped bindings like { device, code }; validation expects non-empty binding strings.",
        "Non-canonical keyboard codes or display labels in place of KeyboardEvent.code names.",
      ],
      operations: ["tn input add-action ... --json", "tn authoring validate --project . --json"],
    },
    {
      document: "systems",
      path: pathForFamily(inventory, "systems", "content/systems/arena.systems.json"),
      supportedShape: [
        "Reference src/scripts/**/*.ts module/export pairs from fixedUpdate for input-driven gameplay loops.",
        "Declare every component/resource read and write, including Transform, custom gameplay components, and GameState.",
      ],
      avoid: [
        "Leaving reads/writes implicit; effect validation and playtest readiness depend on declared access.",
        "Using update for fixed-time movement unless the game intentionally does not need fixedDelta-driven proof.",
      ],
      operations: ["tn system create ... --json", "tn authoring validate --project . --json", "tn build --project . --json"],
    },
    {
      document: "ui",
      path: pathForFamily(inventory, "ui", "content/ui/hud.ui.json"),
      supportedShape: [
        "Use retained UI nodes with type, text, style, layout, and a bindings array that maps node ids to GameState fields.",
        "Represent gameplay, pause, settings, loading, fail-retry, win-milestone, and touch-controls states.",
      ],
      avoid: [
        "roots/children/kind trees when the project uses the current retained UI document shape.",
        "Visible instructional paragraphs; prefer concise HUD state text that fits mobile proof.",
      ],
      operations: ["tn ui create ... --json", "tn ui add-text ... --json", "tn ui bind ... --json"],
    },
    {
      document: "materials",
      path: pathForFamily(inventory, "material", "content/materials/arena.materials.json"),
      supportedShape: [
        "Use material rows with id, color, roughness, metalness, emissive, and supported texture-slot fields.",
        "Preserve authored color/material intent in source; fix mapping or runtime setup if screenshots differ.",
      ],
      avoid: [
        "baseColor in structured material source; use color for this document family.",
        "Adapter-only color/material tweaks to chase screenshots.",
      ],
      operations: ["tn material create ... --json", "tn material set-color ... --json"],
    },
    {
      document: "assets",
      path: pathForFamily(inventory, "asset", "content/assets/arena.assets.json"),
      supportedShape: [
        "Record asset rows with id, path, and type for source/model/audio/texture/document evidence.",
        "Preserve SQLite catalog ids, source URLs, provenance URLs, license evidence, and fallback notes next to committed assets.",
      ],
      avoid: [
        "uri/kind/provenance fields in the asset row shape; put provenance in a source document or notes file.",
        "Web-sourced assets before querying the shipped SQLite asset source catalog.",
      ],
      operations: ["tn asset source search --game-category <category> --format glb --direct-only --json", "tn asset source get <asset-source-id> --json", "tn asset add ... --json"],
    },
  ];
}

function pathForFamily(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>, kind: string, fallback: string): string {
  return inventory.sourceFamilies.find((family) => family.kind === kind)?.files[0] ?? fallback;
}

function inferGameCategory(goal: string): string {
  const lower = goal.toLowerCase();
  if (lower.includes("race") || lower.includes("car") || lower.includes("drive")) {
    return "racing";
  }
  if (lower.includes("space") || lower.includes("spaceship") || lower.includes("starship") || lower.includes("rocket") || lower.includes("asteroid")) {
    return "space";
  }
  if (
    lower.includes("boat") ||
    lower.includes("ferry") ||
    lower.includes("harbor") ||
    lower.includes("harbour") ||
    lower.includes("naval") ||
    lower.includes("dock") ||
    lower.includes("pier") ||
    lower.includes("ship")
  ) {
    return "naval";
  }
  if (
    lower.includes("underwater") ||
    lower.includes("sunken") ||
    lower.includes("ocean") ||
    lower.includes("sea") ||
    lower.includes("diver") ||
    lower.includes("salvage")
  ) {
    return "ocean";
  }
  if (lower.includes("forest") || lower.includes("garden") || lower.includes("orchard") || lower.includes("nature")) {
    return "nature";
  }
  if (lower.includes("cave") || lower.includes("cavern") || lower.includes("mine")) {
    return "environment";
  }
  if (lower.includes("platform")) {
    return "platformer";
  }
  if (lower.includes("room") || lower.includes("escape") || lower.includes("puzzle")) {
    return "room";
  }
  if (lower.includes("bowl") || lower.includes("ball") || lower.includes("physics")) {
    return "physics";
  }
  return "arcade";
}

function inferPlanDefaults(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>): { cameraId: string; playerId: string; sceneId: string } {
  const entityIds = inventory.primaryScene?.entityIds ?? [];
  const playerId = entityIds.find(isPlayerLikeEntityId);
  const cameraId = inventory.primaryScene?.cameraIds[0] ?? entityIds.find((id) => id.toLowerCase().includes("camera"));
  return {
    cameraId: cameraId ?? "camera.main",
    playerId: playerId ?? "player",
    sceneId: inventory.primaryScene?.id ?? "arena",
  };
}

function buildPlanDiagnostics(inventory: Awaited<ReturnType<typeof createGameAgentInventory>>): Array<{ code: string; message: string; path?: string; severity: "warning" }> {
  const diagnostics: Array<{ code: string; message: string; path?: string; severity: "warning" }> = [];
  if (inventory.primaryScene === undefined) {
    diagnostics.push({
      code: "TN_GAME_PLAN_SOURCE_DEFAULT_FALLBACK",
      message: "Game plan used fallback scene defaults because the project inventory has no primary scene.",
      path: "/steps/playable-loop/recipeArgs/sceneId",
      severity: "warning",
    });
  }
  if ((inventory.primaryScene?.cameraIds.length ?? 0) === 0) {
    diagnostics.push({
      code: "TN_GAME_PLAN_SOURCE_DEFAULT_FALLBACK",
      message: "Game plan used fallback camera defaults because the project inventory has no camera entity.",
      path: "/steps/playable-loop/recipeArgs/cameraId",
      severity: "warning",
    });
  }
  if (inventory.primaryScene?.entityIds.some(isPlayerLikeEntityId) !== true) {
    diagnostics.push({
      code: "TN_GAME_PLAN_SOURCE_DEFAULT_FALLBACK",
      message: "Game plan used fallback player entity defaults because the project inventory has no player-like entity id.",
      path: "/steps/playable-loop/recipeArgs/entityId",
      severity: "warning",
    });
  }
  return diagnostics;
}

function isPlayerLikeEntityId(id: string): boolean {
  const lower = id.toLowerCase();
  if (lower.includes("camera")) {
    return false;
  }
  return lower.includes("player") || lower.includes("runner") || lower.includes("hero") || lower.includes("avatar") || lower.includes("boat") || lower.includes("car");
}

async function runGameQaProof(argv: readonly string[], projectPath: string, options: IGameCommandOptions): Promise<IGameProofRun> {
  const proofDefaults = await readProjectProofDefaults(projectPath);
  const steps = buildQaProofSteps(argv, proofDefaults);
  const results: IGameProofStepResult[] = [];
  for (const step of steps) {
    const startedAt = Date.now();
    const result = await (options.proofRunner ?? runDefaultProofStep)(step, { projectPath });
    if (step.id === "doctor" && result.exitCode === 0) {
      await writeDoctorProof(projectPath, result);
    }
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

async function writeDoctorProof(projectPath: string, result: ICommandResult): Promise<void> {
  const outputPath = resolve(projectPath, "artifacts/game-production/doctor.json");
  await mkdir(resolve(outputPath, ".."), { recursive: true });
  const parsed = readResultPayload(result);
  const payload = {
    ...(parsed ?? { rawStdout: result.stdout }),
    generatedBy: "tn game qa --run-proof",
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: "tn game qa --run-proof", proof: "doctor" },
      projectPath,
    }),
    schema: "threenative.game-doctor-proof",
  };
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function buildQaProofSteps(argv: readonly string[], proofDefaults: IProofDefaults = {}): IGameProofStepSpec[] {
  const url = readFlag(argv, "--url");
  const entity = readFlag(argv, "--entity") ?? proofDefaults.entity;
  const press = normalizeProofPress(readFlag(argv, "--press") ?? proofDefaults.press);
  const expectAxis = readFlag(argv, "--expect-axis") ?? proofDefaults.expectAxis;
  const frames = readFlag(argv, "--frames") ?? proofDefaults.frames ?? "30";
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
          args: [
            "--project",
            ".",
            "--entity",
            entity,
            "--press",
            press,
            "--frames",
            frames,
            "--expect-moved",
            ...(expectAxis === undefined ? [] : ["--expect-axis", expectAxis]),
            "--json",
          ],
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
      : {
          args: ["artifacts/game-production/screenshot.png"],
          command: "artifact-check",
          id: "screenshot",
          phase: "visuals",
          required: true,
          summary: "Check screenshot proof artifact.",
        },
    url !== undefined
      ? {
          args: ["--project", ".", "--url", url, "--out", "artifacts/game-production/mobile-viewport.png", "--viewport", "mobile", "--wait-ready", "--json"],
          command: "screenshot",
          id: "mobile-viewport",
          phase: "qa",
          required: true,
          summary: "Capture mobile viewport proof from a running web preview.",
        }
      : {
          args: ["artifacts/game-production/mobile-viewport.png"],
          command: "artifact-check",
          id: "mobile-viewport",
          phase: "qa",
          required: true,
          summary: "Check mobile viewport proof artifact.",
        },
    argv.includes("--record") && url !== undefined
      ? {
          args: ["--project", ".", "--url", url, "--out", "artifacts/game-production/motion.webm", "--duration", readFlag(argv, "--duration") ?? "5", "--json"],
          command: "record",
          id: "record",
          phase: "qa",
          required: false,
          summary: "Capture short motion proof from a running web preview.",
        }
      : {
          args: ["artifacts/game-production/motion.webm"],
          command: "artifact-check",
          id: "record",
          phase: "qa",
          required: false,
          summary: "Check for existing motion proof artifact.",
        },
    {
      args: ["artifacts/game-production/visual-quality.json"],
      command: "visual-quality-proof",
      id: "visual-quality",
      phase: "visuals",
      required: true,
      summary: "Analyze screenshot composition metrics for nonblank, visible bounds, color variety, and local contrast.",
    },
    {
      args: ["artifacts/game-production/scale-analysis.json"],
      command: "scale-proof",
      id: "scale-analysis",
      phase: "visuals",
      required: true,
      summary: "Analyze runtime loaded-asset bounds for incoherent relative scale.",
    },
    {
      args: ["artifacts/game-production/performance.json"],
      command: "performance-proof",
      id: "performance",
      phase: "qa",
      required: true,
      summary: "Write a lightweight performance proof artifact from bundle and screenshot evidence.",
    },
    {
      args: ["artifacts/game-production/asset-budget.json"],
      command: "asset-budget-proof",
      id: "asset-budget",
      phase: "release",
      required: true,
      summary: "Write a lightweight asset and bundle budget proof artifact.",
    },
    {
      args: ["artifacts/game-production/ui-fit.json"],
      command: "ui-fit-proof",
      id: "ui-fit",
      phase: "ui",
      required: true,
      summary: "Write a mobile UI fit proof artifact from mobile viewport evidence.",
    },
  ];
  return steps;
}

function normalizeProofPress(press: string | undefined): string | undefined {
  return press?.startsWith("keyboard.") === true ? press.slice("keyboard.".length) : press;
}

interface IProofDefaults {
  entity?: string;
  expectAxis?: string;
  frames?: string;
  press?: string;
}

async function readProjectProofDefaults(projectPath: string): Promise<IProofDefaults> {
  try {
    const parsed = JSON.parse(await readFile(resolve(projectPath, "threenative.config.json"), "utf8")) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.production) || !Array.isArray(parsed.production.proofCommands)) {
      return inferProofDefaultsFromSource(projectPath);
    }
    const playtestCommand = parsed.production.proofCommands.find((command): command is string => typeof command === "string" && command.includes("tn playtest"));
    if (playtestCommand === undefined) {
      return inferProofDefaultsFromSource(projectPath);
    }
    const tokens = shellWords(playtestCommand);
    return {
      entity: readFlag(tokens, "--entity"),
      expectAxis: readFlag(tokens, "--expect-axis"),
      frames: readFlag(tokens, "--frames"),
      press: readFlag(tokens, "--press"),
    };
  } catch {
    return inferProofDefaultsFromSource(projectPath);
  }
}

async function inferProofDefaultsFromSource(projectPath: string): Promise<IProofDefaults> {
  const inventory = await createGameAgentInventory({ projectPath });
  const defaults = inferPlanDefaults(inventory);
  return {
    entity: defaults.playerId,
    expectAxis: "x",
    press: await inferKeyboardPress(projectPath),
  };
}

async function inferKeyboardPress(projectPath: string): Promise<string | undefined> {
  const project = await loadAuthoringProject({ projectPath });
  const inputDocuments = project.documents.filter((document) => document.kind === "input");
  const actionRows = inputDocuments.flatMap((document) => {
    const data = document.data;
    return isRecord(data) && Array.isArray(data.actions) ? data.actions.filter(isRecord) : [];
  });
  const preferred = actionRows.find((action) => typeof action.id === "string" && ["move-right", "right", "east"].includes(action.id.toLowerCase())) ?? actionRows.find((action) => {
    const id = typeof action.id === "string" ? action.id.toLowerCase() : "";
    return id.includes("move") || id.includes("right") || id.includes("left") || id.includes("up") || id.includes("down");
  });
  const bindings: unknown[] = Array.isArray(preferred?.bindings) ? preferred.bindings : [];
  const keyboard = bindings.find((binding): binding is string => typeof binding === "string" && binding.startsWith("keyboard."));
  return keyboard?.slice("keyboard.".length);
}

function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = "";
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (const char of command) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) {
        quote = undefined;
      } else {
        current += char;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current !== "") {
        words.push(current);
        current = "";
      }
      continue;
    }
    current += char;
  }
  if (current !== "") {
    words.push(current);
  }
  return words;
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
  if (step.command === "performance-proof") {
    return writePerformanceProof(step, options.projectPath);
  }
  if (step.command === "asset-budget-proof") {
    return writeAssetBudgetProof(step, options.projectPath);
  }
  if (step.command === "visual-quality-proof") {
    return writeVisualQualityProof(step, options.projectPath);
  }
  if (step.command === "scale-proof") {
    return writeScaleProof(step, options.projectPath);
  }
  if (step.command === "ui-fit-proof") {
    return writeUiFitProof(step, options.projectPath);
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

async function writePerformanceProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const manifestPath = resolve(projectPath, "dist");
  const screenshotPath = resolve(projectPath, "artifacts/game-production/screenshot.png");
  const mobilePath = resolve(projectPath, "artifacts/game-production/mobile-viewport.png");
  const [screenshot, mobile] = await Promise.all([optionalFileStat(screenshotPath), optionalFileStat(mobilePath)]);
  const report = {
    schema: "threenative.game-performance-proof",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: "tn game qa --run-proof", proof: "performance" },
      projectPath,
    }),
    source: "tn game qa --run-proof",
    targetFps: 60,
    frameBudgetMs: 16.67,
    evidence: {
      distDirectory: await pathExists(manifestPath),
      screenshot: screenshot === undefined ? null : { byteSize: screenshot.size, path: "artifacts/game-production/screenshot.png" },
      mobileViewport: mobile === undefined ? null : { byteSize: mobile.size, path: "artifacts/game-production/mobile-viewport.png" },
    },
    status: screenshot !== undefined && mobile !== undefined ? "pass" : "warning",
    notes: "This is a lightweight proof artifact for generated-game QA. It records build/screenshot evidence and the default 60 FPS target; use dedicated profiling before claiming device performance.",
  };
  await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ code: "TN_GAME_QA_PERFORMANCE_PROOF_OK", artifactPath: outPath, message: "Performance proof artifact written.", report }, null, 2)}\n`,
  };
}

async function writeAssetBudgetProof(step: IGameProofStepSpec, projectPath: string, source = "tn game qa --run-proof"): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const [dist, assets, content] = await Promise.all([
    directoryByteStats(resolve(projectPath, "dist")),
    directoryByteStats(resolve(projectPath, "assets")),
    directoryByteStats(resolve(projectPath, "content")),
  ]);
  const report = {
    schema: "threenative.game-asset-budget-proof",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: source, proof: "asset-budget" },
      projectPath,
    }),
    source,
    budgets: {
      distBytes: 10 * 1024 * 1024,
      assetBytes: 50 * 1024 * 1024,
      contentBytes: 5 * 1024 * 1024,
    },
    measurements: {
      dist,
      assets,
      content,
    },
    status: dist.exists && dist.byteSize <= 10 * 1024 * 1024 && assets.byteSize <= 50 * 1024 * 1024 && content.byteSize <= 5 * 1024 * 1024 ? "pass" : "warning",
    notes: "This lightweight budget proof records local generated-game bundle/source asset sizes. Use dedicated platform profiling before claiming device memory or load-time budgets.",
  };
  await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({ code: "TN_GAME_QA_ASSET_BUDGET_PROOF_OK", artifactPath: outPath, message: "Asset budget proof artifact written.", report }, null, 2)}\n`,
  };
}

async function writeVisualQualityProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const screenshotPath = resolve(projectPath, "artifacts/game-production/screenshot.png");
  try {
    const frame = await readPngFrame(screenshotPath);
    const metrics = analyzeGameScreenshot(frame);
    const diagnostics = visualQualityDiagnostics(metrics);
    const hasError = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    const report = {
      schema: "threenative.game-visual-quality-proof",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      proofMetadata: await buildProofArtifactMetadata({
        commandParameters: { command: "tn game qa --run-proof", proof: "visual-quality" },
        projectPath,
      }),
      source: "tn game qa --run-proof",
      screenshot: "artifacts/game-production/screenshot.png",
      metrics,
      diagnostics,
      status: hasError ? "blocked" : diagnostics.length > 0 ? "warning" : "pass",
      notes: "This objective screenshot proof catches blank, tiny, flat, or low-contrast captures. It is supporting evidence for human visual review, not an art-quality oracle.",
    };
    await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    return {
      exitCode: hasError ? 1 : 0,
      stdout: `${JSON.stringify({
        code: hasError ? "TN_GAME_QA_VISUAL_QUALITY_BLOCKED" : "TN_GAME_QA_VISUAL_QUALITY_PROOF_OK",
        artifactPath: outPath,
        diagnostics,
        message: hasError ? "Visual quality proof found blocking screenshot issues." : "Visual quality proof artifact written.",
        report,
      }, null, 2)}\n`,
    };
  } catch (error) {
    const diagnostics = [{
      code: "TN_GAME_QA_VISUAL_QUALITY_SCREENSHOT_INVALID",
      message: `Unable to read game-production screenshot PNG: ${error instanceof Error ? error.message : String(error)}.`,
      severity: "error" as const,
    }];
    const report = {
      schema: "threenative.game-visual-quality-proof",
      version: "0.1.0",
      generatedAt: new Date().toISOString(),
      proofMetadata: await buildProofArtifactMetadata({
        commandParameters: { command: "tn game qa --run-proof", proof: "visual-quality" },
        projectPath,
      }),
      source: "tn game qa --run-proof",
      screenshot: "artifacts/game-production/screenshot.png",
      diagnostics,
      status: "blocked",
    };
    await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    return {
      exitCode: 1,
      stdout: `${JSON.stringify({
        code: "TN_GAME_QA_VISUAL_QUALITY_SCREENSHOT_INVALID",
        artifactPath: outPath,
        diagnostics,
        message: "Visual quality proof requires a valid screenshot PNG.",
        report,
      }, null, 2)}\n`,
    };
  }
}

async function writeScaleProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  return gameScaleCommand(["--project", projectPath, "--out", outPath, "--json"]);
}

async function writeUiFitProof(step: IGameProofStepSpec, projectPath: string): Promise<ICommandResult> {
  const outPath = resolveProofArtifactPath(step, projectPath);
  if (outPath === undefined) {
    return { exitCode: 1, stdout: `${JSON.stringify({ code: "TN_GAME_QA_ARTIFACT_PATH_MISSING", message: step.summary }, null, 2)}\n` };
  }
  const mobilePath = resolve(projectPath, "artifacts/game-production/mobile-viewport.png");
  const mobile = await optionalFileStat(mobilePath);
  const report = {
    schema: "threenative.game-ui-fit-proof",
    version: "0.1.0",
    generatedAt: new Date().toISOString(),
    proofMetadata: await buildProofArtifactMetadata({
      commandParameters: { command: "tn game qa --run-proof", proof: "ui-fit" },
      projectPath,
    }),
    source: "tn game qa --run-proof",
    viewport: { height: 844, preset: "mobile", width: 390 },
    evidence: {
      mobileViewport: mobile === undefined ? null : { byteSize: mobile.size, path: "artifacts/game-production/mobile-viewport.png" },
    },
    status: mobile === undefined ? "blocked" : "pass",
    notes: "Mobile viewport screenshot exists and was captured through tn screenshot --viewport mobile. Human review or future text-fit metrics should still inspect UI overlap.",
  };
  await mkdir(resolve(projectPath, "artifacts/game-production"), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
  return {
    exitCode: mobile === undefined ? 1 : 0,
    stdout: `${JSON.stringify({
      code: mobile === undefined ? "TN_GAME_QA_UI_FIT_PROOF_MISSING_MOBILE" : "TN_GAME_QA_UI_FIT_PROOF_OK",
      artifactPath: outPath,
      message: mobile === undefined ? "Mobile viewport artifact is missing." : "UI fit proof artifact written.",
      report,
    }, null, 2)}\n`,
  };
}

function analyzeGameScreenshot(frame: IPixelFrame): {
  averageColor: { blue: number; green: number; red: number };
  colorBucketCount: number;
  colorBucketRatio: number;
  height: number;
  localContrastRatio: number;
  nonblank: ReturnType<typeof analyzeNonblank>;
  projectedBounds: ReturnType<typeof analyzeProjectedBounds>;
  visibleBoundsAreaRatio: number;
  width: number;
} {
  const projectedBounds = analyzeProjectedBounds(frame);
  const totalPixels = frame.width * frame.height;
  const visibleBoundsAreaRatio = totalPixels <= 0 ? 0 : (projectedBounds.width * projectedBounds.height) / totalPixels;
  const buckets = new Set<string>();
  let contrastEdges = 0;
  let contrastSamples = 0;
  for (let y = 0; y < frame.height; y += 2) {
    for (let x = 0; x < frame.width; x += 2) {
      const index = (y * frame.width + x) * 4;
      const red = frame.data[index] ?? 0;
      const green = frame.data[index + 1] ?? 0;
      const blue = frame.data[index + 2] ?? 0;
      buckets.add(`${red >> 5}:${green >> 5}:${blue >> 5}`);
      if (x + 2 < frame.width) {
        const neighbor = (y * frame.width + x + 2) * 4;
        const delta = Math.abs(red - (frame.data[neighbor] ?? 0)) + Math.abs(green - (frame.data[neighbor + 1] ?? 0)) + Math.abs(blue - (frame.data[neighbor + 2] ?? 0));
        contrastEdges += delta > 36 ? 1 : 0;
        contrastSamples += 1;
      }
    }
  }
  return {
    averageColor: averageColor(frame),
    colorBucketCount: buckets.size,
    colorBucketRatio: totalPixels <= 0 ? 0 : buckets.size / Math.max(1, Math.ceil(frame.width / 2) * Math.ceil(frame.height / 2)),
    height: frame.height,
    localContrastRatio: contrastSamples <= 0 ? 0 : contrastEdges / contrastSamples,
    nonblank: analyzeNonblank(frame),
    projectedBounds,
    visibleBoundsAreaRatio,
    width: frame.width,
  };
}

function visualQualityDiagnostics(metrics: ReturnType<typeof analyzeGameScreenshot>): Array<{ code: string; message: string; severity: "error" | "warning"; suggestion?: string }> {
  const diagnostics: Array<{ code: string; message: string; severity: "error" | "warning"; suggestion?: string }> = [];
  if (!metrics.nonblank.ok) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_BLANK",
      message: `Screenshot nonblank ratio ${metrics.nonblank.changedPixelRatio.toFixed(4)} is below ${metrics.nonblank.threshold}.`,
      severity: "error",
      suggestion: "Fix camera, lighting, scene loading, or screenshot timing before accepting visual proof.",
    });
  }
  if (metrics.visibleBoundsAreaRatio < 0.08) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_TINY_SUBJECT",
      message: `Visible projected bounds cover ${(metrics.visibleBoundsAreaRatio * 100).toFixed(1)}% of the screenshot.`,
      severity: "error",
      suggestion: "Improve camera framing, scale, landmarks, or object placement so the playable scene is readable.",
    });
  }
  if (metrics.colorBucketCount < 12) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_LOW_COLOR_VARIETY",
      message: `Screenshot only contains ${metrics.colorBucketCount} coarse color buckets.`,
      severity: "warning",
      suggestion: "Add authored materials, lighting variation, set dressing, or UI/object accents.",
    });
  }
  if (metrics.localContrastRatio < 0.01) {
    diagnostics.push({
      code: "TN_GAME_QA_VISUAL_QUALITY_LOW_CONTRAST",
      message: `Screenshot local contrast ratio ${metrics.localContrastRatio.toFixed(4)} is very low.`,
      severity: "warning",
      suggestion: "Add silhouette contrast, shadows, material detail, boundaries, or readable objective markers.",
    });
  }
  return diagnostics;
}

function resolveProofArtifactPath(step: IGameProofStepSpec, projectPath: string): string | undefined {
  const artifact = step.args[0];
  return artifact === undefined ? undefined : isAbsolute(artifact) ? artifact : resolve(projectPath, artifact);
}

async function optionalFileStat(path: string): Promise<{ size: number } | undefined> {
  try {
    const info = await stat(path);
    return { size: info.size };
  } catch {
    return undefined;
  }
}

async function directoryByteStats(path: string): Promise<{ byteSize: number; exists: boolean; fileCount: number; path: string }> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      return { byteSize: info.size, exists: true, fileCount: 1, path };
    }
  } catch {
    return { byteSize: 0, exists: false, fileCount: 0, path };
  }
  const entries = await readdir(path, { withFileTypes: true });
  let byteSize = 0;
  let fileCount = 0;
  for (const entry of entries) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) {
      const childStats = await directoryByteStats(child);
      byteSize += childStats.byteSize;
      fileCount += childStats.fileCount;
    } else if (entry.isFile()) {
      const file = await stat(child);
      byteSize += file.size;
      fileCount += 1;
    }
  }
  return { byteSize, exists: true, fileCount, path };
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
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
