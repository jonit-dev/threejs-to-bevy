import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type MechanicBlockId = "follow-camera" | "projectile" | "score" | "spawner" | "timer" | "trigger-sequence";

export interface IMechanicBlockResult {
  block: MechanicBlockId;
  code: "TN_ADD_BLOCK_OK";
  filesWritten: string[];
  message: string;
  proofCommand: string;
  scenarioPath: string;
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

async function addSpawnerBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const pattern = readFlag(options.args, "--pattern") ?? "grid";
  const prefab = readFlag(options.args, "--prefab") ?? "mechanic.spawn.prefab";
  const count = parsePositiveInteger(readFlag(options.args, "--count")) ?? 4;
  const blockId = readFlag(options.args, "--id") ?? `spawner.${pattern}`;
  const scenePath = await resolveScenePath(options.projectPath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const prefabs = arrayOfRecords(scene.prefabs);
  const entities = arrayOfRecords(scene.entities);
  const resources = arrayOfRecords(scene.resources);
  scene.prefabs = prefabs;
  scene.entities = entities;
  scene.resources = resources;
  upsertPrefab(prefabs, prefab, "box", "#38bdf8");
  for (const [index, position] of spawnPositions(pattern, count).entries()) {
    upsertEntity(entities, `${blockId}.${String(index + 1).padStart(2, "0")}`, prefab, position);
  }
  upsertResource(resources, "MechanicSpawner", { blockId, count, pattern, prefab, statusText: `${count} spawn points ready` });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  return writeBlockArtifacts(options.projectPath, "spawner", {
    blockId,
    count,
    pattern,
    prefab,
    scenePath,
  }, [scenePath]);
}

async function addTimerBlock(options: IMechanicBlockOptions): Promise<IMechanicBlockResult> {
  const resource = readFlag(options.args, "--resource") ?? "GameTimer";
  const direction = readFlag(options.args, "--direction") === "up" ? "up" : "down";
  const limit = parseFiniteNumber(readFlag(options.args, "--limit")) ?? 60;
  const scenePath = await resolveScenePath(options.projectPath);
  const scene = await readJsonObject(resolve(options.projectPath, scenePath));
  const resources = arrayOfRecords(scene.resources);
  scene.resources = resources;
  upsertResource(resources, resource, { direction, limit, remaining: direction === "down" ? limit : 0, statusText: direction === "down" ? `Time ${limit}` : "Time 0" });
  await writeJson(resolve(options.projectPath, scenePath), scene);
  return writeBlockArtifacts(options.projectPath, "timer", { direction, limit, resource, scenePath }, [scenePath]);
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
  return writeBlockArtifacts(options.projectPath, "trigger-sequence", { mode, scenePath, triggers }, [scenePath]);
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

function blockScenario(block: MechanicBlockId, details: Record<string, unknown>, subject: string): Record<string, unknown> {
  const resources: Record<MechanicBlockId, Record<string, unknown>[]> = {
    "follow-camera": [{ equals: details.target, id: "FollowCamera", path: "target" }],
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

function upsertEntity(entities: Record<string, unknown>[], id: string, prefab: string, position: [number, number, number]): void {
  const next = { id, prefab, transform: { position } };
  const existing = entities.find((entity) => entity.id === id);
  if (existing === undefined) {
    entities.push(next);
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

function readFlag(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}
