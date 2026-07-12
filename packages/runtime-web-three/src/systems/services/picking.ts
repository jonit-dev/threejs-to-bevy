import type { IAssetsManifest, IWorldIr } from "@threenative/ir";
import * as THREE from "three";
import { meshAabb } from "../../meshBounds.js";
import { type IRaycastRequest, type IRaycastResult } from "./physics.js";

export type IPickMeshRequest = IRaycastRequest;
export type IPickMeshResult = IRaycastResult;

export interface IPointerRayRequest {
  aspect?: number;
  camera?: string;
  maxDistance?: number;
  pointer: [number, number];
}

export type IPointerRayResult =
  | { hit: false }
  | {
      direction: [number, number, number];
      hit: true;
      maxDistance: number;
      origin: [number, number, number];
    };

const IDENTITY_QUAT: [number, number, number, number] = [0, 0, 0, 1];

export function pickMesh(
  world: IWorldIr,
  assets: IAssetsManifest | undefined,
  request: IPickMeshRequest,
  objectsById?: ReadonlyMap<string, THREE.Object3D>,
): IPickMeshResult {
  if (objectsById !== undefined) {
    return pickMappedMesh(objectsById, request);
  }
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

function pickMappedMesh(objectsById: ReadonlyMap<string, THREE.Object3D>, request: IPickMeshRequest): IPickMeshResult {
  const ignore = new Set(request.ignore ?? []);
  const roots = [...objectsById.entries()]
    .filter(([entityId, object]) => !ignore.has(entityId) && object.visible)
    .map(([, object]) => object);
  const raycaster = new THREE.Raycaster(
    new THREE.Vector3(...request.origin),
    new THREE.Vector3(...request.direction).normalize(),
    0,
    request.maxDistance,
  );
  for (const hit of raycaster.intersectObjects(roots, true)) {
    const entity = owningEntityId(hit.object);
    if (entity === undefined || ignore.has(entity)) {
      continue;
    }
    return {
      distance: Number(hit.distance.toFixed(6)),
      entity,
      hit: true,
      normal: hit.face == null
        ? [0, 0, 0]
        : hit.face.normal.clone().transformDirection(hit.object.matrixWorld).toArray() as [number, number, number],
      point: hit.point.toArray().map((value) => Number(value.toFixed(6))) as [number, number, number],
    };
  }
  return { hit: false };
}

function owningEntityId(object: THREE.Object3D): string | undefined {
  let current: THREE.Object3D | null = object;
  while (current !== null) {
    if (typeof current.userData.entityId === "string") {
      return current.userData.entityId;
    }
    current = current.parent;
  }
  return undefined;
}

export function pointerRay(world: IWorldIr, request: IPointerRayRequest): IPointerRayResult {
  const cameraEntity = findCamera(world, request.camera);
  if (cameraEntity === undefined) {
    return { hit: false };
  }
  const camera = cameraEntity.components.Camera;
  const transform = cameraEntity.components.Transform;
  if (camera === undefined) {
    return { hit: false };
  }
  const origin = readVec3(transform?.position, [0, 0, 0]);
  const rotation = readQuat(transform?.rotation, IDENTITY_QUAT);
  const aspect = positiveNumber(request.aspect, 1);
  const maxDistance = positiveNumber(request.maxDistance, camera.far);
  const ndcX = clamp(request.pointer[0], 0, 1) * 2 - 1;
  const ndcY = 1 - clamp(request.pointer[1], 0, 1) * 2;

  if (camera.kind === "orthographic") {
    const size = positiveNumber(camera.size, 1);
    const offset = rotateVec3([ndcX * size * aspect * 0.5, ndcY * size * 0.5, 0], rotation);
    return {
      direction: roundVec3(normalizeVec3(rotateVec3([0, 0, -1], rotation))),
      hit: true,
      maxDistance,
      origin: roundVec3([origin[0] + offset[0], origin[1] + offset[1], origin[2] + offset[2]]),
    };
  }

  const fovY = positiveNumber(camera.fovY, 60) * Math.PI / 180;
  const tanHalfFovY = Math.tan(fovY / 2);
  const localDirection: [number, number, number] = [ndcX * tanHalfFovY * aspect, ndcY * tanHalfFovY, -1];
  return {
    direction: roundVec3(normalizeVec3(rotateVec3(localDirection, rotation))),
    hit: true,
    maxDistance,
    origin: roundVec3(origin),
  };
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

function findCamera(world: IWorldIr, cameraId: string | undefined): IWorldIr["entities"][number] | undefined {
  const activeCamera = typeof world.resources?.ActiveCamera === "object" && world.resources.ActiveCamera !== null && "entity" in world.resources.ActiveCamera
    ? String((world.resources.ActiveCamera as { entity?: unknown }).entity ?? "")
    : undefined;
  const selected = cameraId ?? activeCamera;
  if (selected !== undefined && selected !== "") {
    return world.entities.find((entity) => entity.id === selected && entity.components.Camera !== undefined)
      ?? world.entities.find((entity) => entity.components.Camera !== undefined);
  }
  return world.entities.find((entity) => entity.components.Camera !== undefined);
}

function readVec3(value: unknown, fallback: [number, number, number]): [number, number, number] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return [numberAt(value, 0, fallback[0]), numberAt(value, 1, fallback[1]), numberAt(value, 2, fallback[2])];
}

function readQuat(value: unknown, fallback: [number, number, number, number]): [number, number, number, number] {
  if (!Array.isArray(value)) {
    return fallback;
  }
  return [numberAt(value, 0, fallback[0]), numberAt(value, 1, fallback[1]), numberAt(value, 2, fallback[2]), numberAt(value, 3, fallback[3])];
}

function positiveNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeVec3(value: [number, number, number]): [number, number, number] {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 0.000001) {
    return [0, 0, -1];
  }
  return [value[0] / length, value[1] / length, value[2] / length];
}

function rotateVec3(value: [number, number, number], quaternion: [number, number, number, number]): [number, number, number] {
  const [x, y, z] = value;
  const [qx, qy, qz, qw] = quaternion;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

function roundVec3(value: [number, number, number]): [number, number, number] {
  return [Number(value[0].toFixed(6)), Number(value[1].toFixed(6)), Number(value[2].toFixed(6))];
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
