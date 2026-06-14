import type { IColliderComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

export interface ICharacterTraceInput {
  axes?: Readonly<Record<string, number>>;
  fixedDelta?: number;
}

export interface ICharacterTraceObservation {
  blockedBy?: string;
  desired: Vec3;
  entity: string;
  grounded: boolean;
  resolved: Vec3;
  start: Vec3;
}

interface IBounds {
  center: Vec3;
  halfExtents: Vec3;
  id: string;
}

export function traceCharacterControllers(world: IWorldIr, input: ICharacterTraceInput = {}): ICharacterTraceObservation[] {
  const fixedDelta = input.fixedDelta ?? 1;
  const axes = input.axes ?? {};
  const blockers = world.entities
    .filter((entity) => entity.components.Collider !== undefined && entity.components.Collider.trigger !== true)
    .sort((left, right) => left.id.localeCompare(right.id));

  return world.entities
    .filter((entity) => entity.components.CharacterController !== undefined)
    .map((entity) => traceCharacter(entity, blockers, axes, fixedDelta))
    .sort((left, right) => left.entity.localeCompare(right.entity));
}

function traceCharacter(
  entity: IWorldEntity,
  blockers: readonly IWorldEntity[],
  axes: Readonly<Record<string, number>>,
  fixedDelta: number,
): ICharacterTraceObservation {
  const controller = entity.components.CharacterController;
  const collider = entity.components.Collider;
  const start = vector(entity.components.Transform?.position);
  if (controller === undefined || collider === undefined) {
    return { desired: start, entity: entity.id, grounded: false, resolved: start, start };
  }

  const desired = add(start, movementDelta(
    axes[controller.moveXAxis] ?? 0,
    axes[controller.moveZAxis] ?? 0,
    controller.speed,
    fixedDelta,
  ));
  const characterHalfExtents = halfExtents(collider);
  const blockedBy = controller.blocking === true
    ? firstBlocker(entity.id, desired, characterHalfExtents, blockers)
    : undefined;
  const ungrounded = blockedBy === undefined ? desired : start;
  const grounded = controller.grounding === "raycast";
  const resolved = grounded ? groundPosition(entity.id, ungrounded, characterHalfExtents, blockers) : ungrounded;

  return {
    ...(blockedBy === undefined ? {} : { blockedBy }),
    desired,
    entity: entity.id,
    grounded,
    resolved,
    start,
  };
}

function movementDelta(axisX: number, axisZ: number, speed: number, fixedDelta: number): Vec3 {
  const length = Math.hypot(axisX, axisZ);
  if (length === 0) {
    return [0, 0, 0];
  }
  const scale = speed * fixedDelta / Math.max(1, length);
  return [axisX * scale, 0, axisZ * scale];
}

function firstBlocker(
  characterId: string,
  desired: Vec3,
  characterHalfExtents: Vec3,
  blockers: readonly IWorldEntity[],
): string | undefined {
  const characterBounds = { center: desired, halfExtents: characterHalfExtents, id: characterId };
  for (const blocker of blockers) {
    if (blocker.id === characterId) {
      continue;
    }
    const bounds = entityBounds(blocker);
    if (bounds !== undefined && penetrates(characterBounds, bounds) && isSideBlocker(desired, characterHalfExtents, bounds)) {
      return blocker.id;
    }
  }
  return undefined;
}

function groundPosition(
  characterId: string,
  position: Vec3,
  characterHalfExtents: Vec3,
  blockers: readonly IWorldEntity[],
): Vec3 {
  let groundY: number | undefined;
  for (const blocker of blockers) {
    if (blocker.id === characterId) {
      continue;
    }
    const bounds = entityBounds(blocker);
    if (bounds === undefined || !coversXZ(position, bounds)) {
      continue;
    }
    const top = bounds.center[1] + bounds.halfExtents[1];
    const foot = position[1] - characterHalfExtents[1];
    if (top <= foot + SUPPORT_TOLERANCE && (groundY === undefined || top > groundY)) {
      groundY = top;
    }
  }
  return groundY === undefined ? [position[0], position[1], position[2]] : [position[0], groundY + characterHalfExtents[1], position[2]];
}

function entityBounds(entity: IWorldEntity): IBounds | undefined {
  const collider = entity.components.Collider;
  if (collider === undefined) {
    return undefined;
  }
  return {
    center: vector(entity.components.Transform?.position),
    halfExtents: halfExtents(collider),
    id: entity.id,
  };
}

function halfExtents(collider: IColliderComponent): Vec3 {
  if (collider.kind === "box") {
    const [x = 1, y = 1, z = 1] = collider.size ?? [];
    return [x / 2, y / 2, z / 2];
  }
  if (collider.kind === "sphere") {
    const radius = collider.radius ?? 0.5;
    return [radius, radius, radius];
  }
  if (collider.kind === "capsule" || collider.kind === "cylinder") {
    const radius = collider.radius ?? 0.5;
    return [radius, (collider.height ?? 1) / 2, radius];
  }
  return [0.5, 0.5, 0.5];
}

function penetrates(left: IBounds, right: IBounds): boolean {
  return (
    Math.abs(left.center[0] - right.center[0]) < left.halfExtents[0] + right.halfExtents[0] - 0.00001 &&
    Math.abs(left.center[1] - right.center[1]) < left.halfExtents[1] + right.halfExtents[1] - 0.00001 &&
    Math.abs(left.center[2] - right.center[2]) < left.halfExtents[2] + right.halfExtents[2] - 0.00001
  );
}

function coversXZ(point: Vec3, bounds: IBounds): boolean {
  return (
    Math.abs(point[0] - bounds.center[0]) <= bounds.halfExtents[0] &&
    Math.abs(point[2] - bounds.center[2]) <= bounds.halfExtents[2]
  );
}

function isSideBlocker(position: Vec3, characterHalfExtents: Vec3, bounds: IBounds): boolean {
  const foot = position[1] - characterHalfExtents[1];
  const top = bounds.center[1] + bounds.halfExtents[1];
  return top > foot + SUPPORT_TOLERANCE;
}

const SUPPORT_TOLERANCE = 0.1;

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function vector(value: readonly number[] | undefined): Vec3 {
  return [value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0];
}
