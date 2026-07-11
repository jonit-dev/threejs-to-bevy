import { createHash } from "node:crypto";
import type { IAssetsManifest, IBakedProbePayloadIr, IEnvironmentSceneIr, IMaterialsIr, IWorldIr, Vec3 } from "@threenative/ir";
import type { ISceneRayQuery, SceneRayVec3 } from "./sceneRayQuery.js";

export interface IProbeBakeInput {
  albedoByEntity: ReadonlyMap<string, readonly [number, number, number]>;
  assets: IAssetsManifest;
  environment: IEnvironmentSceneIr;
  materials: IMaterialsIr;
  maxDistance?: number;
  query: ISceneRayQuery;
  rayCount?: number;
  seed?: number;
  world: IWorldIr;
}

export interface IBakedProbeResult {
  id: string;
  source: IBakedProbePayloadIr;
}

export interface IProbeBakeReport {
  hitCount: number;
  probes: IBakedProbeResult[];
  rayCount: number;
  sceneContentHash: string;
  seed: number;
}

export function bakeGiProbes(input: IProbeBakeInput): IProbeBakeReport {
  const probes = input.environment.lightProbes ?? [];
  const raysPerProbe = clampInteger(input.rayCount ?? 96, 8, 4096);
  const seed = toUint32(input.seed ?? 1337);
  const maxDistance = Math.max(0.01, input.maxDistance ?? 100);
  const sceneContentHash = computeProbeSceneContentHash(input.world, input.materials, input.environment, input.assets);
  const sky = colorToLinearRgb(input.environment.atmosphere?.sky.color ?? "#20242a");
  const ambientIntensity = Math.max(0, input.environment.atmosphere?.ambient?.intensity ?? 0.2);
  const skyRadiance = scaleRgb(sky, Math.max(0.05, ambientIntensity));
  const sun = input.environment.atmosphere?.sun;
  const directionToSun = sun === undefined ? undefined : normalize(scaleVec(sun.direction, -1));
  const sunRadiance = sun === undefined ? [0, 0, 0] as const : scaleRgb(colorToLinearRgb(sun.color), Math.max(0, sun.intensity) * 0.12);
  let hitCount = 0;

  const baked = probes.map((probe, probeIndex): IBakedProbeResult => {
    const origin = boundsCenter(probe.bounds);
    const coefficients = Array<number>(27).fill(0);
    for (let rayIndex = 0; rayIndex < raysPerProbe; rayIndex++) {
      const direction = seededCosineSphereDirection(rayIndex, raysPerProbe, seed + probeIndex * 0x9e3779b9);
      const hit = input.query.raycast(origin, direction, maxDistance);
      let radiance: readonly [number, number, number];
      if (hit === null) {
        const sunWeight = directionToSun === undefined ? 0 : Math.pow(Math.max(0, dot(direction, directionToSun)), 256);
        radiance = addRgb(skyRadiance, scaleRgb(sunRadiance, sunWeight));
      } else {
        hitCount += 1;
        const albedo = input.albedoByEntity.get(hit.entityId) ?? [0.8, 0.8, 0.8];
        const bounce = multiplyRgb(albedo, scaleRgb(skyRadiance, 0.75));
        const normalSun = directionToSun === undefined ? 0 : Math.max(0, dot(hit.normal, directionToSun));
        const shadowOrigin = addVec(hit.point, scaleVec(hit.normal, 0.002));
        const sunVisible = directionToSun !== undefined && normalSun > 0 && !input.query.occluded(shadowOrigin, addVec(shadowOrigin, scaleVec(directionToSun, maxDistance)));
        radiance = addRgb(bounce, sunVisible ? multiplyRgb(albedo, scaleRgb(sunRadiance, normalSun)) : [0, 0, 0]);
      }
      const basis = sh2Basis(direction);
      for (let basisIndex = 0; basisIndex < 9; basisIndex++) {
        const projectionWeight = basis[basisIndex]! * (4 * Math.PI / raysPerProbe);
        coefficients[basisIndex * 3] = (coefficients[basisIndex * 3] ?? 0) + radiance[0] * projectionWeight;
        coefficients[basisIndex * 3 + 1] = (coefficients[basisIndex * 3 + 1] ?? 0) + radiance[1] * projectionWeight;
        coefficients[basisIndex * 3 + 2] = (coefficients[basisIndex * 3 + 2] ?? 0) + radiance[2] * projectionWeight;
      }
    }
    return {
      id: probe.id,
      source: {
        bakeVersion: 1,
        coefficients: coefficients.map(roundCoefficient),
        format: "sh2",
        sceneContentHash,
      },
    };
  }).sort((left, right) => left.id.localeCompare(right.id));

  return { hitCount, probes: baked, rayCount: raysPerProbe * probes.length, sceneContentHash, seed };
}

export function computeProbeSceneContentHash(world: IWorldIr, materials: IMaterialsIr, environment: IEnvironmentSceneIr, assets: IAssetsManifest): string {
  const environmentForHash = {
    ...environment,
    lightProbes: (environment.lightProbes ?? []).map((probe) => ({
      bounds: probe.bounds,
      id: probe.id,
      influenceRadius: probe.influenceRadius,
      intent: probe.intent,
    })).sort((left, right) => left.id.localeCompare(right.id)),
  };
  const canonical = stableJson({
    assets: {
      assets: assets.assets.filter((asset) => asset.kind === "mesh").sort((left, right) => left.id.localeCompare(right.id)),
      schema: assets.schema,
      version: assets.version,
    },
    environment: environmentForHash,
    materials: { ...materials, materials: [...materials.materials].sort((left, right) => left.id.localeCompare(right.id)) },
    world: { ...world, entities: [...world.entities].sort((left, right) => left.id.localeCompare(right.id)) },
  });
  return `sha256:${createHash("sha256").update(canonical).digest("hex")}`;
}

function seededCosineSphereDirection(index: number, count: number, seed: number): [number, number, number] {
  const normals = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  const normal = normals[(index + seed) % normals.length]!;
  const sequenceIndex = Math.floor(index / normals.length);
  const sequenceCount = Math.ceil(count / normals.length);
  const jitter = random01(seed ^ (sequenceIndex * 0x85ebca6b));
  const u = (sequenceIndex + jitter) / Math.max(1, sequenceCount);
  const v = radicalInverse(sequenceIndex ^ seed);
  const radius = Math.sqrt(Math.min(1, u));
  const local: [number, number, number] = [Math.cos(2 * Math.PI * v) * radius, Math.sin(2 * Math.PI * v) * radius, Math.sqrt(Math.max(0, 1 - u))];
  return orientHemisphere(local, normal);
}

function orientHemisphere(local: SceneRayVec3, normal: SceneRayVec3): [number, number, number] {
  const up: [number, number, number] = Math.abs(normal[2]) < 0.999 ? [0, 0, 1] : [0, 1, 0];
  const tangent = normalize(cross(up, normal));
  const bitangent = cross(normal, tangent);
  return normalize(addVec(addVec(scaleVec(tangent, local[0]), scaleVec(bitangent, local[1])), scaleVec(normal, local[2])));
}

function sh2Basis(direction: SceneRayVec3): [number, number, number, number, number, number, number, number, number] {
  const [x, y, z] = direction;
  return [
    0.2820947918,
    0.4886025119 * y,
    0.4886025119 * z,
    0.4886025119 * x,
    1.0925484306 * x * y,
    1.0925484306 * y * z,
    0.3153915653 * (3 * z * z - 1),
    1.0925484306 * x * z,
    0.5462742153 * (x * x - y * y),
  ];
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((entry) => entry === undefined ? "null" : stableJson(entry)).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).filter((key) => record[key] !== undefined).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function colorToLinearRgb(value: string | readonly number[]): [number, number, number] {
  if (typeof value !== "string") return [linearChannel(value[0] ?? 0), linearChannel(value[1] ?? 0), linearChannel(value[2] ?? 0)];
  const hex = value.startsWith("#") ? value.slice(1) : value;
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return [0, 2, 4].map((offset) => linearChannel(Number.parseInt(hex.slice(offset, offset + 2), 16) / 255)) as [number, number, number];
  return [0.5, 0.5, 0.5];
}

function linearChannel(value: number): number { return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4); }
function roundCoefficient(value: number): number { return Math.round(value * 1e8) / 1e8; }
function clampInteger(value: number, min: number, max: number): number { return Math.max(min, Math.min(max, Math.floor(value))); }
function toUint32(value: number): number { return value >>> 0; }
function random01(value: number): number { let x = toUint32(value || 1); x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 0x1_0000_0000; }
function radicalInverse(value: number): number { let bits = toUint32(value); bits = ((bits << 16) | (bits >>> 16)) >>> 0; bits = (((bits & 0x55555555) << 1) | ((bits & 0xaaaaaaaa) >>> 1)) >>> 0; bits = (((bits & 0x33333333) << 2) | ((bits & 0xcccccccc) >>> 2)) >>> 0; bits = (((bits & 0x0f0f0f0f) << 4) | ((bits & 0xf0f0f0f0) >>> 4)) >>> 0; bits = (((bits & 0x00ff00ff) << 8) | ((bits & 0xff00ff00) >>> 8)) >>> 0; return bits * 2.3283064365386963e-10; }
function boundsCenter(bounds: { min: Vec3; max: Vec3 }): [number, number, number] { return [(bounds.min[0] + bounds.max[0]) * 0.5, (bounds.min[1] + bounds.max[1]) * 0.5, (bounds.min[2] + bounds.max[2]) * 0.5]; }
function normalize(value: SceneRayVec3): [number, number, number] { const length = Math.hypot(value[0], value[1], value[2]); return length <= 1e-12 ? [0, 0, 1] : [value[0] / length, value[1] / length, value[2] / length]; }
function dot(left: SceneRayVec3, right: SceneRayVec3): number { return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]; }
function cross(left: SceneRayVec3, right: SceneRayVec3): [number, number, number] { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }
function addVec(left: SceneRayVec3, right: SceneRayVec3): [number, number, number] { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function scaleVec(value: SceneRayVec3, scale: number): [number, number, number] { return [value[0] * scale, value[1] * scale, value[2] * scale]; }
function addRgb(left: readonly [number, number, number], right: readonly [number, number, number]): [number, number, number] { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function scaleRgb(value: readonly [number, number, number], scale: number): [number, number, number] { return [value[0] * scale, value[1] * scale, value[2] * scale]; }
function multiplyRgb(left: readonly [number, number, number], right: readonly [number, number, number]): [number, number, number] { return [left[0] * right[0], left[1] * right[1], left[2] * right[2]]; }
