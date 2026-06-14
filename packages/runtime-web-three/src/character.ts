import type { IColliderComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

export interface ICharacterTraceInput {
  axes?: Readonly<Record<string, number>>;
  fixedDelta?: number;
}

export interface ICharacterTraceObservation {
  blockedBy?: string;
  desired: Vec3;
  entity: string;
  groundEntity?: string;
  grounded: boolean;
  platformDelta?: Vec3;
  resolved: Vec3;
  start: Vec3;
}

interface IBounds {
  center: Vec3;
  halfExtents: Vec3;
  id: string;
  velocity?: Vec3;
}

interface IGroundResolution {
  entity?: string;
  platformDelta?: Vec3;
  position: Vec3;
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
  const horizontal = controller.blocking === true
    ? resolveHorizontalContact(entity.id, start, desired, characterHalfExtents, blockers, controller.stepOffset ?? 0)
    : { position: desired };
  const ground = controller.grounding === "raycast"
    ? groundPosition(entity.id, horizontal.position, characterHalfExtents, blockers, fixedDelta)
    : { position: horizontal.position };

  return {
    ...(horizontal.blockedBy === undefined ? {} : { blockedBy: horizontal.blockedBy }),
    desired,
    entity: entity.id,
    ...(ground.entity === undefined ? {} : { groundEntity: ground.entity }),
    grounded: ground.entity !== undefined,
    ...(ground.platformDelta === undefined ? {} : { platformDelta: ground.platformDelta }),
    resolved: ground.position,
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

function resolveHorizontalContact(
  characterId: string,
  start: Vec3,
  desired: Vec3,
  characterHalfExtents: Vec3,
  blockers: readonly IWorldEntity[],
  stepOffset: number,
): { blockedBy?: string; position: Vec3 } {
  let position = desired;
  let characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
  for (const blocker of blockers) {
    if (blocker.id === characterId) {
      continue;
    }
    const bounds = entityBounds(blocker);
    if (bounds === undefined || !penetrates(characterBounds, bounds) || !isSideBlocker(position, characterHalfExtents, bounds)) {
      continue;
    }
    if (canStepOnto(position, characterHalfExtents, bounds, stepOffset)) {
      const top = bounds.center[1] + bounds.halfExtents[1];
      position = [position[0], top + characterHalfExtents[1], position[2]];
      characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
      continue;
    }
    return { blockedBy: blocker.id, position: start };
  }
  return { position };
}

function groundPosition(
  characterId: string,
  position: Vec3,
  characterHalfExtents: Vec3,
  blockers: readonly IWorldEntity[],
  fixedDelta: number,
): IGroundResolution {
  let ground: IBounds | undefined;
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
    if (top <= foot + SUPPORT_TOLERANCE && (ground === undefined || top > ground.center[1] + ground.halfExtents[1])) {
      ground = bounds;
    }
  }
  if (ground === undefined) {
    return { position };
  }
  const top = ground.center[1] + ground.halfExtents[1];
  const grounded = [position[0], top + characterHalfExtents[1], position[2]] as Vec3;
  const platformDelta = ground.velocity === undefined ? undefined : scale(ground.velocity, fixedDelta);
  return {
    entity: ground.id,
    ...(platformDelta === undefined ? {} : { platformDelta }),
    position: platformDelta === undefined ? grounded : add(grounded, platformDelta),
  };
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
    velocity: entity.components.RigidBody?.velocity,
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

function canStepOnto(position: Vec3, characterHalfExtents: Vec3, bounds: IBounds, stepOffset: number): boolean {
  const foot = position[1] - characterHalfExtents[1];
  const top = bounds.center[1] + bounds.halfExtents[1];
  return stepOffset > 0 && top > foot + SUPPORT_TOLERANCE && top <= foot + stepOffset + SUPPORT_TOLERANCE && coversXZ(position, bounds);
}

const SUPPORT_TOLERANCE = 0.1;

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function scale(vector: Vec3, amount: number): Vec3 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function vector(value: readonly number[] | undefined): Vec3 {
  return [value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0];
}
