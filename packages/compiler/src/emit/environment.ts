import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { IEnvironmentSceneIr, ITargetProfile } from "@threenative/ir";

import type { IAssetCopy, IInternalAsset } from "./asset-copy.js";

export interface IEnvironmentDeclaration {
  assetNames: string[];
  atmosphere?: IEnvironmentSceneIr["atmosphere"];
  bookmarks?: IEnvironmentSceneIr["bookmarks"];
  budgets?: ITargetProfile["budgets"];
  controller?: IEnvironmentSceneIr["controller"];
  environmentMap?: IEnvironmentSceneIr["environmentMap"];
  exclusionZones?: IEnvironmentSceneIr["exclusionZones"];
  instances: IEnvironmentSceneIr["instances"];
  lightProbes?: IEnvironmentSceneIr["lightProbes"];
  lod?: Record<string, Array<{ assetName: string; maxDistance: number; minDistance: number }>>;
  path: IEnvironmentSceneIr["path"];
  performance?: ITargetProfile["performance"];
  previewImage?: string;
  scatter?: IEnvironmentSceneIr["scatter"];
  skybox?: IEnvironmentSceneIr["skybox"];
  sourceDir: string;
  terrain?: IEnvironmentSceneIr["terrain"];
  walkability?: IEnvironmentSceneIr["walkability"];
}

export interface IEmittedEnvironment {
  assets: IInternalAsset[];
  budgets?: ITargetProfile["budgets"];
  extraFiles: IAssetCopy[];
  performance?: ITargetProfile["performance"];
  scene: IEnvironmentSceneIr;
}

export async function emitEnvironment(projectPath: string, declaration: IEnvironmentDeclaration): Promise<IEmittedEnvironment> {
  const sourceDir = resolve(projectPath, declaration.sourceDir);
  const entries = await readdir(sourceDir, { withFileTypes: true });
  const available = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name));
  const sourceAssetNames = [...declaration.assetNames].sort((left, right) => left.localeCompare(right));
  const assetNames = collectEnvironmentModelAssetNames(declaration);
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
    if (sourceAssetNames.includes(assetName)) {
      sourceAssets.push({
        asset: `model.${id}`,
        category: categorizeEnvironmentAsset(assetName),
        id,
        ...emitSourceAssetLod(assetName, declaration),
      });
    }
  }
  const previewAsset =
    declaration.previewImage === undefined
      ? undefined
      : emitPreviewAsset(declaration.previewImage, "assets/environment/reference");
  if (previewAsset !== undefined) {
    assets.push(previewAsset);
  }
  assets.push(...collectEnvironmentLightingAssets(declaration));

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
      ...(declaration.environmentMap === undefined ? {} : { environmentMap: toJsonValue(declaration.environmentMap) as IEnvironmentSceneIr["environmentMap"] }),
      ...(declaration.exclusionZones === undefined ? {} : { exclusionZones: [...declaration.exclusionZones].sort((left, right) => left.id.localeCompare(right.id)) }),
      ...(declaration.lightProbes === undefined
        ? {}
        : { lightProbes: [...declaration.lightProbes].map((probe) => toJsonValue(probe) as NonNullable<IEnvironmentSceneIr["lightProbes"]>[number]).sort((left, right) => left.id.localeCompare(right.id)) }),
      ...(previewAsset === undefined ? {} : { referenceImage: previewAsset.id }),
      ...(declaration.scatter === undefined ? {} : { scatter: [...declaration.scatter].sort((left, right) => left.id.localeCompare(right.id)) }),
      ...(declaration.skybox === undefined ? {} : { skybox: toJsonValue(declaration.skybox) as IEnvironmentSceneIr["skybox"] }),
      sourceAssets,
      instances: emitEnvironmentInstances(declaration),
      path: declaration.path,
      ...(declaration.terrain === undefined ? {} : { terrain: declaration.terrain }),
      ...(declaration.walkability === undefined ? {} : { walkability: declaration.walkability }),
    },
  };
}

function collectEnvironmentLightingAssets(declaration: IEnvironmentDeclaration): IInternalAsset[] {
  const assetRefs = [
    ...readAssetRefs(declaration.skybox),
    ...readAssetRefs(declaration.environmentMap),
    ...(declaration.lightProbes ?? []).flatMap((probe) => readAssetRefs(probe)),
  ];
  const byId = new Map<string, IInternalAsset>();
  for (const assetRef of assetRefs) {
    if (assetRef.kind !== "texture" || typeof assetRef.path !== "string") {
      continue;
    }
    byId.set(assetRef.id, {
      center: assetRef.center,
      format: assetRef.format,
      id: assetRef.id,
      kind: "texture",
      magFilter: assetRef.magFilter,
      minFilter: assetRef.minFilter,
      offset: assetRef.offset,
      path: assetRef.path,
      repeat: assetRef.repeat,
      rotation: assetRef.rotation,
      sourcePath: assetRef.path,
      wrapS: assetRef.wrapS,
      wrapT: assetRef.wrapT,
    });
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function readAssetRefs(value: unknown): Array<{ [key: string]: unknown; format: string; id: string; kind: string; path?: string }> {
  if (typeof value !== "object" || value === null || !("assetRefs" in value) || !Array.isArray((value as { assetRefs?: unknown }).assetRefs)) {
    return [];
  }
  return (value as { assetRefs: Array<{ [key: string]: unknown; format: string; id: string; kind: string; path?: string }> }).assetRefs;
}

function toJsonValue(value: unknown): unknown {
  if (typeof value === "object" && value !== null && "toJSON" in value && typeof (value as { toJSON?: unknown }).toJSON === "function") {
    return (value as { toJSON: () => unknown }).toJSON();
  }
  return value;
}

function collectEnvironmentModelAssetNames(declaration: IEnvironmentDeclaration): string[] {
  const assetNames = new Set(declaration.assetNames);
  for (const levels of Object.values(declaration.lod ?? {})) {
    for (const level of levels) {
      assetNames.add(level.assetName);
    }
  }
  return [...assetNames].sort((left, right) => left.localeCompare(right));
}

function emitSourceAssetLod(
  assetName: string,
  declaration: IEnvironmentDeclaration,
): Pick<IEnvironmentSceneIr["sourceAssets"][number], "lod"> {
  const sourceAssetId = `env.${assetName.slice(0, -(assetName.split(".").pop()!.length + 1))}`;
  const levels = declaration.lod?.[sourceAssetId];
  if (levels === undefined || levels.length === 0) {
    return {};
  }
  return {
    lod: [...levels]
      .sort((left, right) => left.minDistance - right.minDistance || left.maxDistance - right.maxDistance || left.assetName.localeCompare(right.assetName))
      .map((level) => {
        const extension = level.assetName.split(".").pop()?.toLowerCase();
        const id = `env.${level.assetName.slice(0, -((extension?.length ?? 0) + 1))}`;
        return {
          asset: `model.${id}`,
          maxDistance: level.maxDistance,
          minDistance: level.minDistance,
        };
      }),
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
