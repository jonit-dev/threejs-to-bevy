import type { IColliderComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

export interface ICharacterTraceInput {
  axes?: Readonly<Record<string, number>>;
  direction?: readonly [number, number];
  fixedDelta?: number;
  speed?: number;
}

export interface ICharacterTraceObservation {
  blockedBy?: string;
  contacts?: ICharacterContactObservation[];
  desired: Vec3;
  entity: string;
  groundEntity?: string;
  grounded: boolean;
  platformDelta?: Vec3;
  pushed?: {
    entity: string;
    impulse: Vec3;
    position: Vec3;
  };
  pushes?: Array<NonNullable<ICharacterTraceObservation["pushed"]>>;
  resolved: Vec3;
  slope?: ICharacterSlopeObservation;
  start: Vec3;
  tooHeavy?: string;
}

export interface ICharacterContactObservation {
  material?: string;
  normal?: Vec3;
  other: string;
  phase: "begin" | "end" | "stay";
  point?: Vec3;
  pointIndex: number;
  self: string;
}

export interface ICharacterSlopeObservation {
  angle: number;
  axis: "x" | "z";
  direction: -1 | 1;
  entity: string;
  rise: number;
  run: number;
  walkable: boolean;
}

interface IBounds {
  center: Vec3;
  contactPhases?: readonly ("begin" | "end" | "stay")[];
  halfExtents: Vec3;
  id: string;
  layer?: string;
  mask?: readonly string[];
  material?: string;
  slope?: {
    angle: number;
    axis: "x" | "z";
    direction: -1 | 1;
    rise: number;
    run: number;
  };
  velocity?: Vec3;
}

interface IGroundResolution {
  contact?: ICharacterContactObservation;
  entity?: string;
  platformDelta?: Vec3;
  position: Vec3;
  slope?: ICharacterSlopeObservation;
}

type CharacterPushPolicy = NonNullable<NonNullable<IWorldEntity["components"]["CharacterController"]>["pushPolicy"]>;

export function traceCharacterControllers(world: IWorldIr, input: ICharacterTraceInput = {}): ICharacterTraceObservation[] {
  const fixedDelta = input.fixedDelta ?? 1;
  const axes = input.axes ?? {};
  const blockers = world.entities
    .filter((entity) => entity.components.Collider !== undefined && !isSensor(entity.components.Collider))
    .sort((left, right) => left.id.localeCompare(right.id));

  return world.entities
    .filter((entity) => entity.components.CharacterController !== undefined)
    .map((entity) => traceCharacter(entity, blockers, axes, fixedDelta, input.direction, input.speed))
    .sort((left, right) => left.entity.localeCompare(right.entity));
}

function traceCharacter(
  entity: IWorldEntity,
  blockers: readonly IWorldEntity[],
  axes: Readonly<Record<string, number>>,
  fixedDelta: number,
  direction: readonly [number, number] | undefined,
  speed: number | undefined,
): ICharacterTraceObservation {
  const controller = entity.components.CharacterController;
  const collider = entity.components.Collider;
  const start = vector(entity.components.Transform?.position);
  if (controller === undefined || collider === undefined) {
    return { desired: start, entity: entity.id, grounded: false, resolved: start, start };
  }

  const desired = add(start, movementDelta(
    direction?.[0] ?? axes[controller.moveXAxis] ?? 0,
    direction?.[1] ?? axes[controller.moveZAxis] ?? 0,
    speed ?? controller.speed,
    fixedDelta,
  ));
  // Collision math runs in collider space (transform + collider center offset);
  // reported positions stay in transform space.
  const offset = colliderOffset(collider);
  const characterBoundsInfo = entityBounds(entity);
  const characterHalfExtents = halfExtents(collider);
  const horizontal = controller.blocking === true
    ? resolveHorizontalContact(entity.id, characterBoundsInfo, add(start, offset), add(desired, offset), characterHalfExtents, blockers, controller.stepOffset ?? 0, controller.slopeLimit ?? DEFAULT_SLOPE_LIMIT, controller.pushPolicy)
    : { position: add(desired, offset) };
  const ground = controller.grounding === "raycast"
    ? groundPosition(entity.id, characterBoundsInfo, horizontal.position, characterHalfExtents, blockers, fixedDelta, controller.slopeLimit ?? DEFAULT_SLOPE_LIMIT)
    : { position: horizontal.position };
  const contacts = sortContacts([...horizontal.contacts ?? [], ...(ground.contact === undefined ? [] : [ground.contact])]);

  return {
    ...(horizontal.blockedBy === undefined ? {} : { blockedBy: horizontal.blockedBy }),
    ...(contacts.length === 0 ? {} : { contacts }),
    desired,
    entity: entity.id,
    ...(ground.entity === undefined ? {} : { groundEntity: ground.entity }),
    grounded: ground.entity !== undefined,
    ...(ground.platformDelta === undefined ? {} : { platformDelta: ground.platformDelta }),
    ...(horizontal.pushed === undefined ? {} : { pushed: horizontal.pushed }),
    ...(horizontal.pushed === undefined ? {} : { pushes: [clonePush(horizontal.pushed)] }),
    resolved: subtract(ground.position, offset),
    ...(ground.slope === undefined ? {} : { slope: ground.slope }),
    start,
    ...(horizontal.tooHeavy === undefined ? {} : { tooHeavy: horizontal.tooHeavy }),
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
  characterBoundsInfo: IBounds | undefined,
  start: Vec3,
  desired: Vec3,
  characterHalfExtents: Vec3,
  blockers: readonly IWorldEntity[],
  stepOffset: number,
  slopeLimit: number,
  pushPolicy: CharacterPushPolicy | undefined,
): { blockedBy?: string; contacts?: ICharacterContactObservation[]; position: Vec3; pushed?: ICharacterTraceObservation["pushed"]; tooHeavy?: string } {
  let position = desired;
  let characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
  const move = [desired[0] - start[0], desired[1] - start[1], desired[2] - start[2]] as Vec3;
  const contacts: ICharacterContactObservation[] = [];
  for (const blocker of blockers) {
    if (blocker.id === characterId) {
      continue;
    }
    const bounds = entityBounds(blocker);
    if (bounds === undefined || !collidersInteract(characterBoundsInfo, bounds) || !penetrates(characterBounds, bounds) || !isSideBlocker(position, characterHalfExtents, bounds)) {
      continue;
    }
    if (bounds.slope !== undefined && isWalkableSlope(bounds, slopeLimit)) {
      addContact(contacts, characterBoundsInfo, bounds, "begin", position, contactNormal(move));
      const top = surfaceTop(position, bounds);
      position = coversXZ(position, bounds) ? [position[0], top + characterHalfExtents[1], position[2]] : position;
      characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
      continue;
    }
    if (canStepOnto(position, characterHalfExtents, bounds, stepOffset)) {
      addContact(contacts, characterBoundsInfo, bounds, "begin", position, contactNormal(move));
      const top = surfaceTop(position, bounds);
      position = coversXZ(position, bounds) ? [position[0], top + characterHalfExtents[1], position[2]] : position;
      characterBounds = { center: position, halfExtents: characterHalfExtents, id: characterId };
      continue;
    }
    addContact(contacts, characterBoundsInfo, bounds, "begin", position, contactNormal(move));
    const push = resolvePush(pushPolicy, blocker, move);
    if (push.kind === "pushed") {
      return { contacts, position, pushed: push.pushed };
    }
    if (push.kind === "too-heavy") {
      return { blockedBy: blocker.id, contacts, position: start, tooHeavy: blocker.id };
    }
    return { blockedBy: blocker.id, contacts, position: start };
  }
  return { contacts, position };
}

function resolvePush(
  pushPolicy: CharacterPushPolicy | undefined,
  blocker: IWorldEntity,
  move: Vec3,
): { kind: "none" } | { kind: "pushed"; pushed: NonNullable<ICharacterTraceObservation["pushed"]> } | { kind: "too-heavy" } {
  const body = blocker.components.RigidBody;
  if (pushPolicy?.enabled !== true || body?.kind !== "dynamic") {
    return { kind: "none" };
  }
  const layer = blocker.components.Collider?.layer;
  if (pushPolicy.allowedLayers !== undefined && (layer === undefined || !pushPolicy.allowedLayers.includes(layer))) {
    return { kind: "none" };
  }
  const mass = body.mass ?? (body.inverseMass === undefined || body.inverseMass === 0 ? 1 : 1 / body.inverseMass);
  if (mass > (pushPolicy.maxPushMass ?? Number.POSITIVE_INFINITY)) {
    return pushPolicy.blockedWhenTooHeavy === false ? { kind: "none" } : { kind: "too-heavy" };
  }
  const speed = Math.hypot(move[0], move[2]);
  if (speed < (pushPolicy.minMoveSpeed ?? 0)) {
    return { kind: "none" };
  }
  const impulseScale = pushPolicy.impulseScale ?? 1;
  const impulse = [move[0] * impulseScale, 0, move[2] * impulseScale] as Vec3;
  const start = vector(blocker.components.Transform?.position);
  return {
    kind: "pushed",
    pushed: {
      entity: blocker.id,
      impulse,
      position: add(start, impulse),
    },
  };
}

function clonePush(push: NonNullable<ICharacterTraceObservation["pushed"]>): NonNullable<ICharacterTraceObservation["pushed"]> {
  return {
    entity: push.entity,
    impulse: [...push.impulse] as Vec3,
    position: [...push.position] as Vec3,
  };
}

function groundPosition(
  characterId: string,
  characterBoundsInfo: IBounds | undefined,
  position: Vec3,
  characterHalfExtents: Vec3,
  blockers: readonly IWorldEntity[],
  fixedDelta: number,
  slopeLimit: number,
): IGroundResolution {
  let ground: IBounds | undefined;
  let groundTop: number | undefined;
  for (const blocker of blockers) {
    if (blocker.id === characterId) {
      continue;
    }
    const bounds = entityBounds(blocker);
    if (bounds === undefined || !collidersInteract(characterBoundsInfo, bounds) || !coversXZ(position, bounds)) {
      continue;
    }
    if (!canWalkSlope(position, bounds, slopeLimit)) {
      continue;
    }
    const top = surfaceTop(position, bounds);
    const foot = position[1] - characterHalfExtents[1];
    if (top <= foot + SUPPORT_TOLERANCE && (groundTop === undefined || top > groundTop)) {
      ground = bounds;
      groundTop = top;
    }
  }
  if (ground === undefined || groundTop === undefined) {
    return { position };
  }
  const grounded = [position[0], groundTop + characterHalfExtents[1], position[2]] as Vec3;
  const platformDelta = ground.velocity === undefined ? undefined : scale(ground.velocity, fixedDelta);
  const contact = makeContact(characterBoundsInfo, ground, "stay", [position[0], groundTop, position[2]], [0, 1, 0]);
  return {
    ...(contact === undefined ? {} : { contact }),
    entity: ground.id,
    ...(platformDelta === undefined ? {} : { platformDelta }),
    position: platformDelta === undefined ? grounded : add(grounded, platformDelta),
    ...(ground.slope === undefined ? {} : { slope: slopeObservation(ground) }),
  };
}

function entityBounds(entity: IWorldEntity): IBounds | undefined {
  const collider = entity.components.Collider;
  if (collider === undefined) {
    return undefined;
  }
  return {
    center: add(vector(entity.components.Transform?.position), colliderOffset(collider)),
    contactPhases: collider.contact?.phases,
    halfExtents: halfExtents(collider),
    id: entity.id,
    layer: collider.layer,
    mask: collider.mask,
    material: collider.material,
    slope: slope(collider),
    velocity: entity.components.RigidBody?.velocity,
  };
}

function colliderOffset(collider: IColliderComponent): Vec3 {
  return vector(collider.center ?? (collider.kind === "mesh" ? collider.mesh?.bounds.center : undefined));
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
  if (collider.kind === "capsule") {
    const radius = collider.radius ?? 0.5;
    return [radius, (collider.height ?? 1) / 2, radius];
  }
  if (collider.kind === "mesh" && collider.mesh !== undefined) {
    const [x, y, z] = collider.mesh.bounds.size;
    return [x / 2, y / 2, z / 2];
  }
  return [0.5, 0.5, 0.5];
}

function isSensor(collider: IColliderComponent): boolean {
  return collider.trigger === true || collider.sensor !== undefined;
}

function collidersInteract(left: IBounds | undefined, right: IBounds): boolean {
  if (left === undefined) {
    return true;
  }
  return maskAccepts(left.mask, right.layer) && maskAccepts(right.mask, left.layer);
}

function maskAccepts(mask: readonly string[] | undefined, layer: string | undefined): boolean {
  return mask === undefined || mask.length === 0 || (layer !== undefined && mask.includes(layer));
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
  const top = surfaceTop(position, bounds);
  return top > foot + SUPPORT_TOLERANCE;
}

function canStepOnto(position: Vec3, characterHalfExtents: Vec3, bounds: IBounds, stepOffset: number): boolean {
  const foot = position[1] - characterHalfExtents[1];
  const top = surfaceTop(position, bounds);
  return stepOffset > 0 && top > foot + SUPPORT_TOLERANCE && top <= foot + stepOffset + SUPPORT_TOLERANCE;
}

function canWalkSlope(position: Vec3, bounds: IBounds, slopeLimit: number): boolean {
  return bounds.slope === undefined || (coversXZ(position, bounds) && isWalkableSlope(bounds, slopeLimit));
}

function isWalkableSlope(bounds: IBounds, slopeLimit: number): boolean {
  return bounds.slope !== undefined && bounds.slope.angle <= slopeLimit + 0.0001;
}

function surfaceTop(position: Vec3, bounds: IBounds): number {
  if (bounds.slope === undefined) {
    return bounds.center[1] + bounds.halfExtents[1];
  }
  const axisIndex = bounds.slope.axis === "x" ? 0 : 2;
  const min = bounds.center[axisIndex] - bounds.halfExtents[axisIndex];
  const max = bounds.center[axisIndex] + bounds.halfExtents[axisIndex];
  const span = Math.max(0.0001, max - min);
  const distance = bounds.slope.direction === 1 ? position[axisIndex] - min : max - position[axisIndex];
  const t = Math.min(1, Math.max(0, distance / span));
  return bounds.center[1] - bounds.halfExtents[1] + t * bounds.slope.rise;
}

function slope(collider: IColliderComponent): IBounds["slope"] {
  const slope = collider.slope;
  if (slope === undefined) {
    return undefined;
  }
  return {
    angle: Math.atan2(slope.rise, slope.run) * 180 / Math.PI,
    axis: slope.axis,
    direction: slope.direction,
    rise: slope.rise,
    run: slope.run,
  };
}

function slopeObservation(bounds: IBounds): ICharacterSlopeObservation | undefined {
  if (bounds.slope === undefined) {
    return undefined;
  }
  return {
    angle: round(bounds.slope.angle),
    axis: bounds.slope.axis,
    direction: bounds.slope.direction,
    entity: bounds.id,
    rise: round(bounds.slope.rise),
    run: round(bounds.slope.run),
    walkable: true,
  };
}

function addContact(
  contacts: ICharacterContactObservation[],
  self: IBounds | undefined,
  other: IBounds,
  phase: ICharacterContactObservation["phase"],
  point: Vec3,
  normal: Vec3,
): void {
  const contact = makeContact(self, other, phase, point, normal);
  if (contact !== undefined) {
    contacts.push(contact);
  }
}

function makeContact(
  self: IBounds | undefined,
  other: IBounds,
  phase: ICharacterContactObservation["phase"],
  point: Vec3,
  normal: Vec3,
): ICharacterContactObservation | undefined {
  if (self === undefined || !contactAllowed(self, other, phase) || !contactAllowed(other, self, phase)) {
    return undefined;
  }
  return {
    ...(other.material === undefined ? {} : { material: other.material }),
    normal: roundVec(normal),
    other: other.id,
    phase,
    point: roundVec(point),
    pointIndex: 0,
    self: self.id,
  };
}

function contactAllowed(self: IBounds, other: IBounds, phase: ICharacterContactObservation["phase"]): boolean {
  if (self.contactPhases === undefined) {
    return false;
  }
  if (!self.contactPhases.includes(phase)) {
    return false;
  }
  return self.mask === undefined || (other.layer !== undefined && self.mask.includes(other.layer));
}

function sortContacts(contacts: ICharacterContactObservation[]): ICharacterContactObservation[] {
  return contacts.sort((left, right) => (
    contactPhaseOrder(left.phase) - contactPhaseOrder(right.phase)
    || left.self.localeCompare(right.self)
    || left.other.localeCompare(right.other)
    || left.pointIndex - right.pointIndex
  ));
}

function contactPhaseOrder(phase: ICharacterContactObservation["phase"]): number {
  return phase === "begin" ? 0 : phase === "stay" ? 1 : 2;
}

function contactNormal(move: Vec3): Vec3 {
  if (Math.abs(move[0]) >= Math.abs(move[2])) {
    return [move[0] >= 0 ? -1 : 1, 0, 0];
  }
  return [0, 0, move[2] >= 0 ? -1 : 1];
}

const SUPPORT_TOLERANCE = 0.1;
const DEFAULT_SLOPE_LIMIT = 45;

function add(left: Vec3, right: Vec3): Vec3 {
  return [left[0] + right[0], left[1] + right[1], left[2] + right[2]];
}

function subtract(left: Vec3, right: Vec3): Vec3 {
  return [left[0] - right[0], left[1] - right[1], left[2] - right[2]];
}

function scale(vector: Vec3, amount: number): Vec3 {
  return [vector[0] * amount, vector[1] * amount, vector[2] * amount];
}

function vector(value: readonly number[] | undefined): Vec3 {
  return [value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0];
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundVec(value: Vec3): Vec3 {
  return [round(value[0]), round(value[1]), round(value[2])];
}
