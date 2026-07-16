import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type MechanicBlockId = "follow-camera" | "physics-target" | "projectile" | "score" | "spawner" | "timer" | "trigger-sequence";

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

interface IMechanicBlockDefinition {
  id: MechanicBlockId;
  summary: string;
  write(options: IMechanicBlockOptions): Promise<IMechanicBlockResult>;
}

const definitions: readonly IMechanicBlockDefinition[] = [
  { id: "spawner", summary: "Spawn stable prefab instances in a grid, ring, or lane pattern.", write: addSpawnerBlock },
  { id: "timer", summary: "Add a deterministic up/down timer resource and proof hook.", write: addTimerBlock },
  { id: "trigger-sequence", summary: "Add ordered or unordered checkpoint/trigger sequence metadata.", write: addTriggerSequenceBlock },
  { id: "score", summary: "Add score, win, and retry state tied to named events.", write: addScoreBlock },
  { id: "projectile", summary: "Add launcher input, projectile prefab, and physics metadata.", write: addProjectileBlock },
  { id: "physics-target", summary: "Add a visible set of dynamic collider targets for push or knockdown mechanics.", write: addPhysicsTargetBlock },
  { id: "follow-camera", summary: "Retarget or annotate an existing camera follow relationship.", write: addFollowCameraBlock },
];

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
  if (typeof block !== "string" || getMechanicBlock(block) === undefined) {
    return { block: blockId, code: "TN_REMOVE_BLOCK_MISSING", filesRemoved: [], message: `Mechanic block '${blockId}' is not a registered tn add block.`, ok: false };
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
  if (systemsPath !== undefined && block === "timer") {
    const systems = await readJsonObject(resolve(projectPath, systemsPath));
    const countdownId = typeof details.countdownId === "string" ? details.countdownId : undefined;
    systems.countdowns = arrayOfRecords(systems.countdowns).filter((countdown) => countdown.id !== countdownId);
    await writeJson(resolve(projectPath, systemsPath), systems);
  }
  const filesRemoved = [mechanicPath, `playtests/block-${block}.playtest.json`];
  for (const file of sourceFiles.filter((file) => file.endsWith("mechanics.ts"))) {
    const removed = await removeMechanicScript(resolve(projectPath, file), block as "projectile" | "score");
    if (removed) filesRemoved.push(file);
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
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const prefabs = arrayOfRecords(scene.prefabs);
  const resources = arrayOfRecords(scene.resources);
  scene.prefabs = prefabs;
  scene.resources = resources;
  upsertPrefab(prefabs, `${projectile}.prefab`, "sphere", "#f97316");
  upsertResource(resources, "ProjectilePhysics", {
    collider: { kind: "sphere", radius: 0.18, trigger: false },
    rigidBody: { kind: "dynamic", mass: 0.25 },
  });
  upsertResource(resources, "ProjectileLauncher", { cooldown: 0.35, input: "keyboard.Space", launcher, projectilePrefab: `${projectile}.prefab`, speed: 12 });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  const scriptPath = await appendMechanicScript(options.projectPath, "projectile");
  return writeBlockArtifacts(options.projectPath, "projectile", { launcher, projectile, scenePath }, [scenePath, scriptPath]);
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
  const mechanicPath = `content/mechanics/${block}.mechanic.json`;
  const scenarioPath = `playtests/block-${block}.playtest.json`;
  await writeJson(resolve(projectPath, mechanicPath), {
    block,
    details,
    schema: "threenative.mechanic-block",
    sourceFiles,
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
  if (context.input.action("retry")) {
    score.score = 0;
    score.won = false;
    score.scoreText = \`Score 0 / \${score.winAt}\`;
    score.statusText = "Score ready";
  }
}
`
      : `export function ${exportName}(context: import("@threenative/script-stdlib").ScriptContext): void {
  context.state("ProjectileLauncher", { cooldown: 0.35, input: "keyboard.Space", projectilePrefab: "projectile.basic.prefab", speed: 12 });
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
    "physics-target": [{ gte: 1, id: "PhysicsTargets", path: "count" }],
    projectile: [{ gte: 1, id: "ProjectileLauncher", path: "speed" }],
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

function upsertSystem(systems: Record<string, unknown>[], id: string, module: string, exportName: string): void {
  const next = { id, script: { export: exportName, module }, source: "behavior-metadata" };
  const existing = systems.find((system) => system.id === id);
  if (existing === undefined) systems.push(next);
  else Object.assign(existing, next);
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
    if (context.input.action("retry")) {
      state.launched = false;
      state.knocked = [${knocked}];
      ball.transform().position = [0, 0.28, 1.4];
      for (let index = 0; index < starts.length; index += 1) context.entity(\`target.\${String(index + 1).padStart(2, "0")}\`)?.transform().setPosition(starts[index]);
      context.resources.patch("GameScore", { score: 0, scoreText: "Score 0 / ${count}", statusText: "SPACE: LAUNCH  •  ENTER/R: RETRY", won: false });
      return;
    }
    if (context.input.action("launch") && !state.launched) state.launched = true;
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
