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

const previousPairsByWorld = new WeakMap<IWorldIr, Map<string, IDetectedPair>>();

export function stepPhysics(world: IWorldIr, fixedDelta = 1 / 60): IPhysicsEventPayload[] {
  for (const entity of world.entities) {
    integrateEntity(entity, fixedDelta);
  }

  const currentPairs = detectPairs(world.entities.flatMap((entity) => colliderBounds(entity)));
  const previousPairs = previousPairsByWorld.get(world) ?? new Map();
  const collisions = eventPayloads("CollisionEvent", currentPairs, previousPairs);
  const triggers = eventPayloads("TriggerEvent", currentPairs, previousPairs);
  previousPairsByWorld.set(world, currentPairs);
  writeEventQueue(world, "CollisionEvent", collisions);
  writeEventQueue(world, "TriggerEvent", triggers);
  return [...collisions, ...triggers];
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
      if (left === undefined || right === undefined || !overlaps(left, right)) {
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

function integrateEntity(entity: IWorldEntity, fixedDelta: number): void {
  const body = entity.components.RigidBody;
  const velocity = body?.velocity;
  const transform = entity.components.Transform;
  if ((body?.kind !== "dynamic" && body?.kind !== "kinematic") || velocity === undefined || transform?.position === undefined) {
    return;
  }
  transform.position = [
    transform.position[0] + velocity[0] * fixedDelta,
    transform.position[1] + velocity[1] * fixedDelta,
    transform.position[2] + velocity[2] * fixedDelta,
  ];
}

function colliderBounds(entity: IWorldEntity): IBounds[] {
  const collider = entity.components.Collider;
  if (collider === undefined) {
    return [];
  }
  return [
    {
      center: entity.components.Transform?.position ?? [0, 0, 0],
      halfExtents: halfExtents(collider),
      id: entity.id,
      trigger: collider.trigger === true,
    },
  ];
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

function overlaps(left: IBounds, right: IBounds): boolean {
  return (
    Math.abs(left.center[0] - right.center[0]) <= left.halfExtents[0] + right.halfExtents[0] &&
    Math.abs(left.center[1] - right.center[1]) <= left.halfExtents[1] + right.halfExtents[1] &&
    Math.abs(left.center[2] - right.center[2]) <= left.halfExtents[2] + right.halfExtents[2]
  );
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
