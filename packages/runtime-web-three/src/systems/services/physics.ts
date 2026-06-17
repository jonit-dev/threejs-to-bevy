import type { IWorldIr } from "@threenative/ir";

export type IQueryShape = { halfExtents: [number, number, number]; kind: "box" } | { kind: "sphere"; radius: number };

export interface IPhysicsFilterRequest {
  ignore?: string[];
  layer?: string;
  layers?: string[];
  mask?: string[];
}

export interface IOverlapRequest extends IPhysicsFilterRequest {
  position: [number, number, number];
  shape: IQueryShape;
}

export interface IOverlapResult {
  entities: string[];
}

export interface IRaycastRequest {
  direction: [number, number, number];
  ignore?: string[];
  layer?: string;
  layers?: string[];
  mask?: string[];
  maxDistance: number;
  origin: [number, number, number];
}

export interface IShapeCastRequest extends IPhysicsFilterRequest {
  direction: [number, number, number];
  maxDistance: number;
  origin: [number, number, number];
  shape: IQueryShape;
}

export type IRaycastResult =
  | { hit: false }
  | {
      distance: number;
      entity: string;
      hit: true;
      normal: [number, number, number];
      point: [number, number, number];
    };

export type IShapeCastResult = IRaycastResult;

export function raycastPrimitive(world: IWorldIr, request: IRaycastRequest): IRaycastResult {
  const ignore = new Set(request.ignore ?? []);
  let best: IRaycastResult = { hit: false };
  for (const entity of world.entities) {
    if (ignore.has(entity.id)) {
      continue;
    }
    const transform = entity.components.Transform;
    const collider = entity.components.Collider;
    if (!isRecord(transform) || !isRecord(collider)) {
      continue;
    }
    if (!passesFilter(collider, request)) {
      continue;
    }
    const center = readVec3(transform.position, [0, 0, 0]);
    const size = readColliderSize(collider);
    const hit = intersectAabb(request, center, size);
    if (hit.hit && hit.distance > 0.000001 && (!best.hit || hit.distance < best.distance)) {
      best = { ...hit, entity: entity.id };
    }
  }
  return best;
}

export function overlapPrimitive(world: IWorldIr, request: IOverlapRequest): IOverlapResult {
  const ignore = new Set(request.ignore ?? []);
  const queryBounds = {
    center: request.position,
    halfExtents: queryHalfExtents(request.shape),
  };
  const entities = world.entities
    .filter((entity) => !ignore.has(entity.id))
    .filter((entity) => {
      const transform = entity.components.Transform;
      const collider = entity.components.Collider;
      if (!isRecord(transform) || !isRecord(collider) || !passesFilter(collider, request)) {
        return false;
      }
      return boundsOverlap(queryBounds, {
        center: readVec3(transform.position, [0, 0, 0]),
        halfExtents: readColliderHalfExtents(collider),
      });
    })
    .map((entity) => entity.id)
    .sort((left, right) => left.localeCompare(right));
  return { entities };
}

export function shapeCastPrimitive(world: IWorldIr, request: IShapeCastRequest): IShapeCastResult {
  const ignore = new Set(request.ignore ?? []);
  let best: IShapeCastResult = { hit: false };
  const queryExtents = queryHalfExtents(request.shape);
  for (const entity of world.entities) {
    if (ignore.has(entity.id)) {
      continue;
    }
    const transform = entity.components.Transform;
    const collider = entity.components.Collider;
    if (!isRecord(transform) || !isRecord(collider) || !passesFilter(collider, request)) {
      continue;
    }
    const center = readVec3(transform.position, [0, 0, 0]);
    const targetSize = readColliderSize(collider);
    const expandedSize: [number, number, number] = [
      targetSize[0] + queryExtents[0] * 2,
      targetSize[1] + queryExtents[1] * 2,
      targetSize[2] + queryExtents[2] * 2,
    ];
    const hit = intersectAabb({ direction: request.direction, maxDistance: request.maxDistance, origin: request.origin }, center, expandedSize);
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
    let axisNormal = normalForAxis(axis, direction > 0 ? -1 : 1);
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

function readColliderSize(collider: Record<string, unknown>): [number, number, number] {
  if (Array.isArray(collider.size)) {
    return readVec3(collider.size, [1, 1, 1]);
  }
  if (typeof collider.radius === "number") {
    const diameter = collider.radius * 2;
    return [diameter, typeof collider.height === "number" ? collider.height : diameter, diameter];
  }
  return [1, 1, 1];
}

function readColliderHalfExtents(collider: Record<string, unknown>): [number, number, number] {
  const size = readColliderSize(collider);
  return [size[0] / 2, size[1] / 2, size[2] / 2];
}

function queryHalfExtents(shape: IQueryShape): [number, number, number] {
  if (shape.kind === "sphere") {
    return [shape.radius, shape.radius, shape.radius];
  }
  return shape.halfExtents;
}

function boundsOverlap(
  left: { center: [number, number, number]; halfExtents: [number, number, number] },
  right: { center: [number, number, number]; halfExtents: [number, number, number] },
): boolean {
  return (
    Math.abs(left.center[0] - right.center[0]) <= left.halfExtents[0] + right.halfExtents[0] &&
    Math.abs(left.center[1] - right.center[1]) <= left.halfExtents[1] + right.halfExtents[1] &&
    Math.abs(left.center[2] - right.center[2]) <= left.halfExtents[2] + right.halfExtents[2]
  );
}

function passesFilter(collider: Record<string, unknown>, request: IPhysicsFilterRequest): boolean {
  const requestedMask = new Set([...(request.mask ?? []), ...(request.layers ?? [])]);
  const colliderLayer = typeof collider.layer === "string" ? collider.layer : undefined;
  if (requestedMask.size > 0 && (colliderLayer === undefined || !requestedMask.has(colliderLayer))) {
    return false;
  }
  if (request.layer !== undefined && Array.isArray(collider.mask)) {
    const colliderMask = new Set(collider.mask.filter((value): value is string => typeof value === "string"));
    if (!colliderMask.has(request.layer)) {
      return false;
    }
  }
  return true;
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
