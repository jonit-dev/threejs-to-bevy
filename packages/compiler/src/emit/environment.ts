import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { IEnvironmentSceneIr, ITargetProfile } from "@threenative/ir";

import type { IAssetCopy, IInternalAsset } from "./asset-copy.js";
import { emitTerrainHeightmap } from "./terrain.js";

const MAX_SCATTER_INSTANCES = 10_000;
const SCATTER_ATTEMPT_MULTIPLIER = 20;

type IGeneratedMeshAsset = IInternalAsset & {
  attributes?: Array<{ itemSize: number; name: string; values: number[] }>;
};

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

export interface IEmitEnvironmentOptions {
  assets?: readonly IInternalAsset[];
}

export interface IEmittedEnvironment {
  assets: IInternalAsset[];
  budgets?: ITargetProfile["budgets"];
  extraFiles: IAssetCopy[];
  performance?: ITargetProfile["performance"];
  scene: IEnvironmentSceneIr;
}

export async function emitEnvironment(projectPath: string, declaration: IEnvironmentDeclaration, options: IEmitEnvironmentOptions = {}): Promise<IEmittedEnvironment> {
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
        } else if (dependencyExtension === "png" || dependencyExtension === "jpeg" || dependencyExtension === "jpg" || dependencyExtension === "webp") {
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
  const emittedTerrain = await emitTerrainHeightmap(projectPath, declaration.terrain, [...(options.assets ?? []), ...assets]);
  assets.push(...(emittedTerrain?.assets ?? []));

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
      instances: emitEnvironmentInstances(declaration, emittedTerrain?.terrain, emittedTerrain?.assets ?? []),
      path: declaration.path,
      ...(emittedTerrain?.terrain === undefined ? {} : { terrain: emittedTerrain.terrain }),
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

function emitEnvironmentInstances(
  declaration: IEnvironmentDeclaration,
  terrain: IEnvironmentSceneIr["terrain"] | undefined,
  terrainAssets: readonly IInternalAsset[],
): IEnvironmentSceneIr["instances"] {
  return [...declaration.instances.map((instance) => ({ kind: "hero" as const, ...instance })), ...expandScatterInstances(declaration, terrain, terrainAssets)].sort(
    compareEnvironmentInstances,
  );
}

function compareEnvironmentInstances(left: IEnvironmentSceneIr["instances"][number], right: IEnvironmentSceneIr["instances"][number]): number {
  const kindOrder = (value: IEnvironmentSceneIr["instances"][number]): number => (value.kind === "hero" ? 0 : value.kind === "manual" ? 1 : 2);
  const kindDelta = kindOrder(left) - kindOrder(right);
  return kindDelta === 0 ? left.id.localeCompare(right.id) : kindDelta;
}

function expandScatterInstances(
  declaration: IEnvironmentDeclaration,
  terrain: IEnvironmentSceneIr["terrain"] | undefined,
  terrainAssets: readonly IInternalAsset[],
): IEnvironmentSceneIr["instances"] {
  const instances: IEnvironmentSceneIr["instances"] = [];
  const exclusionZones = declaration.exclusionZones ?? [];
  const terrainSampler = terrain === undefined ? undefined : createTerrainSampler(terrain, terrainAssets);
  for (const scatter of [...(declaration.scatter ?? [])].sort((left, right) => left.id.localeCompare(right.id))) {
    const count = scatter.count ?? estimateScatterCount(scatter);
    assertScatterBudget(scatter.id, count);
    const assetIds = [...scatter.assetIds].sort((left, right) => left.localeCompare(right));
    if (assetIds.length === 0) {
      continue;
    }
    const random = seededRandom(scatter.seed);
    let emitted = 0;
    let attempts = 0;
    const maxAttempts = count * SCATTER_ATTEMPT_MULTIPLIER;
    while (emitted < count && attempts < maxAttempts) {
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
      const placement = terrainSampler?.(position[0], position[2]) ?? { slope: 0, terrainHeight: position[1] };
      if (!scatterAllowsPlacement(scatter, placement)) {
        continue;
      }
      const scale = lerp(scatter.minScale, scatter.maxScale, random());
      const yaw = lerp(scatter.rotation?.minYaw ?? 0, scatter.rotation?.maxYaw ?? Math.PI * 2, random());
      instances.push({
        collisionMode: scatter.collisionMode ?? "none",
        id: `${scatter.id}.${sourceAsset}.${String(emitted).padStart(3, "0")}`,
        kind: "scatter",
        placement: {
          scatterAttempt: attempts,
          slope: round(placement.slope),
          terrainHeight: round(placement.terrainHeight),
        },
        position: [position[0], round(placement.terrainHeight), position[2]],
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

function scatterAllowsPlacement(
  scatter: NonNullable<IEnvironmentDeclaration["scatter"]>[number],
  placement: { slope: number; terrainHeight: number },
): boolean {
  if (scatter.minHeight !== undefined && placement.terrainHeight < scatter.minHeight) {
    return false;
  }
  if (scatter.maxHeight !== undefined && placement.terrainHeight > scatter.maxHeight) {
    return false;
  }
  if (scatter.minSlope !== undefined && placement.slope < scatter.minSlope) {
    return false;
  }
  const maxSlope = scatter.maxSlope ?? scatter.slopeLimit;
  if (maxSlope !== undefined && placement.slope > maxSlope) {
    return false;
  }
  return true;
}

function createTerrainSampler(
  terrain: IEnvironmentSceneIr["terrain"],
  terrainAssets: readonly IInternalAsset[],
): ((x: number, z: number) => { slope: number; terrainHeight: number } | undefined) | undefined {
  const chunks = terrain?.chunks ?? [];
  const assets = new Map(terrainAssets.map((asset) => [asset.id, asset as IGeneratedMeshAsset]));
  const samplers = chunks
    .map((chunk) => {
      const asset = assets.get(chunk.mesh);
      return asset === undefined ? undefined : createMeshSampler(chunk.bounds, asset);
    })
    .filter((sampler): sampler is (x: number, z: number) => { slope: number; terrainHeight: number } | undefined => sampler !== undefined);
  if (samplers.length === 0) {
    return undefined;
  }
  return (x, z) => {
    for (const sampler of samplers) {
      const sample = sampler(x, z);
      if (sample !== undefined) {
        return sample;
      }
    }
    return undefined;
  };
}

function createMeshSampler(
  bounds: { max: readonly [number, number, number]; min: readonly [number, number, number] },
  asset: IGeneratedMeshAsset,
): ((x: number, z: number) => { slope: number; terrainHeight: number } | undefined) | undefined {
  const positionAttribute = asset.attributes?.find((attribute) => attribute.name === "position" && attribute.itemSize === 3);
  if (positionAttribute === undefined) {
    return undefined;
  }
  const normalAttribute = asset.attributes?.find((attribute) => attribute.name === "normal" && attribute.itemSize === 3);
  const samples = positionAttribute.values
    .reduce<Array<{ normal?: [number, number, number]; x: number; y: number; z: number }>>((items, _value, index) => {
      if (index % 3 !== 0) {
        return items;
      }
      const vertexIndex = index / 3;
      const normalOffset = vertexIndex * 3;
      const normal = normalAttribute === undefined
        ? undefined
        : [
            normalAttribute.values[normalOffset] ?? 0,
            normalAttribute.values[normalOffset + 1] ?? 1,
            normalAttribute.values[normalOffset + 2] ?? 0,
          ] as [number, number, number];
      items.push({
        normal,
        x: positionAttribute.values[index] ?? 0,
        y: positionAttribute.values[index + 1] ?? 0,
        z: positionAttribute.values[index + 2] ?? 0,
      });
      return items;
    }, []);
  const xs = uniqueSorted(samples.map((sample) => sample.x));
  const zs = uniqueSorted(samples.map((sample) => sample.z));
  return (x, z) => {
    if (x < bounds.min[0] || x > bounds.max[0] || z < bounds.min[2] || z > bounds.max[2]) {
      return undefined;
    }
    const leftX = lowerGridValue(xs, x);
    const rightX = upperGridValue(xs, x);
    const lowZ = lowerGridValue(zs, z);
    const highZ = upperGridValue(zs, z);
    if (leftX === undefined || rightX === undefined || lowZ === undefined || highZ === undefined) {
      return undefined;
    }
    const h00 = sampleHeight(samples, leftX, lowZ);
    const h10 = sampleHeight(samples, rightX, lowZ);
    const h01 = sampleHeight(samples, leftX, highZ);
    const h11 = sampleHeight(samples, rightX, highZ);
    if (h00 === undefined || h10 === undefined || h01 === undefined || h11 === undefined) {
      return undefined;
    }
    const tx = rightX === leftX ? 0 : (x - leftX) / (rightX - leftX);
    const tz = highZ === lowZ ? 0 : (z - lowZ) / (highZ - lowZ);
    const terrainHeight = lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
    const slope = slopeAt(samples, x, z);
    return { slope, terrainHeight };
  };
}

function uniqueSorted(values: readonly number[]): number[] {
  return [...values]
    .sort((left, right) => left - right)
    .filter((value, index, sorted) => index === 0 || Math.abs(value - (sorted[index - 1] ?? value)) > 0.0001);
}

function lowerGridValue(values: readonly number[], target: number): number | undefined {
  return [...values].reverse().find((value) => value <= target + 0.0001);
}

function upperGridValue(values: readonly number[], target: number): number | undefined {
  return values.find((value) => value >= target - 0.0001);
}

function sampleHeight(samples: ReadonlyArray<{ x: number; y: number; z: number }>, x: number, z: number): number | undefined {
  return samples.find((sample) => Math.abs(sample.x - x) <= 0.0001 && Math.abs(sample.z - z) <= 0.0001)?.y;
}

function slopeAt(samples: ReadonlyArray<{ normal?: [number, number, number]; x: number; z: number }>, x: number, z: number): number {
  const nearest = samples.reduce<{ distance: number; normal?: [number, number, number] } | undefined>((best, sample) => {
    const distance = Math.hypot(sample.x - x, sample.z - z);
    return best === undefined || distance < best.distance ? { distance, normal: sample.normal } : best;
  }, undefined);
  const normalY = Math.max(-1, Math.min(1, nearest?.normal?.[1] ?? 1));
  return (Math.acos(normalY) * 180) / Math.PI;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function estimateScatterCount(scatter: NonNullable<IEnvironmentDeclaration["scatter"]>[number]): number {
  const area = Math.abs((scatter.bounds.max[0] - scatter.bounds.min[0]) * (scatter.bounds.max[2] - scatter.bounds.min[2]));
  return Math.floor(area * (scatter.density ?? 0));
}

function assertScatterBudget(id: string, count: number): void {
  if (!Number.isFinite(count) || !Number.isInteger(count) || count < 0) {
    throw new Error(`Environment scatter '${id}' must resolve to a finite non-negative integer instance count.`);
  }
  if (count > MAX_SCATTER_INSTANCES) {
    throw new Error(
      `Environment scatter '${id}' resolves to ${count} instances, exceeding the maximum of ${MAX_SCATTER_INSTANCES}. Lower the count or density before emitting the bundle.`,
    );
  }
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
  if (extension !== "jpg" && extension !== "jpeg" && extension !== "png" && extension !== "webp") {
    throw new Error(`Environment preview '${previewImage}' must be a PNG, JPEG, or WebP image.`);
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
