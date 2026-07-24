import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { MECHANIC_BLOCK_DESCRIPTORS, mechanicBlockDescriptor, type IMechanicBlockDescriptor, type MechanicBlockId } from "./descriptors.js";
import { writeSpatialMechanicBlock } from "./spatial.js";

export type { MechanicBlockId } from "./descriptors.js";

export interface IMechanicBlockResult {
  block: MechanicBlockId;
  code: "TN_ADD_BLOCK_OK";
  filesWritten: string[];
  message: string;
  proofCommand: string;
  scenarioPath: string;
}

export interface IRemoveMechanicBlockResult {
  block: string;
  code: "TN_REMOVE_BLOCK_OK" | "TN_REMOVE_BLOCK_MISSING";
  filesRemoved: string[];
  message: string;
  ok: boolean;
}

export interface IMechanicBlockOptions {
  args: readonly string[];
  projectPath: string;
}

interface IMechanicBlockDefinition extends IMechanicBlockDescriptor {
  write(options: IMechanicBlockOptions): Promise<IMechanicBlockResult>;
}

const definitions: readonly IMechanicBlockDefinition[] = MECHANIC_BLOCK_DESCRIPTORS.map((descriptor) => ({
  ...descriptor,
  write: (options) => writeMechanicBlock(descriptor, options),
}));

function writeMechanicBlock(descriptor: IMechanicBlockDescriptor, options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  if (descriptor.writer.kind === "spatial") return writeSpatialMechanicBlock(descriptor.id as "grid-step" | "occupancy-objective" | "push-interaction", options);
  switch (descriptor.writer.id) {
    case "follow-camera": return addFollowCameraBlock(options);
    case "physics-target": return addPhysicsTargetBlock(options);
    case "projectile": return addProjectileBlock(options);
    case "score": return addScoreBlock(options);
    case "spawner": return addSpawnerBlock(options);
    case "timer": return addTimerBlock(options);
    case "trigger-sequence": return addTriggerSequenceBlock(options);
  }
}

export function getMechanicBlock(id: string | undefined): IMechanicBlockDefinition | undefined {
  return definitions.find((definition) => definition.id === id);
}

export function listMechanicBlocks(): readonly IMechanicBlockDefinition[] {
  return definitions;
}

export function formatMechanicBlockUsage(): string {
  return definitions.map((definition) => definition.id).join("|");
}

export async function removeMechanicBlock(projectPath: string, blockId: string): Promise<IRemoveMechanicBlockResult> {
  const mechanicPath = `content/mechanics/${blockId}.mechanic.json`;
  let mechanic: Record<string, unknown>;
  try {
    mechanic = await readJsonObject(resolve(projectPath, mechanicPath));
  } catch {
    return { block: blockId, code: "TN_REMOVE_BLOCK_MISSING", filesRemoved: [], message: `Mechanic block '${blockId}' does not have a registered mechanic document.`, ok: false };
  }
  const block = mechanic.block;
  const definition = typeof block === "string" ? getMechanicBlock(block) : undefined;
  if (typeof block !== "string" || definition === undefined) {
    return { block: blockId, code: "TN_REMOVE_BLOCK_MISSING", filesRemoved: [], message: `Mechanic block '${blockId}' is not a registered tn add block.`, ok: false };
  }
  if (!("owner" in definition.removal)) {
    return { block, code: "TN_REMOVE_BLOCK_MISSING", filesRemoved: [], message: `Mechanic block '${block}' is not individually removable: ${definition.removal.rationale}`, ok: false };
  }
  const details = isRecord(mechanic.details) ? mechanic.details : {};
  const sourceFiles = Array.isArray(mechanic.sourceFiles) ? mechanic.sourceFiles.filter((file): file is string => typeof file === "string") : [];
  const scenePath = sourceFiles.find((file) => file.endsWith(".scene.json"));
  if (scenePath !== undefined) {
    const scene = await readJsonObject(resolve(projectPath, scenePath));
    removeBlockSceneContent(scene, block as MechanicBlockId, details);
    await writeJson(resolve(projectPath, scenePath), scene);
  }
  const systemsPath = sourceFiles.find((file) => file.endsWith(".systems.json"));
  if (systemsPath !== undefined && (block === "timer" || block === "projectile")) {
    const systems = await readJsonObject(resolve(projectPath, systemsPath));
    if (block === "timer") {
      const countdownId = typeof details.countdownId === "string" ? details.countdownId : undefined;
      systems.countdowns = arrayOfRecords(systems.countdowns).filter((countdown) => countdown.id !== countdownId);
    } else {
      systems.systems = arrayOfRecords(systems.systems).filter((system) => system.id !== "run-projectile");
    }
    await writeJson(resolve(projectPath, systemsPath), systems);
  }
  const inputPath = sourceFiles.find((file) => file.endsWith(".input.json"));
  if (inputPath !== undefined && block === "projectile") {
    const input = await readJsonObject(resolve(projectPath, inputPath));
    input.actions = arrayOfRecords(input.actions).filter((action) => action.id !== "launch");
    await writeJson(resolve(projectPath, inputPath), input);
  }
  const filesRemoved = [mechanicPath, `playtests/${definition.proofTemplateId}.playtest.json`];
  for (const file of sourceFiles.filter((file) => file.endsWith("mechanics.ts"))) {
    const removed = await removeMechanicScript(resolve(projectPath, file), block as "projectile" | "score");
    if (removed) filesRemoved.push(file);
  }
  if (block === "projectile" && typeof details.prefabPath === "string") {
    await rm(resolve(projectPath, details.prefabPath), { force: true });
    filesRemoved.push(details.prefabPath);
  }
  if (block === "projectile") {
    const cooldownScenarioPath = "playtests/block-projectile-cooldown.playtest.json";
    await rm(resolve(projectPath, cooldownScenarioPath), { force: true });
    filesRemoved.push(cooldownScenarioPath);
  }
  await Promise.all(filesRemoved.slice(0, 2).map((file) => rm(resolve(projectPath, file), { force: true })));
  return {
    block,
    code: "TN_REMOVE_BLOCK_OK",
    filesRemoved: [...new Set(filesRemoved)].sort(),
    message: `Mechanic block '${block}' removed.`,
    ok: true,
  };
}

function removeBlockSceneContent(scene: Record<string, unknown>, block: MechanicBlockId, details: Record<string, unknown>): void {
  const entities = arrayOfRecords(scene.entities);
  const prefabs = arrayOfRecords(scene.prefabs);
  const resources = arrayOfRecords(scene.resources);
  const entityIds = new Set<string>();
  const prefabIds = new Set<string>();
  const resourceIds = new Set<string>();
  if (block === "spawner") {
    const blockId = typeof details.blockId === "string" ? details.blockId : "spawner.grid";
    for (const entity of entities) if (typeof entity.id === "string" && entity.id.startsWith(`${blockId}.`)) entityIds.add(entity.id);
    if (typeof details.prefab === "string") prefabIds.add(details.prefab);
    resourceIds.add("MechanicSpawner");
  } else if (block === "trigger-sequence") {
    for (const id of Array.isArray(details.triggers) ? details.triggers : []) if (typeof id === "string") entityIds.add(id);
    if (typeof details.mode === "string" && typeof details.scenePath === "string") {
      const prefix = typeof details.prefix === "string" ? details.prefix : "checkpoint";
      prefabIds.add(`${prefix}.prefab`);
    }
    resourceIds.add("TriggerSequence");
  } else if (block === "timer") {
    if (typeof details.resource === "string") resourceIds.add(details.resource);
  } else if (block === "score") {
    resourceIds.add(typeof details.resource === "string" ? details.resource : "GameScore");
  } else if (block === "projectile") {
    resourceIds.add("ProjectilePhysics");
    resourceIds.add("ProjectileLauncher");
    if (typeof details.projectile === "string") prefabIds.add(`${details.projectile}.prefab`);
    entityIds.add("projectile-impact-target");
    entityIds.add("projectile.runtime.template");
  } else if (block === "physics-target") {
    for (const id of Array.isArray(details.targets) ? details.targets : []) if (typeof id === "string") entityIds.add(id);
    if (typeof details.prefab === "string") prefabIds.add(details.prefab);
    resourceIds.add("PhysicsTargets");
  } else if (block === "follow-camera") {
    resourceIds.add("FollowCamera");
    const camera = typeof details.camera === "string" ? details.camera : undefined;
    const cameraEntity = entities.find((entity) => entity.id === camera);
    if (cameraEntity !== undefined && Object.keys(cameraEntity).every((key) => key === "id" || key === "components")) entityIds.add(camera!);
  }
  scene.entities = entities.filter((entity) => typeof entity.id !== "string" || !entityIds.has(entity.id));
  scene.prefabs = prefabs.filter((prefab) => typeof prefab.id !== "string" || !prefabIds.has(prefab.id));
  scene.resources = resources.filter((resource) => typeof resource.id !== "string" || !resourceIds.has(resource.id));
}

async function removeMechanicScript(file: string, block: "projectile" | "score"): Promise<boolean> {
  let source: string;
  try {
    source = await readFile(file, "utf8");
  } catch {
    return false;
  }
  const exportName = block === "score" ? "updateScoreBlock" : "updateProjectileBlock";
  const start = source.indexOf(`export function ${exportName}`);
  if (start < 0) return false;
  const next = source.indexOf("\nexport ", start + 1);
  const nextSource = `${source.slice(0, start)}${next < 0 ? "" : source.slice(next + 1)}`.trim();
  if (nextSource === "") {
    await rm(file, { force: true });
  } else {
    await writeFile(file, `${nextSource}\n`, "utf8");
  }
  return true;
}

async function addSpawnerBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const pattern = readFlag(options.args, "--pattern") ?? "grid";
  const prefab = readFlag(options.args, "--prefab") ?? "mechanic.spawn.prefab";
  const count = parsePositiveInteger(readFlag(options.args, "--count")) ?? 4;
  const blockId = readFlag(options.args, "--id") ?? `spawner.${pattern}`;
  const basePosition = parseVector3(readFlag(options.args, "--position")) ?? [0, 0, -2];
  const scale = parseVector3(readFlag(options.args, "--scale")) ?? [0.35, 0.35, 0.35];
  const scenePath = await resolveScenePath(options.projectPath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const prefabs = arrayOfRecords(scene.prefabs);
  const entities = arrayOfRecords(scene.entities);
  const resources = arrayOfRecords(scene.resources);
  scene.prefabs = prefabs;
  scene.entities = entities;
  scene.resources = resources;
  upsertPrefab(prefabs, prefab, "box", "#38bdf8");
  for (const [index, spawnPosition] of spawnPositions(pattern, count).entries()) {
    upsertEntity(entities, `${blockId}.${String(index + 1).padStart(2, "0")}`, prefab, [spawnPosition[0] + basePosition[0], spawnPosition[1] + basePosition[1], spawnPosition[2] + basePosition[2]], scale);
  }
  upsertResource(resources, "MechanicSpawner", { blockId, count, pattern, position: basePosition, prefab, scale, statusText: `${count} spawn points ready` });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  return writeBlockArtifacts(options.projectPath, "spawner", {
    blockId,
    count,
    pattern,
    position: basePosition,
    prefab,
    scenePath,
    scale,
  }, [scenePath]);
}

async function addTimerBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const resource = readFlag(options.args, "--resource") ?? "GameTimer";
  const direction = readFlag(options.args, "--direction") === "up" ? "up" : "down";
  const limit = parseFiniteNumber(readFlag(options.args, "--limit")) ?? 60;
  const field = readFlag(options.args, "--field") ?? (direction === "down" ? "remaining" : "elapsed");
  const event = readFlag(options.args, "--event") ?? `${resource}.limit`;
  const countdownId = readFlag(options.args, "--id") ?? `${resource}.countdown`;
  const autostart = readFlag(options.args, "--autostart") !== "false";
  const scenePath = await resolveScenePath(options.projectPath);
  const systemsPath = await resolveSystemsPath(options.projectPath, scenePath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const systems = await readJsonObject(resolve(options.projectPath, systemsPath));
  const resources = arrayOfRecords(scene.resources);
  scene.resources = resources;
  upsertResource(resources, resource, {
    direction,
    [field]: direction === "down" ? limit : 0,
    limit,
    restartToken: 0,
    running: autostart,
    statusText: direction === "down" ? `Time ${limit}` : "Time 0",
  });
  const countdowns = arrayOfRecords(systems.countdowns);
  systems.schema = systems.schema ?? "threenative.systems";
  systems.version = systems.version ?? "0.1.0";
  systems.id = systems.id ?? "systems.generated";
  systems.countdowns = countdowns;
  upsertCountdown(countdowns, { autostart, direction, event, field, id: countdownId, limit, resource });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  await writeJson(resolve(options.projectPath, systemsPath), systems);
  return writeBlockArtifacts(options.projectPath, "timer", { autostart, countdownId, direction, event, field, limit, resource, scenePath, systemsPath }, [scenePath, systemsPath]);
}

async function addTriggerSequenceBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const mode = readFlag(options.args, "--mode") === "unordered" ? "unordered" : "ordered";
  const count = parsePositiveInteger(readFlag(options.args, "--count")) ?? 3;
  const prefix = readFlag(options.args, "--prefix") ?? "checkpoint";
  const scenePath = await resolveScenePath(options.projectPath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const prefabs = arrayOfRecords(scene.prefabs);
  const entities = arrayOfRecords(scene.entities);
  const resources = arrayOfRecords(scene.resources);
  scene.prefabs = prefabs;
  scene.entities = entities;
  scene.resources = resources;
  upsertPrefab(prefabs, `${prefix}.prefab`, "box", "#22c55e");
  const triggers: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}.${String(index + 1).padStart(2, "0")}`;
    triggers.push(id);
    upsertEntity(entities, id, `${prefix}.prefab`, [index * 1.5, 0.35, -2 - index]);
  }
  upsertResource(resources, "TriggerSequence", { mode, nextIndex: 0, statusText: `${mode} trigger sequence ready`, triggers });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  return writeBlockArtifacts(options.projectPath, "trigger-sequence", { mode, prefix, scenePath, triggers }, [scenePath]);
}

async function addScoreBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const resource = readFlag(options.args, "--resource") ?? "GameScore";
  const winAt = parsePositiveInteger(readFlag(options.args, "--win-at")) ?? 5;
  const scenePath = await resolveScenePath(options.projectPath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const resources = arrayOfRecords(scene.resources);
  scene.resources = resources;
  upsertResource(resources, resource, { retryKey: "keyboard.KeyR", score: 0, scoreText: `Score 0 / ${winAt}`, statusText: "Score ready", winAt, won: false });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  const scriptPath = await appendMechanicScript(options.projectPath, "score");
  return writeBlockArtifacts(options.projectPath, "score", { resource, scenePath, winAt }, [scenePath, scriptPath]);
}

async function addProjectileBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const launcher = readFlag(options.args, "--launcher") ?? "player";
  const projectile = readFlag(options.args, "--projectile") ?? "projectile.basic";
  const scenePath = await resolveScenePath(options.projectPath);
  const systemsPath = await resolveSystemsPath(options.projectPath, scenePath);
  const inputPath = await resolveInputPath(options.projectPath, scenePath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const systems = await readJsonObject(resolve(options.projectPath, systemsPath));
  const input = await readJsonObject(resolve(options.projectPath, inputPath));
  const prefabs = arrayOfRecords(scene.prefabs);
  const entities = arrayOfRecords(scene.entities);
  const resources = arrayOfRecords(scene.resources);
  const prefabId = `${projectile}.prefab`;
  const prefabPath = `content/prefabs/${projectile.replaceAll(/[^a-zA-Z0-9._-]/g, "-")}.prefab.json`;
  await assertProjectileOwnersAvailable(options.projectPath, {
    entities,
    input,
    prefabId,
    prefabPath,
    prefabs,
    resources,
    systems,
  });
  scene.prefabs = prefabs;
  scene.entities = entities;
  scene.resources = resources;
  const launcherEntity = entities.find((entity) => entity.id === launcher);
  if (launcherEntity === undefined) {
    throw new Error(`TN_ADD_PROJECTILE_LAUNCHER_MISSING: Launcher entity '${launcher}' does not exist in ${scenePath}. Add it or pass --launcher <entity-id>.`);
  }
  if (!isRecord(launcherEntity.transform) && !isRecord(readComponent(launcherEntity, "Transform"))) {
    throw new Error(`TN_ADD_PROJECTILE_TRANSFORM_MISSING: Launcher entity '${launcher}' has no Transform in ${scenePath}. Add a transform before installing the projectile mechanic.`);
  }
  upsertPrefab(prefabs, prefabId, "sphere", "#f97316");
  upsertEntity(entities, "projectile.runtime.template", prefabId, [0, -9999, 0], [0.001, 0.001, 0.001]);
  const projectileTemplate = entities.find((entity) => entity.id === "projectile.runtime.template");
  if (projectileTemplate !== undefined) {
    projectileTemplate.components = { Visibility: { visible: false } };
  }
  upsertPhysicsTarget(entities, "projectile-impact-target", prefabId, [0, 0.35, 1.8]);
  const impactTarget = entities.find((entity) => entity.id === "projectile-impact-target");
  if (impactTarget !== undefined) {
    impactTarget.components = {
      Collider: { kind: "box", size: [0.5, 0.5, 0.1] },
      RigidBody: { kind: "static" },
    };
    impactTarget.transform = { position: [0, 0.35, 1.8], scale: [1, 1, 1] };
  }
  upsertResource(resources, "ProjectilePhysics", {
    collider: { kind: "sphere", radius: 0.18, trigger: false },
    rigidBody: { kind: "dynamic", mass: 0.25 },
  });
  upsertResource(resources, "ProjectileLauncher", {
    active: 0,
    cooldown: 1,
    cooldownRejected: 0,
    despawned: 0,
    fired: 0,
    impacts: 0,
    impactDistance: 1.5,
    impactTarget: "projectile-impact-target",
    input: "launch",
    lastImpactEntity: "",
    launcher,
    lifetime: 1.5,
    projectilePrefab: prefabId,
    maxTravelDistance: 0,
    speed: 12,
    status: "ready",
  });
  const actions = arrayOfRecords(input.actions);
  input.actions = actions;
  upsertInputAction(actions, "launch", ["keyboard.Space"]);
  const systemList = arrayOfRecords(systems.systems);
  systems.systems = systemList;
  upsertSystem(systemList, "run-projectile", "src/scripts/mechanics.ts", "updateProjectileBlock", {
    commands: [
      ...projectilePrefixes(8).map((prefix) => ({ kind: "instantiate", prefab: prefabId, prefix })),
      ...projectilePrefixes(8).map((prefix) => ({ entity: `${prefix}.root`, kind: "despawn" })),
    ],
    resourceReads: ["ProjectileLauncher"],
    resourceWrites: ["ProjectileLauncher"],
    services: ["physics.raycast"],
    writes: ["RigidBody", "Transform"],
  });
  await writeJson(resolve(options.projectPath, prefabPath), {
    entities: [{
      components: {
        Collider: { kind: "sphere", radius: 0.18, trigger: false },
        MeshRenderer: { material: "mat.player", mesh: "mesh.projectile.runtime.template" },
        RigidBody: { gravityScale: 0, kind: "dynamic", mass: 0.25 },
        Transform: { position: [0, -9999, 0], rotation: [0, 0, 0, 1], scale: [0.18, 0.18, 0.18] },
      },
      id: "root",
      tags: ["projectile"],
    }],
    id: `${projectile}.prefab`,
    schema: "threenative.prefab",
    version: "0.1.0",
  });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  await writeJson(resolve(options.projectPath, systemsPath), systems);
  await writeJson(resolve(options.projectPath, inputPath), input);
  const scriptPath = await appendMechanicScript(options.projectPath, "projectile");
  const result = await writeBlockArtifacts(options.projectPath, "projectile", { inputPath, launcher, prefabPath, projectile, scenePath, systemsPath }, [inputPath, prefabPath, scenePath, scriptPath, systemsPath]);
  await writeJson(resolve(options.projectPath, result.scenarioPath), projectileScenario(launcher));
  const cooldownScenarioPath = "playtests/block-projectile-cooldown.playtest.json";
  await writeJson(resolve(options.projectPath, cooldownScenarioPath), projectileCooldownScenario(launcher));
  result.filesWritten = [...new Set([...result.filesWritten, cooldownScenarioPath])].sort();
  return result;
}

async function addPhysicsTargetBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const count = parsePositiveInteger(readFlag(options.args, "--count")) ?? 5;
  const prefix = readFlag(options.args, "--prefix") ?? "target";
  const prefab = `${prefix}.prefab`;
  const scenePath = await resolveScenePath(options.projectPath);
  const systemsPath = await resolveSystemsPath(options.projectPath, scenePath);
  const inputPath = await resolveInputPath(options.projectPath, scenePath);
  const uiPath = await resolveUiPath(options.projectPath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const systems = await readJsonObject(resolve(options.projectPath, systemsPath));
  const input = await readJsonObject(resolve(options.projectPath, inputPath));
  const ui = await readJsonObject(resolve(options.projectPath, uiPath));
  const prefabs = arrayOfRecords(scene.prefabs);
  const entities = arrayOfRecords(scene.entities);
  const resources = arrayOfRecords(scene.resources);
  scene.prefabs = prefabs;
  scene.entities = entities;
  scene.resources = resources;
  upsertPrefab(prefabs, prefab, "box", "#f97316");
  upsertPrefab(prefabs, "prefab.push-ball", "sphere", "#facc15");
  upsertEntity(entities, "push.ball", "prefab.push-ball", [0, 0.28, 1.4], [0.42, 0.42, 0.42]);
  const targets: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const id = `${prefix}.${String(index + 1).padStart(2, "0")}`;
    const column = index % 3;
    const row = Math.floor(index / 3);
    targets.push(id);
    upsertPhysicsTarget(entities, id, prefab, [(column - 1) * 0.85, 0.55, -2.4 - (row * 0.9)]);
  }
  upsertResource(resources, "PhysicsTargets", { count, statusText: `${count} knockdown targets ready`, targets });
  if (!resources.some((resource) => resource.id === "GameScore")) {
    resources.push({ id: "GameScore", value: { score: 0, scoreText: `Score 0 / ${count}`, statusText: "SPACE: LAUNCH  •  ENTER/R: RETRY", winAt: count, won: false } });
  }
  const actions = arrayOfRecords(input.actions);
  input.actions = actions;
  upsertInputAction(actions, "launch", ["keyboard.Space"]);
  upsertInputAction(actions, "retry", ["keyboard.Enter", "keyboard.KeyR"]);
  const nodes = arrayOfRecords(ui.nodes);
  const bindings = arrayOfRecords(ui.bindings);
  ui.nodes = nodes;
  ui.bindings = bindings;
  upsertUiText(nodes, "physics-target.score", "Score 0", 32);
  upsertUiText(nodes, "physics-target.status", "SPACE: LAUNCH  •  ENTER/R: RETRY", 68);
  upsertUiBinding(bindings, "physics-target.score", "GameScore.scoreText");
  upsertUiBinding(bindings, "physics-target.status", "GameScore.statusText");
  const systemList = arrayOfRecords(systems.systems);
  systems.systems = systemList;
  upsertSystem(systemList, "run-physics-target", "src/scripts/physicsTarget.ts", "runPhysicsTarget");
  const scriptPath = "src/scripts/physicsTarget.ts";
  await writeJson(resolve(options.projectPath, scenePath), scene);
  await writeJson(resolve(options.projectPath, systemsPath), systems);
  await writeJson(resolve(options.projectPath, inputPath), input);
  await writeJson(resolve(options.projectPath, uiPath), ui);
  await writeFile(resolve(options.projectPath, scriptPath), physicsTargetScript(count), "utf8");
  const result = await writeBlockArtifacts(options.projectPath, "physics-target", { count, prefab, scenePath, targets }, [inputPath, scenePath, scriptPath, systemsPath, uiPath]);
  await writeJson(resolve(options.projectPath, result.scenarioPath), physicsTargetScenario(count));
  const retryScenarioPath = "playtests/block-physics-target-retry.playtest.json";
  await writeJson(resolve(options.projectPath, retryScenarioPath), physicsTargetRetryScenario(count));
  result.filesWritten = [...new Set([...result.filesWritten, retryScenarioPath])].sort();
  return result;
}

async function addFollowCameraBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const camera = readFlag(options.args, "--camera") ?? "camera.main";
  const target = readFlag(options.args, "--target") ?? "player";
  const scenePath = await resolveScenePath(options.projectPath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const entities = arrayOfRecords(scene.entities);
  const resources = arrayOfRecords(scene.resources);
  scene.entities = entities;
  scene.resources = resources;
  const cameraEntity = entities.find((entity) => entity.id === camera);
  if (cameraEntity === undefined) {
    entities.push({ components: { camera: { mode: "perspective", target } }, id: camera });
  } else if (!isRecord(cameraEntity.transform)) {
    const components = isRecord(cameraEntity.components) ? cameraEntity.components : {};
    const cameraComponent = isRecord(components.camera) ? components.camera : {};
    cameraEntity.components = { ...components, camera: { ...cameraComponent, target } };
  }
  upsertResource(resources, "FollowCamera", { camera, statusText: `Following ${target}`, target });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  return writeBlockArtifacts(options.projectPath, "follow-camera", { camera, scenePath, target }, [scenePath]);
}

async function writeBlockArtifacts(projectPath: string, block: MechanicBlockId, details: Record<string, unknown>, sourceFiles: string[]): Promise<IMechanicBlockResult> {
  const descriptor = mechanicBlockDescriptor(block)!;
  const mechanicPath = `content/mechanics/${block}.mechanic.json`;
  const scenarioPath = `playtests/${descriptor.proofTemplateId}.playtest.json`;
  await writeJson(resolve(projectPath, mechanicPath), {
    block,
    details,
    mutationCommand: descriptor.mutationCommand,
    proofTemplateId: descriptor.proofTemplateId,
    recipeIds: descriptor.recipeIds,
    removal: descriptor.removal,
    responsibilities: descriptor.responsibilities,
    schema: "threenative.mechanic-block",
    sourceFiles,
    sourceOwners: descriptor.sourceOwners,
    version: "0.1.0",
  });
  const subject = await resolveProofSubject(projectPath, details, sourceFiles);
  await writeJson(resolve(projectPath, scenarioPath), blockScenario(block, details, subject));
  return {
    block,
    code: "TN_ADD_BLOCK_OK",
    filesWritten: [...new Set([mechanicPath, scenarioPath, ...sourceFiles])].sort(),
    message: `Mechanic block '${block}' added.`,
    proofCommand: `tn playtest --project . --scenario ${scenarioPath} --stable-artifacts --json`,
    scenarioPath,
  };
}

async function appendMechanicScript(projectPath: string, block: "projectile" | "score"): Promise<string> {
  const relativePath = "src/scripts/mechanics.ts";
  const absolutePath = resolve(projectPath, relativePath);
  let source = "";
  try {
    source = await readFile(absolutePath, "utf8");
  } catch {
    source = "";
  }
  const exportName = block === "score" ? "updateScoreBlock" : "updateProjectileBlock";
  if (!new RegExp(`export\\s+function\\s+${exportName}\\b`).test(source)) {
    const body = block === "score"
      ? `export function ${exportName}(context: import("@threenative/script-stdlib").ScriptContext): void {
  const score = context.state("GameScore", { score: 0, scoreText: "Score 0 / 5", statusText: "Score ready", winAt: 5, won: false });
  if (context.input.pressed("retry")) {
    score.score = 0;
    score.won = false;
    score.scoreText = \`Score 0 / \${score.winAt}\`;
    score.statusText = "Score ready";
  }
}
`
      : `export function ${exportName}(context: import("@threenative/script-stdlib").ScriptContext): void {
  const config = context.resources.get("ProjectileLauncher", {
    active: 0, cooldown: 1, cooldownRejected: 0, despawned: 0, fired: 0,
    impacts: 0, impactDistance: 1.5, impactTarget: "projectile-impact-target", input: "launch", lastImpactEntity: "", launcher: "player", lifetime: 1.5,
    projectilePrefab: "projectile.basic.prefab", maxTravelDistance: 0, speed: 12, status: "ready"
  });
  const state = context.state("projectile-lifecycle", {
    active: [] as Array<{ age: number; direction: [number, number, number]; id: string; initialized: boolean; origin: [number, number, number]; position: [number, number, number]; rotation: [number, number, number, number] }>,
    nextId: 1,
    readyAt: 0
  });
  const dt = Math.max(0, context.time.fixedDelta);
  const survivors: typeof state.active = [];
  for (const projectile of state.active) {
    projectile.age += dt;
    const entity = context.entity(projectile.id);
    if (entity) {
      if (!projectile.initialized) {
        entity.transform().setPose(projectile.position, projectile.rotation);
        entity.patch("RigidBody", {
          gravityScale: 0, kind: "dynamic", mass: 0.25,
          velocity: [projectile.direction[0] * config.speed, projectile.direction[1] * config.speed, projectile.direction[2] * config.speed]
        });
        projectile.initialized = true;
        survivors.push(projectile);
        continue;
      }
      const position: [number, number, number] = [
        projectile.position[0] + projectile.direction[0] * config.speed * dt,
        projectile.position[1] + projectile.direction[1] * config.speed * dt,
        projectile.position[2] + projectile.direction[2] * config.speed * dt
      ];
      entity.transform().setPose(position, projectile.rotation);
      projectile.position = position;
      const travelDistance = Math.hypot(
        position[0] - projectile.origin[0],
        position[1] - projectile.origin[1],
        position[2] - projectile.origin[2]
      );
      config.maxTravelDistance = Math.round(Math.max(config.maxTravelDistance, travelDistance) * 1000) / 1000;
      context.physics.raycast({
        direction: projectile.direction,
        ignore: [config.launcher, projectile.id],
        maxDistance: Math.max(0.01, config.speed * dt),
        origin: position
      });
      const impactTarget = context.entity(config.impactTarget);
      if (impactTarget && travelDistance >= config.impactDistance) {
        context.commands.despawn(projectile.id);
        config.impacts += 1;
        config.lastImpactEntity = config.impactTarget;
        config.despawned += 1;
        continue;
      }
    }
    if (projectile.age >= config.lifetime) {
      context.commands.despawn(projectile.id);
      config.despawned += 1;
      continue;
    }
    survivors.push(projectile);
  }
  state.active = survivors;
  if (context.input.pressed(config.input)) {
    if (context.time.elapsed < state.readyAt) {
      config.cooldownRejected += 1;
    } else {
      const launcher = context.entity(config.launcher);
      if (launcher) {
        const transform = launcher.get<{ position?: [number, number, number]; rotation?: [number, number, number, number] }>("Transform", {});
        const position = transform.position ?? launcher.transform().position;
        const rotation = transform.rotation ?? [0, 0, 0, 1];
        const [x, y, z, w] = rotation;
        const direction: [number, number, number] = [
          2 * (x * z + w * y),
          2 * (y * z - w * x),
          1 - 2 * (x * x + y * y)
        ];
        const prefix = \`projectile.runtime.\${String(state.nextId).padStart(4, "0")}\`;
        const id = \`\${prefix}.root\`;
        const result = context.commands.instantiate(config.projectilePrefab, prefix);
        if (result.accepted) {
          state.active.push({ age: 0, direction, id, initialized: false, origin: position, position, rotation });
          state.nextId = state.nextId >= 8 ? 1 : state.nextId + 1;
          state.readyAt = context.time.elapsed + config.cooldown;
          config.fired += 1;
        }
      }
    }
  }
  config.active = state.active.length;
  config.status = config.impacts > 0 ? "impact-cleaned" : config.despawned > 0 ? "expired-cleaned" : config.fired > 0 ? "flying" : "ready";
  context.resources.patch("ProjectileLauncher", config);
}
`;
    await mkdir(resolve(absolutePath, ".."), { recursive: true });
    await writeFile(absolutePath, `${source.trimEnd()}${source.trim() === "" ? "" : "\n\n"}${body}`, "utf8");
  }
  return relativePath;
}

async function resolveScenePath(projectPath: string): Promise<string> {
  try {
    const config = await readJsonObject(resolve(projectPath, "threenative.config.json"));
    if (typeof config.entry === "string" && config.entry.trim() !== "") {
      return config.entry;
    }
  } catch {
    // Fall through to source discovery.
  }
  const sceneDir = resolve(projectPath, "content/scenes");
  const entries = await readdir(sceneDir);
  const firstScene = entries.find((entry) => entry.endsWith(".scene.json"));
  return firstScene === undefined ? "content/scenes/arena.scene.json" : `content/scenes/${firstScene}`;
}

async function resolveSystemsPath(projectPath: string, scenePath: string): Promise<string> {
  const sceneFile = scenePath.split("/").pop() ?? "arena.scene.json";
  const stem = sceneFile.endsWith(".scene.json") ? sceneFile.slice(0, -".scene.json".length) : "arena";
  const candidate = `content/systems/${stem}.systems.json`;
  try {
    await readFile(resolve(projectPath, candidate), "utf8");
    return candidate;
  } catch {
    try {
      const entries = await readdir(resolve(projectPath, "content/systems"));
      const first = entries.find((entry) => entry.endsWith(".systems.json"));
      return first === undefined ? candidate : `content/systems/${first}`;
    } catch {
      return candidate;
    }
  }
}

async function resolveInputPath(projectPath: string, scenePath: string): Promise<string> {
  const sceneFile = scenePath.split("/").pop() ?? "arena.scene.json";
  const stem = sceneFile.endsWith(".scene.json") ? sceneFile.slice(0, -".scene.json".length) : "arena";
  const candidate = `content/input/${stem}.input.json`;
  try {
    await readFile(resolve(projectPath, candidate), "utf8");
    return candidate;
  } catch {
    const entries = await readdir(resolve(projectPath, "content/input")).catch(() => []);
    const first = entries.find((entry) => entry.endsWith(".input.json"));
    return first === undefined ? candidate : `content/input/${first}`;
  }
}

async function resolveUiPath(projectPath: string): Promise<string> {
  const entries = await readdir(resolve(projectPath, "content/ui")).catch(() => []);
  const first = entries.find((entry) => entry.endsWith(".ui.json"));
  return first === undefined ? "content/ui/hud.ui.json" : `content/ui/${first}`;
}

function blockScenario(block: MechanicBlockId, details: Record<string, unknown>, subject: string): Record<string, unknown> {
  const resources: Record<MechanicBlockId, Record<string, unknown>[]> = {
    "follow-camera": [{ equals: details.target, id: "FollowCamera", path: "target" }],
    "grid-step": [{ gte: 1, id: "SpatialGrid", path: "step" }],
    "occupancy-objective": [{ gte: 0, id: "SpatialObjective", path: "progress" }],
    "physics-target": [{ gte: 1, id: "PhysicsTargets", path: "count" }],
    projectile: [{ gte: 1, id: "ProjectileLauncher", path: "speed" }],
    "push-interaction": [{ equals: true, id: "SpatialGrid", path: "pushEnabled" }],
    score: [{ gte: 0, id: typeof details.resource === "string" ? details.resource : "GameScore", path: "score" }],
    spawner: [{ gte: 1, id: "MechanicSpawner", path: "count" }],
    timer: [{ gte: 0, id: typeof details.resource === "string" ? details.resource : "GameTimer", path: "limit" }],
    "trigger-sequence": [{ textIncludes: "trigger sequence ready", id: "TriggerSequence", path: "statusText" }],
  };
  return {
    artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true },
      resources: resources[block],
    },
    name: `block-${block}`,
    schemaVersion: 1,
    steps: [{ label: "observe-block-state", release: false, waitFrames: 2 }],
    subject,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

async function resolveProofSubject(projectPath: string, details: Record<string, unknown>, sourceFiles: readonly string[]): Promise<string> {
  if (typeof details.target === "string" && details.target.trim() !== "") {
    return details.target;
  }
  const scenePath = sourceFiles.find((file) => file.endsWith(".scene.json")) ?? await resolveScenePath(projectPath);
  try {
    const scene = await readJsonObject(resolve(projectPath, scenePath));
    const ids = arrayOfRecords(scene.entities).flatMap((entity) => typeof entity.id === "string" ? [entity.id] : []);
    return ids.find((id) => id === "player")
      ?? ids.find((id) => /(?:^|[._-])(player|hero|car|kart|vehicle)(?:$|[._-])/iu.test(id))
      ?? ids[0]
      ?? "player";
  } catch {
    return "player";
  }
}

function spawnPositions(pattern: string, count: number): Array<[number, number, number]> {
  if (pattern === "ring") {
    return Array.from({ length: count }, (_, index) => {
      const angle = (Math.PI * 2 * index) / count;
      return [Number((Math.cos(angle) * 2.4).toFixed(3)), 0.35, Number((Math.sin(angle) * 2.4).toFixed(3))];
    });
  }
  if (pattern === "lane") {
    return Array.from({ length: count }, (_, index) => [0, 0.35, -2 - (index * 1.5)]);
  }
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));
  return Array.from({ length: count }, (_, index) => [(index % columns) * 1.2, 0.35, Math.floor(index / columns) * -1.2]);
}

function upsertPrefab(prefabs: Record<string, unknown>[], id: string, primitive: string, color: string): void {
  const next = { color, id, primitive };
  const existing = prefabs.find((prefab) => prefab.id === id);
  if (existing === undefined) {
    prefabs.push(next);
  } else {
    Object.assign(existing, next);
  }
}

function upsertEntity(entities: Record<string, unknown>[], id: string, prefab: string, position: [number, number, number], scale?: [number, number, number]): void {
  const next = { id, prefab, transform: { position, ...(scale === undefined ? {} : { scale }) } };
  const existing = entities.find((entity) => entity.id === id);
  if (existing === undefined) {
    entities.push(next);
  } else {
    Object.assign(existing, next);
  }
}

function upsertPhysicsTarget(entities: Record<string, unknown>[], id: string, prefab: string, position: [number, number, number]): void {
  const next = {
    components: {
      Collider: { kind: "box", size: [0.42, 0.9, 0.42] },
      RigidBody: { kind: "dynamic", mass: 1 },
    },
    id,
    prefab,
    transform: { position, scale: [0.42, 0.9, 0.42] },
  };
  const existing = entities.find((entity) => entity.id === id);
  if (existing === undefined) entities.push(next);
  else Object.assign(existing, next);
}

function upsertResource(resources: Record<string, unknown>[], id: string, value: Record<string, unknown>): void {
  const existing = resources.find((resource) => resource.id === id);
  if (existing === undefined) {
    resources.push({ id, value });
  } else {
    existing.value = { ...(isRecord(existing.value) ? existing.value : {}), ...value };
  }
}

function upsertCountdown(countdowns: Record<string, unknown>[], next: Record<string, unknown>): void {
  const existing = countdowns.find((countdown) => countdown.id === next.id);
  if (existing === undefined) {
    countdowns.push(next);
  } else {
    Object.assign(existing, next);
  }
}

function upsertInputAction(actions: Record<string, unknown>[], id: string, bindings: string[]): void {
  const existing = actions.find((action) => action.id === id);
  if (existing === undefined) actions.push({ bindings, id });
  else existing.bindings = bindings;
}

function upsertSystem(systems: Record<string, unknown>[], id: string, module: string, exportName: string, metadata: Record<string, unknown> = {}): void {
  const next = { ...metadata, id, script: { export: exportName, module }, source: "behavior-metadata" };
  const existing = systems.find((system) => system.id === id);
  if (existing === undefined) systems.push(next);
  else Object.assign(existing, next);
}

function readComponent(entity: Record<string, unknown>, component: string): unknown {
  return isRecord(entity.components) ? entity.components[component] : undefined;
}

function projectilePrefixes(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `projectile.runtime.${String(index + 1).padStart(4, "0")}`);
}

async function assertProjectileOwnersAvailable(
  projectPath: string,
  owners: {
    entities: Record<string, unknown>[];
    input: Record<string, unknown>;
    prefabId: string;
    prefabPath: string;
    prefabs: Record<string, unknown>[];
    resources: Record<string, unknown>[];
    systems: Record<string, unknown>;
  },
): Promise<void> {
  const conflicts: string[] = [];
  const ownedEntityIds = new Set(["projectile-impact-target", "projectile.runtime.template"]);
  const ownedResourceIds = new Set(["ProjectileLauncher", "ProjectilePhysics"]);
  if (owners.entities.some((entity) => typeof entity.id === "string" && ownedEntityIds.has(entity.id))) conflicts.push("scene entity");
  if (owners.prefabs.some((prefab) => prefab.id === owners.prefabId)) conflicts.push(`scene prefab '${owners.prefabId}'`);
  if (owners.resources.some((resource) => typeof resource.id === "string" && ownedResourceIds.has(resource.id))) conflicts.push("scene resource");
  if (arrayOfRecords(owners.input.actions).some((action) => action.id === "launch")) conflicts.push("input action 'launch'");
  if (arrayOfRecords(owners.systems.systems).some((system) => system.id === "run-projectile")) conflicts.push("system 'run-projectile'");
  for (const relativePath of [
    owners.prefabPath,
    "content/mechanics/projectile.mechanic.json",
    "playtests/block-projectile.playtest.json",
    "playtests/block-projectile-cooldown.playtest.json",
  ]) {
    if (await pathExists(resolve(projectPath, relativePath))) conflicts.push(relativePath);
  }
  const mechanicsPath = resolve(projectPath, "src/scripts/mechanics.ts");
  if (await pathExists(mechanicsPath) && /export\s+function\s+updateProjectileBlock\b/u.test(await readFile(mechanicsPath, "utf8"))) {
    conflicts.push("script export 'updateProjectileBlock'");
  }
  if (conflicts.length > 0) {
    throw new Error(`TN_ADD_PROJECTILE_OWNER_CONFLICT: Projectile installation would overwrite owned source: ${conflicts.join(", ")}. Remove or rename the conflicting source before retrying.`);
  }
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await readFile(path);
    return true;
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") return false;
    throw error;
  }
}

function projectileScenario(subject: string): Record<string, unknown> {
  return {
    artifacts: { console: true, effectLog: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      contacts: [{ entity: "projectile.runtime.0001.root", kind: "physics.raycast", minCount: 1, requiredOn: ["web"], with: "projectile-impact-target" }],
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true },
      resources: [
        { gte: 1, id: "ProjectileLauncher", path: "fired" },
        { gte: 1, id: "ProjectileLauncher", path: "impacts" },
        { equals: "projectile-impact-target", id: "ProjectileLauncher", path: "lastImpactEntity" },
        { gte: 0.5, id: "ProjectileLauncher", path: "maxTravelDistance" },
        { gte: 1, id: "ProjectileLauncher", path: "despawned" },
        { equals: 0, id: "ProjectileLauncher", path: "active" },
      ],
    },
    name: "block-projectile",
    parity: {
      resources: [
        "ProjectileLauncher.fired",
        "ProjectileLauncher.impacts",
        "ProjectileLauncher.lastImpactEntity",
        "ProjectileLauncher.maxTravelDistance",
        "ProjectileLauncher.despawned",
        "ProjectileLauncher.active",
      ],
      targets: ["web", "desktop"],
    },
    schemaVersion: 1,
    steps: [
      { holdFrames: 1, label: "fire-projectile", press: "Space", release: true },
      ...Array.from({ length: 8 }, (_, index) => ({ label: `observe-travel-${index + 1}`, release: false, waitFrames: 1 })),
      { label: "observe-impact-cleanup", release: false, waitFrames: 42 },
    ],
    subject,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

function projectileCooldownScenario(subject: string): Record<string, unknown> {
  return {
    artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true },
      resources: [
        { equals: 1, id: "ProjectileLauncher", path: "fired" },
        { gte: 1, id: "ProjectileLauncher", path: "cooldownRejected" },
      ],
    },
    name: "block-projectile-cooldown",
    schemaVersion: 1,
    steps: [
      { holdFrames: 1, label: "first-fire", press: "Space", release: true },
      { holdFrames: 1, label: "cooldown-negative-control", press: "Space", release: true },
      { label: "observe-cooldown", release: false, waitFrames: 2 },
    ],
    subject,
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
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

function physicsTargetScenario(count: number): Record<string, unknown> {
  return {
    artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true },
      movement: { axis: "z", entity: "push.ball", minDistance: 2.5, minVelocity: 0.001 },
      resources: [{ gte: 1, id: "GameScore", path: "score" }],
    },
    name: "block-physics-target",
    schemaVersion: 1,
    steps: [{ holdFrames: 1, label: "launch-ball", press: "Space", release: true }, { label: "observe-targets", release: false, waitFrames: 50 }],
    subject: "push.ball",
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: Math.max(5, count),
  };
}

function physicsTargetRetryScenario(count: number): Record<string, unknown> {
  return {
    artifacts: { console: true, network: true, runtimeTrace: true, screenshots: "before-after" },
    assert: {
      diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true, runtimeReady: true },
      resources: [{ equals: 0, id: "GameScore", path: "score" }, { textIncludes: "RETRY", id: "GameScore", path: "statusText" }],
    },
    name: "block-physics-target-retry",
    schemaVersion: 1,
    steps: [
      { holdFrames: 1, label: "launch-before-retry", press: "Space", release: true },
      { label: "wait-for-score", release: false, waitFrames: 50 },
      { holdFrames: 1, label: "retry", press: "Enter", release: true },
      { label: "observe-reset", release: false, waitFrames: Math.max(2, count) },
    ],
    subject: "push.ball",
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
}

function physicsTargetScript(count: number): string {
  const knocked = Array.from({ length: count }, () => "false").join(", ");
  const targets = Array.from({ length: count }, (_, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    return `[${(column - 1) * 0.85}, 0.55, ${-2.4 - (row * 0.9)}]`;
  }).join(",\n      ");
  return `import { defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";

export const runPhysicsTarget = defineBehavior(
  { id: "run-physics-target", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ProjectContext): void => {
    const ball = context.entity("push.ball");
    if (!ball) return;
    const starts = [
      ${targets}
    ] as const;
    const state = context.state("physics-target", { launched: false, knocked: [${knocked}] });
    const score = context.resources.get("GameScore", { score: 0, scoreText: "Score 0 / ${count}", statusText: "SPACE: LAUNCH  •  ENTER/R: RETRY", winAt: ${count}, won: false });
    if (context.input.pressed("retry")) {
      state.launched = false;
      state.knocked = [${knocked}];
      ball.transform().position = [0, 0.28, 1.4];
      for (let index = 0; index < starts.length; index += 1) context.entity(\`target.\${String(index + 1).padStart(2, "0")}\`)?.transform().setPosition(starts[index]);
      context.resources.patch("GameScore", { score: 0, scoreText: "Score 0 / ${count}", statusText: "SPACE: LAUNCH  •  ENTER/R: RETRY", won: false });
      return;
    }
    if (context.input.pressed("launch") && !state.launched) state.launched = true;
    if (!state.launched) return;
    const ballTransform = ball.transform();
    const ballPosition = ballTransform.position;
    ballTransform.position = [ballPosition[0], ballPosition[1], ballPosition[2] - context.time.fixedDelta * 7.5];
    for (let index = 0; index < starts.length; index += 1) {
      if (state.knocked[index]) continue;
      const target = context.entity(\`target.\${String(index + 1).padStart(2, "0")}\`);
      if (!target) continue;
      const position = target.transform().position;
      const dx = position[0] - ballTransform.position[0];
      const dz = position[2] - ballTransform.position[2];
      if (dx * dx + dz * dz >= 0.32) continue;
      state.knocked[index] = true;
      target.transform().position = [position[0] + (index % 2 === 0 ? -0.55 : 0.55), 0.18, position[2] - 0.7];
      score.score += 1;
      score.won = score.score >= score.winAt;
      score.scoreText = \`Score \${score.score} / \${score.winAt}\`;
      score.statusText = score.won ? "ALL TARGETS DOWN!  ENTER/R: RETRY" : "TARGET DOWN!  ENTER/R: RETRY";
      context.resources.patch("GameScore", score);
    }
  },
);
`;
}

async function readJsonObject(path: string): Promise<Record<string, unknown>> {
  const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  return isRecord(parsed) ? parsed : {};
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function arrayOfRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseFiniteNumber(value: string | undefined): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parsePositiveInteger(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function parseVector3(value: string | undefined): [number, number, number] | undefined {
  if (value === undefined) return undefined;
  const values = value.split(",").map((entry) => Number(entry.trim()));
  return values.length === 3 && values.every((entry) => Number.isFinite(entry)) ? values as [number, number, number] : undefined;
}

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}
