import type { IWorldIr } from "./types.js";
import type { IInputIr } from "./input.js";
import type { IIrDiagnostic } from "./validate.js";
import {
  isRecord,
  validateBooleanVec3,
  validateFiniteRange,
  validateFiniteVec3,
  validateFiniteVec3Range,
  validateIntegerRange,
  validatePositiveFinite,
  validatePositiveVec3,
} from "./validationPrimitives.js";

const V9_MAX_PHYSICS_DAMPING = 1000;
const V9_MAX_PHYSICS_GRAVITY_SCALE = 100;
const V9_MAX_PHYSICS_MASS = 1_000_000;
const V9_MAX_PHYSICS_SLEEP_THRESHOLD = 100;
const V9_MAX_PHYSICS_SOLVER_ITERATIONS = 64;
const V9_MAX_PHYSICS_SPEED = 10_000;
const V9_MAX_PHYSICS_FRICTION = 10;
const V9_MAX_PHYSICS_FILTER_ENTRIES = 32;
const V9_MAX_SENSOR_OCCUPANTS = 128;
const V9_MAX_CHARACTER_PUSH_MASS = 1_000_000;
const V9_MAX_CHARACTER_PUSH_IMPULSE = 1000;
const PORTABLE_FILTER_NAME = /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/;

export function validatePhysicsComponents(entity: IWorldIr["entities"][number], path: string, entityIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
  const collider = entity.components.Collider as unknown;
  const body = entity.components.RigidBody as unknown;
  const joint = entity.components.PhysicsJoint as unknown;
  if (collider === undefined && body === undefined && joint === undefined) {
    return;
  }
  if (collider !== undefined && !isRecord(collider)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COLLIDER_INVALID",
      message: `Collider '${entity.id}' must be an object.`,
      path: `${path}/components/Collider`,
    });
  }
  if (body !== undefined && !isRecord(body)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVALID",
      message: `RigidBody '${entity.id}' must be an object.`,
      path: `${path}/components/RigidBody`,
    });
  }
  if (joint !== undefined && !isRecord(joint)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_JOINT_INVALID",
      message: `PhysicsJoint '${entity.id}' must be an object.`,
      path: `${path}/components/PhysicsJoint`,
      severity: "error",
    });
  }

  const colliderRecord = isRecord(collider) ? collider : undefined;
  const bodyRecord = isRecord(body) ? body : undefined;
  const jointRecord = isRecord(joint) ? joint : undefined;

  if (colliderRecord !== undefined) {
    if (!["box", "capsule", "mesh", "sphere"].includes(colliderRecord.kind as string)) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_COLLIDER_UNSUPPORTED",
        message: `Collider '${entity.id}' uses unsupported shape '${String(colliderRecord.kind)}'.`,
        path: `${path}/components/Collider/kind`,
        suggestion: "Use a V6 portable collider shape: box, sphere, capsule, or static mesh.",
      });
    }
    if (hasEnginePhysicsHandle(colliderRecord)) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED",
        message: "Collider must not expose backend-specific physics handles.",
        path: `${path}/components/Collider`,
        suggestion: "Use portable Collider.layer and Collider.mask filter metadata instead of Rapier, Bevy, or native physics handles.",
      });
    }
    validateUnsupportedColliderContactFields(colliderRecord, `${path}/components/Collider`, diagnostics);
    validatePhysicsFilter(colliderRecord, `${path}/components/Collider`, diagnostics);
    validatePhysicsContact(colliderRecord.contact, `${path}/components/Collider/contact`, diagnostics);
    if (colliderRecord.center !== undefined) {
      validateFiniteVec3(colliderRecord.center, `${path}/components/Collider/center`, "TN_IR_PHYSICS_COLLIDER_CENTER_INVALID", diagnostics);
    }
    if (colliderRecord.trigger !== undefined && typeof colliderRecord.trigger !== "boolean") {
      diagnostics.push({
        code: "TN_IR_PHYSICS_TRIGGER_INVALID",
        message: `Collider trigger flag for '${entity.id}' must be boolean.`,
        path: `${path}/components/Collider/trigger`,
      });
    }
    validatePhysicsSensor(colliderRecord.sensor, colliderRecord.kind, `${path}/components/Collider/sensor`, diagnostics);
    if (colliderRecord.friction !== undefined) {
      validateFiniteRange(colliderRecord.friction, 0, V9_MAX_PHYSICS_FRICTION, `${path}/components/Collider/friction`, "TN_IR_PHYSICS_COLLIDER_FRICTION_INVALID", diagnostics);
    }
    if (colliderRecord.restitution !== undefined) {
      validateFiniteRange(colliderRecord.restitution, 0, 1, `${path}/components/Collider/restitution`, "TN_IR_PHYSICS_COLLIDER_RESTITUTION_INVALID", diagnostics);
    }
    if (colliderRecord.kind === "box") {
      validatePositiveVec3(colliderRecord.size, `${path}/components/Collider/size`, "TN_IR_PHYSICS_COLLIDER_SIZE_INVALID", diagnostics);
      validateColliderSlope(colliderRecord.slope, `${path}/components/Collider/slope`, diagnostics);
    } else if (colliderRecord.slope !== undefined) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_COLLIDER_SLOPE_UNSUPPORTED",
        message: "Collider.slope is supported only for box colliders.",
        path: `${path}/components/Collider/slope`,
      });
    }
    if (colliderRecord.kind === "sphere") {
      validatePositiveFinite(colliderRecord.radius, `${path}/components/Collider/radius`, "TN_IR_PHYSICS_COLLIDER_RADIUS_INVALID", diagnostics);
    }
    if (colliderRecord.kind === "capsule") {
      validatePositiveFinite(colliderRecord.radius, `${path}/components/Collider/radius`, "TN_IR_PHYSICS_COLLIDER_RADIUS_INVALID", diagnostics);
      validatePositiveFinite(colliderRecord.height, `${path}/components/Collider/height`, "TN_IR_PHYSICS_COLLIDER_HEIGHT_INVALID", diagnostics);
      validateCharacterCapsuleCenter(entity, colliderRecord, `${path}/components/Collider`, diagnostics);
    }
    if (colliderRecord.kind === "mesh" && colliderRecord.trigger === true) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_MESH_TRIGGER_UNSUPPORTED",
        message: "Mesh trigger colliders are not supported in the portable physics contract.",
        path: `${path}/components/Collider/kind`,
        suggestion: "Use a primitive trigger collider or a static mesh collider without trigger semantics.",
      });
    }
    if (colliderRecord.kind === "mesh") {
      validateMeshColliderMetadata(colliderRecord.mesh, `${path}/components/Collider/mesh`, diagnostics);
    } else if (colliderRecord.mesh !== undefined) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_MESH_COLLIDER_INVALID",
        message: "Collider.mesh metadata is supported only when Collider.kind is mesh.",
        path: `${path}/components/Collider/mesh`,
        severity: "error",
        suggestion: "Set Collider.kind to mesh or remove Collider.mesh metadata.",
      });
    }
  }
  if (bodyRecord !== undefined && !["dynamic", "kinematic", "static"].includes(bodyRecord.kind as string)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_UNSUPPORTED",
      message: `RigidBody '${entity.id}' uses unsupported body kind '${String(bodyRecord.kind)}'.`,
      path: `${path}/components/RigidBody/kind`,
    });
  }
  if (bodyRecord !== undefined && hasEnginePhysicsHandle(bodyRecord)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED",
      message: "RigidBody must not expose backend-specific physics handles.",
      path: `${path}/components/RigidBody`,
      suggestion: "Use portable body and query metadata instead of Rapier, Bevy, or native physics handles.",
    });
  }
  if (bodyRecord !== undefined) {
    validateUnsupportedPhysicsSolverFields(bodyRecord, `${path}/components/RigidBody`, diagnostics);
    validateCcd(bodyRecord.ccd, `${path}/components/RigidBody/ccd`, diagnostics);
  }
  if (bodyRecord?.mass !== undefined) {
    validateFiniteRange(bodyRecord.mass, Number.MIN_VALUE, V9_MAX_PHYSICS_MASS, `${path}/components/RigidBody/mass`, "TN_IR_PHYSICS_BODY_MASS_INVALID", diagnostics);
  }
  if (bodyRecord?.damping !== undefined) {
    validateFiniteRange(bodyRecord.damping, 0, V9_MAX_PHYSICS_DAMPING, `${path}/components/RigidBody/damping`, "TN_IR_PHYSICS_BODY_DAMPING_INVALID", diagnostics);
  }
  if (bodyRecord?.gravityScale !== undefined) {
    validateFiniteRange(bodyRecord.gravityScale, -V9_MAX_PHYSICS_GRAVITY_SCALE, V9_MAX_PHYSICS_GRAVITY_SCALE, `${path}/components/RigidBody/gravityScale`, "TN_IR_PHYSICS_BODY_GRAVITY_SCALE_INVALID", diagnostics);
  }
  if (bodyRecord?.velocity !== undefined) {
    validateFiniteVec3Range(bodyRecord.velocity, -V9_MAX_PHYSICS_SPEED, V9_MAX_PHYSICS_SPEED, `${path}/components/RigidBody/velocity`, "TN_IR_PHYSICS_BODY_VELOCITY_INVALID", diagnostics);
  }
  if (bodyRecord?.angularVelocity !== undefined) {
    validateFiniteVec3Range(bodyRecord.angularVelocity, -V9_MAX_PHYSICS_SPEED, V9_MAX_PHYSICS_SPEED, `${path}/components/RigidBody/angularVelocity`, "TN_IR_PHYSICS_BODY_ANGULAR_VELOCITY_INVALID", diagnostics);
  }
  if (bodyRecord?.enabledTranslations !== undefined) {
    validateBooleanVec3(bodyRecord.enabledTranslations, `${path}/components/RigidBody/enabledTranslations`, "TN_IR_PHYSICS_BODY_ENABLED_TRANSLATIONS_INVALID", diagnostics);
  }
  if (bodyRecord?.enabledRotations !== undefined) {
    validateBooleanVec3(bodyRecord.enabledRotations, `${path}/components/RigidBody/enabledRotations`, "TN_IR_PHYSICS_BODY_ENABLED_ROTATIONS_INVALID", diagnostics);
  }
  if (bodyRecord?.sleepThreshold !== undefined) {
    validateFiniteRange(bodyRecord.sleepThreshold, 0, V9_MAX_PHYSICS_SLEEP_THRESHOLD, `${path}/components/RigidBody/sleepThreshold`, "TN_IR_PHYSICS_BODY_SLEEP_THRESHOLD_INVALID", diagnostics);
  }
  if (bodyRecord?.solverIterations !== undefined) {
    validateIntegerRange(bodyRecord.solverIterations, 1, V9_MAX_PHYSICS_SOLVER_ITERATIONS, `${path}/components/RigidBody/solverIterations`, "TN_IR_PHYSICS_BODY_SOLVER_ITERATIONS_INVALID", diagnostics);
  }
  if (bodyRecord?.inverseMass !== undefined) {
    validateInverseMass(bodyRecord, `${path}/components/RigidBody`, diagnostics);
  }
  if (colliderRecord?.kind === "mesh" && bodyRecord?.kind !== undefined && bodyRecord.kind !== "static" && colliderRecord.mesh === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID",
      message: "Dynamic and kinematic mesh colliders require explicit bounded Collider.mesh metadata.",
      path: `${path}/components/Collider/mesh`,
      severity: "error",
      suggestion: "Author Collider.mesh.bounds and Collider.mesh.triangleCount so adapters can use deterministic bounded AABB behavior.",
    });
  }
  if (bodyRecord !== undefined && collider === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COLLIDER_MISSING",
      message: `RigidBody '${entity.id}' must have a Collider in the V6 portable physics contract.`,
      path: `${path}/components/Collider`,
    });
  }
  if (jointRecord !== undefined) {
    validatePhysicsJoint(jointRecord, `${path}/components/PhysicsJoint`, entity.id, entityIds, diagnostics);
  }
}

function validateCharacterCapsuleCenter(entity: IWorldIr["entities"][number], collider: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (entity.components.CharacterController === undefined) {
    return;
  }
  const height = collider.height;
  const radius = collider.radius;
  if (typeof height !== "number" || !Number.isFinite(height) || typeof radius !== "number" || !Number.isFinite(radius)) {
    return;
  }
  if (height / 2 <= radius) {
    return;
  }
  if (collider.center === undefined || !isZeroVec3(collider.center)) {
    return;
  }
  diagnostics.push({
    code: "TN_PHYSICS_CAPSULE_CENTER_SUSPECT",
    message: "CharacterController capsules authored at feet origin should set Collider.center to half the capsule height.",
    path: `${path}/center`,
    severity: "warning",
    suggestion: `Set Collider.center to [0, ${height / 2}, 0] when the Transform position represents the character feet.`,
  });
}

function isZeroVec3(value: unknown): boolean {
  return Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry) && Math.abs(entry) <= 0.000001);
}

function validateMeshColliderMetadata(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_MESH_COLLIDER_INVALID",
      message: "Mesh colliders require Collider.mesh metadata with bounds and triangleCount.",
      path,
      severity: "error",
      suggestion: "Provide bounds.size, optional bounds.center, source asset id, and a bounded triangleCount.",
    });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["bounds", "source", "triangleCount"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_MESH_COLLIDER_FIELD_UNSUPPORTED", message: `Collider.mesh uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (value.source !== undefined && (typeof value.source !== "string" || value.source.trim() === "")) {
    diagnostics.push({ code: "TN_IR_PHYSICS_MESH_COLLIDER_INVALID", message: "Collider.mesh.source must be a non-empty asset id when authored.", path: `${path}/source`, severity: "error" });
  }
  validateIntegerRange(value.triangleCount, 1, 10000, `${path}/triangleCount`, "TN_IR_PHYSICS_MESH_COLLIDER_TRIANGLE_COUNT_INVALID", diagnostics);
  if (!isRecord(value.bounds)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_MESH_COLLIDER_BOUNDS_INVALID", message: "Collider.mesh.bounds must be an object.", path: `${path}/bounds`, severity: "error" });
    return;
  }
  validatePositiveVec3(value.bounds.size, `${path}/bounds/size`, "TN_IR_PHYSICS_MESH_COLLIDER_BOUNDS_INVALID", diagnostics);
  if (value.bounds.center !== undefined) {
    validateFiniteVec3(value.bounds.center, `${path}/bounds/center`, "TN_IR_PHYSICS_MESH_COLLIDER_BOUNDS_INVALID", diagnostics);
  }
}

function validateCcd(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_CCD_INVALID", message: "RigidBody.ccd must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["enabled", "maxSubsteps", "mode"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_CCD_FIELD_UNSUPPORTED", message: `RigidBody.ccd uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.enabled !== "boolean") {
    diagnostics.push({ code: "TN_IR_PHYSICS_CCD_INVALID", message: "RigidBody.ccd.enabled must be boolean.", path: `${path}/enabled`, severity: "error" });
  }
  if (value.mode !== "linear" && value.mode !== "swept-aabb") {
    diagnostics.push({ code: "TN_IR_PHYSICS_CCD_INVALID", message: "RigidBody.ccd.mode must be linear or swept-aabb.", path: `${path}/mode`, severity: "error" });
  }
  if (value.maxSubsteps !== undefined) {
    validateIntegerRange(value.maxSubsteps, 1, 16, `${path}/maxSubsteps`, "TN_IR_PHYSICS_CCD_SUBSTEPS_INVALID", diagnostics);
  }
}

function validatePhysicsJoint(joint: Record<string, unknown>, path: string, entityId: string, entityIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
  for (const key of Object.keys(joint)) {
    if (!["anchor", "axis", "connectedEntity", "damping", "kind", "limits", "stiffness", "travel"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_FIELD_UNSUPPORTED", message: `PhysicsJoint uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (!["hinge", "slider", "suspension"].includes(joint.kind as string)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_UNSUPPORTED", message: "PhysicsJoint.kind must be hinge, slider, or suspension.", path: `${path}/kind`, severity: "error" });
  }
  if (typeof joint.connectedEntity !== "string" || joint.connectedEntity.trim() === "" || joint.connectedEntity === entityId || !entityIds.has(joint.connectedEntity)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_JOINT_TARGET_INVALID",
      message: "PhysicsJoint.connectedEntity must reference a different existing entity.",
      path: `${path}/connectedEntity`,
      severity: "error",
      suggestion: "Connect suspension, hinge, or slider joints to another rigid-body entity in the same world.",
    });
  }
  if (joint.anchor !== undefined) {
    validateFiniteVec3(joint.anchor, `${path}/anchor`, "TN_IR_PHYSICS_JOINT_INVALID", diagnostics);
  }
  if (joint.axis !== undefined) {
    validateFiniteVec3(joint.axis, `${path}/axis`, "TN_IR_PHYSICS_JOINT_INVALID", diagnostics);
  }
  for (const key of ["damping", "stiffness", "travel"]) {
    const value = joint[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_INVALID", message: `PhysicsJoint.${key} must be a non-negative finite number.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (joint.limits !== undefined) {
    if (!isRecord(joint.limits) || typeof joint.limits.min !== "number" || typeof joint.limits.max !== "number" || !Number.isFinite(joint.limits.min) || !Number.isFinite(joint.limits.max) || joint.limits.min > joint.limits.max) {
      diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_LIMITS_INVALID", message: "PhysicsJoint.limits must have finite min <= max.", path: `${path}/limits`, severity: "error" });
    }
  }
}

function validatePhysicsSensor(value: unknown, colliderKind: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (colliderKind === "mesh") {
    diagnostics.push({
      code: "TN_IR_PHYSICS_SENSOR_MESH_UNSUPPORTED",
      message: "Mesh sensor colliders are not supported in the V9 portable broad sensor contract.",
      path,
      severity: "error",
      suggestion: "Use a primitive box, sphere, or capsule sensor volume.",
    });
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_INVALID", message: "Collider.sensor must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["interactionKind", "occupantLimit", "phases", "trackOccupants"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_FIELD_UNSUPPORTED", message: `Collider.sensor uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (value.interactionKind !== undefined && !["checkpoint", "hazard", "pickup", "prompt", "zone"].includes(value.interactionKind as string)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_INVALID", message: "Collider.sensor.interactionKind must be checkpoint, hazard, pickup, prompt, or zone.", path: `${path}/interactionKind`, severity: "error" });
  }
  if (value.occupantLimit !== undefined) {
    validateIntegerRange(value.occupantLimit, 1, V9_MAX_SENSOR_OCCUPANTS, `${path}/occupantLimit`, "TN_IR_PHYSICS_SENSOR_OCCUPANT_LIMIT_INVALID", diagnostics);
  }
  if (value.trackOccupants !== undefined && typeof value.trackOccupants !== "boolean") {
    diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_INVALID", message: "Collider.sensor.trackOccupants must be boolean.", path: `${path}/trackOccupants`, severity: "error" });
  }
  if (value.phases !== undefined) {
    if (!Array.isArray(value.phases) || value.phases.length === 0 || value.phases.some((phase) => !["enter", "stay", "exit"].includes(phase as string))) {
      diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_PHASES_INVALID", message: "Collider.sensor.phases must be a non-empty array containing enter, stay, or exit.", path: `${path}/phases`, severity: "error" });
    }
  }
}

function validateUnsupportedPhysicsSolverFields(body: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const key of ["constraint", "constraints", "joint", "joints", "randomSeed", "solverRandomSeed", "nondeterministic", "backendSolver"] as const) {
    if (body[key] !== undefined) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED",
        message: `RigidBody uses unsupported solver field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use portable primitive body metadata only; joints, constraints, backend solvers, and nondeterministic settings are deferred.",
      });
    }
  }
}

function validateInverseMass(body: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  const value = body.inverseMass;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > V9_MAX_PHYSICS_MASS) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: `RigidBody.inverseMass must be a finite number from 0 to ${V9_MAX_PHYSICS_MASS}.`,
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Use 0 for static or kinematic bodies, or a positive reciprocal of mass for dynamic primitive bodies.",
    });
    return;
  }
  if (body.kind !== "dynamic" && value !== 0) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: "RigidBody.inverseMass must be 0 for static and kinematic bodies.",
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Set inverseMass to 0 or omit it for non-dynamic bodies.",
    });
  }
  if (body.kind === "dynamic" && value <= 0) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: "Dynamic RigidBody.inverseMass must be greater than 0.",
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Use a positive reciprocal of mass for dynamic primitive bodies.",
    });
  }
  if (typeof body.mass === "number" && Number.isFinite(body.mass) && Math.abs(value - 1 / body.mass) > 0.000001) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: "RigidBody.inverseMass must match 1 / RigidBody.mass when both are authored.",
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Omit inverseMass and let adapters derive it, or set it to the reciprocal of mass.",
    });
  }
}

function validateColliderSlope(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: "Collider.slope must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["axis", "direction", "rise", "run"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_FIELD_UNSUPPORTED", message: `Collider.slope uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (value.axis !== "x" && value.axis !== "z") {
    diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: "Collider.slope.axis must be x or z.", path: `${path}/axis` });
  }
  if (value.direction !== -1 && value.direction !== 1) {
    diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: "Collider.slope.direction must be -1 or 1.", path: `${path}/direction` });
  }
  for (const key of ["rise", "run"]) {
    const item = value[key];
    if (typeof item !== "number" || !Number.isFinite(item) || item <= 0) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: `Collider.slope.${key} must be a positive finite number.`, path: `${path}/${key}` });
    }
  }
}

function hasEnginePhysicsHandle(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => /(?:rapier|bevy|native|engine).*(?:handle|body|collider)|(?:handle|rawHandle)$/i.test(key));
}

function validatePhysicsFilter(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value.layer !== undefined && (typeof value.layer !== "string" || !PORTABLE_FILTER_NAME.test(value.layer))) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_FILTER_INVALID",
      message: "Collider.layer must be a portable filter layer string.",
      path: `${path}/layer`,
      suggestion: "Use a stable gameplay layer name such as 'world', 'player', or 'sensor'.",
    });
  }
  if (value.mask !== undefined) {
    if (!Array.isArray(value.mask) || value.mask.length > V9_MAX_PHYSICS_FILTER_ENTRIES || value.mask.some((entry) => typeof entry !== "string" || !PORTABLE_FILTER_NAME.test(entry))) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_FILTER_INVALID",
        message: "Collider.mask must be an array of portable filter layer strings.",
        path: `${path}/mask`,
        suggestion: "Use stable gameplay layer names and keep backend bitmasks adapter-private.",
      });
    }
  }
  if (value.material !== undefined && (typeof value.material !== "string" || !PORTABLE_FILTER_NAME.test(value.material))) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_FILTER_INVALID",
      message: "Collider.material must be a portable contact material string.",
      path: `${path}/material`,
      suggestion: "Use stable gameplay material names such as 'stone', 'ice', or 'bounce'.",
    });
  }
}

function validatePhysicsContact(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_CONTACT_INVALID", message: "Collider.contact must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["phases"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_CONTACT_FIELD_UNSUPPORTED",
        message: `Collider.contact uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use Collider.contact.phases only; contact payload order and shape are fixed by the portable contract.",
      });
    }
  }
  if (value.phases !== undefined && (!Array.isArray(value.phases) || value.phases.length === 0 || value.phases.some((phase) => !["begin", "stay", "end"].includes(phase as string)))) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_CONTACT_PHASES_INVALID",
      message: "Collider.contact.phases must be a non-empty array containing begin, stay, or end.",
      path: `${path}/phases`,
      severity: "error",
    });
  }
}

function validateUnsupportedColliderContactFields(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const key of [
    "backendCallback",
    "bevyCollisionGroups",
    "collisionGroup",
    "collisionGroups",
    "collisionMask",
    "contactCallback",
    "contactGroups",
    "filterCallback",
    "groupBits",
    "maskBits",
    "onCollision",
    "onContact",
    "onTrigger",
    "rapierCollisionGroups",
  ] as const) {
    if (value[key] !== undefined) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_CONTACT_FIELD_UNSUPPORTED",
        message: `Collider uses unsupported contact/filter field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use portable Collider.layer, Collider.mask, Collider.material, and Collider.contact.phases. Backend bitsets and callbacks remain adapter-private.",
      });
    }
  }
}

export function validateCharacterComponents(
  entity: IWorldIr["entities"][number],
  path: string,
  input: IInputIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  const controller = entity.components.CharacterController as unknown;
  if (controller === undefined) {
    return;
  }
  if (!isRecord(controller)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_CONTROLLER_INVALID",
      message: `CharacterController '${entity.id}' must be an object.`,
      path: `${path}/components/CharacterController`,
    });
    return;
  }

  for (const key of Object.keys(controller)) {
    if (!["blocking", "grounding", "interactAction", "moveXAxis", "moveZAxis", "pushPolicy", "slopeLimit", "speed", "stepOffset"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_CHARACTER_FIELD_UNSUPPORTED",
        message: `CharacterController '${entity.id}' uses unsupported field '${key}'.`,
        path: `${path}/components/CharacterController/${key}`,
        suggestion: "Navmesh and engine-specific controller fields are deferred.",
      });
    }
  }
  validateCharacterPushPolicy(controller.pushPolicy, `${path}/components/CharacterController/pushPolicy`, diagnostics);
  if (entity.components.Collider === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_COLLIDER_MISSING",
      message: `CharacterController '${entity.id}' must have a Collider.`,
      path: `${path}/components/Collider`,
    });
  }
  if (entity.components.Transform === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_TRANSFORM_MISSING",
      message: `CharacterController '${entity.id}' must have a Transform.`,
      path: `${path}/components/Transform`,
    });
  }
  if (entity.components.RigidBody === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_BODY_MISSING",
      message: `CharacterController '${entity.id}' must have a RigidBody.`,
      path: `${path}/components/RigidBody`,
    });
  }
  if (typeof controller.speed !== "number" || !Number.isFinite(controller.speed) || controller.speed <= 0) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_SPEED_INVALID",
      message: "CharacterController.speed must be a positive finite number.",
      path: `${path}/components/CharacterController/speed`,
    });
  }
  if (controller.slopeLimit !== undefined && (typeof controller.slopeLimit !== "number" || !Number.isFinite(controller.slopeLimit) || controller.slopeLimit < 0 || controller.slopeLimit > 90)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_SLOPE_INVALID",
      message: "CharacterController.slopeLimit must be a finite angle from 0 to 90 degrees.",
      path: `${path}/components/CharacterController/slopeLimit`,
    });
  }
  if (typeof controller.blocking !== "boolean") {
    diagnostics.push({
      code: "TN_IR_CHARACTER_BLOCKING_INVALID",
      message: "CharacterController.blocking must be boolean.",
      path: `${path}/components/CharacterController/blocking`,
    });
  }
  if (controller.stepOffset !== undefined && (typeof controller.stepOffset !== "number" || !Number.isFinite(controller.stepOffset) || controller.stepOffset < 0)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_STEP_INVALID",
      message: "CharacterController.stepOffset must be a finite non-negative number.",
      path: `${path}/components/CharacterController/stepOffset`,
    });
  }
  if (!["none", "raycast"].includes(controller.grounding as string)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_GROUNDING_UNSUPPORTED",
      message: `CharacterController '${entity.id}' uses unsupported grounding mode '${String(controller.grounding)}'.`,
      path: `${path}/components/CharacterController/grounding`,
      suggestion: "Use 'raycast' or 'none'.",
    });
  }

  const axisIds = new Set(input?.axes.map((axis) => axis.id) ?? []);
  const actionIds = new Set(input?.actions.map((action) => action.id) ?? []);
  validateInputRef(controller.moveXAxis, axisIds, input, `${path}/components/CharacterController/moveXAxis`, "axis", diagnostics);
  validateInputRef(controller.moveZAxis, axisIds, input, `${path}/components/CharacterController/moveZAxis`, "axis", diagnostics);
  if (controller.interactAction !== undefined) {
    validateInputRef(controller.interactAction, actionIds, input, `${path}/components/CharacterController/interactAction`, "action", diagnostics);
  }
}

function validateCharacterPushPolicy(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_POLICY_INVALID", message: "CharacterController.pushPolicy must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["allowedLayers", "blockedWhenTooHeavy", "enabled", "impulseScale", "maxPushMass", "minMoveSpeed"].includes(key)) {
      diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_FIELD_UNSUPPORTED", message: `CharacterController.pushPolicy uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.enabled !== "boolean") {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_POLICY_INVALID", message: "CharacterController.pushPolicy.enabled must be boolean.", path: `${path}/enabled`, severity: "error" });
  }
  if (value.maxPushMass !== undefined) {
    validateFiniteRange(value.maxPushMass, 0, V9_MAX_CHARACTER_PUSH_MASS, `${path}/maxPushMass`, "TN_IR_CHARACTER_PUSH_MASS_INVALID", diagnostics);
  }
  if (value.impulseScale !== undefined) {
    validateFiniteRange(value.impulseScale, 0, V9_MAX_CHARACTER_PUSH_IMPULSE, `${path}/impulseScale`, "TN_IR_CHARACTER_PUSH_IMPULSE_INVALID", diagnostics);
  }
  if (value.minMoveSpeed !== undefined) {
    validateFiniteRange(value.minMoveSpeed, 0, V9_MAX_PHYSICS_SPEED, `${path}/minMoveSpeed`, "TN_IR_CHARACTER_PUSH_SPEED_INVALID", diagnostics);
  }
  if (value.blockedWhenTooHeavy !== undefined && typeof value.blockedWhenTooHeavy !== "boolean") {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_POLICY_INVALID", message: "CharacterController.pushPolicy.blockedWhenTooHeavy must be boolean.", path: `${path}/blockedWhenTooHeavy`, severity: "error" });
  }
  if (value.allowedLayers !== undefined && (!Array.isArray(value.allowedLayers) || value.allowedLayers.some((layer) => typeof layer !== "string" || layer.trim() === ""))) {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_LAYERS_INVALID", message: "CharacterController.pushPolicy.allowedLayers must be an array of non-empty layer strings.", path: `${path}/allowedLayers`, severity: "error" });
  }
}

function validateInputRef(
  value: unknown,
  ids: ReadonlySet<string>,
  input: IInputIr | undefined,
  path: string,
  kind: "action" | "axis",
  diagnostics: IIrDiagnostic[],
): void {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({
      code: "TN_IR_CHARACTER_INPUT_REF_INVALID",
      message: `CharacterController ${kind} reference must be a non-empty string.`,
      path,
    });
    return;
  }
  if (input === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_INPUT_MISSING",
      message: "CharacterController requires an input map for movement and interaction references.",
      path,
    });
    return;
  }
  if (!ids.has(value)) {
    diagnostics.push({
      code: kind === "axis" ? "TN_IR_CHARACTER_AXIS_MISSING" : "TN_IR_CHARACTER_ACTION_MISSING",
      message: `CharacterController references unknown input ${kind} '${value}'.`,
      path,
    });
  }
}
