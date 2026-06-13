import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { type IBundleManifest, type IEnvironmentSceneIr, type ITargetProfile, type IWorldIr } from "@threenative/ir";
import { type IAssetReference, type IAudioDeclaration, type IInputMapDeclaration, type World } from "@threenative/sdk";
import { type IUiElement } from "@threenative/ui";

import { type IProjectConfig } from "../config.js";
import { emitAudio } from "./audio.js";
import { ecsToIr } from "./ecs.js";
import { inputToIr } from "./input.js";
import { sceneToWorld } from "./scene-to-world.js";
import { stableJson } from "./stable-json.js";
import { emitUi } from "./ui.js";

export async function emitBundle(config: IProjectConfig, root: unknown): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const bundleRoot = normalizeBundleRoot(root);
  const isWorld =
    typeof bundleRoot.scene === "object" && bundleRoot.scene !== null && bundleRoot.scene.constructor.name === "World";
  const worldRoot = bundleRoot.world ?? (isWorld ? bundleRoot.scene : undefined);
  const sceneRoot = isWorld ? undefined : bundleRoot.scene;
  const emitted = sceneRoot === undefined ? undefined : sceneToWorld(sceneRoot as Parameters<typeof sceneToWorld>[0]);
  const ecs = worldRoot === undefined ? undefined : ecsToIr(worldRoot as Parameters<typeof ecsToIr>[0]);
  const input = bundleRoot.input === undefined ? ecs?.input : inputToIr(bundleRoot.input);
  const audio = bundleRoot.audio === undefined ? undefined : emitAudio(bundleRoot.audio);
  const environment = bundleRoot.environment === undefined ? undefined : await emitEnvironment(config.projectPath, bundleRoot.environment);
  const assets = mergeEnvironmentAssets(mergeAudioAssets(emitted?.assets ?? [], bundleRoot.audio), environment?.assets ?? []);
  const ui = bundleRoot.ui === undefined ? undefined : emitUi(bundleRoot.ui);
  const manifest: IBundleManifest = {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "threenative-game",
    requiredCapabilities: {
      rendering: ["mesh.primitive.box", "material.standard", "light.directional"],
    },
    entry: {
      ...(audio === undefined ? {} : { audio: "audio.ir.json" }),
      ...(environment === undefined ? {} : { environmentScene: "environment.scene.json" }),
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" }),
      ...(ecs === undefined ? {} : { systems: "systems.ir.json" }),
      ...(ui === undefined ? {} : { ui: "ui.ir.json" }),
      world: "world.ir.json",
    },
    files: {
      assets: "assets.manifest.json",
      ...(input === undefined ? {} : { input: "input.ir.json" }),
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
      ...(ecs === undefined
        ? {}
        : {
            componentSchemas: "schemas/components.schema.json" as const,
            eventSchemas: "schemas/events.schema.json" as const,
            resourceSchemas: "schemas/resources.schema.json" as const,
            ...(ecs.runtimeConfig === undefined ? {} : { runtimeConfig: "runtime.config.json" as const }),
            ...(ecs.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" as const }),
          }),
    },
  };

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(resolve(outDir, "schemas"), { recursive: true });
  await writeFile(resolve(outDir, "manifest.json"), stableJson(manifest));
  await copyAssetFiles(config.projectPath, outDir, assets);
  await copyExtraAssetFiles(config.projectPath, outDir, environment?.extraFiles ?? []);
  await writeFile(resolve(outDir, "world.ir.json"), stableJson(mergeWorlds(emitted?.world, ecs?.world)));
  await writeFile(
    resolve(outDir, "materials.ir.json"),
    stableJson({ schema: "threenative.materials", version: "0.1.0", materials: emitted?.materials ?? [] }),
  );
  await writeFile(
    resolve(outDir, "assets.manifest.json"),
    stableJson({ schema: "threenative.assets", version: "0.1.0", assets: assets.map(stripInternalAssetFields) }),
  );
  await writeFile(
    resolve(outDir, "target.profile.json"),
    stableJson({
      schema: "threenative.target-profile",
      version: "0.1.0",
      targets: ["web", "desktop"],
      ...(environment?.budgets === undefined ? {} : { budgets: environment.budgets }),
      ...(environment?.performance === undefined ? {} : { performance: environment.performance }),
    } satisfies ITargetProfile),
  );
  if (environment !== undefined) {
    await writeFile(resolve(outDir, "environment.scene.json"), stableJson(environment.scene));
  }
  if (ui !== undefined) {
    await writeFile(resolve(outDir, "ui.ir.json"), stableJson(ui));
  }
  if (audio !== undefined) {
    await writeFile(resolve(outDir, "audio.ir.json"), stableJson(audio));
  }
  if (input !== undefined) {
    await writeFile(resolve(outDir, "input.ir.json"), stableJson(input));
  }
  if (ecs !== undefined) {
    await writeFile(resolve(outDir, "schemas/components.schema.json"), stableJson(ecs.componentSchemas));
    await writeFile(resolve(outDir, "schemas/resources.schema.json"), stableJson(ecs.resourceSchemas));
    await writeFile(resolve(outDir, "schemas/events.schema.json"), stableJson(ecs.eventSchemas));
    await writeFile(resolve(outDir, "systems.ir.json"), stableJson(ecs.systems));
    if (ecs.runtimeConfig !== undefined) {
      await writeFile(resolve(outDir, "runtime.config.json"), stableJson(ecs.runtimeConfig));
    }
    if (ecs.scriptBundle !== undefined) {
      await writeFile(resolve(outDir, "scripts.bundle.js"), ecs.scriptBundle);
    }
  }

  return outDir;
}

interface IBundleRoot {
  audio?: IAudioDeclaration;
  environment?: IEnvironmentDeclaration;
  input?: IInputMapDeclaration;
  scene: unknown;
  ui?: IUiElement;
  world?: World;
}

interface IEnvironmentDeclaration {
  assetNames: string[];
  atmosphere?: IEnvironmentSceneIr["atmosphere"];
  bookmarks?: IEnvironmentSceneIr["bookmarks"];
  budgets?: ITargetProfile["budgets"];
  controller?: IEnvironmentSceneIr["controller"];
  exclusionZones?: IEnvironmentSceneIr["exclusionZones"];
  instances: IEnvironmentSceneIr["instances"];
  path: IEnvironmentSceneIr["path"];
  performance?: ITargetProfile["performance"];
  previewImage?: string;
  scatter?: IEnvironmentSceneIr["scatter"];
  sourceDir: string;
  terrain?: IEnvironmentSceneIr["terrain"];
  walkability?: IEnvironmentSceneIr["walkability"];
}

interface IEmittedEnvironment {
  assets: IInternalAsset[];
  budgets?: ITargetProfile["budgets"];
  extraFiles: IAssetCopy[];
  performance?: ITargetProfile["performance"];
  scene: IEnvironmentSceneIr;
}

type IInternalAsset = Record<string, unknown> & { id: string; sourcePath?: string };

interface IAssetCopy {
  path: string;
  sourcePath: string;
}

function normalizeBundleRoot(root: unknown): IBundleRoot {
  if (isBundleRoot(root)) {
    return root;
  }
  return { scene: root };
}

function isBundleRoot(root: unknown): root is IBundleRoot {
  return typeof root === "object" && root !== null && "scene" in root;
}

function mergeWorlds(scene: IWorldIr | undefined, ecs: IWorldIr | undefined): IWorldIr | undefined {
  if (scene === undefined) {
    return ecs;
  }
  if (ecs === undefined) {
    return scene;
  }
  const entities = new Map(scene.entities.map((entity) => [entity.id, { ...entity, components: { ...entity.components } }]));
  for (const entity of ecs.entities) {
    const existing = entities.get(entity.id);
    entities.set(
      entity.id,
      existing === undefined
        ? { ...entity, components: { ...entity.components } }
        : { ...existing, components: { ...existing.components, ...entity.components }, tags: entity.tags ?? existing.tags },
    );
  }
  return {
    ...scene,
    entities: [...entities.values()].sort((left, right) => left.id.localeCompare(right.id)),
    events: { ...(scene.events ?? {}), ...(ecs.events ?? {}) },
    resources: { ...(scene.resources ?? {}), ...(ecs.resources ?? {}) },
  };
}

function mergeAudioAssets(
  assets: Array<Record<string, unknown> & { id: string }>,
  audio: IAudioDeclaration | undefined,
): IInternalAsset[] {
  const merged = new Map(assets.map((asset) => [asset.id, asset]));
  for (const asset of audioAssetRefs(audio)) {
    merged.set(asset.id, {
      format: asset.format,
      id: asset.id,
      kind: asset.kind,
      path: asset.path,
    });
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergeEnvironmentAssets(
  assets: IInternalAsset[],
  environmentAssets: IInternalAsset[],
): IInternalAsset[] {
  const merged = new Map(assets.map((asset) => [asset.id, asset]));
  for (const asset of environmentAssets) {
    merged.set(asset.id, asset);
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function audioAssetRefs(audio: IAudioDeclaration | undefined): IAssetReference[] {
  if (audio === undefined) {
    return [];
  }
  return [...audio.music, ...audio.oneShots].flatMap((item) => (item.assetRef === undefined ? [] : [item.assetRef]));
}

async function copyAssetFiles(
  projectPath: string,
  outDir: string,
  assets: ReadonlyArray<IInternalAsset>,
): Promise<void> {
  for (const asset of assets) {
    if (typeof asset.path !== "string") {
      continue;
    }
    const from = resolve(projectPath, asset.sourcePath ?? asset.path);
    const to = resolve(outDir, asset.path);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
}

async function copyExtraAssetFiles(projectPath: string, outDir: string, files: readonly IAssetCopy[]): Promise<void> {
  for (const file of files) {
    const from = resolve(projectPath, file.sourcePath);
    const to = resolve(outDir, file.path);
    await mkdir(dirname(to), { recursive: true });
    await cp(from, to);
  }
}

function stripInternalAssetFields(asset: IInternalAsset): Record<string, unknown> & { id: string } {
  const { sourcePath: _sourcePath, ...publicAsset } = asset;
  return publicAsset;
}

async function emitEnvironment(projectPath: string, declaration: IEnvironmentDeclaration): Promise<IEmittedEnvironment> {
  const sourceDir = resolve(projectPath, declaration.sourceDir);
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const available = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const assetNames = [...declaration.assetNames].sort((left, right) => left.localeCompare(right));
  const assets: IEmittedEnvironment["assets"] = [];
  const extraFiles: IAssetCopy[] = [];
  const sourceAssets: IEnvironmentSceneIr["sourceAssets"] = [];

  for (const assetName of assetNames) {
    if (!available.has(assetName)) {
      throw new Error(`Environment asset '${assetName}' is missing from '${declaration.sourceDir}'.`);
    }
    const extension = assetName.split(".").pop()?.toLowerCase();
    if (extension !== "gltf" && extension !== "glb") {
      throw new Error(`Environment asset '${assetName}' must be a glTF or GLB model.`);
    }
    const id = `env.${assetName.slice(0, -(extension.length + 1))}`;
    const bounds = extension === "gltf" ? await readGltfBounds(sourceDir, assetName) : undefined;
    assets.push({
      ...(bounds === undefined ? {} : { bounds }),
      format: extension,
      id: `model.${id}`,
      kind: "model",
      path: `assets/environment/${assetName}`,
      sourcePath: `${declaration.sourceDir}/${assetName}`,
    });
    if (extension === "gltf") {
      for (const dependency of await readGltfDependencies(sourceDir, assetName)) {
        if (!available.has(dependency)) {
          throw new Error(`Environment asset '${assetName}' references missing dependency '${dependency}'.`);
        }
        const dependencyExtension = dependency.split(".").pop()?.toLowerCase();
        const copy = { path: `assets/environment/${dependency}`, sourcePath: `${declaration.sourceDir}/${dependency}` };
        if (dependencyExtension === "bin") {
          assets.push({
            format: "bin",
            id: `buffer.env.${dependency.slice(0, -(dependencyExtension.length + 1))}`,
            kind: "buffer",
            path: copy.path,
            sourcePath: copy.sourcePath,
          });
        } else if (dependencyExtension === "png" || dependencyExtension === "jpeg" || dependencyExtension === "jpg") {
          const textureFormat = dependencyExtension === "jpg" ? "jpeg" : dependencyExtension;
          assets.push({
            format: textureFormat,
            id: `tex.env.${dependency.slice(0, -(dependencyExtension.length + 1))}`,
            kind: "texture",
            path: copy.path,
            sourcePath: copy.sourcePath,
          });
        } else {
          extraFiles.push(copy);
        }
      }
    }
    sourceAssets.push({
      asset: `model.${id}`,
      category: categorizeEnvironmentAsset(assetName),
      id,
    });
  }
  const previewAsset =
    declaration.previewImage === undefined
      ? undefined
      : emitPreviewAsset(declaration.previewImage, "assets/environment/reference");
  if (previewAsset !== undefined) {
    assets.push(previewAsset);
  }

  return {
    assets,
    budgets: declaration.budgets,
    extraFiles,
    performance: declaration.performance,
    scene: {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      ...(declaration.atmosphere === undefined ? {} : { atmosphere: declaration.atmosphere }),
      ...(declaration.bookmarks === undefined ? {} : { bookmarks: [...declaration.bookmarks].sort((left, right) => left.id.localeCompare(right.id)) }),
      ...(declaration.controller === undefined ? {} : { controller: declaration.controller }),
      ...(declaration.exclusionZones === undefined ? {} : { exclusionZones: [...declaration.exclusionZones].sort((left, right) => left.id.localeCompare(right.id)) }),
      ...(previewAsset === undefined ? {} : { referenceImage: previewAsset.id }),
      ...(declaration.scatter === undefined ? {} : { scatter: [...declaration.scatter].sort((left, right) => left.id.localeCompare(right.id)) }),
      sourceAssets,
      instances: emitEnvironmentInstances(declaration),
      path: declaration.path,
      ...(declaration.terrain === undefined ? {} : { terrain: declaration.terrain }),
      ...(declaration.walkability === undefined ? {} : { walkability: declaration.walkability }),
    },
  };
}

function emitEnvironmentInstances(declaration: IEnvironmentDeclaration): IEnvironmentSceneIr["instances"] {
  return [...declaration.instances.map((instance) => ({ kind: "hero" as const, ...instance })), ...expandScatterInstances(declaration)].sort(
    compareEnvironmentInstances,
  );
}

function compareEnvironmentInstances(left: IEnvironmentSceneIr["instances"][number], right: IEnvironmentSceneIr["instances"][number]): number {
  const kindOrder = (value: IEnvironmentSceneIr["instances"][number]): number => (value.kind === "hero" ? 0 : value.kind === "manual" ? 1 : 2);
  const kindDelta = kindOrder(left) - kindOrder(right);
  return kindDelta === 0 ? left.id.localeCompare(right.id) : kindDelta;
}

function expandScatterInstances(declaration: IEnvironmentDeclaration): IEnvironmentSceneIr["instances"] {
  const instances: IEnvironmentSceneIr["instances"] = [];
  const exclusionZones = declaration.exclusionZones ?? [];
  for (const scatter of [...(declaration.scatter ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const count = scatter.count ?? estimateScatterCount(scatter);
    const assetIds = [...scatter.assetIds].sort((left, right) => left.localeCompare(right));
    if (assetIds.length === 0) {
      continue;
    }
    const random = seededRandom(scatter.seed);
    let emitted = 0;
    let attempts = 0;
    while (emitted < count && attempts < count * 20) {
      attempts += 1;
      const sourceAsset = assetIds[Math.floor(random() * assetIds.length)] ?? assetIds[0]!;
      const position = [
        lerp(scatter.bounds.min[0], scatter.bounds.max[0], random()),
        0,
        lerp(scatter.bounds.min[2], scatter.bounds.max[2], random()),
      ] as const;
      if (isExcluded(position, declaration.path, exclusionZones, scatter.exclusionZoneIds ?? [])) {
        continue;
      }
      const scale = lerp(scatter.minScale, scatter.maxScale, random());
      const yaw = lerp(scatter.rotation?.minYaw ?? 0, scatter.rotation?.maxYaw ?? Math.PI * 2, random());
      instances.push({
        collisionMode: scatter.collisionMode ?? "none",
        id: `${scatter.id}.${sourceAsset}.${String(emitted).padStart(3, "0")}`,
        kind: "scatter",
        position,
        rotation: [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)],
        scale: [scale, scale, scale],
        scatterSource: scatter.id,
        sourceAsset,
        tags: [...(scatter.tags ?? [])].sort((left, right) => left.localeCompare(right)),
      });
      emitted += 1;
    }
  }
  return instances;
}

function estimateScatterCount(scatter: NonNullable<IEnvironmentDeclaration["scatter"]>[number]): number {
  const area = Math.abs((scatter.bounds.max[0] - scatter.bounds.min[0]) * (scatter.bounds.max[2] - scatter.bounds.min[2]));
  return Math.floor(area * (scatter.density ?? 0));
}

function seededRandom(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isExcluded(
  position: readonly [number, number, number],
  path: IEnvironmentSceneIr["path"],
  zones: NonNullable<IEnvironmentDeclaration["exclusionZones"]>,
  enabledZoneIds: readonly string[],
): boolean {
  const pathClearance = path.clearingRadius ?? path.width / 2;
  for (let index = 1; index < path.points.length; index += 1) {
    const start = path.points[index - 1];
    const end = path.points[index];
    if (start !== undefined && end !== undefined && distanceToSegment2d(position, start, end) <= pathClearance) {
      return true;
    }
  }
  const enabled = new Set(enabledZoneIds);
  return zones.some((zone) => {
    if (enabled.size > 0 && !enabled.has(zone.id)) {
      return false;
    }
    if (zone.bounds !== undefined) {
      return position[0] >= zone.bounds.min[0] && position[0] <= zone.bounds.max[0] && position[2] >= zone.bounds.min[2] && position[2] <= zone.bounds.max[2];
    }
    if (zone.radius !== undefined) {
      return Math.hypot(position[0], position[2]) <= zone.radius;
    }
    return false;
  });
}

function distanceToSegment2d(point: readonly [number, number, number], start: readonly [number, number, number], end: readonly [number, number, number]): number {
  const dx = end[0] - start[0];
  const dz = end[2] - start[2];
  const lengthSquared = dx * dx + dz * dz;
  if (lengthSquared === 0) {
    return Math.hypot(point[0] - start[0], point[2] - start[2]);
  }
  const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[2] - start[2]) * dz) / lengthSquared));
  return Math.hypot(point[0] - (start[0] + t * dx), point[2] - (start[2] + t * dz));
}

function lerp(min: number, max: number, amount: number): number {
  return min + (max - min) * amount;
}

async function readGltfDependencies(sourceDir: string, assetName: string): Promise<string[]> {
  const gltf = JSON.parse(await readFile(resolve(sourceDir, assetName), "utf8")) as {
    buffers?: Array<{ uri?: string }>;
    images?: Array<{ uri?: string }>;
  };
  const dependencies = new Set<string>();
  for (const item of [...(gltf.buffers ?? []), ...(gltf.images ?? [])]) {
    if (item.uri === undefined || item.uri.startsWith("data:") || item.uri.includes("/") || item.uri.includes("..")) {
      continue;
    }
    dependencies.add(item.uri);
  }
  if (dependencies.size === 0) {
    const binName = `${basename(assetName, ".gltf")}.bin`;
    dependencies.add(binName);
  }
  return [...dependencies].sort((left, right) => left.localeCompare(right));
}

async function readGltfBounds(sourceDir: string, assetName: string): Promise<{ max: [number, number, number]; min: [number, number, number] } | undefined> {
  const gltf = JSON.parse(await readFile(resolve(sourceDir, assetName), "utf8")) as {
    accessors?: Array<{ max?: number[]; min?: number[] }>;
    meshes?: Array<{ primitives?: Array<{ attributes?: { POSITION?: number } }> }>;
  };
  const mins: number[][] = [];
  const maxes: number[][] = [];
  for (const mesh of gltf.meshes ?? []) {
    for (const primitive of mesh.primitives ?? []) {
      const position = primitive.attributes?.POSITION;
      const accessor = position === undefined ? undefined : gltf.accessors?.[position];
      if (accessor?.min?.length === 3 && accessor.max?.length === 3) {
        mins.push(accessor.min);
        maxes.push(accessor.max);
      }
    }
  }
  if (mins.length === 0 || maxes.length === 0) {
    return undefined;
  }
  return {
    max: [0, 1, 2].map((index) => Math.max(...maxes.map((item) => item[index] ?? 0))) as [number, number, number],
    min: [0, 1, 2].map((index) => Math.min(...mins.map((item) => item[index] ?? 0))) as [number, number, number],
  };
}

function emitPreviewAsset(previewImage: string, outDir: string): IInternalAsset {
  const extension = previewImage.split(".").pop()?.toLowerCase();
  if (extension !== "jpg" && extension !== "jpeg" && extension !== "png") {
    throw new Error(`Environment preview '${previewImage}' must be a PNG or JPEG image.`);
  }
  const fileName = basename(previewImage);
  return {
    format: extension === "jpg" ? "jpeg" : extension,
    id: `tex.env.reference.${fileName.slice(0, -(extension.length + 1))}`,
    kind: "texture",
    path: `${outDir}/${fileName}`,
    sourcePath: previewImage,
  };
}

function categorizeEnvironmentAsset(assetName: string): IEnvironmentSceneIr["sourceAssets"][number]["category"] {
  const lower = assetName.toLowerCase();
  if (lower.includes("tree") || lower.includes("pine")) {
    return "tree";
  }
  if (lower.includes("grass") || lower.includes("clover") || lower.includes("fern") || lower.includes("plant")) {
    return "grass";
  }
  if (lower.includes("mushroom")) {
    return "mushroom";
  }
  if (lower.includes("pebble")) {
    return "pebble";
  }
  if (lower.includes("rock")) {
    return "rock";
  }
  if (lower.includes("flower") || lower.includes("petal")) {
    return "flower";
  }
  return "vegetation";
}
