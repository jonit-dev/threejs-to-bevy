import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IAssetsManifest, IEnvironmentTerrainIr, Vec3 } from "@threenative/ir";

import type { IInternalAsset } from "./asset-copy.js";

interface IHeightmapPayload {
  samples: readonly number[];
}

interface IEmittedTerrain {
  assets: IInternalAsset[];
  terrain: IEnvironmentTerrainIr;
}

export async function emitTerrainHeightmap(
  projectPath: string,
  terrain: IEnvironmentTerrainIr | undefined,
  assets: readonly IInternalAsset[],
): Promise<IEmittedTerrain | undefined> {
  if (terrain === undefined || terrain.heightMode !== "heightmap" || terrain.heightmap === undefined) {
    return terrain === undefined ? undefined : { assets: [], terrain };
  }
  const heightmapAsset = assets.find((asset): asset is Extract<IAssetsManifest["assets"][number], { kind: "heightmap" }> & IInternalAsset => asset.kind === "heightmap" && asset.id === terrain.heightmap?.asset);
  if (heightmapAsset === undefined) {
    throw new Error(`Terrain '${terrain.id}' references heightmap asset '${terrain.heightmap.asset}' that is not declared in bundle assets.`);
  }
  if (heightmapAsset.path === undefined) {
    throw new Error(`Terrain '${terrain.id}' heightmap asset '${heightmapAsset.id}' must be bundle-local for compiler terrain emission.`);
  }

  const payload = await readHeightmapPayload(projectPath, heightmapAsset);
  const decodedHeights = decodeHeights(payload.samples, heightmapAsset, terrain.heightmap.heightScale);
  const meshId = `mesh.${terrain.id}.chunk.0`;
  const origin = terrain.heightmap.origin ?? [terrain.bounds.min[0], 0, terrain.bounds.min[2]];
  const mesh = terrainMeshAsset(meshId, terrain, heightmapAsset, decodedHeights, origin);
  const heightRange = range(decodedHeights);

  return {
    assets: [mesh],
    terrain: {
      ...terrain,
      chunks: [
        {
          bounds: mesh.bounds as { max: Vec3; min: Vec3 },
          heightRange,
          id: `${terrain.id}.chunk.0`,
          mesh: meshId,
          sampleRange: { x: [0, heightmapAsset.width - 1], z: [0, heightmapAsset.height - 1] },
        },
      ],
      collider: {
        asset: heightmapAsset.id,
        cellSize: terrain.heightmap.cellSize,
        heightRange,
        heightScale: terrain.heightmap.heightScale,
        kind: "heightfield",
        mesh: meshId,
        origin,
        sampleCount: [heightmapAsset.width, heightmapAsset.height],
      },
    },
  };
}

async function readHeightmapPayload(
  projectPath: string,
  asset: Extract<IAssetsManifest["assets"][number], { kind: "heightmap" }> & IInternalAsset,
): Promise<IHeightmapPayload> {
  const sourcePath = asset.sourcePath ?? asset.path;
  if (typeof sourcePath !== "string") {
    throw new Error(`Heightmap asset '${asset.id}' must include a source path.`);
  }
  const document = JSON.parse(await readFile(resolve(projectPath, sourcePath), "utf8")) as { samples?: unknown; values?: unknown };
  const samples = Array.isArray(document.samples) ? document.samples : document.values;
  if (!Array.isArray(samples) || samples.length !== asset.width * asset.height || samples.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    throw new Error(`Heightmap asset '${asset.id}' must contain ${asset.width * asset.height} finite numeric samples.`);
  }
  return { samples: samples as number[] };
}

function decodeHeights(
  samples: readonly number[],
  asset: Extract<IAssetsManifest["assets"][number], { kind: "heightmap" }>,
  heightScale: number,
): number[] {
  const span = asset.heightRange.max - asset.heightRange.min;
  return samples.map((sample) => {
    const raw = asset.encoding === "u16-normalized"
      ? asset.heightRange.min + (sample / 65535) * span
      : sample;
    return raw * heightScale;
  });
}

function terrainMeshAsset(
  meshId: string,
  terrain: IEnvironmentTerrainIr,
  heightmap: Extract<IAssetsManifest["assets"][number], { kind: "heightmap" }>,
  heights: readonly number[],
  origin: Vec3,
): IInternalAsset {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const width = heightmap.width;
  const depth = heightmap.height;
  const cellSize = terrain.heightmap?.cellSize ?? 1;

  for (let z = 0; z < depth; z += 1) {
    for (let x = 0; x < width; x += 1) {
      const y = sampleHeight(heights, width, x, z);
      positions.push(origin[0] + x * cellSize, origin[1] + y, origin[2] + z * cellSize);
      normals.push(...normalAt(heights, width, depth, x, z, cellSize));
      uvs.push(width === 1 ? 0 : x / (width - 1), depth === 1 ? 0 : z / (depth - 1));
    }
  }

  for (let z = 0; z < depth - 1; z += 1) {
    for (let x = 0; x < width - 1; x += 1) {
      const topLeft = z * width + x;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + width;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }

  return {
    bounds: terrainBounds(positions),
    format: "generated",
    generation: { id: terrain.id, source: "MeshBuilder" },
    id: meshId,
    kind: "mesh",
    primitive: "custom",
    storage: "binary",
    topology: "triangle-list",
    usage: "static",
    attributes: [
      { itemSize: 3, name: "position", values: positions },
      { itemSize: 3, name: "normal", values: normals },
      { itemSize: 2, name: "uv", values: uvs },
    ],
    indices,
  };
}

function normalAt(heights: readonly number[], width: number, depth: number, x: number, z: number, cellSize: number): [number, number, number] {
  const left = sampleHeight(heights, width, Math.max(0, x - 1), z);
  const right = sampleHeight(heights, width, Math.min(width - 1, x + 1), z);
  const down = sampleHeight(heights, width, x, Math.max(0, z - 1));
  const up = sampleHeight(heights, width, x, Math.min(depth - 1, z + 1));
  return normalize([left - right, 2 * cellSize, down - up]);
}

function sampleHeight(heights: readonly number[], width: number, x: number, z: number): number {
  return heights[z * width + x] ?? 0;
}

function normalize(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  return length === 0 ? [0, 1, 0] : [value[0] / length, value[1] / length, value[2] / length];
}

function terrainBounds(positions: readonly number[]): { max: Vec3; min: Vec3 } {
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let index = 0; index < positions.length; index += 3) {
    min[0] = Math.min(min[0], positions[index] ?? 0);
    min[1] = Math.min(min[1], positions[index + 1] ?? 0);
    min[2] = Math.min(min[2], positions[index + 2] ?? 0);
    max[0] = Math.max(max[0], positions[index] ?? 0);
    max[1] = Math.max(max[1], positions[index + 1] ?? 0);
    max[2] = Math.max(max[2], positions[index + 2] ?? 0);
  }
  return { max, min };
}

function range(values: readonly number[]): { max: number; min: number } {
  return {
    max: Math.max(...values),
    min: Math.min(...values),
  };
}
