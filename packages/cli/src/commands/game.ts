import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

import {
  applyAuthoringRecipe,
  createGameAgentInventory,
  createGameQualityReport,
  GAME_WORKFLOW_PHASE_IDS,
  listAuthoringRecipeIds,
  planAuthoringRecipe,
  supportedPrefabPrimitives,
  validateGameQualityReport,
  type GameProductionMode,
  type IGameWorkflowReport,
} from "@threenative/authoring";
import { compileTypedGameSpecFile } from "@threenative/compiler";
import { selectGameArchetype, type GameArchetypeId } from "../archetypes/registry.js";
import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { matchGameKitCandidates } from "../game/kits.js";
import { buildGameTaskGraph } from "../game/taskGraph.js";
import { gameProvidersCommand } from "./game/providers.js";
import { ensureReleaseAssetBudgetProof, runGameQaProof, type IGameCommandOptions, type IGameProofRun } from "./gameQaProof.js";
import { gameScaleCommand } from "./gameScale.js";
import { hasNonEmptyString, hasStringArray, isPlayerLikeEntityId, isRecord, readFlag, resolveProjectPath } from "./gameShared.js";
import { buildPlaytestScaffoldScenario, type PlaytestScaffoldMechanic } from "./playtestScaffold.js";

import { type IGameplayBlockDescriptor, type IGamePlan, type IGamePlanStep } from "./gamePlanTypes.js";
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

async function gamePlanCommand(argv: readonly string[]): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const fullJson = normalizedArgv.includes("--full-json") || normalizedArgv.includes("--stdout-plan");
  const apply = normalizedArgv.includes("--apply");
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
  const archetype = selectGameArchetype(goal);
  const kitCandidates = matchGameKitCandidates(goal);
  const gameplayBlocks = buildGameplayBlocks(goal);
  const plan: IGamePlan = {
    acceptanceCriteria: [
      "A player can understand the objective from the first screen and complete or fail the loop with real input.",
      "Every high-value visual surface has an asset, authored mesh, or documented fallback with provenance.",
      "Gameplay behavior lives in src/scripts/**/*.ts and every exported system is referenced from structured source.",
      "The scene has authored materials, lighting, camera framing, environment context, and set dressing instead of a placeholder floor and loose primitives.",
      "Proof includes authoring validation, build, playtest motion, screenshot, game score, QA, and release checks.",
    ],
    archetype: archetype.id,
    archetypeDetails: {
      controls: archetype.controls,
      lookProfile: archetype.lookProfile,
      probe: archetype.probe.path,
      script: archetype.script,
      summary: archetype.summary,
    },
    assetPlan: buildAssetPlan(gameCategory),
    code: "TN_GAME_PLAN",
    design: {
      controls: [...archetype.controls, "retry/pause input path", "touch-control fallback when mobile is in scope"],
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
    gameplayBlocks,
    kitCandidates,
    mechanicDecomposition: buildMechanicDecomposition(goal, gameplayBlocks, inventory),
    message: "Deterministic game-production plan generated without mutating source.",
    mutate: false,
    phases: GAME_WORKFLOW_PHASE_IDS.map((id, index) => ({ id, order: index + 1, summary: phaseSummary(id) })),
    polishPlan: buildPolishPlan(),
    proofCommands: [
      "tn iterate --project . --json",
      "tn playtest report --latest --scenario <name> --json",
      "tn playtest --project . --suggest-scenario smoke-movement --json",
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
  const planArtifactPath = resolve(projectPath, "artifacts/game-production/plan.json");
  await mkdir(resolve(planArtifactPath, ".."), { recursive: true });
  await writeFile(planArtifactPath, `${JSON.stringify(plan, null, 2)}\n`, "utf8");
  await persistGameTaskGraph(projectPath);
  if (apply) {
    return applyGamePlanScaffold({ json, plan, planArtifactPath, projectPath });
  }
  const compactPlan = compactGamePlanForStdout(plan, planArtifactPath);

  return {
    exitCode: 0,
    stdout: json ? `${JSON.stringify(fullJson ? plan : compactPlan, null, 2)}\n` : renderPlan(plan),
  };
}

interface IGameScaffoldDefinition {
  archetype: GameArchetypeId;
  exportName: string;
  modulePath: string;
  proofCommand: string;
  recipeId: "lane-runner" | "top-down-collector";
  scenario: {
    axis: "x" | "z";
    name: string;
    path: string;
    press: string;
  };
}

async function applyGamePlanScaffold(options: { json: boolean; plan: IGamePlan; planArtifactPath: string; projectPath: string }): Promise<ICommandResult> {
  const scaffold = selectGameScaffold(options.plan);
  if (scaffold === undefined) {
    return diagnosticResult(
      {
        code: "TN_GAME_SCAFFOLD_UNSUPPORTED_CATEGORY",
        message: "tn game plan --apply only supports high-confidence top-down collector and lane-runner goals in this scaffold-first slice.",
        suggestedFix: "Use a collector or lane-runner goal, or run tn game plan without --apply and apply a supported recipe manually.",
      },
      { exitCode: 1, json: options.json, stderr: !options.json },
    );
  }

  const step = options.plan.steps.find((candidate) => candidate.recipe === scaffold.recipeId && isRecord(candidate.recipeArgs));
  if (step === undefined || !isRecord(step.recipeArgs)) {
    return diagnosticResult(
      {
        code: "TN_GAME_SCAFFOLD_STEP_MISSING",
        message: `Generated plan did not include an applicable '${scaffold.recipeId}' scaffold step.`,
        suggestedFix: "Regenerate the plan with the current tn game plan command.",
      },
      { exitCode: 1, json: options.json, stderr: !options.json },
    );
  }

  const recipeArgs: Record<string, unknown> = {
    ...step.recipeArgs,
    exportName: scaffold.exportName,
    modulePath: scaffold.modulePath,
    playerId: "scaffold.player",
  };
  const playerId = stringValue(recipeArgs.playerId) ?? "scaffold.player";
  const scriptPath = await ensureScaffoldScript(options.projectPath, scaffold, playerId);
  const planned = planAuthoringRecipe({ args: recipeArgs, projectPath: options.projectPath, recipeId: scaffold.recipeId });
  const result = planned.ok
    ? await applyAuthoringRecipe({ args: recipeArgs, projectPath: options.projectPath, recipeId: scaffold.recipeId })
    : { ...planned, changed: false, filesWritten: [], ok: false, operationResults: [] };

  const diagnostics = result.diagnostics.map((diagnostic) => ({
    code: diagnostic.code,
    message: diagnostic.message,
    path: diagnostic.path,
    severity: diagnostic.severity,
    value: diagnostic.value,
  }));
  if (!result.ok) {
    const payload = {
      applied: [],
      code: "TN_GAME_SCAFFOLD_FAILED",
      diagnostics,
      message: "Scaffold-first plan application failed before writing scenario proof.",
      ok: false,
      plannedWrites: planned.operations.map((operation) => operation.name),
      planArtifactPath: options.planArtifactPath,
      projectPath: options.projectPath,
      recipeId: scaffold.recipeId,
    };
    return {
      exitCode: 1,
      stdout: options.json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
    };
  }

  const sceneId = stringValue(recipeArgs.sceneId) ?? "arena";
  const enrichmentFiles = await enrichScaffoldSource(options.projectPath, scaffold, sceneId, playerId, stringValue(recipeArgs.inputDocId));
  const typedSpecFiles = await syncTypedSpecScaffoldSource(options.projectPath, sceneId, stringValue(recipeArgs.inputDocId));
  const scenarioPaths = await writeScaffoldScenarios(options.projectPath, scaffold, playerId);
  const scaffoldEvidencePath = await writeScaffoldEvidence(options.projectPath, {
    archetype: scaffold.archetype,
    filesWritten: [...new Set([...result.filesWritten, scriptPath, ...enrichmentFiles, ...typedSpecFiles, ...scenarioPaths])].sort(),
    planArtifactPath: options.planArtifactPath,
    recipeId: scaffold.recipeId,
    scenarioPaths,
  });
  await persistGameTaskGraph(options.projectPath);

  const payload = {
    applied: [{
      changed: result.changed,
      filesWritten: [...new Set([...result.filesWritten, scriptPath, ...enrichmentFiles, ...typedSpecFiles, ...scenarioPaths, scaffoldEvidencePath])].sort(),
      ok: result.ok,
      recipe: scaffold.recipeId,
    }],
    code: "TN_GAME_SCAFFOLD_APPLIED",
    diagnostics,
    iterateArtifactPath: "artifacts/iterate/latest/report.json",
    message: "Scaffold-first game plan applied through bounded recipe operations.",
    ok: true,
    planArtifactPath: options.planArtifactPath,
    plannedWrites: planned.operations.map((operation) => operation.name),
    projectPath: options.projectPath,
    archetype: scaffold.archetype,
    proofCommand: "tn iterate --project . --json",
    recipeId: scaffold.recipeId,
    scenarioPaths,
  };

  return {
    exitCode: 0,
    stdout: options.json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

function selectGameScaffold(plan: IGamePlan): IGameScaffoldDefinition | undefined {
  const candidate = plan.kitCandidates.find((kit) => kit.score > 0 && (kit.recipeId === "top-down-collector" || kit.recipeId === "lane-runner"));
  if (candidate?.recipeId === "top-down-collector") {
    return {
      archetype: "top-down",
      exportName: "topDownCollectorSystem",
      modulePath: "src/scripts/player.ts",
      proofCommand: "tn iterate --project . --json",
      recipeId: "top-down-collector",
      scenario: { axis: "x", name: "top-down-collector", path: "playtests/top-down-collector.playtest.json", press: "KeyD" },
    };
  }
  if (candidate?.recipeId === "lane-runner") {
    return {
      archetype: "third-person",
      exportName: "laneRunnerSystem",
      modulePath: "src/scripts/player.ts",
      proofCommand: "tn iterate --project . --json",
      recipeId: "lane-runner",
      scenario: { axis: "x", name: "lane-runner", path: "playtests/lane-runner.playtest.json", press: "ArrowRight" },
    };
  }
  return undefined;
}

async function enrichScaffoldSource(projectPath: string, scaffold: IGameScaffoldDefinition, sceneId: string, playerId: string, inputDocId: string | undefined): Promise<string[]> {
  const relativePath = `content/scenes/${sceneId}.scene.json`;
  const absolutePath = resolve(projectPath, relativePath);
  const scene = JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, unknown>;
  const entities = arrayOfRecords(scene.entities).filter((entity) => !["player", "goal", "coin.01"].includes(String(entity.id)));
  const prefabs = arrayOfRecords(scene.prefabs);
  const resources = arrayOfRecords(scene.resources);
  const systems = arrayOfRecords(scene.systems).filter((system) => system.id !== "move-player-to-goal");
  const ui = isRecord(scene.ui) ? scene.ui : {};
  const uiNodes = arrayOfRecords(ui.nodes);
  const uiBindings = arrayOfRecords(ui.bindings);

  scene.entities = entities;
  scene.prefabs = prefabs;
  scene.resources = resources;
  scene.systems = systems;
  scene.ui = { ...ui, bindings: uiBindings, nodes: uiNodes };

  const system = systems.find((candidate) => candidate.id === scaffold.recipeId);
  if (system !== undefined) {
    system.reads = ["Transform"];
    system.resourceWrites = ["GameState"];
    system.writes = ["Transform"];
  }
  upsertResource(resources, "GameState", scaffold.recipeId === "top-down-collector"
    ? { countdown: "Ready", retryText: "Press R to retry", scoreText: "Score 0 / 5", statusText: "Collect all pickups" }
    : { countdown: "Ready", distanceText: "Distance 0 / 60", retryText: "Press R to retry", statusText: "Run to the finish" });
  removeUiText(uiNodes, uiBindings, "countdown");
  addUiText(uiNodes, uiBindings, "hud.status", scaffold.recipeId === "top-down-collector" ? "Collect all pickups" : "Run to the finish", "GameState.statusText", 24);
  addUiText(uiNodes, uiBindings, "hud.progress", scaffold.recipeId === "top-down-collector" ? "Score 0 / 5" : "Distance 0 / 60", scaffold.recipeId === "top-down-collector" ? "GameState.scoreText" : "GameState.distanceText", 64);
  addUiText(uiNodes, uiBindings, "hud.retry", "Press R to retry", "GameState.retryText", 104);

  if (scaffold.recipeId === "top-down-collector") {
    addPrefab(prefabs, "arena.boundary.prefab", "box", "#111827");
    addPrefab(prefabs, "scaffold.pickup.prefab", "sphere", "#ffd166");
    addEntity(entities, "arena.boundary.north", "arena.boundary.prefab", [0, 0.2, -4], [8, 0.4, 0.2]);
    addEntity(entities, "arena.boundary.south", "arena.boundary.prefab", [0, 0.2, 4], [8, 0.4, 0.2]);
    addEntity(entities, "arena.boundary.east", "arena.boundary.prefab", [4, 0.2, 0], [0.2, 0.4, 8]);
    addEntity(entities, "arena.boundary.west", "arena.boundary.prefab", [-4, 0.2, 0], [0.2, 0.4, 8]);
    for (const [index, position] of [[3.2, 0.6, -3.2], [-3.2, 0.6, -3.2], [3.2, 0.6, 3.2], [-3.2, 0.6, 3.2], [0, 0.6, 3.2]].entries()) {
      addEntity(entities, `pickup.${index + 1}`, "scaffold.pickup.prefab", position as [number, number, number], [0.45, 0.45, 0.45], {
        Collider: {
          kind: "sphere",
          radius: 0.65,
          sensor: { interactionKind: "pickup", occupantLimit: 4, phases: ["enter", "stay"], trackOccupants: true },
          trigger: true,
        },
        RigidBody: { kind: "static" },
      });
    }
  } else {
    addPrefab(prefabs, "scaffold.lane.prefab", "box", "#475569");
    addPrefab(prefabs, "scaffold.hazard.prefab", "box", "#ef4444");
    addPrefab(prefabs, "scaffold.finish.prefab", "box", "#22c55e");
    for (const [index, x] of [-2, 0, 2].entries()) {
      addEntity(entities, `lane.${index + 1}`, "scaffold.lane.prefab", [x, 0.02, -18], [0.08, 0.04, 44]);
    }
    addEntity(entities, "hazard.left", "scaffold.hazard.prefab", [-2, 0.45, -10], [0.8, 0.7, 0.35]);
    addEntity(entities, "hazard.center", "scaffold.hazard.prefab", [0, 0.45, -22], [0.8, 0.7, 0.35]);
    addEntity(entities, "hazard.right", "scaffold.hazard.prefab", [2, 0.45, -34], [0.8, 0.7, 0.35]);
    addEntity(entities, "finish.marker", "scaffold.finish.prefab", [0, 0.3, -60], [6, 0.6, 0.3]);
  }

  await writeFile(absolutePath, `${JSON.stringify(scene, null, 2)}\n`, "utf8");
  const written = [relativePath];
  const inputPath = await enrichScaffoldInput(projectPath, sceneId, inputDocId);
  if (inputPath !== undefined) {
    written.push(inputPath);
  }
  written.push(...await enrichScaffoldSystems(projectPath, scaffold));
  written.push(...await enrichScaffoldUi(projectPath, scaffold));
  written.push(...await retargetStarterPlaytests(projectPath, playerId));
  return [...new Set(written)].sort();
}

async function syncTypedSpecScaffoldSource(projectPath: string, sceneId: string, inputDocId: string | undefined): Promise<string[]> {
  if (!(await isTypedSpecProject(projectPath))) {
    return [];
  }
  const scenePath = `content/scenes/${sceneId}.scene.json`;
  const scene = await readJsonDocument(resolve(projectPath, scenePath));
  const inputPath = await findInputDocumentPath(projectPath, sceneId, inputDocId);
  const input = inputPath === undefined ? undefined : await readJsonDocument(resolve(projectPath, inputPath));
  const materials = await readTypedSpecMaterials(projectPath);
  const spec = {
    ...(input === undefined ? {} : { input: typedInput(input) }),
    ...(materials.length === 0 ? {} : { materials }),
    scenes: [typedScene(scene)],
  };
  const specPath = resolve(projectPath, "src/game.spec.ts");
  await mkdir(resolve(specPath, ".."), { recursive: true });
  await writeFile(specPath, `import { defineTypedGameSpec } from "@threenative/sdk";

export default defineTypedGameSpec(${JSON.stringify(spec, null, 2)});
`, "utf8");
  const compiled = await compileTypedGameSpecFile({ projectPath });
  return [...new Set(["src/game.spec.ts", ...compiled.documents.map((document) => document.path)])].sort();
}

async function isTypedSpecProject(projectPath: string): Promise<boolean> {
  try {
    const config = await readJsonDocument(resolve(projectPath, "threenative.config.json"));
    const production = isRecord(config.production) ? config.production : {};
    return production.authoringMode === "typed-spec";
  } catch {
    return false;
  }
}

async function readJsonDocument(path: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : {};
}

async function readTypedSpecMaterials(projectPath: string): Promise<Record<string, unknown>[]> {
  const materialsDir = resolve(projectPath, "content/materials");
  let entries: string[];
  try {
    entries = await readdir(materialsDir);
  } catch {
    return [];
  }
  const materials: Record<string, unknown>[] = [];
  for (const name of entries.filter((entry) => entry.endsWith(".materials.json")).sort()) {
    try {
      materials.push(...arrayOfRecords((await readJsonDocument(resolve(materialsDir, name))).materials));
    } catch {
      continue;
    }
  }
  return dedupeById(materials).map((material) => stripDocumentMetadata(material));
}

function typedInput(input: Record<string, unknown>): Record<string, unknown> {
  return stripUndefined({
    actions: cloneRecords(input.actions),
    axes: cloneRecords(input.axes),
    id: input.id,
  });
}

function typedScene(scene: Record<string, unknown>): Record<string, unknown> {
  const ui = isRecord(scene.ui) ? typedUi(scene.ui) : undefined;
  return stripUndefined({
    entities: cloneRecords(scene.entities).map(typedEntity),
    id: scene.id,
    initial: scene.initial,
    kind: scene.kind,
    prefabs: cloneRecords(scene.prefabs),
    resources: cloneRecords(scene.resources),
    systems: cloneRecords(scene.systems).map(stripDocumentMetadata),
    ui,
  });
}

function typedEntity(entity: Record<string, unknown>): Record<string, unknown> {
  return stripUndefined({
    components: isRecord(entity.components) ? stripDocumentMetadata(entity.components) : undefined,
    id: entity.id,
    prefab: entity.prefab,
    transform: isRecord(entity.transform) ? stripDocumentMetadata(entity.transform) : undefined,
  });
}

function typedUi(ui: Record<string, unknown>): Record<string, unknown> {
  const nodes = cloneRecords(ui.nodes).map(stripDocumentMetadata);
  const bindings = cloneRecords(ui.bindings).map(typedUiBinding);
  return stripUndefined({
    bindings,
    nodes,
  });
}

function typedUiBinding(binding: Record<string, unknown>): Record<string, unknown> {
  const resource = typeof binding.resource === "string" ? binding.resource : undefined;
  if (resource !== undefined && resource.includes(".")) {
    const [root, ...fields] = resource.split(".");
    return stripUndefined({
      ...stripDocumentMetadata(binding),
      fields: fields.length === 0 ? undefined : fields,
      resource: root,
    });
  }
  return stripDocumentMetadata(binding);
}

function cloneRecords(value: unknown): Record<string, unknown>[] {
  return arrayOfRecords(value).map((entry) => ({ ...entry }));
}

function dedupeById(values: Record<string, unknown>[]): Record<string, unknown>[] {
  const seen = new Set<string>();
  const next: Record<string, unknown>[] = [];
  for (const value of values) {
    const id = typeof value.id === "string" ? value.id : undefined;
    if (id === undefined || seen.has(id)) {
      continue;
    }
    seen.add(id);
    next.push(value);
  }
  return next;
}

function stripDocumentMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (key === "schema" || key === "version" || key === "provenance") {
      continue;
    }
    next[key] = entry;
  }
  return next;
}

function stripUndefined(value: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) {
      next[key] = entry;
    }
  }
  return next;
}

async function enrichScaffoldInput(projectPath: string, sceneId: string, inputDocId: string | undefined): Promise<string | undefined> {
  const inputPath = await findInputDocumentPath(projectPath, sceneId, inputDocId);
  if (inputPath === undefined) {
    return undefined;
  }
  const absolutePath = resolve(projectPath, inputPath);
  const input = JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, unknown>;
  const actions = arrayOfRecords(input.actions);
  input.actions = actions;
  if (!actions.some((action) => action.id === "retry")) {
    actions.push({ bindings: ["keyboard.KeyR"], id: "retry" });
  }
  await writeFile(absolutePath, `${JSON.stringify(input, null, 2)}\n`, "utf8");
  return inputPath;
}

async function findInputDocumentPath(projectPath: string, sceneId: string, inputDocId: string | undefined): Promise<string | undefined> {
  const inputDir = resolve(projectPath, "content/input");
  let entries: string[];
  try {
    entries = await readdir(inputDir);
  } catch {
    return undefined;
  }
  for (const name of entries.filter((entry) => entry.endsWith(".input.json")).sort()) {
    const relativePath = `content/input/${name}`;
    try {
      const parsed = JSON.parse(await readFile(resolve(projectPath, relativePath), "utf8")) as unknown;
      if (isRecord(parsed) && (parsed.id === inputDocId || parsed.id === `${sceneId}-input` || name === `${sceneId}.input.json`)) {
        return relativePath;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

async function enrichScaffoldSystems(projectPath: string, scaffold: IGameScaffoldDefinition): Promise<string[]> {
  const relativePath = "content/systems/arena.systems.json";
  const absolutePath = resolve(projectPath, relativePath);
  let systemsDocument: Record<string, unknown>;
  try {
    systemsDocument = JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }
  const systems = arrayOfRecords(systemsDocument.systems).filter((system) => system.id !== "move-player-to-goal");
  upsertSystem(systems, scaffold.recipeId, scaffold.modulePath, scaffold.exportName);
  systemsDocument.systems = systems;
  await writeFile(absolutePath, `${JSON.stringify(systemsDocument, null, 2)}\n`, "utf8");
  return [relativePath];
}

async function enrichScaffoldUi(projectPath: string, scaffold: IGameScaffoldDefinition): Promise<string[]> {
  const relativePath = "content/ui/hud.ui.json";
  const absolutePath = resolve(projectPath, relativePath);
  let uiDocument: Record<string, unknown>;
  try {
    uiDocument = JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, unknown>;
  } catch {
    return [];
  }
  const nodes = arrayOfRecords(uiDocument.nodes);
  const bindings = arrayOfRecords(uiDocument.bindings);
  uiDocument.nodes = nodes;
  uiDocument.bindings = bindings;
  removeUiText(nodes, bindings, "countdown");
  if (scaffold.recipeId === "top-down-collector") {
    addUiText(nodes, bindings, "hud.progress", "Score 0 / 5", "GameState.scoreText", 24);
    addUiText(nodes, bindings, "hud.status", "Collect all pickups", "GameState.statusText", 64);
  } else {
    addUiText(nodes, bindings, "hud.progress", "Distance 0 / 60", "GameState.distanceText", 24);
    addUiText(nodes, bindings, "hud.status", "Run to the finish", "GameState.statusText", 64);
  }
  addUiText(nodes, bindings, "hud.retry", "Press R to retry", "GameState.retryText", 104);
  await writeFile(absolutePath, `${JSON.stringify(uiDocument, null, 2)}\n`, "utf8");
  return [relativePath];
}

async function retargetStarterPlaytests(projectPath: string, playerId: string): Promise<string[]> {
  const playtestDir = resolve(projectPath, "playtests");
  let entries: string[];
  try {
    entries = await readdir(playtestDir);
  } catch {
    return [];
  }
  const written: string[] = [];
  for (const name of entries.filter((entry) => entry.endsWith(".playtest.json")).sort()) {
    const relativePath = `playtests/${name}`;
    const absolutePath = resolve(projectPath, relativePath);
    let scenario: Record<string, unknown>;
    try {
      scenario = JSON.parse(await readFile(absolutePath, "utf8")) as Record<string, unknown>;
    } catch {
      continue;
    }
    let changed = false;
    if (scenario.subject === "player") {
      scenario.subject = playerId;
      changed = true;
    }
    const assertions = isRecord(scenario.assert) ? scenario.assert : undefined;
    const movement = isRecord(assertions?.movement) ? assertions.movement : undefined;
    if (movement?.entity === "player") {
      movement.entity = playerId;
      changed = true;
    }
    const visibility = Array.isArray(assertions?.visibility) ? assertions.visibility.filter(isRecord) : [];
    for (const item of visibility) {
      if (item.entity === "player") {
        item.entity = playerId;
        changed = true;
      }
    }
    if (changed) {
      await writeFile(absolutePath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
      written.push(relativePath);
    }
  }
  return written;
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function upsertSystem(systems: Record<string, unknown>[], id: string, modulePath: string, exportName: string): void {
  const existing = systems.find((system) => system.id === id);
  const next = {
    id,
    reads: ["Transform"],
    resourceWrites: ["GameState"],
    schedule: "fixedUpdate",
    script: { export: exportName, module: modulePath },
    writes: ["Transform"],
  };
  if (existing === undefined) {
    systems.push(next);
  } else {
    Object.assign(existing, next);
  }
}

function upsertResource(resources: Record<string, unknown>[], id: string, value: Record<string, unknown>): void {
  const existing = resources.find((resource) => resource.id === id);
  if (existing === undefined) {
    resources.push({ id, value });
  } else {
    existing.value = { ...(isRecord(existing.value) ? existing.value : {}), ...value };
  }
}

function addUiText(nodes: Record<string, unknown>[], bindings: Record<string, unknown>[], id: string, text: string, resource: string, top: number): void {
  const layout = { align: "start", justify: "start", left: 32, top, width: 420 };
  const existing = nodes.find((node) => node.id === id);
  if (existing === undefined) {
    nodes.push({ id, layout, text, type: "text" });
  } else {
    Object.assign(existing, { layout, text, type: "text" });
  }
  if (!bindings.some((binding) => binding.node === id && binding.resource === resource)) {
    bindings.push({ node: id, resource });
  }
}

function removeUiText(nodes: Record<string, unknown>[], bindings: Record<string, unknown>[], id: string): void {
  removeMatching(nodes, (node) => node.id === id);
  removeMatching(bindings, (binding) => binding.node === id);
}

function removeMatching<T>(values: T[], shouldRemove: (value: T) => boolean): void {
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value !== undefined && shouldRemove(value)) {
      values.splice(index, 1);
    }
  }
}

function addPrefab(prefabs: Record<string, unknown>[], id: string, primitive: string, color: string): void {
  if (!prefabs.some((prefab) => prefab.id === id)) {
    prefabs.push({ color, id, primitive });
  }
}

function addEntity(
  entities: Record<string, unknown>[],
  id: string,
  prefabId: string,
  position: [number, number, number],
  scale?: [number, number, number],
  components?: Record<string, unknown>,
): void {
  const existing = entities.find((entity) => entity.id === id);
  if (existing === undefined) {
    entities.push({
      ...(components === undefined ? {} : { components }),
      id,
      prefab: prefabId,
      transform: {
        position,
        ...(scale === undefined ? {} : { scale }),
      },
    });
  } else if (components !== undefined) {
    existing.components = { ...(isRecord(existing.components) ? existing.components : {}), ...components };
  }
}

async function ensureScaffoldScript(projectPath: string, scaffold: IGameScaffoldDefinition, playerId: string): Promise<string> {
  const absolutePath = resolve(projectPath, scaffold.modulePath);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  let source = "";
  try {
    source = await readFile(absolutePath, "utf8");
  } catch {
    source = "";
  }
  if (new RegExp(`export\\s+function\\s+${scaffold.exportName}\\b`).test(source)) {
    return scaffold.modulePath;
  }
  const nextSource = `${source.trimEnd()}${source.trim() === "" ? "" : "\n\n"}${scaffoldScriptSource(scaffold, playerId)}\n`;
  await writeFile(absolutePath, nextSource, "utf8");
  return scaffold.modulePath;
}

function scaffoldScriptSource(scaffold: IGameScaffoldDefinition, playerId: string): string {
  if (scaffold.recipeId === "lane-runner") {
    return `export function ${scaffold.exportName}(context: import("@threenative/script-stdlib").ScriptContext): void {
  const player = context.entity("${playerId}") ?? context.query({ limit: 1 })[0];
  if (player === undefined) {
    return;
  }
  const transform = player.transform();
  const position = transform.position || [0, 0.8, 2.5];
  const laneInput = (context.input.action("move-right") ? 1 : 0) - (context.input.action("move-left") ? 1 : 0);
  const dt = context.time.fixedDelta || 1 / 60;
  const game = context.state("GameState", { distanceText: "Distance 0 / 60", retryText: "Press R to retry", statusText: "Run to the finish", failed: false, finished: false });
  if (context.input.action("retry")) {
    game.failed = false;
    game.finished = false;
    transform.position = [0, position[1], 2.5];
    game.distanceText = "Distance 0 / 60";
    game.statusText = "Run to the finish";
    return;
  }
  if (game.failed || game.finished) {
    return;
  }
  const nextPosition: [number, number, number] = [Math.max(-2, Math.min(2, position[0] + laneInput * dt * 6)), position[1], position[2] - dt * 3];
  transform.position = nextPosition;
  const distance = Math.max(0, Math.min(60, Math.round(2.5 - nextPosition[2])));
  game.distanceText = \`Distance \${distance} / 60\`;
  game.failed = (Math.abs(nextPosition[0] + 2) < 0.7 && Math.abs(nextPosition[2] + 10) < 0.9)
    || (Math.abs(nextPosition[0]) < 0.7 && Math.abs(nextPosition[2] + 22) < 0.9)
    || (Math.abs(nextPosition[0] - 2) < 0.7 && Math.abs(nextPosition[2] + 34) < 0.9);
  game.finished = nextPosition[2] <= -60;
  game.statusText = game.failed ? "Crashed - press R to retry" : game.finished ? "Finish reached" : "Run to the finish";
}`;
  }
  return `export function ${scaffold.exportName}(context: import("@threenative/script-stdlib").ScriptContext): void {
  const player = context.entity("${playerId}") ?? context.query({ limit: 1 })[0];
  if (player === undefined) {
    return;
  }
  const transform = player.transform();
  const position = transform.position || [0, 0.8, 0];
  const moveX = context.input.getAxis("MoveX");
  const moveZ = context.input.getAxis("MoveZ");
  const dt = context.time.fixedDelta || 1 / 60;
  const game = context.state("GameState", { collected: "", retryText: "Press R to retry", scoreText: "Score 0 / 5", statusText: "Collect all pickups", won: false });
  const pickups: Array<[string, number, number]> = [["1", 3.2, -3.2], ["2", -3.2, -3.2], ["3", 3.2, 3.2], ["4", -3.2, 3.2], ["5", 0, 3.2]];
  if (context.input.action("retry")) {
    game.collected = "";
    game.scoreText = "Score 0 / 5";
    game.statusText = "Collect all pickups";
    game.won = false;
    transform.position = [0, position[1], 0];
    for (const [id, x, z] of pickups) {
      const pickup = context.entity(\`pickup.\${id}\`);
      if (pickup !== undefined) {
        pickup.transform().position = [x, 0.6, z];
      }
    }
    return;
  }
  if (!game.won) {
    transform.position = [
      Math.max(-3.4, Math.min(3.4, position[0] + moveX * dt * 5)),
      position[1],
      Math.max(-3.4, Math.min(3.4, position[2] - moveZ * dt * 5))
    ];
  }
  const nextPosition = transform.position || position;
  const collected = new Set(String(game.collected).split(",").filter(Boolean));
  for (const [id, x, z] of pickups) {
    if (Math.abs(nextPosition[0] - x) < 0.8 && Math.abs(nextPosition[2] - z) < 0.8) {
      collected.add(id);
    }
    if (collected.has(id)) {
      const pickup = context.entity(\`pickup.\${id}\`);
      if (pickup !== undefined) {
        pickup.transform().position = [x, -10, z];
      }
    }
  }
  game.collected = [...collected].sort().join(",");
  game.scoreText = \`Score \${collected.size} / 5\`;
  game.won = collected.size >= 5;
  game.statusText = game.won ? "All pickups collected - press R to retry" : "Collect all pickups";
}`;
}

async function writeScaffoldScenarios(projectPath: string, scaffold: IGameScaffoldDefinition, playerId: string): Promise<string[]> {
  const specs = scaffoldScenarioSpecs(scaffold);
  const paths: string[] = [];
  for (const spec of specs) {
    const absolutePath = resolve(projectPath, spec.path);
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    const scenario = scaffoldScenarioForGame(scaffold, spec.mechanic, playerId, spec.name);
    await writeFile(absolutePath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
    paths.push(spec.path);
  }
  await writeHudResourceScenario(projectPath, scaffold, playerId);
  return paths;
}

function scaffoldScenarioSpecs(scaffold: IGameScaffoldDefinition): Array<{ mechanic: PlaytestScaffoldMechanic; name: string; path: string }> {
  if (scaffold.recipeId === "top-down-collector") {
    return [
      { mechanic: "movement", name: "top-down-collector", path: "playtests/top-down-collector.playtest.json" },
      { mechanic: "pickup", name: "top-down-collector-pickup", path: "playtests/top-down-collector-pickup.playtest.json" },
      { mechanic: "win-state", name: "top-down-collector-win-state", path: "playtests/top-down-collector-win-state.playtest.json" },
      { mechanic: "retry", name: "top-down-collector-retry", path: "playtests/top-down-collector-retry.playtest.json" },
    ];
  }
  return [
    { mechanic: "movement", name: "lane-runner", path: "playtests/lane-runner.playtest.json" },
    { mechanic: "win-state", name: "lane-runner-win-state", path: "playtests/lane-runner-win-state.playtest.json" },
    { mechanic: "retry", name: "lane-runner-retry", path: "playtests/lane-runner-retry.playtest.json" },
  ];
}

function scaffoldScenarioForGame(scaffold: IGameScaffoldDefinition, mechanic: PlaytestScaffoldMechanic, playerId: string, name: string): ReturnType<typeof buildPlaytestScaffoldScenario> {
  const scenario = buildPlaytestScaffoldScenario(mechanic, {
    hudId: mechanic === "retry" ? "hud.retry" : mechanic === "win-state" ? "hud.status" : "hud.progress",
    resourceId: "GameState",
    subject: playerId,
  });
  scenario.name = name;
  scenario.steps = scenario.steps.map((step) => step.press === "KeyD" ? { ...step, press: scaffold.scenario.press } : step);
  if (scaffold.recipeId === "top-down-collector" && mechanic === "pickup") {
    scenario.steps = [
      { holdFrames: 7, label: "move to pickup x", press: "KeyD", release: true },
      { holdFrames: 7, label: "move to pickup z", press: "KeyW", release: true },
    ];
    if (scenario.assert !== undefined) {
      delete scenario.assert.contacts;
    }
  }
  if (scaffold.recipeId === "top-down-collector" && mechanic === "win-state") {
    scenario.steps = [
      { holdFrames: 7, label: "pickup one x", press: "KeyD", release: true },
      { holdFrames: 7, label: "pickup one z", press: "KeyW", release: true },
      { holdFrames: 14, label: "pickup two x", press: "KeyA", release: true },
      { holdFrames: 14, label: "pickup four z", press: "KeyS", release: true },
      { holdFrames: 14, label: "pickup three x", press: "KeyD", release: true },
      { holdFrames: 7, label: "center for final pickup", press: "KeyA", release: true },
      { holdFrames: 4, label: "finish final pickup", press: "KeyS", release: true },
    ];
  }
  scenario.assert = {
    ...scenario.assert,
    ...(mechanic === "movement"
      ? {
          movement: {
            axis: scaffold.scenario.axis,
            entity: playerId,
            minDistance: 0.05,
            minVelocity: 0.001,
          },
        }
      : {}),
    ...(mechanic === "win-state"
      ? {
          ...(scenario.assert ?? {}),
          hud: [{ id: "hud.status", textIncludes: scaffold.recipeId === "top-down-collector" ? "All pickups collected" : "Finish reached" }],
          resources: scaffold.recipeId === "top-down-collector"
            ? [{ equals: true, id: "GameState", path: "won" }]
            : [{ equals: true, id: "GameState", path: "finished" }],
        }
      : {}),
    ...(mechanic === "retry"
      ? {
          ...(scenario.assert ?? {}),
          hud: [{ id: "hud.retry", textIncludes: "Press R" }],
          resources: [{ id: "GameState", path: "statusText", textIncludes: scaffold.recipeId === "top-down-collector" ? "Collect" : "Run" }],
        }
      : {}),
  };
  return scenario;
}

async function writeHudResourceScenario(projectPath: string, scaffold: IGameScaffoldDefinition, playerId: string): Promise<void> {
  const scenario = {
    artifacts: { effectLog: "focused", screenshots: "before-after" },
    assert: {
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, runtimeReady: true },
      hud: [{ id: "hud.status", textIncludes: scaffold.recipeId === "top-down-collector" ? "Collect all pickups" : "Run to the finish" }],
      resources: [{ equals: scaffold.recipeId === "top-down-collector" ? "Collect all pickups" : "Run to the finish", id: "GameState", path: "statusText" }],
    },
    name: "hud-resource",
    schemaVersion: 1,
    steps: [{ label: "sample-hud", waitFrames: 10 }],
    subject: playerId,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
  const absolutePath = resolve(projectPath, "playtests/hud-resource.playtest.json");
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(scenario, null, 2)}\n`, "utf8");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

async function writeScaffoldEvidence(projectPath: string, evidence: { archetype: GameArchetypeId; filesWritten: string[]; planArtifactPath: string; recipeId: string; scenarioPaths: string[] }): Promise<string> {
  const relativePath = "artifacts/game-production/scaffold-first.json";
  const absolutePath = resolve(projectPath, relativePath);
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(
      {
        archetype: evidence.archetype,
        filesWritten: evidence.filesWritten,
        iterateCommand: "tn iterate --project . --json",
        planArtifactPath: evidence.planArtifactPath,
        proofCommand: "tn iterate --project . --json",
        recipeId: evidence.recipeId,
        scenarioPaths: evidence.scenarioPaths,
        schema: "threenative.game-scaffold-first",
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  return relativePath;
}

function compactGamePlanForStdout(plan: IGamePlan, planArtifactPath: string): Record<string, unknown> {
  return {
    archetype: plan.archetype,
    code: plan.code,
    diagnostics: plan.diagnostics,
    fileMap: {
      scripts: plan.scriptPlan.map((script) => ({ exportName: script.exportName, module: script.module, responsibility: script.responsibility })),
      source: plan.sourcePlan.map((source) => ({ document: source.document, path: source.path })),
    },
    goal: plan.goal,
    kitCandidates: plan.kitCandidates.slice(0, 3).map((kit) => ({ kitId: kit.kitId, recipeId: kit.recipeId, toolingOnly: kit.toolingOnly })),
    mechanicDecomposition: plan.mechanicDecomposition,
    message: "Full game plan written to artifacts/game-production/plan.json.",
    milestones: plan.phases.map((phase) => ({ id: phase.id, order: phase.order, summary: phase.summary })),
    mutate: plan.mutate,
    planArtifactPath,
    proofCommands: plan.proofCommands,
    recipeIds: plan.recipeIds,
    schema: "threenative.game-plan-summary",
    version: "0.1.0",
  };
}

function buildMechanicDecomposition(
  goal: string,
  gameplayBlocks: readonly IGameplayBlockDescriptor[],
  inventory: Awaited<ReturnType<typeof createGameAgentInventory>>,
): IGamePlan["mechanicDecomposition"] {
  const sourceOwner = inventory.primaryScene === undefined ? "content/scenes/arena.scene.json" : inventory.primaryScene.file;
  const scriptOwner = inventory.scripts[0]?.module ?? "src/scripts/player.ts";
  const blockByKind = new Map<string, IGameplayBlockDescriptor>();
  for (const block of gameplayBlocks) {
    if (!blockByKind.has(block.kind)) {
      blockByKind.set(block.kind, block);
    }
  }
  const movement = blockByKind.get("controller") ?? gameplayBlocks.find((block) => block.id.startsWith("controller."));
  const objective = blockByKind.get("objective") ?? gameplayBlocks.find((block) => block.id.startsWith("objective."));
  const camera = blockByKind.get("camera");
  const spawn = blockByKind.get("spawn");
  const rows: IGamePlan["mechanicDecomposition"] = [
    mechanicRow({
      block: movement,
      command: movement?.recipeIds[0] === undefined ? "tn add follow-camera --project . --json" : `tn recipe apply ${movement.recipeIds[0]} --scene <scene-id> --entity <player-id> --camera <camera-id> --project . --json`,
      fallbackCookbookId: "player-move-wasd",
      mechanic: "movement",
      owner: scriptOwner,
      summary: "Author continuous input response through portable script state and declared Transform/resource writes.",
    }),
    mechanicRow({
      block: objective,
      command: objective?.recipeIds[0] === undefined ? "tn add score --project . --json" : `tn recipe apply ${objective.recipeIds[0]} --scene <scene-id> --entity <target-id> --project . --json`,
      fallbackCookbookId: cookbookForGoal(goal),
      mechanic: "objective-progression",
      owner: sourceOwner,
      summary: "Track progress, scoring, win/fail state, and retry through source-owned resources and retained UI.",
    }),
    mechanicRow({
      block: camera,
      command: "tn add follow-camera --project . --json",
      fallbackCookbookId: "follow-camera",
      mechanic: "camera-feedback",
      owner: sourceOwner,
      summary: "Keep the player, objective, and feedback moments framed without runtime adapter handles.",
    }),
    mechanicRow({
      block: spawn,
      command: spawn === undefined ? "tn add spawner --project . --json" : "tn add spawner --project . --json",
      fallbackCookbookId: "kinematic-hazard",
      mechanic: "hazards-or-rewards",
      owner: sourceOwner,
      summary: "Place hazards, rewards, checkpoints, or targets from data so playtests can discover stable IDs.",
    }),
  ];
  return rows;
}

function mechanicRow(options: {
  block?: IGameplayBlockDescriptor;
  command: string;
  fallbackCookbookId: string;
  mechanic: string;
  owner: string;
  summary: string;
}): IGamePlan["mechanicDecomposition"][number] {
  return {
    command: options.command,
    cookbookId: options.block?.id ?? options.fallbackCookbookId,
    mechanic: options.mechanic,
    owner: options.owner,
    proof: options.block?.proof[0] ?? "tn iterate --project . --json",
    summary: options.summary,
  };
}

function cookbookForGoal(goal: string): string {
  const text = goal.toLowerCase();
  if (matchesAny(text, ["race", "checkpoint", "lap", "vehicle", "kart", "car"])) {
    return "checkpoint-race-progress";
  }
  if (matchesAny(text, ["physics", "knock", "throw", "projectile", "target"])) {
    return "physics-knockdown";
  }
  if (matchesAny(text, ["collect", "coin", "pickup", "gather"])) {
    return "collectible-respawn";
  }
  return "trigger-zone-win";
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
    recipeGameplayBlocks: plan.gameplayBlocks,
    recipeGeneratedIds: plan.generatedIds,
    recipeProofCommands: plan.proofCommands,
    recipeProofHints: plan.proofHints,
    recipeScriptResponsibilities: plan.scriptResponsibilities,
    recipeSourceOwners: plan.sourceOwners,
  };
}

function buildGameplayBlocks(goal: string): IGameplayBlockDescriptor[] {
  const text = goal.toLowerCase();
  const blocks = new Map<string, IGameplayBlockDescriptor>();
  const add = (block: IGameplayBlockDescriptor): void => {
    blocks.set(block.id, block);
  };
  add(gameplayBlock({
    appliesWhen: ["all generated 3D games"],
    cautions: ["Use this descriptor as the only source of truth for right/up/forward signs before authoring movement math."],
    helperImports: ["BasisEx"],
    id: "basis.y-up-z-forward",
    kind: "basis",
    proof: ["pnpm --filter @threenative/script-stdlib test"],
    recipeIds: ["third-person-controller", "top-down-collector", "lane-runner", "vehicle-checkpoint"],
    scriptResponsibilities: ["convert planar input through BasisEx before writing Transform or velocity state"],
    source: "gameblocks-inspired",
  }));
  add(gameplayBlock({
    appliesWhen: ["third-person", "top-down", "obstacle", "generic character goals"],
    cautions: ["Do not read runtime camera or renderer objects; pass input, dt, pose, and velocity as plain data."],
    helperImports: ["BasisEx", "ControllerEx"],
    id: "controller.world-cardinal-character",
    kind: "controller",
    proof: ["tn playtest --project . --entity <player-id> --press KeyD --frames 30 --expect-moved --json"],
    recipeIds: ["third-person-controller", "kinematic-character", "obstacle-avoider"],
    scriptResponsibilities: ["owns movement intent", "owns yaw/velocity resource writes"],
    source: "gameblocks-inspired",
  }));
  add(gameplayBlock({
    appliesWhen: ["camera follows player, vehicle, runner, or top-down pawn"],
    cautions: ["Camera target and offset must be authored source data or pure CameraMath output, not adapter handles."],
    helperImports: ["CameraMath"],
    id: "camera.position-follow",
    kind: "camera",
    proof: ["tn screenshot --project . --url <preview-url> --out artifacts/game-production/screenshot.png --wait-ready --json"],
    recipeIds: ["third-person-controller", "top-down-collector", "lane-runner", "vehicle-checkpoint"],
    scriptResponsibilities: ["keeps target framing and follow offset consistent with authored camera source"],
    source: "gameblocks-inspired",
  }));
  if (matchesAny(text, ["collect", "coin", "pickup", "rescue", "salvage", "gather"])) {
    add(gameplayBlock({
      appliesWhen: ["collector and rescue goals"],
      cautions: ["Trigger collection must update declared resources and retained UI instead of DOM HUD state."],
      helperImports: ["CollectorKit", "BasisEx", "ControllerEx"],
      id: "objective.collectible",
      kind: "objective",
      proof: ["tn game qa --project . --run-proof --json"],
      recipeIds: ["collectible", "top-down-collector"],
      scriptResponsibilities: ["owns collectible progress", "owns score resource and HUD text"],
      source: "threenative",
    }));
    add(gameplayBlock({
      appliesWhen: ["top-down collectors and compact arena pickups"],
      cautions: ["Forward/right signs come from BasisEx; avoid hand-authored axis swaps in scripts."],
      helperImports: ["BasisEx", "ControllerEx"],
      id: "controller.top-down-cardinal",
      kind: "controller",
      proof: ["tn playtest --project . --entity <player-id> --press KeyW --frames 30 --expect-moved --json"],
      recipeIds: ["top-down-collector"],
      scriptResponsibilities: ["owns top-down movement intent"],
      source: "gameblocks-inspired",
    }));
  }
  if (matchesAny(text, ["lane", "runner", "run", "dodge", "avoid", "hazard"])) {
    add(gameplayBlock({
      appliesWhen: ["lane runner and obstacle dodging goals"],
      cautions: ["Lane state must be plain resource data with deterministic fail/retry events."],
      helperImports: ["LaneRunnerKit", "BasisEx"],
      id: "controller.lane-runner",
      kind: "controller",
      proof: ["tn playtest --project . --entity <player-id> --press ArrowLeft --frames 30 --expect-moved --json"],
      recipeIds: ["lane-runner", "obstacle-avoider"],
      scriptResponsibilities: ["owns lane index", "owns forward progression", "owns hazard fail state"],
      source: "gameblocks-inspired",
    }));
    add(gameplayBlock({
      appliesWhen: ["hazard, obstacle, timing, and dodge loops"],
      cautions: ["Do not infer collisions from screenshots; preserve trigger/contact evidence."],
      helperImports: ["LaneRunnerKit"],
      id: "objective.obstacle-avoid",
      kind: "objective",
      proof: ["tn game qa --project . --run-proof --json"],
      recipeIds: ["lane-runner", "obstacle-avoider"],
      scriptResponsibilities: ["owns fail/retry state", "owns obstacle trigger events"],
      source: "threenative",
    }));
  }
  if (matchesAny(text, ["race", "checkpoint", "lap", "vehicle", "kart", "car", "boat", "courier", "ferry"])) {
    add(gameplayBlock({
      appliesWhen: ["vehicle and checkpoint racing goals"],
      cautions: ["This is kinematic intent, not promoted wheel or drivetrain physics."],
      helperImports: ["BasisEx", "CheckpointRaceEx"],
      id: "controller.vehicle-cardinal",
      kind: "controller",
      proof: ["tn playtest --project . --entity <vehicle-id> --press KeyW --frames 30 --expect-moved --json"],
      recipeIds: ["vehicle-checkpoint"],
      scriptResponsibilities: ["owns throttle/steer intent", "owns checkpoint-facing yaw"],
      source: "gameblocks-inspired",
    }));
    add(gameplayBlock({
      appliesWhen: ["checkpoint, lap, race, delivery-route, and waypoint objectives"],
      cautions: ["Checkpoint order and lap finish events must come from plain reducer state, not visible mesh order guesses."],
      helperImports: ["CheckpointRaceEx"],
      id: "objective.checkpoint-lap",
      kind: "objective",
      proof: ["tn game qa --project . --run-proof --json"],
      recipeIds: ["vehicle-checkpoint"],
      scriptResponsibilities: ["owns checkpoint progress", "owns lap and finish events", "owns retry state"],
      source: "gameblocks-inspired",
    }));
  }
  if (matchesAny(text, ["spawn", "wave", "enemy", "combat", "target", "projectile", "physics"])) {
    add(gameplayBlock({
      appliesWhen: ["spawned targets, waves, projectile targets, and combat arenas"],
      cautions: ["Spawn regions are plain data; do not sample from runtime geometry or physics backends."],
      helperImports: ["SpawnEx", "RandomEx"],
      id: "spawn.region-sampler",
      kind: "spawn",
      proof: ["tn game qa --project . --run-proof --json"],
      recipeIds: ["physics-target", "vehicle-checkpoint"],
      scriptResponsibilities: ["owns deterministic spawn points", "owns blocked-region rejection"],
      source: "gameblocks-inspired",
    }));
  }
  return [...blocks.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function gameplayBlock(input: IGameplayBlockDescriptor): IGameplayBlockDescriptor {
  return {
    ...input,
    appliesWhen: [...input.appliesWhen],
    cautions: [...input.cautions],
    helperImports: [...input.helperImports].sort(),
    proof: [...input.proof],
    recipeIds: [...input.recipeIds].sort(),
    scriptResponsibilities: [...input.scriptResponsibilities],
  };
}

function matchesAny(text: string, needles: readonly string[]): boolean {
  return needles.some((needle) => text.includes(needle));
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
      "tn game plan --goal <text> [--project <path>] [--json] [--full-json] [--apply]",
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
          scenarioCoverage: report.proofRun.scenarioCoverage,
          steps: report.proofRun.steps.map((step) => ({
            code: step.code,
            command: step.command,
            durationMs: step.durationMs,
            evidence: step.evidence,
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
  return `${plan.message}\n\nArchetype:\n  ${plan.archetype}: ${plan.archetypeDetails.summary}\n\nDesign:\n  ${plan.design.objective}\n  ${plan.design.loop}\n\nAssets:\n${plan.assetPlan.map((asset) => `  ${asset.surface}: ${asset.sourcePreference}`).join("\n")}\n\nSource:\n${plan.sourcePlan.map((source) => `  ${source.document} (${source.path}): ${source.supportedShape[0]}`).join("\n")}\n\nScripts:\n${plan.scriptPlan.map((script) => `  ${script.module}#${script.exportName}: ${script.responsibility}`).join("\n")}\n\nPolish:\n${plan.polishPlan.map((item) => `  ${item.category}: ${item.treatment}`).join("\n")}\n\nPhases:\n${plan.phases.map((phase) => `  ${phase.order}. ${phase.id}: ${phase.summary}`).join("\n")}\n\nProof:\n${plan.proofCommands.map((command) => `  ${command}`).join("\n")}\n`;
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
  const hasIterateProof = proofCommands.some((command) => command.includes("tn iterate"));
  const requiredProofCommands = [
    (command: string) => hasIterateProof || command.includes("tn authoring validate"),
    (command: string) => hasIterateProof || command.includes("tn build"),
    (command: string) => hasIterateProof || (command.includes("tn playtest") && command.includes("--expect-moved")),
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
