import RAPIER from "@dimforge/rapier3d-compat";

import type { IColliderComponent, IEnvironmentSceneIr, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";
import type { IRuntimeWriteLedger } from "./systems/writeAudit.js";

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
  environmentScene?: IEnvironmentSceneIr;
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
const scriptAuthoredTransformsByWorld = new WeakMap<IWorldIr, Set<string>>();
const rapierWorlds = new WeakMap<IWorldIr, IRapierRuntime>();
const rapierRebuilds = new WeakMap<IWorldIr, number>();
let rapierInitialized = false;
let rapierInitialization: Promise<void> | undefined;

export async function initializePhysicsRuntime(): Promise<void> {
  if (rapierInitialized) {
    return;
  }
  rapierInitialization ??= RAPIER.init().then(() => {
    rapierInitialized = true;
  });
  await rapierInitialization;
}

export function stepPhysics(world: IWorldIr, fixedDelta = 1 / 60, environmentScene?: IEnvironmentSceneIr, options: { tick?: number; writeLedger?: IRuntimeWriteLedger } = {}): IPhysicsEventPayload[] {
  const scriptAuthoredTransforms = scriptAuthoredTransformsByWorld.get(world) ?? new Set<string>();
  scriptAuthoredTransformsByWorld.delete(world);
  const beforeTransforms = snapshotPhysicsTransforms(world);
  const physicsWorld = worldWithEnvironmentTerrain(world, environmentScene);
  if (rapierInitialized) {
    stepRapierBodies(world, physicsWorld, fixedDelta, [0, -9.81, 0], scriptAuthoredTransforms);
  } else {
    stepPrimitiveBodies(physicsWorld, fixedDelta, [0, -9.81, 0], scriptAuthoredTransforms);
  }
  recordPhysicsTransformWrites(world, beforeTransforms, options);

  const currentPairs = detectPairs(physicsWorld.entities.flatMap((entity) => colliderBounds(entity)));
  const previousPairs = previousPairsByWorld.get(world) ?? new Map();
  const collisions = eventPayloads("CollisionEvent", currentPairs, previousPairs);
  const triggers = eventPayloads("TriggerEvent", currentPairs, previousPairs);
  previousPairsByWorld.set(world, currentPairs);
  writeEventQueue(world, "CollisionEvent", collisions);
  writeEventQueue(world, "TriggerEvent", triggers);
  return [...collisions, ...triggers];
}

function snapshotPhysicsTransforms(world: IWorldIr): Map<string, { position?: Vec3; rotation?: readonly [number, number, number, number] }> {
  return new Map(world.entities.map((entity) => {
    const transform = entity.components.Transform;
    return [entity.id, {
      ...(transform?.position === undefined ? {} : { position: [...transform.position] as Vec3 }),
      ...(transform?.rotation === undefined ? {} : { rotation: [...transform.rotation] as [number, number, number, number] }),
    }];
  }));
}

function recordPhysicsTransformWrites(
  world: IWorldIr,
  before: ReadonlyMap<string, { position?: Vec3; rotation?: readonly [number, number, number, number] }>,
  options: { tick?: number; writeLedger?: IRuntimeWriteLedger },
): void {
  if (options.writeLedger === undefined) {
    return;
  }
  for (const entity of world.entities) {
    const previous = before.get(entity.id);
    const transform = entity.components.Transform;
    if (previous?.position !== undefined && transform?.position !== undefined && !tupleEqual(previous.position, transform.position)) {
      options.writeLedger.record({
        newValue: transform.position,
        oldValue: previous.position,
        path: "Transform/position",
        targetId: entity.id,
        targetKind: "component",
        tick: options.tick ?? 0,
        writer: "physics",
      });
    }
    if (previous?.rotation !== undefined && transform?.rotation !== undefined && !tupleEqual(previous.rotation, transform.rotation)) {
      options.writeLedger.record({
        newValue: transform.rotation,
        oldValue: previous.rotation,
        path: "Transform/rotation",
        targetId: entity.id,
        targetKind: "component",
        tick: options.tick ?? 0,
        writer: "physics",
      });
    }
  }
}

function tupleEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function markScriptAuthoredTransform(world: IWorldIr, entity: string): void {
  const authored = scriptAuthoredTransformsByWorld.get(world) ?? new Set<string>();
  authored.add(entity);
  scriptAuthoredTransformsByWorld.set(world, authored);
}

interface IRapierRuntime {
  bodies: Map<string, RAPIER.RigidBody>;
  signature: string;
  world: RAPIER.World;
}

export function disposePhysicsRuntime(world: IWorldIr): void {
  rapierWorlds.get(world)?.world.free();
  rapierWorlds.delete(world);
  rapierRebuilds.delete(world);
  previousPairsByWorld.delete(world);
  scriptAuthoredTransformsByWorld.delete(world);
}

export function physicsRuntimeStats(world: IWorldIr): { rebuilds: number } {
  return { rebuilds: rapierRebuilds.get(world) ?? 0 };
}

function stepRapierBodies(cacheKey: IWorldIr, world: IWorldIr, fixedDelta: number, gravity: Vec3, scriptAuthoredTransforms: ReadonlySet<string>): void {
  const signature = rapierTopologySignature(world, gravity);
  let runtime = rapierWorlds.get(cacheKey);
  if (runtime === undefined || runtime.signature !== signature) {
    runtime?.world.free();
    runtime = createRapierRuntime(world, gravity, signature);
    rapierWorlds.set(cacheKey, runtime);
    rapierRebuilds.set(cacheKey, (rapierRebuilds.get(cacheKey) ?? 0) + 1);
  }
  const rapierWorld = runtime.world;
  const substeps = physicsSubsteps(fixedDelta);
  rapierWorld.integrationParameters.dt = fixedDelta / substeps;
  rapierWorld.integrationParameters.numSolverIterations = 12;
  rapierWorld.integrationParameters.numAdditionalFrictionIterations = 8;
  const bodies = runtime.bodies;

  for (const entity of world.entities) {
    const body = bodies.get(entity.id);
    const transform = entity.components.Transform;
    const source = entity.components.RigidBody;
    if (body === undefined || transform?.position === undefined || source === undefined) {
      continue;
    }
    const rotation = transform.rotation ?? [0, 0, 0, 1];
    const velocity = source.velocity ?? [0, 0, 0];
    const angularVelocity = source.angularVelocity ?? [0, 0, 0];
    body.setTranslation({ x: transform.position[0], y: transform.position[1], z: transform.position[2] }, false);
    body.setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] }, false);
    body.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, false);
    body.setAngvel({ x: angularVelocity[0], y: angularVelocity[1], z: angularVelocity[2] }, false);
  }

  for (let step = 0; step < substeps; step += 1) {
    rapierWorld.step();
  }

  for (const entity of world.entities) {
    const body = bodies.get(entity.id);
    if (body === undefined || entity.components.Transform?.position === undefined || entity.components.RigidBody === undefined) {
      continue;
    }
    if (scriptAuthoredTransforms.has(entity.id) && entity.components.RigidBody.kind === "kinematic") {
      continue;
    }
    const translation = body.translation();
    const rotation = body.rotation();
    const linvel = body.linvel();
    const angvel = body.angvel();
    entity.components.Transform = {
      ...entity.components.Transform,
      position: [translation.x, translation.y, translation.z],
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    };
    entity.components.RigidBody = {
      ...entity.components.RigidBody,
      angularVelocity: [angvel.x, angvel.y, angvel.z],
      velocity: [linvel.x, linvel.y, linvel.z],
    };
  }
}

function createRapierRuntime(world: IWorldIr, gravity: Vec3, signature: string): IRapierRuntime {
  const rapierWorld = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
  const bodies = new Map<string, RAPIER.RigidBody>();
  const layerBits = layerBitsForWorld(world);

  for (const entity of world.entities) {
    const transform = entity.components.Transform;
    const body = entity.components.RigidBody;
    const collider = entity.components.Collider;
    if (transform?.position === undefined || body === undefined || collider === undefined) {
      continue;
    }
    const position = transform.position;
    const rotation = transform.rotation ?? [0, 0, 0, 1];
    const desc = rigidBodyDesc(body.kind)
      .setTranslation(position[0], position[1], position[2])
      .setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] })
      .setGravityScale(body.kind === "dynamic" ? (body.gravityScale ?? 1) : 0)
      .setLinearDamping(body.damping ?? 0)
      .setCanSleep(body.sleepThreshold !== 0)
      .setCcdEnabled(body.ccd?.enabled === true);
    if (body.mass !== undefined && body.kind === "dynamic") {
      desc.setAdditionalMass(body.mass);
    }
    if (body.solverIterations !== undefined) {
      desc.setAdditionalSolverIterations(Math.max(0, body.solverIterations - 1));
    }
    if (Array.isArray(body.enabledTranslations)) {
      desc.enabledTranslations(body.enabledTranslations[0], body.enabledTranslations[1], body.enabledTranslations[2]);
    }
    if (Array.isArray(body.enabledRotations)) {
      desc.enabledRotations(body.enabledRotations[0], body.enabledRotations[1], body.enabledRotations[2]);
    }
    const velocity = body.velocity ?? [0, 0, 0];
    desc.setLinvel(velocity[0], velocity[1], velocity[2]);
    if (body.angularVelocity !== undefined) {
      desc.setAngvel({ x: body.angularVelocity[0], y: body.angularVelocity[1], z: body.angularVelocity[2] });
    }

    const rapierBody = rapierWorld.createRigidBody(desc);
    const colliderDesc = colliderDescFor(collider);
    if (colliderDesc !== undefined) {
      const groups = rapierCollisionGroups(collider, layerBits);
      const center = colliderLocalCenter(collider);
      colliderDesc
        .setTranslation(center[0], center[1], center[2])
        .setFriction(collider.friction ?? 0)
        .setRestitution(collider.restitution ?? 0)
        .setSensor(collider.trigger === true || collider.sensor !== undefined)
        .setCollisionGroups(groups)
        .setSolverGroups(groups);
      rapierWorld.createCollider(colliderDesc, rapierBody);
      bodies.set(entity.id, rapierBody);
    }
  }

  return { bodies, signature, world: rapierWorld };
}

function rapierTopologySignature(world: IWorldIr, gravity: Vec3): string {
  return JSON.stringify({
    gravity,
    entities: world.entities.map((entity) => ({
      Collider: entity.components.Collider,
      RigidBody: entity.components.RigidBody === undefined ? undefined : {
        ...entity.components.RigidBody,
        angularVelocity: undefined,
        velocity: undefined,
      },
      id: entity.id,
    })),
  });
}

function physicsSubsteps(fixedDelta: number): number {
  return Math.max(1, Math.ceil(fixedDelta / (1 / 120)));
}

function layerBitsForWorld(world: IWorldIr): Map<string, number> {
  const layers = new Map<string, number>();
  for (const entity of world.entities) {
    const layer = entity.components.Collider?.layer;
    if (layer === undefined || layers.has(layer)) {
      continue;
    }
    if (layers.size < 16) {
      layers.set(layer, 1 << layers.size);
    }
  }
  return layers;
}

function rapierCollisionGroups(collider: IColliderComponent, layerBits: ReadonlyMap<string, number>): number {
  const membership = collider.layer === undefined ? 0xffff : layerBits.get(collider.layer) ?? 0xffff;
  const filter = collider.mask === undefined || collider.mask.length === 0
    ? 0xffff
    : collider.mask.reduce((bits, layer) => bits | (layerBits.get(layer) ?? 0), 0);
  return membership * 0x10000 + filter;
}

function rigidBodyDesc(kind: string): RAPIER.RigidBodyDesc {
  if (kind === "dynamic") {
    return RAPIER.RigidBodyDesc.dynamic();
  }
  if (kind === "kinematic") {
    return RAPIER.RigidBodyDesc.kinematicVelocityBased();
  }
  return RAPIER.RigidBodyDesc.fixed();
}

function colliderDescFor(collider: IColliderComponent): RAPIER.ColliderDesc | undefined {
  if (collider.kind === "box") {
    const [x = 1, y = 1, z = 1] = collider.size ?? [];
    return RAPIER.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
  }
  if (collider.kind === "sphere") {
    return RAPIER.ColliderDesc.ball(collider.radius ?? 0.5);
  }
  if (collider.kind === "capsule") {
    return RAPIER.ColliderDesc.capsule((collider.height ?? 1) / 2, collider.radius ?? 0.5);
  }
  if (collider.kind === "cylinder") {
    return RAPIER.ColliderDesc.cylinder((collider.height ?? 1) / 2, collider.radius ?? 0.5);
  }
  if (collider.kind === "mesh" && collider.mesh !== undefined) {
    const [x, y, z] = collider.mesh.bounds.size;
    return RAPIER.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
  }
  return undefined;
}

export function traceRigidBodyPrimitive(world: IWorldIr, input: IRigidBodyTraceInput = {}): IRigidBodyTraceObservation[] {
  const fixedDelta = input.fixedDelta ?? 0.25;
  const gravity = input.gravity ?? [0, -9.81, 0];
  const physicsWorld = worldWithEnvironmentTerrain(world, input.environmentScene);
  const observations: IRigidBodyTraceObservation[] = [];
  for (let step = 1; step <= (input.steps ?? 4); step += 1) {
    const contacts = stepPrimitiveBodies(physicsWorld, fixedDelta, gravity, new Set());
    for (const entity of physicsWorld.entities) {
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

export function worldWithEnvironmentTerrain(world: IWorldIr, environmentScene: IEnvironmentSceneIr | undefined): IWorldIr {
  const terrain = environmentScene?.terrain;
  const chunk = terrain?.chunks?.[0];
  const collider = terrain?.collider;
  if (terrain === undefined || chunk === undefined || collider === undefined) {
    return world;
  }
  const min = chunk.bounds.min;
  const max = chunk.bounds.max;
  const size: Vec3 = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const center: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
  const terrainEntity: IWorldEntity = {
    components: {
      Collider: {
        kind: "mesh",
        layer: "world",
        mesh: {
          bounds: { center, size },
          source: collider.mesh,
          triangleCount: Math.max(0, (collider.sampleCount[0] - 1) * (collider.sampleCount[1] - 1) * 2),
        },
      },
      RigidBody: { kind: "static" },
      Transform: { position: [0, 0, 0] },
    },
    id: `${terrain.id}.heightfield`,
  };
  return {
    ...world,
    entities: [...world.entities.filter((entity) => entity.id !== terrainEntity.id), terrainEntity],
  };
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

function stepPrimitiveBodies(world: IWorldIr, fixedDelta: number, gravity: Vec3, scriptAuthoredTransforms: ReadonlySet<string> = new Set()): Map<string, string[]> {
  const contacts = new Map<string, string[]>();
  const previousCenters = new Map<string, Vec3>();
  for (const entity of world.entities) {
    const position = entity.components.Transform?.position;
    if (position !== undefined) {
      previousCenters.set(entity.id, [...position] as Vec3);
    }
  }
  for (const entity of world.entities) {
    if (scriptAuthoredTransforms.has(entity.id) && entity.components.RigidBody?.kind === "kinematic") {
      continue;
    }
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
      trigger: collider.trigger === true || collider.sensor !== undefined,
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
  const local = colliderLocalCenter(collider);
  return [transformPosition[0] + local[0], transformPosition[1] + local[1], transformPosition[2] + local[2]];
}

function colliderLocalCenter(collider: IColliderComponent): Vec3 {
  return collider.center ?? (collider.kind === "mesh" ? collider.mesh?.bounds.center : undefined) ?? [0, 0, 0];
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
