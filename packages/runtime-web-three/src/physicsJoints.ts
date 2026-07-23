import RAPIER from "@dimforge/rapier3d-compat";

import type { IWorldEntity, IWorldIr, Vec3 } from "@threenative/ir";

type IPhysicsJointComponent = NonNullable<IWorldEntity["components"]["PhysicsJoint"]>;

export interface IPhysicsJointBreakEvent {
  connectedEntity: string;
  entity: string;
  force: number;
  kind: IPhysicsJointComponent["kind"];
  phase: "break";
  torque: number;
}

export interface IPhysicsJointLoadObservation {
  active: boolean;
  connectedEntity: string;
  entity: string;
  force: number;
  kind: IPhysicsJointComponent["kind"];
  lifecycle: number;
  torque: number;
}

interface ILiveJoint {
  authored: IPhysicsJointComponent;
  joint: RAPIER.ImpulseJoint;
  lifecycle: number;
  signature: string;
}

export interface IPhysicsJointRuntime {
  brokenSignatures: Map<string, string>;
  creations: number;
  joints: Map<string, ILiveJoint>;
  nextLifecycle: number;
  observations: Map<string, IPhysicsJointLoadObservation>;
  commandLoads: Map<string, { force: number; torque: number }>;
  pendingRemoval: Set<string>;
  removals: number;
}

export function createPhysicsJointRuntime(): IPhysicsJointRuntime {
  return {
    brokenSignatures: new Map(),
    commandLoads: new Map(),
    creations: 0,
    joints: new Map(),
    nextLifecycle: 0,
    observations: new Map(),
    pendingRemoval: new Set(),
    removals: 0,
  };
}

export function reconcilePhysicsJoints(
  runtime: IPhysicsJointRuntime,
  source: IWorldIr,
  world: RAPIER.World,
  bodies: ReadonlyMap<string, RAPIER.RigidBody>,
): void {
  flushPendingRemovals(runtime, world);
  const authored = new Map(source.entities.flatMap((entity) => {
    const joint = entity.components.PhysicsJoint;
    return joint === undefined ? [] : [[entity.id, joint] as const];
  }));

  for (const [entity, live] of runtime.joints) {
    const joint = authored.get(entity);
    const signature = joint === undefined ? undefined : jointSignature(joint);
    if (signature !== live.signature || bodies.get(entity) === undefined || bodies.get(joint?.connectedEntity ?? "") === undefined) {
      removeLiveJoint(runtime, world, entity, "delete");
    }
  }

  for (const [entity, joint] of [...authored].sort(([left], [right]) => left.localeCompare(right))) {
    const signature = jointSignature(joint);
    const brokenSignature = runtime.brokenSignatures.get(entity);
    if (brokenSignature !== undefined && brokenSignature !== signature) runtime.brokenSignatures.delete(entity);
    if (runtime.joints.has(entity) || runtime.brokenSignatures.get(entity) === signature) continue;
    const body = bodies.get(entity);
    const connectedBody = bodies.get(joint.connectedEntity);
    if (body === undefined || connectedBody === undefined) continue;
    const data = createJointData(source, entity, joint);
    const liveJoint = world.createImpulseJoint(data, connectedBody, body, true);
    if (joint.kind === "suspension" && joint.motor === undefined && "configureMotorPosition" in liveJoint) {
      liveJoint.configureMotorPosition(0, joint.stiffness ?? 0, joint.damping ?? 0);
    }
    runtime.nextLifecycle += 1;
    runtime.joints.set(entity, { authored: joint, joint: liveJoint, lifecycle: runtime.nextLifecycle, signature });
    runtime.creations += 1;
  }

  for (const entity of [...runtime.brokenSignatures.keys()]) {
    if (!authored.has(entity)) runtime.brokenSignatures.delete(entity);
  }
  for (const entity of [...runtime.observations.keys()]) {
    if (!authored.has(entity) && !runtime.joints.has(entity)) runtime.observations.delete(entity);
  }
}

export function preparePhysicsJointStep(runtime: IPhysicsJointRuntime, delta: number): void {
  for (const [entity, live] of runtime.joints) {
    if (runtime.pendingRemoval.has(entity) || !live.joint.isValid()) continue;
    const loads = estimateLoads(live, delta);
    const motorLoad = applyBoundedMotor(live, delta);
    const commandLoad = runtime.commandLoads.get(entity) ?? { force: 0, torque: 0 };
    const previous = runtime.observations.get(entity);
    runtime.observations.set(entity, {
      active: true,
      connectedEntity: live.authored.connectedEntity,
      entity,
      force: round(Math.max(previous?.force ?? 0, loads.force, motorLoad.force, commandLoad.force)),
      kind: live.authored.kind,
      lifecycle: live.lifecycle,
      torque: round(Math.max(previous?.torque ?? 0, loads.torque, motorLoad.torque, commandLoad.torque)),
    });
  }
}

export function beginPhysicsJointTick(runtime: IPhysicsJointRuntime): void {
  runtime.commandLoads.clear();
  for (const [entity, observation] of runtime.observations) {
    if (runtime.joints.has(entity)) runtime.observations.set(entity, { ...observation, force: 0, torque: 0 });
  }
}

export function recordPhysicsJointCommandLoad(runtime: IPhysicsJointRuntime, body: RAPIER.RigidBody, entity: string, force: Vec3, point: readonly number[]): void {
  const arm = subtract(point, toVec(body.translation()));
  const contribution = { force: magnitude(force), torque: magnitude(cross(arm, force)) };
  for (const [jointEntity, live] of runtime.joints) {
    if (jointEntity !== entity && live.authored.connectedEntity !== entity) continue;
    const previous = runtime.commandLoads.get(jointEntity) ?? { force: 0, torque: 0 };
    runtime.commandLoads.set(jointEntity, { force: Math.max(previous.force, contribution.force), torque: Math.max(previous.torque, contribution.torque) });
  }
}

export function collectBrokenPhysicsJoints(runtime: IPhysicsJointRuntime): IPhysicsJointBreakEvent[] {
  const events: IPhysicsJointBreakEvent[] = [];
  for (const [entity, live] of runtime.joints) {
    if (runtime.pendingRemoval.has(entity)) continue;
    const observation = runtime.observations.get(entity);
    if (observation === undefined) continue;
    const broken = (live.authored.breakForce !== undefined && observation.force > live.authored.breakForce)
      || (live.authored.breakTorque !== undefined && observation.torque > live.authored.breakTorque);
    if (!broken) continue;
    runtime.pendingRemoval.add(entity);
    runtime.brokenSignatures.set(entity, live.signature);
    events.push({ connectedEntity: observation.connectedEntity, entity, force: observation.force, kind: observation.kind, phase: "break", torque: observation.torque });
  }
  return events.sort((left, right) => left.entity.localeCompare(right.entity));
}

export function flushBrokenPhysicsJoints(runtime: IPhysicsJointRuntime, world: RAPIER.World): void {
  for (const entity of [...runtime.pendingRemoval].sort()) {
    removeLiveJoint(runtime, world, entity, "active");
  }
}

export function observePhysicsJointLoads(runtime: IPhysicsJointRuntime): IPhysicsJointLoadObservation[] {
  return [...runtime.observations.values()]
    .sort((left, right) => left.entity.localeCompare(right.entity));
}

function flushPendingRemovals(runtime: IPhysicsJointRuntime, world: RAPIER.World): void {
  for (const entity of [...runtime.pendingRemoval].sort()) {
    removeLiveJoint(runtime, world, entity, "inactive");
  }
  runtime.pendingRemoval.clear();
}

function removeLiveJoint(runtime: IPhysicsJointRuntime, world: RAPIER.World, entity: string, observation: "active" | "delete" | "inactive"): void {
  const live = runtime.joints.get(entity);
  if (live !== undefined) {
    if (live.joint.isValid()) world.removeImpulseJoint(live.joint, true);
    runtime.joints.delete(entity);
    runtime.removals += 1;
  }
  const retained = runtime.observations.get(entity);
  if (observation === "inactive" && retained !== undefined) retained.active = false;
  if (observation === "delete") runtime.observations.delete(entity);
}

function createJointData(source: IWorldIr, entityId: string, joint: IPhysicsJointComponent): RAPIER.JointData {
  const entity = source.entities.find((candidate) => candidate.id === entityId);
  const connected = source.entities.find((candidate) => candidate.id === joint.connectedEntity);
  const selfPosition = entity?.components.Transform?.position ?? [0, 0, 0];
  const selfRotation = entity?.components.Transform?.rotation ?? [0, 0, 0, 1];
  const connectedPosition = connected?.components.Transform?.position ?? [0, 0, 0];
  const connectedRotation = connected?.components.Transform?.rotation ?? [0, 0, 0, 1];
  const localAnchor = joint.anchor ?? [0, 0, 0];
  const worldAnchor = add(selfPosition, rotate(localAnchor, selfRotation));
  const inferredConnectedAnchor = inverseRotate(subtract(worldAnchor, connectedPosition), connectedRotation);
  const connectedAnchor = joint.connectedAnchor ?? inferredConnectedAnchor;
  const localAxis = normalize(joint.axis ?? [1, 0, 0]);
  const connectedAxis = normalize(inverseRotate(rotate(localAxis, selfRotation), connectedRotation));
  const identity = { w: 1, x: 0, y: 0, z: 0 };
  const data = joint.kind === "hinge"
    ? RAPIER.JointData.revolute(vector(connectedAnchor), vector(localAnchor), vector(connectedAxis))
    : joint.kind === "slider" || joint.kind === "suspension"
      ? RAPIER.JointData.prismatic(vector(connectedAnchor), vector(localAnchor), vector(connectedAxis))
      : joint.kind === "fixed"
        ? RAPIER.JointData.fixed(vector(connectedAnchor), joint.connectedRotation === undefined ? identity : rotation(joint.connectedRotation), vector(localAnchor), joint.rotation === undefined ? identity : rotation(joint.rotation))
        : joint.kind === "ball"
          ? RAPIER.JointData.spherical(vector(connectedAnchor), vector(localAnchor))
          : RAPIER.JointData.rope(joint.length ?? 0, vector(connectedAnchor), vector(localAnchor));
  const limits = joint.limits ?? (joint.kind === "suspension" && joint.travel !== undefined ? { max: joint.travel, min: -joint.travel } : undefined);
  if (limits !== undefined) {
    data.limitsEnabled = true;
    data.limits = [limits.min, limits.max];
  }
  return data;
}

function estimateLoads(live: ILiveJoint, delta: number): { force: number; torque: number } {
  const first = live.joint.body1();
  const second = live.joint.body2();
  const anchor1 = worldPoint(first, live.joint.anchor1());
  const anchor2 = worldPoint(second, live.joint.anchor2());
  const separation = subtract(anchor2.position, anchor1.position);
  const relativeVelocity = subtract(anchor2.velocity, anchor1.velocity);
  const axis = worldAxis(second, live.authored.axis ?? [1, 0, 0]);
  const along = dot(separation, axis);
  const alongVelocity = dot(relativeVelocity, axis);
  let constrainedError = separation;
  let constrainedVelocity = relativeVelocity;
  if (live.authored.kind === "rope") {
    const distance = magnitude(separation);
    const excess = Math.max(0, distance - (live.authored.length ?? 0));
    constrainedError = scale(normalize(separation), excess);
    constrainedVelocity = scale(normalize(separation), Math.max(0, dot(relativeVelocity, normalize(separation))));
  } else if (live.authored.kind === "slider" || live.authored.kind === "suspension") {
    const limits = live.authored.limits ?? (live.authored.travel === undefined ? undefined : { min: -live.authored.travel, max: live.authored.travel });
    const limitError = limits === undefined ? 0 : along < limits.min ? along - limits.min : along > limits.max ? along - limits.max : 0;
    constrainedError = add(subtract(separation, scale(axis, along)), scale(axis, limitError));
    constrainedVelocity = subtract(relativeVelocity, scale(axis, limits === undefined || limitError === 0 ? alongVelocity : 0));
  }
  const effectiveMass = inverseOrZero(first.invMass() + second.invMass());
  const force = effectiveMass * magnitude(add(constrainedVelocity, scale(constrainedError, inverseOrZero(delta)))) * inverseOrZero(delta);
  const relativeAngularVelocity = subtract(toVec(second.angvel()), toVec(first.angvel()));
  const constrainedAngularVelocity = live.authored.kind === "hinge"
    ? subtract(relativeAngularVelocity, scale(axis, dot(relativeAngularVelocity, axis)))
    : live.authored.kind === "ball" || live.authored.kind === "rope" ? [0, 0, 0] as Vec3 : relativeAngularVelocity;
  const torque = effectiveMass * magnitude(constrainedAngularVelocity) * inverseOrZero(delta);
  return { force: finite(force), torque: finite(torque) };
}

function applyBoundedMotor(live: ILiveJoint, delta: number): { force: number; torque: number } {
  const motor = live.authored.motor;
  if (motor === undefined) return { force: 0, torque: 0 };
  const first = live.joint.body1();
  const second = live.joint.body2();
  const axis = worldAxis(second, live.authored.axis ?? [1, 0, 0]);
  if (live.authored.kind === "hinge") {
    const velocity = dot(subtract(toVec(second.angvel()), toVec(first.angvel())), axis);
    const position = signedTwist(first.rotation(), second.rotation(), axis);
    const requested = motor.mode === "velocity"
      ? (motor.target - velocity) * (motor.damping ?? 1)
      : (motor.target - position) * (motor.stiffness ?? 0) - velocity * (motor.damping ?? 0);
    const torque = clampMagnitude(requested, motor.maxTorque ?? 0);
    applyTorquePair(first, second, scale(axis, torque * delta));
    return { force: 0, torque: Math.abs(torque) };
  }
  const anchor1 = worldPoint(first, live.joint.anchor1());
  const anchor2 = worldPoint(second, live.joint.anchor2());
  const position = dot(subtract(anchor2.position, anchor1.position), axis);
  const velocity = dot(subtract(anchor2.velocity, anchor1.velocity), axis);
  const requested = motor.mode === "velocity"
    ? (motor.target - velocity) * (motor.damping ?? 1)
    : (motor.target - position) * (motor.stiffness ?? 0) - velocity * (motor.damping ?? 0);
  const force = clampMagnitude(requested, motor.maxForce ?? 0);
  applyImpulsePair(first, second, scale(axis, force * delta));
  return { force: Math.abs(force), torque: 0 };
}

function applyImpulsePair(first: RAPIER.RigidBody, second: RAPIER.RigidBody, impulse: Vec3): void {
  if (first.isDynamic()) first.applyImpulse(vector(scale(impulse, -1)), true);
  if (second.isDynamic()) second.applyImpulse(vector(impulse), true);
}

function applyTorquePair(first: RAPIER.RigidBody, second: RAPIER.RigidBody, impulse: Vec3): void {
  if (first.isDynamic()) first.applyTorqueImpulse(vector(scale(impulse, -1)), true);
  if (second.isDynamic()) second.applyTorqueImpulse(vector(impulse), true);
}

function worldPoint(body: RAPIER.RigidBody, local: RAPIER.Vector): { position: Vec3; velocity: Vec3 } {
  const offset = rotate(toVec(local), toQuat(body.rotation()));
  return {
    position: add(toVec(body.translation()), offset),
    velocity: add(toVec(body.linvel()), cross(toVec(body.angvel()), offset)),
  };
}

function worldAxis(body: RAPIER.RigidBody, localAxis: readonly number[]): Vec3 {
  return normalize(rotate(localAxis, toQuat(body.rotation())));
}

function signedTwist(first: RAPIER.Rotation, second: RAPIER.Rotation, worldAxisValue: Vec3): number {
  const firstQuat = toQuat(first);
  const secondQuat = toQuat(second);
  const relative = multiplyQuaternion(conjugateQuaternion(firstQuat), secondQuat);
  const localAxis = inverseRotate(worldAxisValue, firstQuat);
  return normalizeAngle(2 * Math.atan2(dot(relative, localAxis), relative[3]));
}

function jointSignature(joint: IPhysicsJointComponent): string { return JSON.stringify(joint); }
function vector(value: readonly number[]): RAPIER.Vector3 { return { x: value[0] ?? 0, y: value[1] ?? 0, z: value[2] ?? 0 }; }
function rotation(value: readonly number[]): RAPIER.Rotation { return { x: value[0] ?? 0, y: value[1] ?? 0, z: value[2] ?? 0, w: value[3] ?? 1 }; }
function toVec(value: RAPIER.Vector): Vec3 { return [value.x, value.y, value.z]; }
function toQuat(value: RAPIER.Rotation): readonly [number, number, number, number] { return [value.x, value.y, value.z, value.w]; }
function add(left: readonly number[], right: readonly number[]): Vec3 { return [(left[0] ?? 0) + (right[0] ?? 0), (left[1] ?? 0) + (right[1] ?? 0), (left[2] ?? 0) + (right[2] ?? 0)]; }
function subtract(left: readonly number[], right: readonly number[]): Vec3 { return [(left[0] ?? 0) - (right[0] ?? 0), (left[1] ?? 0) - (right[1] ?? 0), (left[2] ?? 0) - (right[2] ?? 0)]; }
function scale(value: readonly number[], factor: number): Vec3 { return [(value[0] ?? 0) * factor, (value[1] ?? 0) * factor, (value[2] ?? 0) * factor]; }
function dot(left: readonly number[], right: readonly number[]): number { return (left[0] ?? 0) * (right[0] ?? 0) + (left[1] ?? 0) * (right[1] ?? 0) + (left[2] ?? 0) * (right[2] ?? 0); }
function cross(left: readonly number[], right: readonly number[]): Vec3 { return [(left[1] ?? 0) * (right[2] ?? 0) - (left[2] ?? 0) * (right[1] ?? 0), (left[2] ?? 0) * (right[0] ?? 0) - (left[0] ?? 0) * (right[2] ?? 0), (left[0] ?? 0) * (right[1] ?? 0) - (left[1] ?? 0) * (right[0] ?? 0)]; }
function magnitude(value: readonly number[]): number { return Math.hypot(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0); }
function normalize(value: readonly number[]): Vec3 { const length = magnitude(value); return length === 0 ? [1, 0, 0] : scale(value, 1 / length); }
function inverseRotate(value: readonly number[], quaternion: readonly number[]): Vec3 { return rotate(value, [-(quaternion[0] ?? 0), -(quaternion[1] ?? 0), -(quaternion[2] ?? 0), quaternion[3] ?? 1]); }
function rotate(value: readonly number[], quaternion: readonly number[]): Vec3 {
  const vectorPart: Vec3 = [quaternion[0] ?? 0, quaternion[1] ?? 0, quaternion[2] ?? 0];
  const twiceCross = scale(cross(vectorPart, value), 2);
  return add(value, add(scale(twiceCross, quaternion[3] ?? 1), cross(vectorPart, twiceCross)));
}
function conjugateQuaternion(value: readonly number[]): readonly [number, number, number, number] { return [-(value[0] ?? 0), -(value[1] ?? 0), -(value[2] ?? 0), value[3] ?? 1]; }
function multiplyQuaternion(left: readonly number[], right: readonly number[]): readonly [number, number, number, number] {
  const [lx, ly, lz, lw] = [left[0] ?? 0, left[1] ?? 0, left[2] ?? 0, left[3] ?? 1];
  const [rx, ry, rz, rw] = [right[0] ?? 0, right[1] ?? 0, right[2] ?? 0, right[3] ?? 1];
  return [lw * rx + lx * rw + ly * rz - lz * ry, lw * ry - lx * rz + ly * rw + lz * rx, lw * rz + lx * ry - ly * rx + lz * rw, lw * rw - lx * rx - ly * ry - lz * rz];
}
function normalizeAngle(value: number): number { return Math.atan2(Math.sin(value), Math.cos(value)); }
function clampMagnitude(value: number, limit: number): number { return Math.max(-limit, Math.min(limit, value)); }
function inverseOrZero(value: number): number { return value === 0 ? 0 : 1 / value; }
function finite(value: number): number { return Number.isFinite(value) ? value : 0; }
function round(value: number): number { return Number(value.toFixed(6)); }
