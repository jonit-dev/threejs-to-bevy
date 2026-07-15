import { SdkError } from "../errors.js";
import { computeBounds, recalculateSmoothNormals, type IMeshBuilderPart } from "./meshBuilderParts.js";

/** Deterministic vertex-clustering decimation for compile-time LOD data. */
export function decimateMeshPart(part: IMeshBuilderPart, targetRatio: number): IMeshBuilderPart {
  if (!Number.isFinite(targetRatio) || targetRatio <= 0 || targetRatio >= 1) {
    throw new SdkError("TN_SDK_MESH_BUILDER_LOD_RATIO_INVALID", "MeshBuilder LOD target ratio must be greater than 0 and less than 1.");
  }
  const sourceTriangles = part.indices.length / 3;
  if (sourceTriangles <= 1) {
    return clonePart(part);
  }
  let best: IMeshBuilderPart | undefined;
  let bestDelta = Infinity;
  const maximumResolution = Math.min(64, Math.max(2, Math.ceil(Math.cbrt(part.positions.length / 3) * 4)));
  for (let resolution = 2; resolution <= maximumResolution; resolution += 1) {
    const candidate = clusterAtResolution(part, resolution);
    const ratio = candidate.indices.length / part.indices.length;
    if (candidate.indices.length === 0 || ratio >= 1) {
      continue;
    }
    const delta = Math.abs(ratio - targetRatio);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  if (best === undefined) {
    throw new SdkError("TN_SDK_MESH_BUILDER_LOD_DECIMATION_FAILED", "MeshBuilder could not produce a non-empty reduced LOD level.");
  }
  return best;
}

function clusterAtResolution(part: IMeshBuilderPart, resolution: number): IMeshBuilderPart {
  const bounds = computeBounds(part.positions);
  const extents = bounds.max.map((value, axis) => value - (bounds.min[axis] ?? 0));
  const scale = Math.max(...extents);
  const minimumAreaSquared = scale ** 4 * 1e-20;
  const clusters = new Map<string, ICluster>();
  const vertexClusters: ICluster[] = [];
  const vertexCount = part.positions.length / 3;
  for (let vertex = 0; vertex < vertexCount; vertex += 1) {
    const cell = [0, 1, 2].map((axis) => {
      const extent = extents[axis] ?? 0;
      if (extent === 0) {
        return 0;
      }
      const normalized = ((part.positions[vertex * 3 + axis] ?? 0) - (bounds.min[axis] ?? 0)) / extent;
      return Math.min(resolution - 1, Math.floor(normalized * resolution));
    });
    const key = `${cell[0]}:${cell[1]}:${cell[2]}`;
    let cluster = clusters.get(key);
    if (cluster === undefined) {
      cluster = { color: [0, 0, 0, 0], count: 0, index: clusters.size, position: [0, 0, 0], uv: [0, 0] };
      clusters.set(key, cluster);
    }
    cluster.count += 1;
    for (let component = 0; component < 3; component += 1) {
      cluster.position[component] = (cluster.position[component] ?? 0) + (part.positions[vertex * 3 + component] ?? 0);
    }
    for (let component = 0; component < 2; component += 1) {
      cluster.uv[component] = (cluster.uv[component] ?? 0) + (part.uvs[vertex * 2 + component] ?? 0);
    }
    for (let component = 0; component < 4; component += 1) {
      cluster.color[component] = (cluster.color[component] ?? 0) + (part.colors[vertex * 4 + component] ?? 1);
    }
    vertexClusters[vertex] = cluster;
  }

  const ordered = [...clusters.values()];
  const positions: number[] = [];
  const uvs: number[] = [];
  const colors: number[] = [];
  for (const cluster of ordered) {
    positions.push(...cluster.position.map((value) => value / cluster.count));
    uvs.push(...cluster.uv.map((value) => value / cluster.count));
    colors.push(...cluster.color.map((value) => value / cluster.count));
  }
  const indices: number[] = [];
  const seen = new Set<string>();
  for (let index = 0; index < part.indices.length; index += 3) {
    const triangle = [
      vertexClusters[part.indices[index] ?? 0]!.index,
      vertexClusters[part.indices[index + 1] ?? 0]!.index,
      vertexClusters[part.indices[index + 2] ?? 0]!.index,
    ] as const;
    if (new Set(triangle).size < 3 || meshTriangleAreaSquared(positions, triangle) <= minimumAreaSquared) {
      continue;
    }
    const canonical = [...triangle].sort((left, right) => left - right).join(":");
    if (seen.has(canonical)) {
      continue;
    }
    seen.add(canonical);
    indices.push(...triangle);
  }
  return recalculateSmoothNormals({
    colors,
    indices,
    normals: Array.from({ length: positions.length }, () => 0),
    positions,
    uvs,
  });
}

interface ICluster {
  color: [number, number, number, number];
  count: number;
  index: number;
  position: [number, number, number];
  uv: [number, number];
}

export function meshTriangleAreaSquared(positions: readonly number[], triangle: readonly number[]): number {
  const [a, b, c] = triangle;
  const ab = [
    (positions[(b ?? 0) * 3] ?? 0) - (positions[(a ?? 0) * 3] ?? 0),
    (positions[(b ?? 0) * 3 + 1] ?? 0) - (positions[(a ?? 0) * 3 + 1] ?? 0),
    (positions[(b ?? 0) * 3 + 2] ?? 0) - (positions[(a ?? 0) * 3 + 2] ?? 0),
  ];
  const ac = [
    (positions[(c ?? 0) * 3] ?? 0) - (positions[(a ?? 0) * 3] ?? 0),
    (positions[(c ?? 0) * 3 + 1] ?? 0) - (positions[(a ?? 0) * 3 + 1] ?? 0),
    (positions[(c ?? 0) * 3 + 2] ?? 0) - (positions[(a ?? 0) * 3 + 2] ?? 0),
  ];
  const cross = [
    (ab[1] ?? 0) * (ac[2] ?? 0) - (ab[2] ?? 0) * (ac[1] ?? 0),
    (ab[2] ?? 0) * (ac[0] ?? 0) - (ab[0] ?? 0) * (ac[2] ?? 0),
    (ab[0] ?? 0) * (ac[1] ?? 0) - (ab[1] ?? 0) * (ac[0] ?? 0),
  ];
  return cross.reduce((total, value) => total + value * value, 0);
}

function clonePart(part: IMeshBuilderPart): IMeshBuilderPart {
  return {
    colors: [...part.colors],
    indices: [...part.indices],
    normals: [...part.normals],
    positions: [...part.positions],
    uvs: [...part.uvs],
  };
}
