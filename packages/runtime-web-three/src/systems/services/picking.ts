import type { IAssetsManifest, IWorldIr } from "@threenative/ir";
import { meshAabb } from "../../meshBounds.js";
import { type IRaycastRequest, type IRaycastResult } from "./physics.js";

export type IPickMeshRequest = IRaycastRequest;
export type IPickMeshResult = IRaycastResult;

export function pickMesh(world: IWorldIr, assets: IAssetsManifest | undefined, request: IPickMeshRequest): IPickMeshResult {
  const ignore = new Set(request.ignore ?? []);
  const meshes = new Map((assets?.assets ?? []).filter((asset) => asset.kind === "mesh").map((asset) => [asset.id, asset]));
  let best: IPickMeshResult = { hit: false };
  for (const entity of world.entities) {
    if (ignore.has(entity.id)) {
      continue;
    }
    const transform = entity.components.Transform;
    const renderer = entity.components.MeshRenderer;
    if (!isRecord(transform) || !isRecord(renderer) || renderer.visible === false || typeof renderer.mesh !== "string") {
      continue;
    }
    const asset = meshes.get(renderer.mesh);
    if (asset === undefined) {
      continue;
    }
    const bounds = meshAabb(asset);
    if (bounds === undefined) {
      continue;
    }
    const center = readVec3(transform.position, [0, 0, 0]);
    const scale = readVec3(transform.scale, [1, 1, 1]);
    const localCenter: [number, number, number] = [
      (bounds.min[0] + bounds.max[0]) / 2,
      (bounds.min[1] + bounds.max[1]) / 2,
      (bounds.min[2] + bounds.max[2]) / 2,
    ];
    const size: [number, number, number] = [
      Math.abs((bounds.max[0] - bounds.min[0]) * scale[0]),
      Math.abs((bounds.max[1] - bounds.min[1]) * scale[1]),
      Math.abs((bounds.max[2] - bounds.min[2]) * scale[2]),
    ];
    const hit = intersectAabb(request, [
      center[0] + localCenter[0] * scale[0],
      center[1] + localCenter[1] * scale[1],
      center[2] + localCenter[2] * scale[2],
    ], size);
    if (hit.hit && (!best.hit || hit.distance < best.distance || (hit.distance === best.distance && entity.id.localeCompare(best.entity) < 0))) {
      best = { ...hit, entity: entity.id };
    }
  }
  return best;
}

function intersectAabb(
  request: Pick<IRaycastRequest, "direction" | "maxDistance" | "origin">,
  center: [number, number, number],
  size: [number, number, number],
): Omit<Extract<IRaycastResult, { hit: true }>, "entity"> | { hit: false } {
  const half = size.map((value) => value / 2) as [number, number, number];
  const min: [number, number, number] = [center[0] - half[0], center[1] - half[1], center[2] - half[2]];
  const max: [number, number, number] = [center[0] + half[0], center[1] + half[1], center[2] + half[2]];
  let tMin = 0;
  let tMax = request.maxDistance;
  let normal: [number, number, number] = [0, 0, 0];

  for (let axis = 0; axis < 3; axis += 1) {
    const origin = tupleAt(request.origin, axis);
    const direction = tupleAt(request.direction, axis);
    const axisMin = tupleAt(min, axis);
    const axisMax = tupleAt(max, axis);
    if (Math.abs(direction) < 0.000001) {
      if (origin < axisMin || origin > axisMax) {
        return { hit: false };
      }
      continue;
    }

    const inv = 1 / direction;
    let near = (axisMin - origin) * inv;
    let far = (axisMax - origin) * inv;
    const axisNormal = normalForAxis(axis, direction > 0 ? -1 : 1);
    if (near > far) {
      [near, far] = [far, near];
    }
    if (near > tMin) {
      tMin = near;
      normal = axisNormal;
    }
    tMax = Math.min(tMax, far);
    if (tMin > tMax) {
      return { hit: false };
    }
  }

  const distance = Number(tMin.toFixed(6));
  return {
    distance,
    hit: true,
    normal,
    point: [
      Number((request.origin[0] + request.direction[0] * distance).toFixed(6)),
      Number((request.origin[1] + request.direction[1] * distance).toFixed(6)),
      Number((request.origin[2] + request.direction[2] * distance).toFixed(6)),
    ],
  };
}

function readVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return [numberAt(value, 0, fallback[0]), numberAt(value, 1, fallback[1]), numberAt(value, 2, fallback[2])];
}

function numberAt(values: unknown[], index: number, fallback: number): number {
  const value = values[index];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function tupleAt(values: [number, number, number], index: number): number {
  return index === 0 ? values[0] : index === 1 ? values[1] : values[2];
}

function normalForAxis(axis: number, sign: number): [number, number, number] {
  return axis === 0 ? [sign, 0, 0] : axis === 1 ? [0, sign, 0] : [0, 0, sign];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
