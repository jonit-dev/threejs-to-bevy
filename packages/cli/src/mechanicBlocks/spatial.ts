import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { hashAuthoringTransactionBytes, publishAuthoringTransaction, stableAuthoringJson } from "@threenative/authoring";

import { MECHANIC_BLOCK_DESCRIPTORS, mechanicBlockDescriptor, type SpatialMechanicBlockId } from "./descriptors.js";
import type { IMechanicBlockOptions, IMechanicBlockResult } from "./registry.js";

type SpatialBlockId = SpatialMechanicBlockId;
type Cell = readonly [number, number];

const SPATIAL_BLOCK_IDS = MECHANIC_BLOCK_DESCRIPTORS
  .filter((descriptor): descriptor is typeof descriptor & { id: SpatialBlockId; writer: { kind: "spatial" } } => descriptor.writer.kind === "spatial")
  .map((descriptor) => descriptor.id);

export interface ISpatialStepInput {
  actor: Cell;
  blocked: readonly Cell[];
  bounds: { maxX: number; maxZ: number; minX: number; minZ: number };
  crates: readonly Cell[];
  pushEnabled: boolean;
  target: Cell;
}

export interface ISpatialStepResult {
  accepted: boolean;
  actor: Cell;
  crates: Cell[];
  reason: "blocked" | "occupied" | "ok" | "outside-bounds" | "push-disabled";
}

export interface IRemoveSpatialCompositionResult {
  code: "TN_RECIPE_REMOVE_OK";
  filesRemoved: string[];
  filesWritten: string[];
  ok: boolean;
}

export function resolveSpatialStep(input: ISpatialStepInput): ISpatialStepResult {
  const unchanged = (reason: ISpatialStepResult["reason"]): ISpatialStepResult => ({ accepted: false, actor: input.actor, crates: input.crates.map(copyCell), reason });
  if (!inside(input.target, input.bounds)) return unchanged("outside-bounds");
  if (includesCell(input.blocked, input.target)) return unchanged("blocked");
  const crateIndex = input.crates.findIndex((cell) => sameCell(cell, input.target));
  if (crateIndex < 0) return { accepted: true, actor: copyCell(input.target), crates: input.crates.map(copyCell), reason: "ok" };
  if (!input.pushEnabled) return unchanged("push-disabled");
  const pushed: Cell = [input.target[0] + (input.target[0] - input.actor[0]), input.target[1] + (input.target[1] - input.actor[1])];
  if (!inside(pushed, input.bounds) || includesCell(input.blocked, pushed)) return unchanged("blocked");
  if (includesCell(input.crates, pushed)) return unchanged("occupied");
  const crates = input.crates.map(copyCell);
  crates[crateIndex] = pushed;
  return { accepted: true, actor: copyCell(input.target), crates, reason: "ok" };
}

export async function writeSpatialMechanicBlock(block: SpatialBlockId, options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const projectPath = resolve(options.projectPath);
  const [scenePath, inputPath, systemsPath, uiPath] = await Promise.all([
    firstDocument(projectPath, "content/scenes", ".scene.json"),
    firstDocument(projectPath, "content/input", ".input.json"),
    firstDocument(projectPath, "content/systems", ".systems.json"),
    firstDocument(projectPath, "content/ui", ".ui.json"),
  ]);
  const [scene, input, systems, ui] = await Promise.all([
    readJson(projectPath, scenePath),
    readJson(projectPath, inputPath),
    readJson(projectPath, systemsPath),
    readJson(projectPath, uiPath),
  ]);
  const enabled = await enabledSpatialBlocks(projectPath);
  enabled.add("grid-step");
  enabled.add(block);
  const resources = records(scene.resources);
  const previousGrid = resourceValue(resources, "SpatialGrid");
  const actor = readFlag(options.args, "--actor") ?? stringValue(previousGrid.actor) ?? adoptActor(scene);
  const step = positiveNumber(readFlag(options.args, "--step"), numberValue(previousGrid.step) ?? 1);
  const bounds = parseBounds(readFlag(options.args, "--bounds")) ?? boundsValue(previousGrid) ?? { maxX: 2, maxZ: 2, minX: -2, minZ: -2 };
  const blocked = readFlag(options.args, "--blocked") === undefined
    ? parseCells(stringValue(previousGrid.blockedKeys))
    : parseCells(readFlag(options.args, "--blocked"));
  const cratePrefix = readFlag(options.args, "--crate-prefix") ?? "crate";
  const previousCrateCount = jsonStringArray(previousGrid.crateIdsJson).length;
  const crateCount = positiveInteger(readFlag(options.args, "--crate-count"), previousCrateCount || 2);
  const targetPrefix = readFlag(options.args, "--target-prefix") ?? "target";
  const targetCount = positiveInteger(readFlag(options.args, "--target-count"), enabled.has("push-interaction") ? crateCount : 1);
  const subjectTag = readFlag(options.args, "--subject-tag") ?? (enabled.has("push-interaction") ? "pushable" : "player");
  const sourceFiles = [inputPath, scenePath, "src/scripts/spatial.ts", systemsPath, uiPath];

  const entities = records(scene.entities);
  const prefabs = records(scene.prefabs);
  scene.entities = entities;
  scene.prefabs = prefabs;
  scene.resources = resources;
  const actorEntity = entities.find((entity) => entity.id === actor);
  const actorStart = positionOf(actorEntity) ?? [0, 0.35, 0];
  if (actorEntity !== undefined) actorEntity.tags = uniqueStrings([...(strings(actorEntity.tags)), "player"]);
  upsertSpatialBoard(entities, prefabs, bounds, step, blocked, actorStart[1]);
  const crates = enabled.has("push-interaction") ? Array.from({ length: crateCount }, (_, index) => {
    const id = `${cratePrefix}.${String(index + 1).padStart(2, "0")}`;
    const start = [actorStart[0] + step, actorStart[1], actorStart[2] + rowOffset(index) * step] as [number, number, number];
    upsertPrefab(prefabs, "prefab.spatial-crate", "box", "#c97a40");
    upsertEntity(entities, { components: { Collider: { kind: "box", size: [0.72, 0.72, 0.72] }, RigidBody: { gravityScale: 0, kind: "kinematic" } }, id, prefab: "prefab.spatial-crate", tags: ["pushable"], transform: { position: start, scale: [0.72, 0.72, 0.72] } });
    return { id, start };
  }) : [];
  const targets = enabled.has("occupancy-objective") ? Array.from({ length: targetCount }, (_, index) => {
    const id = `${targetPrefix}.${String(index + 1).padStart(2, "0")}`;
    const position: [number, number, number] = [
      actorStart[0] + step * (enabled.has("push-interaction") ? 2 : 1),
      0.04,
      actorStart[2] + rowOffset(index) * step,
    ];
    upsertPrefab(prefabs, "prefab.spatial-target", "box", "#45d6a1");
    upsertEntity(entities, { components: { Collider: { kind: "box", size: [0.82, 0.08, 0.82], trigger: true }, RigidBody: { kind: "static" } }, id, prefab: "prefab.spatial-target", tags: ["occupancy-target"], transform: { position, scale: [0.82, 0.08, 0.82] } });
    return { id, position };
  }) : [];
  upsertResource(resources, "SpatialGrid", {
    actor,
    actorStart,
    blockedKeys: blocked.map((cell) => `${cell[0]},${cell[1]}`).join(";"),
    boundsMaxX: bounds.maxX,
    boundsMaxZ: bounds.maxZ,
    boundsMinX: bounds.minX,
    boundsMinZ: bounds.minZ,
    crateIdsJson: JSON.stringify(crates.map((crate) => crate.id)),
    crateStartPositionsJson: JSON.stringify(crates.map((crate) => crate.start)),
    objectiveEnabled: enabled.has("occupancy-objective"),
    pushEnabled: enabled.has("push-interaction"),
    step,
    statusText: "ARROWS/WASD: STEP  R: RETRY",
  });
  if (enabled.has("occupancy-objective")) upsertResource(resources, "SpatialObjective", { progress: 0, statusText: `Targets 0 / ${targetCount}`, subjectTag, targetCount, targetIds: targets.map((target) => target.id), won: false });

  const actions = records(input.actions);
  input.actions = actions;
  for (const [id, bindings] of Object.entries({ "grid-down": ["keyboard.ArrowDown", "keyboard.KeyS"], "grid-left": ["keyboard.ArrowLeft", "keyboard.KeyA"], "grid-right": ["keyboard.ArrowRight", "keyboard.KeyD"], "grid-up": ["keyboard.ArrowUp", "keyboard.KeyW"], retry: ["keyboard.KeyR"] })) upsertById(actions, { bindings, id });
  const systemList = records(systems.systems);
  systems.systems = systemList;
  for (const inlineSystem of records(scene.systems)) upsertById(systemList, inlineSystem);
  delete scene.systems;
  for (let index = systemList.length - 1; index >= 0; index -= 1) {
    const candidate = systemList[index]!;
    const script = typeof candidate.script === "object" && candidate.script !== null ? candidate.script as Record<string, unknown> : {};
    if (candidate.id === "move-player-to-goal" || script.export === "movePlayerToGoal") systemList.splice(index, 1);
  }
  upsertById(systemList, { id: "spatial-mechanics", script: { export: "runSpatialMechanics", module: "src/scripts/spatial.ts" }, source: "behavior-metadata" });
  const nodes = records(ui.nodes);
  const bindings = records(ui.bindings);
  const inlineUi = typeof scene.ui === "object" && scene.ui !== null ? scene.ui as Record<string, unknown> : {};
  for (const node of records(inlineUi.nodes)) upsertById(nodes, node);
  for (const binding of records(inlineUi.bindings)) {
    const existing = bindings.find((candidate) => candidate.node === binding.node);
    if (existing === undefined) bindings.push(binding);
    else Object.assign(existing, binding);
  }
  ui.nodes = nodes;
  ui.bindings = bindings;
  delete scene.ui;
  if (enabled.has("occupancy-objective")) {
    upsertById(nodes, { id: "spatial-progress", layout: { align: "center", justify: "center", top: 88, width: 1280 }, text: "Targets 0", type: "text" });
    const existingBinding = bindings.find((binding) => binding.node === "spatial-progress");
    if (existingBinding === undefined) bindings.push({ node: "spatial-progress", resource: "SpatialObjective.statusText" });
    else existingBinding.resource = "SpatialObjective.statusText";
  }

  const nextFiles = new Map<string, Uint8Array>();
  nextFiles.set(scenePath, bytes(stableAuthoringJson(scene)));
  nextFiles.set(inputPath, bytes(stableAuthoringJson(input)));
  nextFiles.set(systemsPath, bytes(stableAuthoringJson(systems)));
  nextFiles.set(uiPath, bytes(stableAuthoringJson(ui)));
  nextFiles.set("src/scripts/spatial.ts", bytes(spatialScript()));
  for (const enabledBlock of enabled) {
    const descriptor = mechanicBlockDescriptor(enabledBlock)!;
    nextFiles.set(`content/mechanics/${enabledBlock}.mechanic.json`, bytes(stableAuthoringJson({ block: enabledBlock, details: { actor, crateIds: crates.map((crate) => crate.id), subjectTag, targetIds: targets.map((target) => target.id) }, mutationCommand: descriptor.mutationCommand, proofTemplateId: descriptor.proofTemplateId, recipeIds: descriptor.recipeIds, removal: descriptor.removal, responsibilities: descriptor.responsibilities, schema: "threenative.mechanic-block", sourceFiles, sourceOwners: descriptor.sourceOwners, version: "0.1.0" })));
    nextFiles.set(`playtests/${descriptor.proofTemplateId}.playtest.json`, bytes(stableAuthoringJson(spatialScenario(enabledBlock, actor, actorStart, bounds, crates, targetCount))));
  }
  const publication = await publishAuthoringTransaction({
    files: await Promise.all([...nextFiles].map(async ([path, nextBytes]) => ({ baseHash: await baseHash(projectPath, path), bytes: nextBytes, path }))),
    projectPath,
  });
  if (!publication.ok) throw new Error(publication.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n"));
  const descriptor = mechanicBlockDescriptor(block)!;
  const scenarioPath = `playtests/${descriptor.proofTemplateId}.playtest.json`;
  return { block, code: "TN_ADD_BLOCK_OK", filesWritten: publication.filesWritten, message: `Mechanic block '${block}' added.`, proofCommand: `tn playtest --project . --scenario ${scenarioPath} --stable-artifacts --json`, scenarioPath };
}

export async function removeSpatialMechanicComposition(projectPathInput: string): Promise<IRemoveSpatialCompositionResult> {
  const projectPath = resolve(projectPathInput);
  const [scenePath, inputPath, systemsPath, uiPath] = await Promise.all([
    firstDocument(projectPath, "content/scenes", ".scene.json"),
    firstDocument(projectPath, "content/input", ".input.json"),
    firstDocument(projectPath, "content/systems", ".systems.json"),
    firstDocument(projectPath, "content/ui", ".ui.json"),
  ]);
  const [scene, input, systems, ui] = await Promise.all([
    readJson(projectPath, scenePath), readJson(projectPath, inputPath), readJson(projectPath, systemsPath), readJson(projectPath, uiPath),
  ]);
  const spatialEntityIds = new Set(records(scene.entities).flatMap((entity) => typeof entity.prefab === "string" && entity.prefab.startsWith("prefab.spatial-") ? [String(entity.id)] : []));
  scene.entities = records(scene.entities).filter((entity) => typeof entity.id !== "string" || !spatialEntityIds.has(entity.id));
  scene.prefabs = records(scene.prefabs).filter((prefab) => typeof prefab.id !== "string" || !prefab.id.startsWith("prefab.spatial-"));
  scene.resources = records(scene.resources).filter((resource) => resource.id !== "SpatialGrid" && resource.id !== "SpatialObjective");
  input.actions = records(input.actions).filter((action) => !["grid-down", "grid-left", "grid-right", "grid-up", "retry"].includes(String(action.id)));
  systems.systems = records(systems.systems).filter((system) => system.id !== "spatial-mechanics");
  ui.nodes = records(ui.nodes).filter((node) => node.id !== "spatial-progress");
  ui.bindings = records(ui.bindings).filter((binding) => binding.node !== "spatial-progress");
  const removed = [
    ...SPATIAL_BLOCK_IDS.flatMap((id) => {
      const descriptor = mechanicBlockDescriptor(id)!;
      return [`content/mechanics/${id}.mechanic.json`, `playtests/${descriptor.proofTemplateId}.playtest.json`];
    }),
    "src/scripts/spatial.ts",
  ];
  const writes = new Map<string, Uint8Array | null>([
    [scenePath, bytes(stableAuthoringJson(scene))], [inputPath, bytes(stableAuthoringJson(input))],
    [systemsPath, bytes(stableAuthoringJson(systems))], [uiPath, bytes(stableAuthoringJson(ui))],
    ...removed.map((path) => [path, null] as const),
  ]);
  const publication = await publishAuthoringTransaction({
    files: await Promise.all([...writes].map(async ([path, nextBytes]) => ({ baseHash: await baseHash(projectPath, path), bytes: nextBytes, path }))),
    projectPath,
  });
  return { code: "TN_RECIPE_REMOVE_OK", filesRemoved: removed, filesWritten: publication.filesWritten, ok: publication.ok };
}

function spatialScript(): string {
  return `import { defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";

export const runSpatialMechanics = defineBehavior(
  { id: "spatial-mechanics", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ProjectContext): void => {
    const grid = context.resources.get("SpatialGrid", { actor: "player", actorStart: [0, 0.35, 0], blockedKeys: "", boundsMinX: -2, boundsMaxX: 2, boundsMinZ: -2, boundsMaxZ: 2, crateIdsJson: "[]", crateStartPositionsJson: "[]", objectiveEnabled: false, pushEnabled: false, step: 1 });
    const actor = context.entity(grid.actor);
    if (!actor) return;
    const retry = context.input.pressed("retry");
    if (retry) {
      actor.transform().setPosition(grid.actorStart);
      const crateStarts = JSON.parse(grid.crateStartPositionsJson) as [number, number, number][];
      const crateIds = JSON.parse(grid.crateIdsJson) as string[];
      for (let index = 0; index < crateIds.length; index += 1) {
        const start = crateStarts[index];
        if (start) context.entity(crateIds[index])?.transform().setPosition(start);
      }
      if (grid.objectiveEnabled) context.resources.patch("SpatialObjective", { progress: 0, statusText: \`Targets 0 / \${context.resources.get("SpatialObjective").targetCount}\`, won: false });
      return;
    }
    const dx = (context.input.pressed("grid-right") ? 1 : 0) - (context.input.pressed("grid-left") ? 1 : 0);
    const dz = (context.input.pressed("grid-down") ? 1 : 0) - (context.input.pressed("grid-up") ? 1 : 0);
    if (Math.abs(dx) + Math.abs(dz) !== 1) return;
    const current = actor.transform().position;
    const target = [current[0] + dx * grid.step, current[1], current[2] + dz * grid.step];
    const cellKey = (position: readonly number[]): string => \`\${Math.round(position[0] / grid.step)},\${Math.round(position[2] / grid.step)}\`;
    const targetKey = cellKey(target);
    const blockedKeys = grid.blockedKeys.split(";").filter((key: string) => key.length > 0);
    if (target[0] < grid.boundsMinX || target[0] > grid.boundsMaxX || target[2] < grid.boundsMinZ || target[2] > grid.boundsMaxZ || blockedKeys.includes(targetKey)) return;
    const pushables = context.entities.withTag("pushable");
    const pushed = pushables.find((entity) => cellKey(entity.transform().position) === targetKey);
    if (pushed) {
      if (!grid.pushEnabled) return;
      const pushedPosition = pushed.transform().position;
      const next = [pushedPosition[0] + dx * grid.step, pushedPosition[1], pushedPosition[2] + dz * grid.step];
      const nextKey = cellKey(next);
      if (next[0] < grid.boundsMinX || next[0] > grid.boundsMaxX || next[2] < grid.boundsMinZ || next[2] > grid.boundsMaxZ || blockedKeys.includes(nextKey) || pushables.some((entity) => entity.id !== pushed.id && cellKey(entity.transform().position) === nextKey)) return;
      pushed.transform().setPosition(next as [number, number, number]);
    }
    actor.transform().setPosition(target as [number, number, number]);
    if (!grid.objectiveEnabled) return;
    const objective = context.resources.get("SpatialObjective");
    const subjects = objective.subjectTag === "player" ? [actor] : context.entities.withTag(objective.subjectTag);
    const targetCells = context.entities.withTag("occupancy-target").map((entity) => cellKey(entity.transform().position));
    const progress = subjects.filter((entity) => targetCells.includes(cellKey(entity.transform().position))).length;
    const won = progress >= objective.targetCount;
    context.resources.patch("SpatialObjective", { progress, statusText: won ? "ALL TARGETS FILLED!  R: RETRY" : \`Targets \${progress} / \${objective.targetCount}\`, won });
  },
);
`;
}

function spatialScenario(block: SpatialBlockId, actor: string, actorStart: [number, number, number], bounds: ISpatialStepInput["bounds"], crates: Array<{ id: string; start: [number, number, number] }>, targetCount: number): Record<string, unknown> {
  const diagnostics = { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true };
  if (block === "grid-step") {
    return {
      artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
      assert: { diagnostics, movement: { entity: actor, maxDistance: 0.01 }, visibility: [{ entity: "spatial.floor", minProjectedPixels: 64 }, { entity: "spatial.wall.east", minProjectedPixels: 8 }] },
      name: `block-${block}`,
      schemaVersion: 1,
      setup: { entities: [{ entity: actor, position: [bounds.maxX, actorStart[1], actorStart[2]] }] },
      steps: [{ holdFrames: 2, label: "reject-outside-bounds", press: "ArrowRight", release: true }],
      subject: actor,
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 5,
    };
  }
  const steps = crates.length > 0 ? spatialCrateSolutionSteps(crates, actorStart, Math.abs(crates[0]!.start[0] - actorStart[0])) : [{ holdFrames: 2, label: "step-right", press: "ArrowRight", release: true }];
  return {
    artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      diagnostics,
      ...(block === "occupancy-objective" ? { resources: [{ gte: targetCount, id: "SpatialObjective", path: "progress" }] } : { movement: { axis: "x", entity: actor, minDistance: 0.5 } }),
      tags: [...(crates.length > 0 ? [{ gte: crates.length, tag: "pushable" }] : []), ...(block === "occupancy-objective" ? [{ gte: targetCount, tag: "occupancy-target" }] : [])],
      visibility: [{ entity: "spatial.floor", minProjectedPixels: 64 }, { entity: "spatial.wall.east", minProjectedPixels: 8 }, ...(crates[0] === undefined ? [] : [{ entity: crates[0].id, minProjectedPixels: 8 }])],
    },
    name: `block-${block}`,
    schemaVersion: 1,
    steps,
    subject: actor,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

function upsertSpatialBoard(
  entities: Record<string, unknown>[],
  prefabs: Record<string, unknown>[],
  bounds: ISpatialStepInput["bounds"],
  step: number,
  blocked: readonly Cell[],
  actorY: number,
): void {
  const width = bounds.maxX - bounds.minX + step;
  const depth = bounds.maxZ - bounds.minZ + step;
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const wallHeight = Math.max(0.5, step * 0.55);
  const wallThickness = Math.max(0.16, step * 0.18);
  upsertPrefab(prefabs, "prefab.spatial-floor", "box", "#263449");
  upsertPrefab(prefabs, "prefab.spatial-grid-line", "box", "#64748b");
  upsertPrefab(prefabs, "prefab.spatial-wall", "box", "#111827");
  upsertEntity(entities, {
    components: { Collider: { kind: "box", size: [width, 0.08, depth] }, RigidBody: { kind: "static" } },
    id: "spatial.floor",
    prefab: "prefab.spatial-floor",
    transform: { position: [centerX, -0.1, centerZ], scale: [width, 0.08, depth] },
  });
  const perimeter = [
    ["north", [centerX, wallHeight / 2, bounds.minZ - step / 2], [width + step, wallHeight, wallThickness]],
    ["south", [centerX, wallHeight / 2, bounds.maxZ + step / 2], [width + step, wallHeight, wallThickness]],
    ["west", [bounds.minX - step / 2, wallHeight / 2, centerZ], [wallThickness, wallHeight, depth + step]],
    ["east", [bounds.maxX + step / 2, wallHeight / 2, centerZ], [wallThickness, wallHeight, depth + step]],
  ] as const;
  for (const [side, position, size] of perimeter) {
    upsertEntity(entities, {
      components: { Collider: { kind: "box", size }, RigidBody: { kind: "static" } },
      id: `spatial.wall.${side}`,
      prefab: "prefab.spatial-wall",
      tags: ["blocked"],
      transform: { position, scale: size },
    });
  }
  for (const [axis, values] of [["x", gridLines(bounds.minX, bounds.maxX, step)], ["z", gridLines(bounds.minZ, bounds.maxZ, step)]] as const) {
    for (let index = 0; index < values.length; index += 1) {
      const value = values[index]!;
      const scale = axis === "x" ? [0.025, 0.025, depth] : [width, 0.025, 0.025];
      const position = axis === "x" ? [value, -0.045, centerZ] : [centerX, -0.045, value];
      upsertEntity(entities, { id: `spatial.grid.${axis}.${index}`, prefab: "prefab.spatial-grid-line", transform: { position, scale } });
    }
  }
  for (let index = 0; index < blocked.length; index += 1) {
    const cell = blocked[index]!;
    const size = [step * 0.82, wallHeight, step * 0.82];
    upsertEntity(entities, {
      components: { Collider: { kind: "box", size }, RigidBody: { kind: "static" } },
      id: `spatial.blocked.${index + 1}`,
      prefab: "prefab.spatial-wall",
      tags: ["blocked"],
      transform: { position: [cell[0] * step, actorY, cell[1] * step], scale: size },
    });
  }
}

function gridLines(min: number, max: number, step: number): number[] {
  const count = Math.min(33, Math.max(0, Math.floor((max - min) / step) + 2));
  return Array.from({ length: count }, (_, index) => Math.min(max + step / 2, min - step / 2 + index * step));
}

export function spatialCrateSolutionSteps(crates: Array<{ start: [number, number, number] }>, actorStart: [number, number, number], step: number): Array<{ holdFrames: number; label: string; press: string; release: true }> {
  const steps: Array<{ holdFrames: number; label: string; press: string; release: true }> = [];
  let actorZ = actorStart[2];
  for (let index = 0; index < crates.length; index += 1) {
    const crate = crates[index]!;
    if (index > 0) steps.push({ holdFrames: 2, label: `return-left-${index}`, press: "ArrowLeft", release: true });
    const delta = Math.round((crate.start[2] - actorZ) / step);
    const key = delta < 0 ? "ArrowUp" : "ArrowDown";
    for (let offset = 0; offset < Math.abs(delta); offset += 1) steps.push({ holdFrames: 2, label: `align-row-${index + 1}-${offset + 1}`, press: key, release: true });
    steps.push({ holdFrames: 2, label: `push-crate-${index + 1}`, press: "ArrowRight", release: true });
    actorZ = crate.start[2];
  }
  return steps;
}

async function enabledSpatialBlocks(projectPath: string): Promise<Set<SpatialBlockId>> {
  const enabled = new Set<SpatialBlockId>();
  for (const id of SPATIAL_BLOCK_IDS) {
    try { await readFile(resolve(projectPath, `content/mechanics/${id}.mechanic.json`)); enabled.add(id); } catch { /* Not installed. */ }
  }
  return enabled;
}

async function firstDocument(projectPath: string, directory: string, suffix: string): Promise<string> {
  const name = (await readdir(resolve(projectPath, directory))).filter((entry) => entry.endsWith(suffix)).sort()[0];
  if (name === undefined) throw new Error(`No ${suffix} document exists under ${directory}.`);
  return `${directory}/${name}`;
}

async function readJson(projectPath: string, path: string): Promise<Record<string, unknown>> { return JSON.parse(await readFile(resolve(projectPath, path), "utf8")) as Record<string, unknown>; }
async function baseHash(projectPath: string, path: string): Promise<`sha256:${string}` | null> { try { return hashAuthoringTransactionBytes(await readFile(resolve(projectPath, path))); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return null; throw error; } }
function bytes(value: string): Uint8Array { return Buffer.from(value.endsWith("\n") ? value : `${value}\n`, "utf8"); }
function records(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry)) : []; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []; }
function uniqueStrings(value: string[]): string[] { return [...new Set(value)].sort(); }
function upsertById(collection: Record<string, unknown>[], next: Record<string, unknown>): void { const existing = collection.find((entry) => entry.id === next.id); if (existing === undefined) collection.push(next); else Object.assign(existing, next); }
function upsertPrefab(prefabs: Record<string, unknown>[], id: string, primitive: string, color: string): void { upsertById(prefabs, { color, id, primitive }); }
function upsertEntity(entities: Record<string, unknown>[], entity: Record<string, unknown>): void { upsertById(entities, entity); }
function upsertResource(resources: Record<string, unknown>[], id: string, value: Record<string, unknown>): void { const existing = resources.find((entry) => entry.id === id); if (existing === undefined) resources.push({ id, value }); else existing.value = { ...(typeof existing.value === "object" && existing.value !== null ? existing.value as Record<string, unknown> : {}), ...value }; }
function adoptActor(scene: Record<string, unknown>): string { const ids = records(scene.entities).flatMap((entity) => typeof entity.id === "string" ? [entity.id] : []); return ids.find((id) => id === "player") ?? ids.find((id) => /player|hero/iu.test(id)) ?? ids[0] ?? "player"; }
function positionOf(entity: Record<string, unknown> | undefined): [number, number, number] | undefined { const transform = entity?.transform; const position = typeof transform === "object" && transform !== null ? (transform as Record<string, unknown>).position : undefined; return Array.isArray(position) && position.length === 3 ? position.map(Number) as [number, number, number] : undefined; }
function readFlag(args: readonly string[], flag: string): string | undefined { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; }
function positiveNumber(value: string | undefined, fallback: number): number { const parsed = Number(value); return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback; }
function positiveInteger(value: string | undefined, fallback: number): number { return Math.max(1, Math.floor(positiveNumber(value, fallback))); }
function parseBounds(value: string | undefined): ISpatialStepInput["bounds"] | undefined { const numbers = value?.split(",").map(Number); return numbers?.length === 4 && numbers.every(Number.isFinite) ? { minX: numbers[0]!, maxX: numbers[1]!, minZ: numbers[2]!, maxZ: numbers[3]! } : undefined; }
function parseCells(value: string | undefined): Cell[] { return value === undefined || value.trim() === "" ? [] : value.split(";").flatMap((cell) => { const values = cell.split(",").map(Number); return values.length === 2 && values.every(Number.isFinite) ? [[values[0]!, values[1]!] as Cell] : []; }); }
function boundsValue(value: Record<string, unknown>): ISpatialStepInput["bounds"] | undefined { const minX = numberValue(value.boundsMinX); const maxX = numberValue(value.boundsMaxX); const minZ = numberValue(value.boundsMinZ); const maxZ = numberValue(value.boundsMaxZ); return minX === undefined || maxX === undefined || minZ === undefined || maxZ === undefined ? undefined : { minX, maxX, minZ, maxZ }; }
function resourceValue(resources: Record<string, unknown>[], id: string): Record<string, unknown> { const value = resources.find((resource) => resource.id === id)?.value; return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function stringValue(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function numberValue(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function jsonStringArray(value: unknown): string[] { try { const parsed = JSON.parse(stringValue(value) ?? "[]") as unknown; return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : []; } catch { return []; } }
function rowOffset(index: number): number { return index === 0 ? 0 : index % 2 === 1 ? Math.ceil(index / 2) : -Math.ceil(index / 2); }
function inside(cell: Cell, bounds: ISpatialStepInput["bounds"]): boolean { return cell[0] >= bounds.minX && cell[0] <= bounds.maxX && cell[1] >= bounds.minZ && cell[1] <= bounds.maxZ; }
function sameCell(left: Cell, right: Cell): boolean { return left[0] === right[0] && left[1] === right[1]; }
function includesCell(cells: readonly Cell[], target: Cell): boolean { return cells.some((cell) => sameCell(cell, target)); }
function copyCell(cell: Cell): Cell { return [cell[0], cell[1]]; }
