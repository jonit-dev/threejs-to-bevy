import type { IColliderComponent, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

export interface IPhysicsEventPayload {
  a: string;
  b: string;
  phase: "enter" | "exit" | "stay";
}

interface IBounds {
  center: Vec3;
  halfExtents: Vec3;
  id: string;
  layer?: string;
  mask: string[];
  trigger: boolean;
}

type PhysicsEventName = "CollisionEvent" | "TriggerEvent";

export interface IPhysicsEventObservation extends IPhysicsEventPayload {
  event: PhysicsEventName;
}

interface IDetectedPair {
  event: PhysicsEventName;
  key: string;
  payload: Omit<IPhysicsEventPayload, "phase">;
}

export interface IRigidBodyTraceInput {
  fixedDelta?: number;
  gravity?: Vec3;
  steps?: number;
}

export interface IRigidBodyTraceObservation {
  ccd?: boolean;
  contact?: string;
  contacts?: string[];
  damping: number;
  entity: string;
  friction: number;
  gravityScale: number;
  position: Vec3;
  restitution: number;
  step: number;
  velocity: Vec3;
}

export interface IPhysicsJointObservation {
  axis?: Vec3;
  connectedEntity: string;
  entity: string;
  kind: string;
}

const previousPairsByWorld = new WeakMap<IWorldIr, Map<string, IDetectedPair>>();

export function stepPhysics(world: IWorldIr, fixedDelta = 1 / 60): IPhysicsEventPayload[] {
  stepPrimitiveBodies(world, fixedDelta, [0, -9.81, 0]);

  const currentPairs = detectPairs(world.entities.flatMap((entity) => colliderBounds(entity)));
  const previousPairs = previousPairsByWorld.get(world) ?? new Map();
  const collisions = eventPayloads("CollisionEvent", currentPairs, previousPairs);
  const triggers = eventPayloads("TriggerEvent", currentPairs, previousPairs);
  previousPairsByWorld.set(world, currentPairs);
  writeEventQueue(world, "CollisionEvent", collisions);
  writeEventQueue(world, "TriggerEvent", triggers);
  return [...collisions, ...triggers];
}

export function traceRigidBodyPrimitive(world: IWorldIr, input: IRigidBodyTraceInput = {}): IRigidBodyTraceObservation[] {
  const fixedDelta = input.fixedDelta ?? 0.25;
  const gravity = input.gravity ?? [0, -9.81, 0];
  const observations: IRigidBodyTraceObservation[] = [];
  for (let step = 1; step <= (input.steps ?? 4); step += 1) {
    const contacts = stepPrimitiveBodies(world, fixedDelta, gravity);
    for (const entity of world.entities) {
      const body = entity.components.RigidBody;
      const collider = entity.components.Collider;
      const position = entity.components.Transform?.position;
      if (body?.kind !== "dynamic" || collider === undefined || position === undefined) {
        continue;
      }
      const entityContacts = contacts.get(entity.id);
      observations.push({
        ...(body.ccd?.enabled === true ? { ccd: true } : {}),
        ...(entityContacts?.[0] === undefined ? {} : { contact: entityContacts[0] }),
        ...(entityContacts === undefined || entityContacts.length <= 1 ? {} : { contacts: entityContacts }),
        damping: roundNumber(body.damping ?? 0),
        entity: entity.id,
        friction: roundNumber(collider.friction ?? 0),
        gravityScale: roundNumber(body.gravityScale ?? 1),
        position: roundVec3(position),
        restitution: roundNumber(collider.restitution ?? 0),
        step,
        velocity: roundVec3(body.velocity ?? [0, 0, 0]),
      });
    }
  }
  return observations.sort((left, right) => left.step - right.step || left.entity.localeCompare(right.entity));
}

export function tracePhysicsJoints(world: IWorldIr): IPhysicsJointObservation[] {
  return world.entities
    .flatMap((entity) => {
      const joint = entity.components.PhysicsJoint;
      if (joint === undefined) {
        return [];
      }
      return [
        {
          ...(joint.axis === undefined ? {} : { axis: joint.axis }),
          connectedEntity: joint.connectedEntity,
          entity: entity.id,
          kind: joint.kind,
        },
      ];
    })
    .sort((left, right) => left.entity.localeCompare(right.entity));
}

export function detectPhysicsEvents(world: IWorldIr): IPhysicsEventObservation[] {
  return [...detectPairs(world.entities.flatMap((entity) => colliderBounds(entity))).values()]
    .map((pair) => ({ event: pair.event, ...pair.payload, phase: "enter" as const }))
    .sort((left, right) => left.event.localeCompare(right.event) || comparePhysicsEvents(left, right));
}

function detectPairs(bounds: IBounds[]): Map<string, IDetectedPair> {
  const pairs = new Map<string, IDetectedPair>();
  for (let leftIndex = 0; leftIndex < bounds.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < bounds.length; rightIndex += 1) {
      const left = bounds[leftIndex];
      const right = bounds[rightIndex];
      if (left === undefined || right === undefined || !overlaps(left, right) || !passesContactFilter(left, right)) {
        continue;
      }
      const payload = orderedPayload(left.id, right.id);
      const event = left.trigger || right.trigger ? "TriggerEvent" : "CollisionEvent";
      pairs.set(pairKey(event, payload), { event, key: pairKey(event, payload), payload });
    }
  }
  return pairs;
}

function eventPayloads(event: PhysicsEventName, currentPairs: Map<string, IDetectedPair>, previousPairs: Map<string, IDetectedPair>): IPhysicsEventPayload[] {
  const payloads: IPhysicsEventPayload[] = [];
  for (const pair of currentPairs.values()) {
    if (pair.event === event) {
      payloads.push({ ...pair.payload, phase: previousPairs.has(pair.key) ? "stay" : "enter" });
    }
  }
  for (const pair of previousPairs.values()) {
    if (pair.event === event && !currentPairs.has(pair.key)) {
      payloads.push({ ...pair.payload, phase: "exit" });
    }
  }
  return payloads.sort(comparePhysicsEvents);
}

function stepPrimitiveBodies(world: IWorldIr, fixedDelta: number, gravity: Vec3): Map<string, string[]> {
  const contacts = new Map<string, string[]>();
  const previousCenters = new Map<string, Vec3>();
  for (const entity of world.entities) {
    const position = entity.components.Transform?.position;
    if (position !== undefined) {
      previousCenters.set(entity.id, [...position] as Vec3);
    }
  }
  for (const entity of world.entities) {
    integrateEntity(entity, fixedDelta, gravity);
  }
  const staticOrKinematic = world.entities
    .filter((entity) => entity.components.RigidBody?.kind === "static" || entity.components.RigidBody?.kind === "kinematic")
    .filter((entity) => entity.components.Collider !== undefined)
    .sort(compareEntityBottomThenId);
  const settledDynamics: IWorldEntity[] = [];
  const dynamics = world.entities
    .filter((entity) => entity.components.RigidBody?.kind === "dynamic" && entity.components.Collider !== undefined && entity.components.Transform?.position !== undefined)
    .sort(compareEntityBottomThenId);
  for (const entity of dynamics) {
    if (entity.components.RigidBody?.kind !== "dynamic" || entity.components.Collider === undefined || entity.components.Transform?.position === undefined) {
      continue;
    }
    for (const blocker of [...staticOrKinematic, ...settledDynamics].sort((left, right) => left.id.localeCompare(right.id))) {
      if (blocker.id === entity.id || blocker.components.Collider === undefined) {
        continue;
      }
      if (resolveVerticalContact(entity, blocker, previousCenters.get(entity.id))) {
        const entityContacts = contacts.get(entity.id) ?? [];
        entityContacts.push(blocker.id);
        contacts.set(entity.id, entityContacts.sort((left, right) => left.localeCompare(right)));
      }
    }
    settledDynamics.push(entity);
  }
  return contacts;
}

function integrateEntity(entity: IWorldEntity, fixedDelta: number, gravity: Vec3): void {
  const body = entity.components.RigidBody;
  const transform = entity.components.Transform;
  if ((body?.kind !== "dynamic" && body?.kind !== "kinematic") || transform?.position === undefined) {
    return;
  }
  const sourceVelocity = body.velocity ?? [0, 0, 0];
  const dampingFactor = Math.max(0, 1 - (body.damping ?? 0) * fixedDelta);
  const gravityScale = body.kind === "dynamic" ? (body.gravityScale ?? 1) : 0;
  const velocity: Vec3 = [
    (sourceVelocity[0] + gravity[0] * gravityScale * fixedDelta) * dampingFactor,
    (sourceVelocity[1] + gravity[1] * gravityScale * fixedDelta) * dampingFactor,
    (sourceVelocity[2] + gravity[2] * gravityScale * fixedDelta) * dampingFactor,
  ];
  body.velocity = velocity;
  transform.position = [
    transform.position[0] + velocity[0] * fixedDelta,
    transform.position[1] + velocity[1] * fixedDelta,
    transform.position[2] + velocity[2] * fixedDelta,
  ];
}

function resolveVerticalContact(entity: IWorldEntity, floor: IWorldEntity, previousCenter?: Vec3): boolean {
  const body = entity.components.RigidBody;
  const collider = entity.components.Collider;
  const transform = entity.components.Transform;
  const floorCollider = floor.components.Collider;
  const floorTransform = floor.components.Transform;
  if (body === undefined || collider === undefined || transform?.position === undefined || floorCollider === undefined) {
    return false;
  }
  const bounds = { center: colliderCenter(collider, transform.position), halfExtents: halfExtents(collider) };
  const floorBounds = { center: colliderCenter(floorCollider, floorTransform?.position ?? [0, 0, 0]), halfExtents: halfExtents(floorCollider) };
  const previousBoundsCenter = previousCenter === undefined ? undefined : colliderCenter(collider, previousCenter);
  if (!boundsOverlap(bounds, floorBounds) && !sweptVerticalOverlap(entity, bounds, floorBounds, previousBoundsCenter)) {
    return false;
  }
  const floorTop = floorBounds.center[1] + floorBounds.halfExtents[1];
  const resolvedY = floorTop + bounds.halfExtents[1];
  transform.position = [transform.position[0], roundNumber(resolvedY), transform.position[2]];
  const restitution = Math.max(collider.restitution ?? 0, floorCollider.restitution ?? 0);
  const friction = ((collider.friction ?? 0) + (floorCollider.friction ?? 0)) / 2;
  const velocity = body.velocity ?? [0, 0, 0];
  const nextY = velocity[1] < 0 ? -velocity[1] * restitution : velocity[1];
  const frictionFactor = Math.max(0, 1 - friction);
  body.velocity = [velocity[0] * frictionFactor, Math.abs(nextY) < 0.000001 ? 0 : nextY, velocity[2] * frictionFactor];
  return true;
}

function compareEntityBottomThenId(left: IWorldEntity, right: IWorldEntity): number {
  return entityBottom(left) - entityBottom(right) || left.id.localeCompare(right.id);
}

function entityBottom(entity: IWorldEntity): number {
  const collider = entity.components.Collider;
  const position = entity.components.Transform?.position ?? [0, 0, 0];
  return collider === undefined ? position[1] : position[1] - halfExtents(collider)[1];
}

function colliderBounds(entity: IWorldEntity): IBounds[] {
  const collider = entity.components.Collider;
  if (collider === undefined) {
    return [];
  }
  return [
    {
      center: colliderCenter(collider, entity.components.Transform?.position ?? [0, 0, 0]),
      halfExtents: halfExtents(collider),
      id: entity.id,
      layer: collider.layer,
      mask: [...(collider.mask ?? [])],
      trigger: collider.trigger === true,
    },
  ];
}

function halfExtents(collider: IColliderComponent): Vec3 {
  if (collider.kind === "mesh" && collider.mesh !== undefined) {
    const [x, y, z] = collider.mesh.bounds.size;
    return [x / 2, y / 2, z / 2];
  }
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

function colliderCenter(collider: IColliderComponent, transformPosition: Vec3): Vec3 {
  const local = collider.kind === "mesh" ? collider.mesh?.bounds.center : undefined;
  if (local === undefined) {
    return transformPosition;
  }
  return [transformPosition[0] + local[0], transformPosition[1] + local[1], transformPosition[2] + local[2]];
}

function sweptVerticalOverlap(entity: IWorldEntity, bounds: { center: Vec3; halfExtents: Vec3 }, floorBounds: { center: Vec3; halfExtents: Vec3 }, previousCenter?: Vec3): boolean {
  const body = entity.components.RigidBody;
  if (body?.ccd?.enabled !== true || previousCenter === undefined) {
    return false;
  }
  const previousBottom = previousCenter[1] - bounds.halfExtents[1];
  const currentBottom = bounds.center[1] - bounds.halfExtents[1];
  const floorTop = floorBounds.center[1] + floorBounds.halfExtents[1];
  const xOverlaps = Math.abs(bounds.center[0] - floorBounds.center[0]) <= bounds.halfExtents[0] + floorBounds.halfExtents[0];
  const zOverlaps = Math.abs(bounds.center[2] - floorBounds.center[2]) <= bounds.halfExtents[2] + floorBounds.halfExtents[2];
  return xOverlaps && zOverlaps && previousBottom >= floorTop && currentBottom <= floorTop;
}

function overlaps(left: IBounds, right: IBounds): boolean {
  return (
    Math.abs(left.center[0] - right.center[0]) <= left.halfExtents[0] + right.halfExtents[0] &&
    Math.abs(left.center[1] - right.center[1]) <= left.halfExtents[1] + right.halfExtents[1] &&
    Math.abs(left.center[2] - right.center[2]) <= left.halfExtents[2] + right.halfExtents[2]
  );
}

function boundsOverlap(
  left: { center: Vec3; halfExtents: Vec3 },
  right: { center: Vec3; halfExtents: Vec3 },
): boolean {
  return (
    Math.abs(left.center[0] - right.center[0]) <= left.halfExtents[0] + right.halfExtents[0] &&
    Math.abs(left.center[1] - right.center[1]) <= left.halfExtents[1] + right.halfExtents[1] &&
    Math.abs(left.center[2] - right.center[2]) <= left.halfExtents[2] + right.halfExtents[2]
  );
}

function passesContactFilter(left: IBounds, right: IBounds): boolean {
  return allows(left, right) && allows(right, left);
}

function allows(left: IBounds, right: IBounds): boolean {
  return left.mask.length === 0 || (right.layer !== undefined && left.mask.includes(right.layer));
}

function orderedPayload(left: string, right: string): Omit<IPhysicsEventPayload, "phase"> {
  return left.localeCompare(right) <= 0 ? { a: left, b: right } : { a: right, b: left };
}

function pairKey(event: PhysicsEventName, payload: Omit<IPhysicsEventPayload, "phase">): string {
  return `${event}:${payload.a}:${payload.b}`;
}

function comparePhysicsEvents(left: IPhysicsEventPayload, right: IPhysicsEventPayload): number {
  return left.a.localeCompare(right.a) || left.b.localeCompare(right.b) || left.phase.localeCompare(right.phase);
}

function writeEventQueue(world: IWorldIr, event: "CollisionEvent" | "TriggerEvent", payloads: IPhysicsEventPayload[]): void {
  world.events = {
    ...(world.events ?? {}),
    [event]: payloads,
  };
}

function roundVec3(value: Vec3): Vec3 {
  return [roundNumber(value[0]), roundNumber(value[1]), roundNumber(value[2])];
}

function roundNumber(value: number): number {
  return Number(value.toFixed(6));
}
