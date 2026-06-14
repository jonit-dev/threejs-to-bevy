import type { IAssetIr } from "@threenative/ir";

export type Vec3Tuple = readonly [number, number, number];

export interface IAabb {
  max: Vec3Tuple;
  min: Vec3Tuple;
}

export interface IBoundingSphere {
  center: Vec3Tuple;
  radius: number;
}

export function sampleMeshPoints(asset: IAssetIr, options: { maxSamples?: number } = {}): Vec3Tuple[] {
  if (asset.kind !== "mesh") {
    return [];
  }
  const samples = asset.primitive === "custom" ? sampleCustomMeshPoints(asset) : samplePrimitiveMeshPoints(asset);
  const maxSamples = options.maxSamples ?? samples.length;
  return samples.slice(0, Math.max(0, maxSamples));
}

export function meshAabb(asset: IAssetIr): IAabb | undefined {
  const samples = sampleMeshPoints(asset);
  if (samples.length === 0) {
    return undefined;
  }
  const first = samples[0] as Vec3Tuple;
  const min: [number, number, number] = [first[0], first[1], first[2]];
  const max: [number, number, number] = [first[0], first[1], first[2]];
  for (const sample of samples.slice(1)) {
    min[0] = Math.min(min[0], sample[0]);
    min[1] = Math.min(min[1], sample[1]);
    min[2] = Math.min(min[2], sample[2]);
    max[0] = Math.max(max[0], sample[0]);
    max[1] = Math.max(max[1], sample[1]);
    max[2] = Math.max(max[2], sample[2]);
  }
  return { max, min };
}

export function meshBoundingSphere(asset: IAssetIr): IBoundingSphere | undefined {
  const bounds = meshAabb(asset);
  if (bounds === undefined) {
    return undefined;
  }
  const center: [number, number, number] = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
  const radius = Math.max(...sampleMeshPoints(asset).map((point) => distance(point, center)));
  return { center, radius };
}

export function aabbIntersectsAabb(left: IAabb, right: IAabb): boolean {
  return left.min[0] <= right.max[0] && left.max[0] >= right.min[0] && left.min[1] <= right.max[1] && left.max[1] >= right.min[1] && left.min[2] <= right.max[2] && left.max[2] >= right.min[2];
}

export function sphereIntersectsSphere(left: IBoundingSphere, right: IBoundingSphere): boolean {
  return distance(left.center, right.center) <= left.radius + right.radius;
}

function sampleCustomMeshPoints(asset: Extract<IAssetIr, { kind: "mesh" }>): Vec3Tuple[] {
  const position = asset.attributes?.find((attribute) => attribute.name === "position" && attribute.itemSize === 3);
  if (position === undefined) {
    return [];
  }
  const samples: Vec3Tuple[] = [];
  for (let index = 0; index < position.values.length; index += 3) {
    samples.push([position.values[index] ?? 0, position.values[index + 1] ?? 0, position.values[index + 2] ?? 0]);
  }
  return samples;
}

function samplePrimitiveMeshPoints(asset: Extract<IAssetIr, { kind: "mesh" }>): Vec3Tuple[] {
  const size = asset.size ?? [];
  if (asset.primitive === "box" || asset.primitive === "extrudedRectangle") {
    const halfX = (size[0] ?? 1) / 2;
    const halfY = (size[1] ?? 1) / 2;
    const halfZ = (size[2] ?? 1) / 2;
    return [
      [-halfX, -halfY, -halfZ],
      [halfX, halfY, halfZ],
    ];
  }
  if (asset.primitive === "plane") {
    const halfX = (size[0] ?? 1) / 2;
    const halfY = (size[1] ?? 1) / 2;
    return [
      [-halfX, -halfY, 0],
      [halfX, halfY, 0],
    ];
  }
  const radius = primitiveRadius(asset);
  const halfHeight = primitiveHalfHeight(asset);
  return [
    [-radius, -halfHeight, -radius],
    [radius, halfHeight, radius],
  ];
}

function primitiveRadius(asset: Extract<IAssetIr, { kind: "mesh" }>): number {
  if (asset.primitive === "torus" || asset.primitive === "annulus") {
    return asset.size?.[1] ?? 1;
  }
  if (asset.primitive === "conicalFrustum") {
    return Math.max(asset.size?.[0] ?? 0.25, asset.size?.[1] ?? 0.5);
  }
  if (asset.primitive === "regularPolygon" || asset.primitive === "circle" || asset.primitive === "sphere") {
    return asset.size?.[0] ?? 0.5;
  }
  return asset.size?.[0] ?? 0.5;
}

function primitiveHalfHeight(asset: Extract<IAssetIr, { kind: "mesh" }>): number {
  if (asset.primitive === "sphere" || asset.primitive === "torus") {
    return primitiveRadius(asset);
  }
  if (asset.primitive === "annulus" || asset.primitive === "circle" || asset.primitive === "regularPolygon") {
    return 0;
  }
  return (asset.size?.[1] ?? 1) / 2;
}

function distance(left: Vec3Tuple, right: Vec3Tuple): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}
