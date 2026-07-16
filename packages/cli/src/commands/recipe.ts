import {
  applyAuthoringRecipe,
  getAuthoringOperationDescriptor,
  hashAuthoringTransactionBytes,
  listAuthoringRecipeIds,
  loadAuthoringProject,
  planAuthoringRecipe,
  publishAuthoringTransaction,
  type IAuthoringRecipeApplyResult,
  type IAuthoringRecipePlanResult,
} from "@threenative/authoring";
import { randomUUID } from "node:crypto";
import { access, copyFile, cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

import { type ICommandResult } from "../diagnostics.js";
import { buildGameTaskGraph } from "../game/taskGraph.js";
import { mechanicRecipeBlockIds, mechanicRecipeCompositions } from "../mechanicBlocks/descriptors.js";
import { removeSpatialMechanicComposition, writeSpatialMechanicBlock } from "../mechanicBlocks/spatial.js";

const recipeCompositions = mechanicRecipeCompositions();

interface IRecipeCommandOptions {
  cwd?: string;
}

export async function recipeCommand(argv: readonly string[], options: IRecipeCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const positionals = readPositionals(normalizedArgv);
  const action = positionals[0] === "apply" || positionals[0] === "remove" ? positionals[0] : "apply";
  const recipeId = positionals[0] === "apply" || positionals[0] === "remove" ? positionals[1] : positionals[0];
  const json = normalizedArgv.includes("--json");
  const fullJson = normalizedArgv.includes("--full-json");
  const dryRun = normalizedArgv.includes("--dry-run");
  const projectPath = resolveProjectPath(normalizedArgv, options.cwd);

  if (recipeId === undefined) {
    return renderUsage(json, "TN_RECIPE_ARGS_MISSING");
  }
  if (action === "remove") {
    if (mechanicRecipeBlockIds(recipeId).length === 0) return renderUsage(json, "TN_RECIPE_REMOVE_UNSUPPORTED");
    const removed = await removeSpatialMechanicComposition(projectPath);
    const payload = { ...removed, message: removed.ok ? "Spatial grid objective recipe removed." : "Spatial grid objective recipe removal failed.", recipeId };
    return { exitCode: removed.ok ? 0 : 1, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
  }

  const args = recipeArgs(normalizedArgv);
  if (dryRun) {
    const plan = planAuthoringRecipe({ args, projectPath, recipeCompositions, recipeId });
    return renderRecipePlan(plan, json);
  }

  const result = await applyRecipeTransaction(recipeId, args, projectPath);
  if (result.ok) {
    await persistGameTaskGraph(projectPath);
  }
  const proofHandoff = result.ok ? await readPlanProofHandoff(projectPath) : undefined;
  return renderRecipeApply(result, json, fullJson, proofHandoff);
}

async function applyRecipeTransaction(recipeId: string, args: Record<string, unknown>, projectPath: string): Promise<IAuthoringRecipeApplyResult> {
  const preflight = planAuthoringRecipe({ args, projectPath, recipeCompositions, recipeId });
  if (!preflight.ok) {
    return { ...preflight, changed: false, filesWritten: [], operationResults: [] };
  }
  const transactionRoot = await mkdtemp(join(tmpdir(), "tn-cli-recipe-"));
  const stagedProjectPath = join(transactionRoot, "project");
  try {
    await stageRecipeSources(projectPath, stagedProjectPath, preflight);
    const mechanicBlocks = mechanicRecipeBlockIds(recipeId);
    if (mechanicBlocks.length > 0) {
      await stageSpatialRecipeSources(projectPath, stagedProjectPath);
    }
    const replacedLegacyFiles = recipeId === "vehicle-checkpoint"
      ? await removeVehicleCheckpointLegacySystems(stagedProjectPath, stringArg(args, "sceneId") ?? "arena")
      : [];
    const scaffoldedScript = await scaffoldRecipeScript(recipeId, args, stagedProjectPath);
    const recipeArgsWithProvenance = await recipeArgsWithBehaviorProvenance(args, preflight, stagedProjectPath);
    const result = await applyAuthoringRecipe({ args: recipeArgsWithProvenance, projectPath: stagedProjectPath, recipeCompositions, recipeId });
    if (result.ok && mechanicBlocks.length > 0) {
      const spatialResults = [];
      for (const block of mechanicBlocks) {
        spatialResults.push(await writeSpatialMechanicBlock(block, { args: [], projectPath: stagedProjectPath }));
      }
      result.changed = true;
      result.filesWritten = Array.from(new Set(spatialResults.flatMap((entry) => entry.filesWritten))).sort();
    }
    if (result.ok && scaffoldedScript !== undefined) {
      result.changed = true;
      result.filesWritten = Array.from(new Set([...result.filesWritten, scaffoldedScript])).sort();
    }
    if (result.ok && replacedLegacyFiles.length > 0) {
      result.changed = true;
      result.filesWritten = Array.from(new Set([...result.filesWritten, ...replacedLegacyFiles])).sort();
    }
    await scaffoldProofRecipe(result, stagedProjectPath);
    await scaffoldVehicleCheckpointArtifacts(result, args, stagedProjectPath);
    if (!result.ok) {
      return remapRecipeResult(result, projectPath, false);
    }
    result.filesWritten = await changedRecipeFiles(stagedProjectPath, projectPath, result.filesWritten);
    result.changed = result.filesWritten.length > 0;
    const publication = await publishRecipeFiles(stagedProjectPath, projectPath, result.filesWritten);
    result.diagnostics.push(...publication.diagnostics);
    result.ok = publication.ok;
    result.filesWritten = publication.filesWritten;
    result.changed = publication.committed && publication.filesWritten.length > 0;
    return remapRecipeResult(result, projectPath, publication.committed);
  } finally {
    await rm(transactionRoot, { force: true, recursive: true });
  }
}

async function stageSpatialRecipeSources(projectPath: string, stagedProjectPath: string): Promise<void> {
  for (const path of ["content/scenes", "content/input", "content/systems", "content/ui", "content/mechanics", "src/scripts", "playtests"]) {
    await cp(resolve(projectPath, path), resolve(stagedProjectPath, path), { force: true, recursive: true }).catch((error: unknown) => {
      if (!isMissingPathError(error)) throw error;
    });
  }
}

async function stageRecipeSources(projectPath: string, stagedProjectPath: string, plan: IAuthoringRecipePlanResult): Promise<void> {
  await mkdir(stagedProjectPath, { recursive: true });
  const project = await loadAuthoringProject({ projectPath });
  const operationTargets = await Promise.all(plan.operations.map(async (operation) => {
    const descriptor = getAuthoringOperationDescriptor(operation.name);
    return descriptor === undefined ? [] : descriptor.targetResolver({ args: operation.args, projectPath });
  }));
  const scriptOperation = plan.operations.find((operation) => operation.name === "scene.attach_script");
  const modulePath = stringArg(scriptOperation?.args ?? {}, "modulePath");
  const proofPath = gameKitRecipeIds.has(plan.recipeId) ? `content/proofs/${plan.recipeId}.proof.json` : undefined;
  const vehicleSystemsPath = plan.recipeId === "vehicle-checkpoint"
    ? `content/systems/${stringArg(scriptOperation?.args ?? {}, "sceneId") ?? "arena"}.systems.json`
    : undefined;
  const vehicleUiPath = plan.recipeId === "vehicle-checkpoint" ? "content/ui/hud.ui.json" : undefined;
  const paths = [...new Set([
    ...project.documents.map((document) => document.projectRelativePath),
    ...operationTargets.flat(),
    ...(modulePath === undefined ? [] : [modulePath]),
    ...(proofPath === undefined ? [] : [proofPath]),
    ...(vehicleSystemsPath === undefined ? [] : [vehicleSystemsPath]),
    ...(vehicleUiPath === undefined ? [] : [vehicleUiPath]),
  ])].sort();
  for (const path of paths) {
    const source = resolve(projectPath, path);
    const destination = resolve(stagedProjectPath, path);
    await mkdir(resolve(destination, ".."), { recursive: true });
    await copyFile(source, destination).catch((error: unknown) => {
      if (!isMissingPathError(error)) throw error;
    });
  }
  await cp(resolve(projectPath, "src/scripts"), resolve(stagedProjectPath, "src/scripts"), { force: true, recursive: true }).catch((error: unknown) => {
    if (!isMissingPathError(error)) throw error;
  });
}

async function recipeArgsWithBehaviorProvenance(
  args: Record<string, unknown>,
  plan: IAuthoringRecipePlanResult,
  projectPath: string,
): Promise<Record<string, unknown>> {
  const scriptOperation = plan.operations.find((operation) => operation.name === "scene.attach_script");
  const modulePath = stringArg(scriptOperation?.args ?? {}, "modulePath");
  const exportName = stringArg(scriptOperation?.args ?? {}, "exportName");
  if (modulePath === undefined || exportName === undefined) return args;
  const source = await readFile(resolve(projectPath, modulePath), "utf8").catch(() => undefined);
  return source !== undefined && hasBehaviorExport(source, exportName)
    ? { ...args, systemSource: "behavior-metadata" }
    : args;
}

async function publishRecipeFiles(stagedProjectPath: string, projectPath: string, files: readonly string[]) {
  return publishAuthoringTransaction({
    files: await Promise.all(files.map(async (file) => {
      const existing = await readFile(resolve(projectPath, file)).catch((error: unknown) => {
        if (isMissingPathError(error)) return undefined;
        throw error;
      });
      return {
        baseHash: existing === undefined ? null : hashAuthoringTransactionBytes(existing),
        bytes: await readFile(resolve(stagedProjectPath, file)),
        path: file,
      };
    })),
    projectPath,
    transactionId: `recipe-${randomUUID()}`,
  });
}

async function persistGameTaskGraph(projectPath: string): Promise<void> {
  const graph = await buildGameTaskGraph({ projectPath });
  const outPath = resolve(projectPath, "artifacts/game-production/task-graph.json");
  await mkdir(resolve(outPath, ".."), { recursive: true });
  await writeFile(outPath, `${JSON.stringify(graph, null, 2)}\n`, "utf8");
}

async function scaffoldRecipeScript(recipeId: string, args: Record<string, unknown>, projectPath: string): Promise<string | undefined> {
  const recipePlan = planAuthoringRecipe({ args, projectPath, recipeCompositions, recipeId });
  const scriptOperation = recipePlan.operations.find((operation) => operation.name === "scene.attach_script");
  const modulePath = stringArg(scriptOperation?.args ?? {}, "modulePath");
  const exportName = stringArg(scriptOperation?.args ?? {}, "exportName");
  const script = modulePath === undefined || exportName === undefined
    ? undefined
    : {
        exportName,
        modulePath,
        source: recipeScriptSource(recipeId, exportName, recipePlan.scriptResponsibilities, args),
      };
  if (script === undefined) {
    return undefined;
  }
  const absolutePath = resolve(projectPath, script.modulePath);
  if (await pathExists(absolutePath)) {
    const source = await readFile(absolutePath, "utf8");
    if (hasNamedExport(source, script.exportName) && !hasEmptyRecipeExport(source, script.exportName)) {
      return undefined;
    }
    const nextSource = hasEmptyRecipeExport(source, script.exportName)
      ? source.replace(recipeExportPattern(script.exportName), script.source.trimEnd())
      : `${source.trimEnd()}\n\n${script.source}`;
    await writeFile(absolutePath, `${nextSource.trimEnd()}\n`, "utf8");
    return script.modulePath;
  }
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(absolutePath, script.source, "utf8");
  return script.modulePath;
}

function recipeScriptSource(recipeId: string, exportName: string, responsibilities: readonly string[], args: Record<string, unknown>): string {
  const metadata = recipeId === "vehicle-checkpoint"
    ? `{ schedule: "fixedUpdate", reads: ["Transform"], resourceReads: ["RaceState"], resourceWrites: ["RaceState"], writes: ["Transform"] }`
    : recipeId === "top-down-collector"
    ? `{ schedule: "fixedUpdate", reads: ["Transform"], resourceReads: ["GameState"], resourceWrites: ["GameState"], writes: ["Transform"] }`
    : recipeId === "kinematic-character" || recipeId === "lane-runner"
    ? `{ schedule: "fixedUpdate", reads: ["Transform"], writes: ["Transform"] }`
    : `{ schedule: "fixedUpdate" }`;
  const vehicleId = stringArg(args, "vehicleId") ?? "player";
  const playerId = stringArg(args, "playerId") ?? "player";
  const goalId = stringArg(args, "goalId") ?? "coin.01";
  const body = recipeId === "vehicle-checkpoint"
    ? `  const vehicle = context.entity(${JSON.stringify(vehicleId)});
  if (vehicle === undefined) return;
  const initial = { checkpointCount: 5, finished: false, nextCheckpoint: 0, progressText: "Checkpoint 0 / 5", statusText: "DRIVE THROUGH THE GATES - R/ENTER: RETRY", time: 0, timeText: "Time 0.0s" };
  const race = context.resources.get("RaceState", initial);
  if (context.input.action("retry")) {
    vehicle.transform().setPosition([0, 0.35, 2]);
    context.resources.patch("RaceState", initial);
    return;
  }
  if (race.finished) return;
  const throttle = context.input.axis("Throttle");
  const steer = context.input.axis("Steer");
  if (throttle === 0 && steer === 0) return;
  const transform = vehicle.transform();
  const position = transform.position;
  const nextPosition: [number, number, number] = [position[0] + steer * 0.06, position[1], position[2] - throttle * 0.1];
  transform.setPosition(nextPosition);
  race.time += context.time.fixedDelta;
  while (race.nextCheckpoint < race.checkpointCount && nextPosition[2] <= 0.3 - race.nextCheckpoint * 2) race.nextCheckpoint += 1;
  race.finished = race.nextCheckpoint >= race.checkpointCount;
  race.progressText = \`Checkpoint \${race.nextCheckpoint} / \${race.checkpointCount}\`;
  race.timeText = \`Time \${race.time.toFixed(1)}s\`;
  race.statusText = race.finished ? \`FINISH! \${race.timeText} - R/ENTER: RETRY\` : \`NEXT GATE \${race.nextCheckpoint + 1} - R/ENTER: RETRY\`;
  context.resources.patch("RaceState", race);`
    : recipeId === "top-down-collector"
    ? `  const player = context.entity(${JSON.stringify(playerId)});
  const pickup = context.entity(${JSON.stringify(goalId)});
  if (player === undefined || pickup === undefined) return;
  const moveX = context.input.axis("MoveX");
  const moveZ = context.input.axis("MoveZ");
  if (moveX !== 0 || moveZ !== 0) {
    const position = player.transform().position;
    player.transform().setPosition([position[0] + moveX * 0.05, position[1], position[2] + moveZ * 0.05]);
  }
  const playerPosition = player.transform().position;
  const pickupPosition = pickup.transform().position;
  const dx = playerPosition[0] - pickupPosition[0];
  const dz = playerPosition[2] - pickupPosition[2];
  const pickupState = context.state(${JSON.stringify(`pickup.${goalId}`)}, { collected: false });
  if (!pickupState.collected && dx * dx + dz * dz < 0.36) {
    pickupState.collected = true;
    const state = context.resources.get("GameState", { score: 0, scoreText: "Score 0" });
    const score = typeof state.score === "number" ? state.score + 1 : 1;
    context.resources.patch("GameState", { score, scoreText: \`Score \${score}\` });
  }`
    : recipeId === "kinematic-character"
    ? `  const moveX = context.input.axis("MoveX");
  const moveZ = context.input.axis("MoveZ");
  const actor = context.query({ with: ["Transform"] })[0];
  if (actor !== undefined && (moveX !== 0 || moveZ !== 0)) {
    const position = actor.transform().position;
    actor.transform().setPosition([position[0] + moveX * 0.05, position[1], position[2] + moveZ * 0.05]);
  }`
    : `  const state = context.resources.get("RecipeState", { active: true, statusText: ${JSON.stringify(responsibilities.join("; "))} });
  if (state.active) {
    context.resources.patch("RecipeState", { statusText: state.statusText });
  }`;
  return `import { defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const ${exportName} = defineBehavior(
  ${metadata},
  (context: ScriptContext): void => {
${body}
  },
);
`;
}

function recipeExportPattern(exportName: string): RegExp {
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`export\\s+function\\s+${escaped}\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}`, "u");
}

function hasEmptyRecipeExport(source: string, exportName: string): boolean {
  const match = source.match(recipeExportPattern(exportName));
  return match !== null && /\{\s*(?:\/\/[^\n]*\n?\s*)?\}/u.test(match[0]);
}

async function scaffoldProofRecipe(result: IAuthoringRecipeApplyResult, projectPath: string): Promise<void> {
  if (!result.ok || !gameKitRecipeIds.has(result.recipeId)) {
    return;
  }
  const relativePath = `content/proofs/${result.recipeId}.proof.json`;
  const absolutePath = resolve(projectPath, relativePath);
  if (await pathExists(absolutePath)) {
    return;
  }
  await mkdir(resolve(absolutePath, ".."), { recursive: true });
  await writeFile(
    absolutePath,
    `${JSON.stringify(
      {
        schema: "threenative.proof-recipe",
        version: "0.1.0",
        id: result.recipeId,
        recipeId: result.recipeId,
        commands: result.proofCommands,
        requiredArtifacts: ["authoring-validation", "build", "input-playtest", "screenshot-or-scene-proof"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  result.changed = true;
  result.filesWritten = Array.from(new Set([...result.filesWritten, relativePath])).sort();
}

async function scaffoldVehicleCheckpointArtifacts(result: IAuthoringRecipeApplyResult, args: Record<string, unknown>, projectPath: string): Promise<void> {
  if (!result.ok || result.recipeId !== "vehicle-checkpoint") return;
  const sceneId = stringArg(args, "sceneId") ?? "arena";
  const project = await loadAuthoringProject({ projectPath });
  const scenePath = project.documents.find((document) => document.kind === "scene" && isRecord(document.data) && document.data.id === sceneId)?.projectRelativePath;
  if (scenePath === undefined) return;
  const uiPath = "content/ui/hud.ui.json";
  const vehicleId = stringArg(args, "vehicleId") ?? "player";
  const ui = await pathExists(resolve(projectPath, uiPath))
    ? await readJsonObject(resolve(projectPath, uiPath))
    : { bindings: [], id: "hud", nodes: [], schema: "threenative.ui", version: "0.1.0" };
  const nodes = recordArray(ui.nodes);
  const bindings = recordArray(ui.bindings);
  ui.nodes = nodes;
  ui.bindings = bindings;
  upsertUiText(nodes, "race.progress", "Checkpoint 0 / 5", 32);
  upsertUiText(nodes, "race.timer", "Time 0.0s", 64);
  upsertUiText(nodes, "race.status", "DRIVE THROUGH THE GATES - R/ENTER: RETRY", 96);
  upsertUiBinding(bindings, "race.progress", "RaceState.progressText");
  upsertUiBinding(bindings, "race.timer", "RaceState.timeText");
  upsertUiBinding(bindings, "race.status", "RaceState.statusText");
  await writeJson(resolve(projectPath, uiPath), ui);
  const scenarioPath = "playtests/vehicle-checkpoint.playtest.json";
  const retryScenarioPath = "playtests/vehicle-checkpoint-retry.playtest.json";
  await writeJson(resolve(projectPath, scenarioPath), vehicleCheckpointScenario(vehicleId));
  await writeJson(resolve(projectPath, retryScenarioPath), vehicleCheckpointRetryScenario(vehicleId));
  result.changed = true;
  result.filesWritten = Array.from(new Set([
    ...result.filesWritten,
    scenePath,
    uiPath,
    scenarioPath,
    retryScenarioPath,
  ])).sort();
}

async function removeVehicleCheckpointLegacySystems(projectPath: string, sceneId: string): Promise<string[]> {
  const project = await loadAuthoringProject({ projectPath });
  const changedPaths: string[] = [];
  for (const document of project.documents.filter((candidate) => candidate.kind === "scene" || candidate.kind === "systems")) {
    if (document.kind === "scene" && (!isRecord(document.data) || document.data.id !== sceneId)) continue;
    const systems = isRecord(document.data) ? recordArray(document.data.systems) : [];
    const filtered = systems.filter((system) => system.id !== "move-player-to-goal");
    if (filtered.length === systems.length) continue;
    const data = await readJsonObject(resolve(projectPath, document.projectRelativePath));
    data.systems = filtered;
    await writeJson(resolve(projectPath, document.projectRelativePath), data);
    changedPaths.push(document.projectRelativePath);
  }
  return changedPaths.sort();
}

function upsertUiText(nodes: Record<string, unknown>[], id: string, text: string, top: number): void {
  const next = { id, layout: { align: "center", justify: "center", top, width: 1280 }, text, type: "text" };
  const existing = nodes.find((node) => node.id === id);
  if (existing === undefined) nodes.push(next);
  else Object.assign(existing, next);
}

function upsertUiBinding(bindings: Record<string, unknown>[], node: string, resource: string): void {
  const existing = bindings.find((binding) => binding.node === node);
  if (existing === undefined) bindings.push({ node, resource });
  else existing.resource = resource;
}

function vehicleCheckpointScenario(vehicleId: string): Record<string, unknown> {
  return {
    artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true },
      hud: [
        { id: "race.progress", textIncludes: "Checkpoint 5 / 5" },
        { id: "race.status", textIncludes: "FINISH" },
      ],
      movement: { axis: "z", entity: vehicleId, minDistance: 7.5, minVelocity: 0.001 },
      resources: [
        { gte: 5, id: "RaceState", path: "nextCheckpoint" },
        { equals: true, id: "RaceState", path: "finished" },
        { gte: 0.1, id: "RaceState", path: "time" },
      ],
    },
    name: "vehicle-checkpoint",
    schemaVersion: 1,
    setup: { entities: [{ entity: vehicleId, position: [0, 0.35, 2] }] },
    steps: [{ holdFrames: 110, label: "drive-through-ordered-gates", press: "KeyW", release: true }],
    subject: vehicleId,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

function vehicleCheckpointRetryScenario(vehicleId: string): Record<string, unknown> {
  return {
    artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true },
      hud: [{ id: "race.status", textIncludes: "RETRY" }],
      resources: [
        { equals: 0, id: "RaceState", path: "nextCheckpoint" },
        { equals: false, id: "RaceState", path: "finished" },
        { equals: 0, id: "RaceState", path: "time" },
      ],
    },
    name: "vehicle-checkpoint-retry",
    schemaVersion: 1,
    steps: [
      { holdFrames: 110, label: "finish-before-retry", press: "KeyW", release: true },
      { holdFrames: 1, label: "retry", press: "KeyR", release: true },
      { label: "observe-reset", release: false, waitFrames: 3 },
    ],
    setup: { entities: [{ entity: vehicleId, position: [0, 0.35, 2] }] },
    subject: vehicleId,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

function hasNamedExport(source: string, exportName: string): boolean {
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${escaped}\\b`, "u").test(source);
}

function hasBehaviorExport(source: string, exportName: string): boolean {
  const escaped = exportName.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`\\bexport\\s+const\\s+${escaped}\\s*=\\s*defineBehavior\\b`, "u").test(source);
}

async function changedRecipeFiles(stagedProjectPath: string, projectPath: string, files: readonly string[]): Promise<string[]> {
  const changed: string[] = [];
  for (const file of files) {
    const staged = await readFile(resolve(stagedProjectPath, file));
    const existing = await readFile(resolve(projectPath, file)).catch(() => undefined);
    if (existing === undefined || !staged.equals(existing)) {
      changed.push(file);
    }
  }
  return changed;
}

function isMissingPathError(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

function remapRecipeResult(result: IAuthoringRecipeApplyResult, projectPath: string, committed: boolean): IAuthoringRecipeApplyResult {
  return {
    ...result,
    changed: committed ? result.changed : false,
    filesWritten: committed ? result.filesWritten : [],
    projectPath,
    operationResults: result.operationResults.map((entry) => ({ ...entry, result: { ...entry.result, projectPath } })),
  };
}

function renderRecipePlan(plan: IAuthoringRecipePlanResult, json: boolean): ICommandResult {
  const payload = {
    code: plan.ok ? "TN_RECIPE_PLAN_OK" : "TN_RECIPE_PLAN_FAILED",
    message: plan.ok ? `Recipe '${plan.recipeId}' plan is valid.` : `Recipe '${plan.recipeId}' plan failed.`,
    ...plan,
  };
  return {
    exitCode: plan.ok ? 0 : 1,
    stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n`,
  };
}

interface IRecipeProofHandoff {
  nextProofCommand: string;
  planFound: boolean;
  requiredAcceptanceIds: string[];
}

async function readPlanProofHandoff(projectPath: string): Promise<IRecipeProofHandoff> {
  const nextProofCommand = "tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json";
  let value: unknown = {};
  try {
    value = JSON.parse(await readFile(resolve(projectPath, "artifacts/game-production/plan.json"), "utf8")) as unknown;
  } catch {
    value = {};
  }
  const requiredAcceptanceIds = isRecord(value) && isRecord(value.intentContract) && Array.isArray(value.intentContract.acceptanceAssertions)
    ? value.intentContract.acceptanceAssertions
      .filter((assertion): assertion is Record<string, unknown> => isRecord(assertion) && assertion.required === true && typeof assertion.id === "string")
      .map((assertion) => String(assertion.id))
    : [];
  return { nextProofCommand, planFound: requiredAcceptanceIds.length > 0, requiredAcceptanceIds };
}

function renderRecipeApply(result: IAuthoringRecipeApplyResult, json: boolean, fullJson: boolean, proofHandoff?: IRecipeProofHandoff): ICommandResult {
  const fullPayload = {
    code: result.ok ? "TN_RECIPE_APPLY_OK" : "TN_RECIPE_APPLY_FAILED",
    message: result.ok ? `Recipe '${result.recipeId}' applied.` : `Recipe '${result.recipeId}' failed.`,
    ...result,
    ...(proofHandoff === undefined ? {} : {
      nextProofCommand: proofHandoff.nextProofCommand,
      proofEnrollment: {
        enrolledAcceptanceIds: [],
        missingAcceptanceIds: proofHandoff.requiredAcceptanceIds,
        planFound: proofHandoff.planFound,
        requiredAcceptanceIds: proofHandoff.requiredAcceptanceIds,
      },
    }),
  };
  const alreadyPresentCount = result.diagnostics.filter((diagnostic) => diagnostic.severity === "info" && diagnostic.code.startsWith("TN_AUTHORING_DUPLICATE_")).length;
  const payload = fullJson
    ? fullPayload
    : {
        alreadyApplied: result.ok && !result.changed,
        alreadyPresentCount,
        changed: result.changed,
        code: fullPayload.code,
        diagnostics: result.diagnostics.filter((diagnostic) => diagnostic.severity !== "info"),
        filesWritten: result.filesWritten,
        gameplayBlocks: result.gameplayBlocks,
        message: fullPayload.message,
        ...(proofHandoff === undefined ? {} : {
          nextProofCommand: proofHandoff.nextProofCommand,
          proofEnrollment: {
            enrolledAcceptanceIds: [],
            missingAcceptanceIds: proofHandoff.requiredAcceptanceIds,
            planFound: proofHandoff.planFound,
            requiredAcceptanceIds: proofHandoff.requiredAcceptanceIds,
          },
        }),
        ok: result.ok,
        projectPath: result.projectPath,
        proofCommands: result.proofCommands,
        recipeId: result.recipeId,
        scriptResponsibilities: result.scriptResponsibilities,
      };
  if (json) {
    return { exitCode: result.ok ? 0 : 1, stdout: `${JSON.stringify(payload, null, 2)}\n` };
  }
  if (result.ok) {
    return { exitCode: 0, stdout: `${payload.message}\n` };
  }
  const diagnostics = result.diagnostics.map((diagnostic) => `${diagnostic.code} ${diagnostic.file ?? ""}${diagnostic.path ?? ""}: ${diagnostic.message}`).join("\n");
  return { exitCode: 1, stderr: `${payload.message}\n${diagnostics}\n`, stdout: "" };
}

function renderUsage(json: boolean, code: string): ICommandResult {
  const payload = {
    code,
    message: recipeUsage(),
    recipes: listAuthoringRecipeIds(),
    severity: "error",
  };
  return { exitCode: 2, stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${payload.message}\n` };
}

function recipeUsage(): string {
  return "Usage: tn recipe [apply] <recipe-id> --scene <scene-id> [--entity <entity-id>|--player <player-id>|--vehicle <vehicle-id>] [--camera <camera-id>] [--module <path>] [--export <name>] [--dry-run] [--project <path>] [--json] [--full-json]";
}

function recipeArgs(argv: readonly string[]): Record<string, unknown> {
  return defined({
    cameraId: readFlag(argv, "--camera"),
    color: readFlag(argv, "--color"),
    entityId: readFlag(argv, "--entity"),
    exportName: readFlag(argv, "--export"),
    goalId: readFlag(argv, "--goal-entity"),
    height: parseOptionalNumber(argv, "--height"),
    inputDocId: readFlag(argv, "--input-doc"),
    modulePath: readFlag(argv, "--module"),
    moveXAxis: readFlag(argv, "--move-x"),
    moveZAxis: readFlag(argv, "--move-z"),
    playerId: readFlag(argv, "--player"),
    position: parseOptionalVector3(argv, "--position"),
    prefabId: readFlag(argv, "--prefab"),
    primitive: readFlag(argv, "--primitive"),
    radius: parseOptionalNumber(argv, "--radius"),
    resourceId: readFlag(argv, "--resource"),
    resourcePath: readFlag(argv, "--resource-path"),
    scale: parseOptionalVector3(argv, "--scale"),
    sceneId: readFlag(argv, "--scene"),
    size: parseOptionalVector3(argv, "--size"),
    speed: parseOptionalNumber(argv, "--speed"),
    systemId: readFlag(argv, "--system"),
    uiNodeId: readFlag(argv, "--ui-node"),
    value: parseOptionalNumber(argv, "--value"),
    vehicleId: readFlag(argv, "--vehicle"),
  });
}

function resolveProjectPath(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): string {
  const project = readFlag(argv, "--project") ?? ".";
  return isAbsolute(project) ? project : resolve(cwd, project);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const value = JSON.parse(await readFile(path, "utf8")) as unknown;
  return isRecord(value) ? value : {};
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readPositional(argv: readonly string[], index: number): string | undefined {
  return readPositionals(argv)[index];
}

function readPositionals(argv: readonly string[]): string[] {
  return argv.filter((arg, argIndex) => {
    if (arg.startsWith("--")) {
      return false;
    }
    const previous = argv[argIndex - 1];
    return !flagsWithValues.has(previous ?? "");
  });
}

function parseOptionalNumber(argv: readonly string[], flag: string): number | undefined {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseOptionalVector3(argv: readonly string[], flag: string): [number, number, number] | undefined {
  const raw = readFlag(argv, flag);
  if (raw === undefined) {
    return undefined;
  }
  const values = raw.split(",").map((entry) => Number(entry.trim()));
  return values.length === 3 && values.every((value) => Number.isFinite(value)) ? [values[0] ?? 0, values[1] ?? 0, values[2] ?? 0] : undefined;
}

function defined(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

const flagsWithValues = new Set([
  "--camera",
  "--color",
  "--entity",
  "--export",
  "--height",
  "--module",
  "--move-x",
  "--move-z",
  "--goal-entity",
  "--input-doc",
  "--player",
  "--position",
  "--prefab",
  "--primitive",
  "--project",
  "--radius",
  "--resource",
  "--resource-path",
  "--scale",
  "--scene",
  "--size",
  "--speed",
  "--system",
  "--ui-node",
  "--value",
  "--vehicle",
]);

const gameKitRecipeIds = new Set(["top-down-collector", "lane-runner", "vehicle-checkpoint"]);
