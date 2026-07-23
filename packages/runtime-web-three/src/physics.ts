import RAPIER from "@dimforge/rapier3d-compat";

import type { IColliderComponent, ICompoundColliderComponent, ICompoundColliderShape, IEnvironmentSceneIr, IFracturePiece, IPhysicsBodyObservation, IPhysicsQueryHitObservation, IScriptPhysicsOverlapRequest, IScriptPhysicsOverlapResult, IScriptPhysicsRaycastRequest, IScriptPhysicsRaycastResult, IScriptPhysicsShapeCastRequest, IScriptPhysicsShapeCastResult, IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";
import { beginPhysicsJointTick, collectBrokenPhysicsJoints, createPhysicsJointRuntime, observePhysicsJointLoads as observeJointLoads, preparePhysicsJointStep, reconcilePhysicsJoints, recordPhysicsJointCommandLoad, type IPhysicsJointBreakEvent, type IPhysicsJointLoadObservation, type IPhysicsJointRuntime } from "./physicsJoints.js";
import type { IRuntimeWriteLedger } from "./systems/writeAudit.js";

export interface IPhysicsEventPayload {
  a: string;
  b: string;
  childA?: string;
  childB?: string;
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
const pendingPointCommands = new WeakMap<IWorldIr, IPointPhysicsCommand[]>();
const pendingPhysicsQueries = new WeakMap<IWorldIr, number>();
const lastPhysicsQueries = new WeakMap<IWorldIr, number>();
const lastPhysicsStepMilliseconds = new WeakMap<IWorldIr, number>();
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

export function preparePhysicsRuntime(world: IWorldIr, environmentScene?: IEnvironmentSceneIr, gravity: Vec3 = [0, -9.81, 0]): void {
  if (!rapierInitialized) return;
  prepareRetainedPhysicsRuntime(world, worldWithEnvironmentTerrain(world, environmentScene), gravity);
}

function prepareRetainedPhysicsRuntime(cacheKey: IWorldIr, physicsWorld: IWorldIr, gravity: Vec3): void {
  const signature = rapierTopologySignature(physicsWorld, gravity);
  const runtime = rapierWorlds.get(cacheKey);
  if (runtime?.signature === signature) {
    runtime.physicsWorld = physicsWorld;
    reconcilePhysicsJoints(runtime.joints, physicsWorld, runtime.world, runtime.bodies);
    return;
  }
  if (runtime !== undefined) freeRapierRuntime(runtime);
  rapierWorlds.set(cacheKey, createRapierRuntime(physicsWorld, gravity, signature));
  rapierRebuilds.set(cacheKey, (rapierRebuilds.get(cacheKey) ?? 0) + 1);
}

export function stepPhysics(world: IWorldIr, fixedDelta = 1 / 60, environmentScene?: IEnvironmentSceneIr, options: { gravity?: Vec3; tick?: number; writeLedger?: IRuntimeWriteLedger } = {}): IPhysicsEventPayload[] {
  const startedAt = performance.now();
  const scriptAuthoredTransforms = scriptAuthoredTransformsByWorld.get(world) ?? new Set<string>();
  scriptAuthoredTransformsByWorld.delete(world);
  const beforeTransforms = options.writeLedger === undefined ? undefined : snapshotPhysicsTransforms(world);
  const physicsWorld = worldWithEnvironmentTerrain(world, environmentScene);
  const gravity = options.gravity ?? [0, -9.81, 0];
  let jointBreaks: IPhysicsJointBreakEvent[] = [];
  if (rapierInitialized) {
    jointBreaks = stepRapierBodies(world, physicsWorld, fixedDelta, gravity, scriptAuthoredTransforms);
  } else {
    stepPrimitiveBodies(physicsWorld, fixedDelta, gravity, scriptAuthoredTransforms);
  }
  if (beforeTransforms !== undefined) {
    recordPhysicsTransformWrites(world, beforeTransforms, options);
  }

  const retainedRuntime = rapierWorlds.get(world);
  const currentPairs = retainedRuntime === undefined
    ? detectPairs(physicsWorld.entities.flatMap((entity) => colliderBounds(entity)))
    : detectRapierPairs(retainedRuntime);
  const previousPairs = previousPairsByWorld.get(world) ?? new Map();
  const collisions = eventPayloads("CollisionEvent", currentPairs, previousPairs);
  const triggers = eventPayloads("TriggerEvent", currentPairs, previousPairs);
  previousPairsByWorld.set(world, currentPairs);
  writeEventQueue(world, "CollisionEvent", collisions);
  writeEventQueue(world, "TriggerEvent", triggers);
  world.events ??= {};
  world.events.JointBreakEvent = jointBreaks;
  lastPhysicsQueries.set(world, pendingPhysicsQueries.get(world) ?? 0);
  pendingPhysicsQueries.set(world, 0);
  lastPhysicsStepMilliseconds.set(world, Math.max(0, performance.now() - startedAt));
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
  colliders: Map<number, { child?: string; entity: string }>;
  contactImpulses: Map<string, { handles: readonly [number, number]; impulse: number }>;
  destructionAssemblies: Map<string, IDestructionAssemblyPhysicsState>;
  eventQueue: RAPIER.EventQueue;
  joints: IPhysicsJointRuntime;
  physicsWorld: IWorldIr;
  signature: string;
  world: RAPIER.World;
}

interface IDestructionAssemblyPhysicsState {
  angularVelocity: Vec3;
  colliderHandles: number[];
  collisionActive: boolean;
  linearVelocity: Vec3;
  mass: number;
  position: Vec3;
  pieceLifecycles: Map<string, "active" | "bound" | "despawned" | "pooled" | "sleeping">;
  retired: boolean;
  rotation: readonly [number, number, number, number];
}

interface IPointPhysicsCommand {
  entity: string;
  kind: "force" | "impulse";
  point: readonly [number, number, number];
  value: readonly [number, number, number];
}

export function disposePhysicsRuntime(world: IWorldIr): void {
  const runtime = rapierWorlds.get(world);
  if (runtime !== undefined) freeRapierRuntime(runtime);
  rapierWorlds.delete(world);
  rapierRebuilds.delete(world);
  previousPairsByWorld.delete(world);
  scriptAuthoredTransformsByWorld.delete(world);
  pendingPointCommands.delete(world);
  pendingPhysicsQueries.delete(world);
  lastPhysicsQueries.delete(world);
  lastPhysicsStepMilliseconds.delete(world);
}

export function observePhysicsTelemetryStats(world: IWorldIr): {
  activeBodies: number;
  contacts: number;
  physicsMilliseconds: number;
  queries: number;
  sleepingBodies: number;
  solverIterations: number;
} {
  const runtime = rapierWorlds.get(world);
  const bodies = runtime === undefined ? [] : [...runtime.bodies.values()].filter((body) => body.isDynamic());
  const contacts = [...(previousPairsByWorld.get(world)?.values() ?? [])].filter((pair) => pair.event === "CollisionEvent").length;
  return {
    activeBodies: bodies.filter((body) => !body.isSleeping()).length,
    contacts,
    physicsMilliseconds: finiteNonnegative(lastPhysicsStepMilliseconds.get(world)),
    queries: Math.max(0, Math.floor(lastPhysicsQueries.get(world) ?? pendingPhysicsQueries.get(world) ?? 0)),
    sleepingBodies: bodies.filter((body) => body.isSleeping()).length,
    solverIterations: Math.max(1, ...world.entities.map((entity) => entity.components.RigidBody?.solverIterations ?? 1)),
  };
}

export function physicsRuntimeStats(world: IWorldIr): { rebuilds: number; jointCreations?: number; jointRemovals?: number } {
  const joints = rapierWorlds.get(world)?.joints;
  return {
    rebuilds: rapierRebuilds.get(world) ?? 0,
    ...(joints === undefined || (joints.creations === 0 && joints.removals === 0) ? {} : { jointCreations: joints.creations, jointRemovals: joints.removals }),
  };
}

export function physicsBodyMass(world: IWorldIr, entity: string): number | undefined {
  return rapierWorlds.get(world)?.bodies.get(entity)?.mass();
}

export function physicsBodySleeping(world: IWorldIr, entity: string): boolean | undefined {
  return rapierWorlds.get(world)?.bodies.get(entity)?.isSleeping();
}

export function physicsRuntimeCcdSubsteps(world: IWorldIr): number | undefined {
  return rapierWorlds.get(world)?.world.maxCcdSubsteps;
}

export function syncPhysicsDestructionBodies(
  world: IWorldIr,
  assembly: string,
  pieces: readonly { lifecycle: "active" | "bound" | "despawned" | "pooled" | "sleeping"; piece: IFracturePiece }[],
): boolean {
  const runtime = liveRuntime(world);
  if (runtime === undefined) return false;
  let state = runtime.destructionAssemblies.get(assembly);
  if (state === undefined) {
    const body = runtime.bodies.get(assembly);
    if (body === undefined) return false;
    const position = body.translation();
    const rotation = body.rotation();
    const linearVelocity = body.linvel();
    const angularVelocity = body.angvel();
    state = {
      angularVelocity: [angularVelocity.x, angularVelocity.y, angularVelocity.z],
      colliderHandles: [...runtime.colliders].filter(([, owner]) => owner.entity === assembly).map(([handle]) => handle).sort((left, right) => left - right),
      collisionActive: true,
      linearVelocity: [linearVelocity.x, linearVelocity.y, linearVelocity.z],
      mass: body.mass(),
      pieceLifecycles: new Map(),
      position: [position.x, position.y, position.z],
      retired: false,
      rotation: [rotation.x, rotation.y, rotation.z, rotation.w],
    };
    runtime.destructionAssemblies.set(assembly, state);
  }
  const participating = pieces.filter(({ lifecycle }) => lifecycle !== "bound");
  if (participating.length === 0) return true;
  disableDestructionAssemblyCollision(runtime, assembly, state);
  for (const item of [...pieces].sort((left, right) => left.piece.id.localeCompare(right.piece.id))) {
    const id = destructionPieceBodyId(assembly, item.piece.id);
    state.pieceLifecycles.set(id, item.lifecycle);
    if (item.lifecycle === "active" || item.lifecycle === "bound" || item.lifecycle === "sleeping") {
      let body = runtime.bodies.get(id);
      if (body === undefined) {
        body = createDestructionPieceBody(runtime, state, id, item.piece, item.lifecycle);
      }
      if (item.lifecycle === "active" && !body.isDynamic()) {
        body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
        body.setLinvel(rapierVector(pieceVelocity(state, item.piece)), true);
        body.setAngvel(rapierVector(state.angularVelocity), true);
      }
      if (item.lifecycle === "bound" && !body.isFixed()) body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
      if (item.lifecycle === "sleeping") body.sleep();
    } else if (item.lifecycle === "despawned" || item.lifecycle === "pooled") {
      removeDestructionBody(runtime, id);
    }
  }
  retireDestructionAssembly(runtime, assembly, state);
  return true;
}

export function destructionPieceBodyId(assembly: string, piece: string): string { return `${assembly}/${piece}`; }

export interface IPhysicsDestructionBodyObservation {
  assemblyCollisionActive: boolean;
  pieces: Array<{
    handle: number;
    id: string;
    lifecycle: "active" | "bound" | "despawned" | "pooled" | "sleeping";
    mass: number;
    position: Vec3;
    rotation: readonly [number, number, number, number];
    velocity: Vec3;
  }>;
}

export interface IPhysicsContactImpulseObservation {
  a: string;
  b: string;
  impulse: number;
  point?: Vec3;
}

export function observePhysicsContactImpulses(world: IWorldIr): IPhysicsContactImpulseObservation[] {
  const runtime = rapierWorlds.get(world);
  if (runtime === undefined) return [];
  const observations: IPhysicsContactImpulseObservation[] = [];
  for (const { handles: [leftHandle, rightHandle], impulse } of runtime.contactImpulses.values()) {
    const leftOwner = runtime.colliders.get(leftHandle);
    const rightOwner = runtime.colliders.get(rightHandle);
    const left = runtime.world.getCollider(leftHandle);
    const right = runtime.world.getCollider(rightHandle);
    if (leftOwner === undefined || rightOwner === undefined || left === null || right === null || leftOwner.entity === rightOwner.entity) continue;
    let point: Vec3 | undefined;
    runtime.world.contactPair(left, right, (manifold: RAPIER.TempContactManifold) => {
      if (point === undefined && manifold.numSolverContacts() > 0) {
        const contact = manifold.solverContactPoint(0);
        point = [contact.x, contact.y, contact.z];
      }
    });
    const [a, b] = leftOwner.entity.localeCompare(rightOwner.entity) <= 0 ? [leftOwner.entity, rightOwner.entity] : [rightOwner.entity, leftOwner.entity];
    observations.push({ a, b, impulse, ...(point === undefined ? {} : { point }) });
  }
  return observations.sort((left, right) => left.a.localeCompare(right.a) || left.b.localeCompare(right.b));
}

export function observePhysicsDestructionBodies(world: IWorldIr, assembly: string): IPhysicsDestructionBodyObservation {
  const runtime = rapierWorlds.get(world);
  const state = runtime?.destructionAssemblies.get(assembly);
  if (runtime === undefined) return { assemblyCollisionActive: false, pieces: [] };
  const prefix = `${assembly}/`;
  const pieces = [...runtime.bodies]
    .filter(([id]) => id.startsWith(prefix))
    .map(([id, body]) => {
      const position = body.translation();
      const rotation = body.rotation();
      const velocity = body.linvel();
      return {
        handle: body.handle,
        id,
        lifecycle: state?.pieceLifecycles.get(id) ?? "active" as const,
        mass: destructionBodyMass(runtime, id),
        position: [position.x, position.y, position.z] as Vec3,
        rotation: [rotation.x, rotation.y, rotation.z, rotation.w] as const,
        velocity: [velocity.x, velocity.y, velocity.z] as Vec3,
      };
    })
    .sort((left, right) => left.id.localeCompare(right.id));
  return { assemblyCollisionActive: state?.collisionActive ?? runtime.bodies.has(assembly), pieces };
}

function destructionBodyMass(runtime: IRapierRuntime, id: string): number {
  let mass = 0;
  for (const [handle, owner] of runtime.colliders) {
    if (owner.entity !== id) continue;
    mass += runtime.world.getCollider(handle)?.mass() ?? 0;
  }
  return mass;
}

function disableDestructionAssemblyCollision(runtime: IRapierRuntime, assembly: string, state: IDestructionAssemblyPhysicsState): void {
  for (const handle of state.colliderHandles) {
    const collider = runtime.world.getCollider(handle);
    if (collider === null) continue;
    collider.setCollisionGroups(0);
    collider.setSolverGroups(0);
  }
  const body = runtime.bodies.get(assembly);
  body?.sleep();
  state.collisionActive = false;
}

function createDestructionPieceBody(runtime: IRapierRuntime, state: IDestructionAssemblyPhysicsState, id: string, piece: IFracturePiece, lifecycle: "active" | "bound" | "sleeping"): RAPIER.RigidBody {
  const offset = rotateVec3(piece.localPosition, state.rotation);
  const position = addVec3(state.position, offset);
  const rotation = multiplyQuat(state.rotation, piece.localRotation ?? [0, 0, 0, 1]);
  const velocity = pieceVelocity(state, piece);
  const desc = (lifecycle === "bound" ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic())
    .setTranslation(position[0], position[1], position[2])
    .setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] })
    .setLinvel(velocity[0], velocity[1], velocity[2])
    .setAngvel(rapierVector(state.angularVelocity));
  const body = runtime.world.createRigidBody(desc);
  const colliderDesc = fracturePieceColliderDesc(piece);
  colliderDesc.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setMass(state.mass * piece.massFraction);
  const collider = runtime.world.createCollider(colliderDesc, body);
  runtime.bodies.set(id, body);
  runtime.colliders.set(collider.handle, { child: piece.id, entity: id });
  return body;
}

function pieceVelocity(state: IDestructionAssemblyPhysicsState, piece: IFracturePiece): Vec3 {
  return addVec3(state.linearVelocity, crossVec3(state.angularVelocity, rotateVec3(piece.localPosition, state.rotation)));
}

function fracturePieceColliderDesc(piece: IFracturePiece): RAPIER.ColliderDesc {
  const collider = piece.collider;
  if (collider.kind === "box") return RAPIER.ColliderDesc.cuboid(collider.halfExtents[0], collider.halfExtents[1], collider.halfExtents[2]);
  if (collider.kind === "sphere") return RAPIER.ColliderDesc.ball(collider.radius);
  if (collider.kind === "capsule") return RAPIER.ColliderDesc.capsule(collider.halfHeight, collider.radius);
  const desc = RAPIER.ColliderDesc.convexHull(new Float32Array(collider.vertices.flatMap((vertex) => [...vertex])));
  if (desc === null) throw new Error(`Fracture piece '${piece.id}' has an invalid convex hull.`);
  return desc;
}

function retireDestructionAssembly(runtime: IRapierRuntime, assembly: string, state: IDestructionAssemblyPhysicsState): void {
  const body = runtime.bodies.get(assembly);
  if (body === undefined || state.retired) return;
  for (const handle of state.colliderHandles) runtime.colliders.delete(handle);
  runtime.world.removeRigidBody(body);
  runtime.bodies.delete(assembly);
  state.retired = true;
}

function removeDestructionBody(runtime: IRapierRuntime, id: string): void {
  const body = runtime.bodies.get(id);
  if (body === undefined) return;
  for (const [handle, owner] of runtime.colliders) if (owner.entity === id) runtime.colliders.delete(handle);
  runtime.world.removeRigidBody(body);
  runtime.bodies.delete(id);
}

function stepRapierBodies(cacheKey: IWorldIr, world: IWorldIr, fixedDelta: number, gravity: Vec3, scriptAuthoredTransforms: ReadonlySet<string>): IPhysicsJointBreakEvent[] {
  prepareRetainedPhysicsRuntime(cacheKey, world, gravity);
  const runtime = rapierWorlds.get(cacheKey);
  if (runtime === undefined) return [];
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
    const authoredVelocity = source.velocity ?? [0, 0, 0];
    const angularVelocity = source.angularVelocity ?? [0, 0, 0];
    const scriptPosedKinematic = source.kind === "kinematic" && scriptAuthoredTransforms.has(entity.id);
    const current = body.translation();
    const velocity = scriptPosedKinematic
      ? [
          (transform.position[0] - current.x) / fixedDelta,
          (transform.position[1] - current.y) / fixedDelta,
          (transform.position[2] - current.z) / fixedDelta,
        ] as Vec3
      : authoredVelocity;
    if (!scriptPosedKinematic) {
      body.setTranslation({ x: transform.position[0], y: transform.position[1], z: transform.position[2] }, false);
    }
    body.setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] }, false);
    body.setLinvel({ x: velocity[0], y: velocity[1], z: velocity[2] }, false);
    body.setAngvel({ x: angularVelocity[0], y: angularVelocity[1], z: angularVelocity[2] }, false);
  }

  const pointCommands = pendingPointCommands.get(cacheKey) ?? [];
  pendingPointCommands.delete(cacheKey);
  const jointBreaks: IPhysicsJointBreakEvent[] = [];
  runtime.contactImpulses.clear();
  beginPhysicsJointTick(runtime.joints);
  for (let step = 0; step < substeps; step += 1) {
    applyPointPhysicsCommands(runtime, pointCommands, step === 0, fixedDelta);
    preparePhysicsJointStep(runtime.joints, fixedDelta / substeps);
    rapierWorld.step(runtime.eventQueue);
    runtime.eventQueue.drainContactForceEvents((event: RAPIER.TempContactForceEvent) => {
      const handles = [event.collider1(), event.collider2()].sort((left, right) => left - right) as [number, number];
      const key = `${handles[0]}:${handles[1]}`;
      const current = runtime.contactImpulses.get(key);
      runtime.contactImpulses.set(key, { handles, impulse: (current?.impulse ?? 0) + event.totalForceMagnitude() * fixedDelta / substeps });
    });
    jointBreaks.push(...collectBrokenPhysicsJoints(runtime.joints));
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
  return jointBreaks;
}

function createRapierRuntime(world: IWorldIr, gravity: Vec3, signature: string): IRapierRuntime {
  const rapierWorld = new RAPIER.World({ x: gravity[0], y: gravity[1], z: gravity[2] });
  rapierWorld.maxCcdSubsteps = Math.max(1, ...world.entities.map((entity) => entity.components.RigidBody?.ccd?.enabled === true ? (entity.components.RigidBody.ccd.maxSubsteps ?? 1) : 1));
  const bodies = new Map<string, RAPIER.RigidBody>();
  const colliders = new Map<number, { child?: string; entity: string }>();
  const layerBits = layerBitsForWorld(world);

  for (const entity of world.entities) {
    const transform = entity.components.Transform;
    const authoredBody = entity.components.RigidBody;
    const collider = entity.components.Collider;
    const compound = entity.components.CompoundCollider;
    if (transform?.position === undefined || (collider === undefined && compound === undefined)) {
      continue;
    }
    const body = authoredBody ?? { kind: "static" as const };
    const position = transform.position;
    const rotation = transform.rotation ?? [0, 0, 0, 1];
    const desc = rigidBodyDesc(body.kind)
      .setTranslation(position[0], position[1], position[2])
      .setRotation({ x: rotation[0], y: rotation[1], z: rotation[2], w: rotation[3] })
      .setGravityScale(body.kind === "dynamic" ? (body.gravityScale ?? 1) : 0)
      .setLinearDamping(body.damping ?? 0)
      .setCanSleep(body.sleepThreshold !== 0)
      .setCcdEnabled(body.ccd?.enabled === true);
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
    const descriptors: Array<{ child?: string; desc: RAPIER.ColliderDesc | undefined; filter: IColliderComponent; friction?: number; localPosition: Vec3; localRotation?: readonly [number, number, number, number]; restitution?: number }> = collider === undefined
      ? compoundColliderDescs(compound)
      : [{ desc: colliderDescFor(collider), filter: collider, localPosition: colliderLocalCenter(collider) }];
    for (const descriptor of descriptors) {
      const colliderDesc = descriptor.desc;
      if (colliderDesc === undefined) continue;
      const filter = descriptor.filter;
      const groups = rapierCollisionGroups(filter, layerBits);
      const center = descriptor.localPosition;
      colliderDesc
        .setTranslation(center[0], center[1], center[2])
        .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
        .setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.ALL)
        .setFriction(descriptor.friction ?? (collider?.friction ?? 0))
        .setRestitution(descriptor.restitution ?? (collider?.restitution ?? 0))
        .setSensor(collider?.trigger === true || collider?.sensor !== undefined)
        .setCollisionGroups(groups)
        .setSolverGroups(groups);
      if (descriptor.localRotation !== undefined) colliderDesc.setRotation({ x: descriptor.localRotation[0], y: descriptor.localRotation[1], z: descriptor.localRotation[2], w: descriptor.localRotation[3] });
      const mass = authoredPhysicsMass(body);
      if (body.kind === "dynamic" && mass !== undefined) {
        colliderDesc.setMass(mass / descriptors.length);
      }
      const liveCollider = rapierWorld.createCollider(colliderDesc, rapierBody);
      colliders.set(liveCollider.handle, { ...(descriptor.child === undefined ? {} : { child: descriptor.child }), entity: entity.id });
    }
    bodies.set(entity.id, rapierBody);
  }

  const joints = createPhysicsJointRuntime();
  reconcilePhysicsJoints(joints, world, rapierWorld, bodies);
  return { bodies, colliders, contactImpulses: new Map(), destructionAssemblies: new Map(), eventQueue: new RAPIER.EventQueue(true), joints, physicsWorld: world, signature, world: rapierWorld };
}

function freeRapierRuntime(runtime: IRapierRuntime): void {
  runtime.eventQueue.free();
  runtime.world.free();
}

function applyPointPhysicsCommands(runtime: IRapierRuntime, commands: readonly IPointPhysicsCommand[], includeImpulses: boolean, forceDelta: number): void {
  for (const command of commands) {
    const body = runtime.bodies.get(command.entity);
    if (body === undefined || !body.isDynamic()) continue;
    if (!includeImpulses) continue;
    const value = command.kind === "force" ? scaleVec3(command.value, forceDelta) : command.value;
    body.applyImpulseAtPoint(rapierVector(value), rapierVector(command.point), true);
    const force = command.kind === "force" ? command.value : scaleVec3(command.value, 1 / forceDelta);
    recordPhysicsJointCommandLoad(runtime.joints, body, command.entity, force, command.point);
  }
}

function rapierTopologySignature(world: IWorldIr, gravity: Vec3): string {
  return JSON.stringify({
    gravity,
    entities: world.entities.map((entity) => ({
      Collider: entity.components.Collider,
      CompoundCollider: entity.components.CompoundCollider,
      RigidBody: entity.components.RigidBody === undefined ? undefined : {
        ...entity.components.RigidBody,
        angularVelocity: undefined,
        velocity: undefined,
      },
      id: entity.id,
    })),
  });
}

function compoundColliderDescs(compound: ICompoundColliderComponent | undefined): Array<{ child: string; desc: RAPIER.ColliderDesc | undefined; filter: IColliderComponent; friction?: number; localPosition: Vec3; localRotation?: readonly [number, number, number, number]; restitution?: number }> {
  return (compound?.children ?? []).map((child) => {
    const filter: IColliderComponent = { kind: "box", size: [1, 1, 1], ...(child.filter?.layer === undefined ? {} : { layer: child.filter.layer }), ...(child.filter?.mask === undefined ? {} : { mask: child.filter.mask }) };
    return {
      child: child.id,
      desc: compoundShapeDesc(child.shape),
      filter,
      ...(child.material?.friction === undefined ? {} : { friction: child.material.friction }),
      localPosition: child.localPose.position,
      ...(child.localPose.rotation === undefined ? {} : { localRotation: child.localPose.rotation }),
      ...(child.material?.restitution === undefined ? {} : { restitution: child.material.restitution }),
    };
  });
}

function compoundShapeDesc(shape: ICompoundColliderShape): RAPIER.ColliderDesc | undefined {
  if (shape.kind === "box") return RAPIER.ColliderDesc.cuboid(shape.size[0] / 2, shape.size[1] / 2, shape.size[2] / 2);
  if (shape.kind === "sphere") return RAPIER.ColliderDesc.ball(shape.radius);
  if (shape.kind === "capsule") return RAPIER.ColliderDesc.capsule(Math.max(0, shape.height / 2 - shape.radius), shape.radius);
  return RAPIER.ColliderDesc.convexHull(new Float32Array(shape.points.flatMap((point) => [...point]))) ?? undefined;
}

function liveRuntime(world: IWorldIr): IRapierRuntime | undefined {
  if (!rapierInitialized) return undefined;
  let runtime = rapierWorlds.get(world);
  if (runtime === undefined) {
    const gravity: Vec3 = [0, -9.81, 0];
    runtime = createRapierRuntime(world, gravity, rapierTopologySignature(world, gravity));
    rapierWorlds.set(world, runtime);
    rapierRebuilds.set(world, (rapierRebuilds.get(world) ?? 0) + 1);
  }
  return runtime;
}

export function observeLivePhysicsBodies(world: IWorldIr, step: number): IPhysicsBodyObservation[] {
  const runtime = liveRuntime(world);
  if (runtime === undefined) return [];
  return [...runtime.bodies.entries()].map(([entity, body]) => {
    const position = body.translation();
    const rotation = body.rotation();
    const velocity = body.linvel();
    const angularVelocity = body.angvel();
    const normalizedRotation: readonly [number, number, number, number] = [roundNumber(rotation.x), roundNumber(rotation.y), roundNumber(rotation.z), roundNumber(rotation.w)];
    return {
      angularVelocity: roundVec3([angularVelocity.x, angularVelocity.y, angularVelocity.z]),
      entity,
      position: roundVec3([position.x, position.y, position.z]),
      rotation: normalizedRotation,
      sleeping: body.isSleeping(),
      step,
      velocity: roundVec3([velocity.x, velocity.y, velocity.z]),
    };
  }).sort((left, right) => left.entity.localeCompare(right.entity));
}

export function raycastLive(world: IWorldIr, request: IScriptPhysicsRaycastRequest): IScriptPhysicsRaycastResult {
  recordPhysicsQuery(world);
  const runtime = liveRuntime(world);
  if (runtime === undefined) return { hit: false };
  const direction = normalizeVec3(request.direction);
  const ray = new RAPIER.Ray(rapierVector(request.origin), rapierVector(direction));
  let best: { collider: RAPIER.Collider; normal: RAPIER.Vector; toi: number } | undefined;
  runtime.world.forEachCollider((collider: RAPIER.Collider) => {
    if (!queryColliderMatches(world, runtime, collider.handle, request)) return;
    const hit = collider.castRayAndGetNormal(ray, request.maxDistance, true);
    if (hit !== null && (best === undefined || hit.timeOfImpact < best.toi)) best = { collider, normal: hit.normal, toi: hit.timeOfImpact };
  });
  if (best === undefined) return { hit: false };
  const owner = runtime.colliders.get(best.collider.handle);
  if (owner === undefined) return { hit: false };
  return { ...(owner.child === undefined ? {} : { child: owner.child }), distance: roundNumber(best.toi), entity: owner.entity, hit: true, normal: mutableRoundedVec3([best.normal.x, best.normal.y, best.normal.z]), point: mutableRoundedVec3(addVec3(request.origin, [direction[0] * best.toi, direction[1] * best.toi, direction[2] * best.toi])) };
}

export function shapeCastLive(world: IWorldIr, request: IScriptPhysicsShapeCastRequest): IScriptPhysicsShapeCastResult {
  recordPhysicsQuery(world);
  const runtime = liveRuntime(world);
  if (runtime === undefined) return { hit: false };
  const direction = normalizeVec3(request.direction);
  const shape = request.shape.kind === "sphere" ? new RAPIER.Ball(request.shape.radius) : new RAPIER.Cuboid(...request.shape.halfExtents);
  let best: { collider: RAPIER.Collider; hit: RAPIER.ShapeCastHit } | undefined;
  runtime.world.forEachCollider((collider: RAPIER.Collider) => {
    if (!queryColliderMatches(world, runtime, collider.handle, request)) return;
    const hit = collider.castShape({ x: 0, y: 0, z: 0 }, shape, rapierVector(request.origin), { x: 0, y: 0, z: 0, w: 1 }, rapierVector(direction), 0, request.maxDistance, true);
    if (hit !== null && (best === undefined || hit.time_of_impact < best.hit.time_of_impact)) best = { collider, hit };
  });
  if (best === undefined) return { hit: false };
  const owner = runtime.colliders.get(best.collider.handle);
  if (owner === undefined) return { hit: false };
  return { ...(owner.child === undefined ? {} : { child: owner.child }), distance: roundNumber(best.hit.time_of_impact), entity: owner.entity, hit: true, normal: mutableRoundedVec3([best.hit.normal1.x, best.hit.normal1.y, best.hit.normal1.z]), point: mutableRoundedVec3(colliderLocalPointToWorld(best.collider, best.hit.witness1)) };
}

function colliderLocalPointToWorld(collider: RAPIER.Collider, point: RAPIER.Vector): Vec3 {
  const translation = collider.translation();
  const rotation = collider.rotation();
  const [x, y, z] = rotateVectorByQuaternion(
    [point.x, point.y, point.z],
    [rotation.x, rotation.y, rotation.z, rotation.w],
  );
  return [x + translation.x, y + translation.y, z + translation.z];
}

function rotateVectorByQuaternion(
  [x, y, z]: Vec3,
  [qx, qy, qz, qw]: readonly [number, number, number, number],
): Vec3 {
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

export function applyLivePhysicsAtPoint(world: IWorldIr, entityId: string, value: readonly [number, number, number], point: readonly [number, number, number], kind: "force" | "impulse"): boolean {
  const entity = world.entities.find((candidate) => candidate.id === entityId);
  if (entity?.components.RigidBody?.kind !== "dynamic" || !validPhysicsVector(value) || !validPhysicsVector(point)) return false;
  const pending = pendingPointCommands.get(world) ?? [];
  pending.push({ entity: entityId, kind, point: [...point], value: [...value] });
  pendingPointCommands.set(world, pending);
  return true;
}

export function overlapLive(world: IWorldIr, request: IScriptPhysicsOverlapRequest): IScriptPhysicsOverlapResult {
  recordPhysicsQuery(world);
  const runtime = liveRuntime(world);
  if (runtime === undefined) return { entities: [] };
  const shape = request.shape.kind === "sphere" ? new RAPIER.Ball(request.shape.radius) : new RAPIER.Cuboid(...request.shape.halfExtents);
  const entities = new Set<string>();
  runtime.world.forEachCollider((collider: RAPIER.Collider) => {
    const owner = runtime.colliders.get(collider.handle);
    if (owner !== undefined && queryColliderMatches(world, runtime, collider.handle, request) && collider.intersectsShape(shape, rapierVector(request.position), { x: 0, y: 0, z: 0, w: 1 })) entities.add(owner.entity);
  });
  return { entities: [...entities].sort() };
}

export function queryHitObservation(result: IScriptPhysicsRaycastResult | IScriptPhysicsShapeCastResult, world: IWorldIr): IPhysicsQueryHitObservation | undefined {
  if (!result.hit) return undefined;
  return { ...(result.child === undefined ? {} : { child: result.child }), distance: result.distance, entity: result.entity, normal: result.normal, point: result.point };
}

function queryColliderMatches(world: IWorldIr, runtime: IRapierRuntime, handle: number, request: { ignore?: string[]; layer?: string; layers?: string[]; mask?: string[] }): boolean {
  const owner = runtime.colliders.get(handle);
  if (owner === undefined || request.ignore?.includes(owner.entity) === true) return false;
  const entity = runtime.physicsWorld.entities.find((candidate) => candidate.id === owner.entity);
  const collider = entity?.components.Collider;
  const child = entity?.components.CompoundCollider?.children.find((candidate) => candidate.id === owner.child);
  const layer = collider?.layer ?? child?.filter?.layer;
  const mask = collider?.mask ?? child?.filter?.mask;
  const requestedMask = new Set([...(request.mask ?? []), ...(request.layers ?? [])]);
  if (requestedMask.size > 0 && (layer === undefined || !requestedMask.has(layer))) return false;
  if (request.layer !== undefined && mask !== undefined && !mask.includes(request.layer)) return false;
  return true;
}

function validPhysicsVector(value: readonly number[]): boolean {
  return value.length === 3 && value.every(Number.isFinite);
}

function addVec3(left: readonly number[], right: readonly number[]): Vec3 {
  return [left[0]! + right[0]!, left[1]! + right[1]!, left[2]! + right[2]!];
}

function crossVec3(left: readonly number[], right: readonly number[]): Vec3 {
  return [left[1]! * right[2]! - left[2]! * right[1]!, left[2]! * right[0]! - left[0]! * right[2]!, left[0]! * right[1]! - left[1]! * right[0]!];
}

function multiplyQuat(left: readonly number[], right: readonly number[]): readonly [number, number, number, number] {
  const [lx = 0, ly = 0, lz = 0, lw = 1] = left;
  const [rx = 0, ry = 0, rz = 0, rw = 1] = right;
  return [lw * rx + lx * rw + ly * rz - lz * ry, lw * ry - lx * rz + ly * rw + lz * rx, lw * rz + lx * ry - ly * rx + lz * rw, lw * rw - lx * rx - ly * ry - lz * rz];
}

function scaleVec3(value: readonly number[], scale: number): Vec3 {
  return [value[0]! * scale, value[1]! * scale, value[2]! * scale];
}

function rapierVector(value: readonly number[]): RAPIER.Vector3 {
  return new RAPIER.Vector3(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
}

function subtractVec3(left: readonly number[], right: readonly number[]): Vec3 {
  return [left[0]! - right[0]!, left[1]! - right[1]!, left[2]! - right[2]!];
}

function normalizeVec3(value: readonly number[]): Vec3 {
  const length = Math.hypot(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0);
  return length <= 0.000001 ? [1, 0, 0] : [(value[0] ?? 0) / length, (value[1] ?? 0) / length, (value[2] ?? 0) / length];
}

function rotateVec3(value: readonly number[], rotation: readonly number[]): Vec3 {
  const [x = 0, y = 0, z = 0] = value;
  const [qx = 0, qy = 0, qz = 0, qw = 1] = rotation;
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

function inverseRotateVec3(value: readonly number[], rotation: readonly number[]): Vec3 {
  return rotateVec3(value, [-(rotation[0] ?? 0), -(rotation[1] ?? 0), -(rotation[2] ?? 0), rotation[3] ?? 1]);
}

function physicsSubsteps(fixedDelta: number): number {
  return Math.max(1, Math.ceil(fixedDelta / (1 / 120)));
}

function layerBitsForWorld(world: IWorldIr): Map<string, number> {
  const names = new Set<string>();
  for (const entity of world.entities) {
    const collider = entity.components.Collider;
    if (collider?.layer !== undefined) {
      names.add(collider.layer);
    }
    for (const name of collider?.mask ?? []) {
      names.add(name);
    }
    for (const child of entity.components.CompoundCollider?.children ?? []) {
      if (child.filter?.layer !== undefined) {
        names.add(child.filter.layer);
      }
      for (const name of child.filter?.mask ?? []) {
        names.add(name);
      }
    }
  }
  return new Map([...names].sort().slice(0, 16).map((name, index) => [name, 1 << index]));
}

function rapierCollisionGroups(collider: IColliderComponent, layerBits: ReadonlyMap<string, number>): number {
  const membership = collider.layer === undefined ? 0xffff : layerBits.get(collider.layer) ?? 0;
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
    const radius = collider.radius ?? 0.5;
    return RAPIER.ColliderDesc.capsule(Math.max(0, (collider.height ?? 1) / 2 - radius), radius);
  }
  if (collider.kind === "mesh" && collider.mesh !== undefined) {
    const [x, y, z] = collider.mesh.bounds.size;
    return RAPIER.ColliderDesc.cuboid(x / 2, y / 2, z / 2);
  }
  return undefined;
}

function authoredPhysicsMass(body: NonNullable<IWorldEntity["components"]["RigidBody"]>): number | undefined {
  if (body.mass !== undefined) {
    return body.mass;
  }
  return body.inverseMass !== undefined && body.inverseMass > 0 ? 1 / body.inverseMass : undefined;
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

export function observePhysicsJointLoads(world: IWorldIr): IPhysicsJointLoadObservation[] {
  const runtime = rapierWorlds.get(world);
  return runtime === undefined ? [] : observeJointLoads(runtime.joints);
}

export function detectPhysicsEvents(world: IWorldIr): IPhysicsEventObservation[] {
  const retainedRuntime = rapierWorlds.get(world);
  const pairs = retainedRuntime === undefined
    ? detectPairs(world.entities.flatMap((entity) => colliderBounds(entity)))
    : detectRapierPairs(retainedRuntime);
  return [...pairs.values()]
    .map((pair) => ({ event: pair.event, ...pair.payload, phase: "enter" as const }))
    .sort((left, right) => left.event.localeCompare(right.event) || comparePhysicsEvents(left, right));
}

function detectRapierPairs(runtime: IRapierRuntime): Map<string, IDetectedPair> {
  const pairs = new Map<string, IDetectedPair>();
  const colliders: RAPIER.Collider[] = [];
  runtime.world.forEachCollider((collider: RAPIER.Collider) => colliders.push(collider));
  colliders.sort((left, right) => left.handle - right.handle);
  for (let leftIndex = 0; leftIndex < colliders.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < colliders.length; rightIndex += 1) {
      const left = colliders[leftIndex];
      const right = colliders[rightIndex];
      if (left === undefined || right === undefined) continue;
      const leftOwner = runtime.colliders.get(left.handle);
      const rightOwner = runtime.colliders.get(right.handle);
      if (leftOwner === undefined || rightOwner === undefined || leftOwner.entity === rightOwner.entity) continue;
      const trigger = left.isSensor() || right.isSensor();
      let touching = trigger ? runtime.world.intersectionPair(left, right) : false;
      if (!trigger) runtime.world.contactPair(left, right, () => { touching = true; });
      if (!touching) continue;
      const ordered = orderedContactPayload(leftOwner, rightOwner);
      const event: PhysicsEventName = trigger ? "TriggerEvent" : "CollisionEvent";
      const key = pairKey(event, ordered);
      pairs.set(key, { event, key, payload: ordered });
    }
  }
  return pairs;
}

function orderedContactPayload(left: { child?: string; entity: string }, right: { child?: string; entity: string }): Omit<IPhysicsEventPayload, "phase"> {
  const [a, b] = left.entity.localeCompare(right.entity) <= 0 ? [left, right] : [right, left];
  return {
    a: a.entity,
    b: b.entity,
    ...(a.child === undefined ? {} : { childA: a.child }),
    ...(b.child === undefined ? {} : { childB: b.child }),
  };
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
    .filter((entity) => entity.components.RigidBody === undefined || entity.components.RigidBody.kind === "static" || entity.components.RigidBody.kind === "kinematic")
    .filter((entity) => entity.components.Collider !== undefined && !isSensorCollider(entity.components.Collider))
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
      if (blocker.id === entity.id || blocker.components.Collider === undefined || !passesColliderContactFilter(entity.components.Collider, blocker.components.Collider)) {
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
  transform.position = [transform.position[0], roundNumber(resolvedY - colliderLocalCenter(collider)[1]), transform.position[2]];
  const restitution = Math.max(collider.restitution ?? 0, floorCollider.restitution ?? 0);
  const friction = ((collider.friction ?? 0) + (floorCollider.friction ?? 0)) / 2;
  const velocity = body.velocity ?? [0, 0, 0];
  const nextY = velocity[1] < 0 ? -velocity[1] * restitution : velocity[1];
  const frictionFactor = Math.max(0, 1 - friction);
  body.velocity = [velocity[0] * frictionFactor, Math.abs(nextY) < 0.000001 ? 0 : nextY, velocity[2] * frictionFactor];
  return true;
}

function isSensorCollider(collider: IColliderComponent): boolean {
  return collider.trigger === true || collider.sensor !== undefined;
}

function passesColliderContactFilter(left: IColliderComponent, right: IColliderComponent): boolean {
  const leftAccepts = left.mask === undefined || left.mask.length === 0 || (right.layer !== undefined && left.mask.includes(right.layer));
  const rightAccepts = right.mask === undefined || right.mask.length === 0 || (left.layer !== undefined && right.mask.includes(left.layer));
  return leftAccepts && rightAccepts;
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
  if (collider.kind === "capsule") {
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
  return `${event}:${payload.a}:${payload.childA ?? ""}:${payload.b}:${payload.childB ?? ""}`;
}

function comparePhysicsEvents(left: IPhysicsEventPayload, right: IPhysicsEventPayload): number {
  return left.a.localeCompare(right.a)
    || (left.childA ?? "").localeCompare(right.childA ?? "")
    || left.b.localeCompare(right.b)
    || (left.childB ?? "").localeCompare(right.childB ?? "")
    || left.phase.localeCompare(right.phase);
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

function mutableRoundedVec3(value: Vec3): [number, number, number] {
  return [roundNumber(value[0]), roundNumber(value[1]), roundNumber(value[2])];
}

function roundNumber(value: number): number {
  return Number(value.toFixed(6));
}

function recordPhysicsQuery(world: IWorldIr): void { pendingPhysicsQueries.set(world, (pendingPhysicsQueries.get(world) ?? 0) + 1); }
function finiteNonnegative(value: number | undefined): number { return value === undefined || !Number.isFinite(value) || value < 0 ? 0 : value; }
