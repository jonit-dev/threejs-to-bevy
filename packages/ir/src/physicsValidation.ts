import type { IWorldIr } from "./types.js";
import type { IInputIr } from "./input.js";
import type { IIrDiagnostic } from "./validate.js";
import { PHYSICS_CAPABILITY_LIMITS } from "./physicsCapabilities.js";
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
const COLLIDER_FIELDS = new Set(["center", "contact", "friction", "height", "kind", "layer", "mask", "material", "mesh", "radius", "restitution", "sensor", "size", "slope", "trigger"]);
const RIGID_BODY_FIELDS = new Set(["angularVelocity", "ccd", "damping", "enabledRotations", "enabledTranslations", "gravityScale", "inverseMass", "kind", "mass", "sleepThreshold", "solverIterations", "velocity"]);

export function validatePhysicsComponents(entity: IWorldIr["entities"][number], path: string, entityIds: Set<string>, rigidBodyEntityIds: Set<string>, tireModelEntityIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
  const aerodynamicBody = entity.components.AerodynamicBody as unknown;
  const collider = entity.components.Collider as unknown;
  const compoundCollider = entity.components.CompoundCollider as unknown;
  const body = entity.components.RigidBody as unknown;
  const joint = entity.components.PhysicsJoint as unknown;
  const physicsSurface = entity.components.PhysicsSurface as unknown;
  const tireModel = entity.components.TireModel as unknown;
  const wheelAssembly = entity.components.WheelAssembly as unknown;
  const vehicleController = entity.components.VehicleController as unknown;
  const windVolume = entity.components.WindVolume as unknown;
  if (aerodynamicBody === undefined && collider === undefined && compoundCollider === undefined && body === undefined && joint === undefined && physicsSurface === undefined && tireModel === undefined && wheelAssembly === undefined && vehicleController === undefined && windVolume === undefined) {
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
  const compoundColliderRecord = isRecord(compoundCollider) ? compoundCollider : undefined;
  const bodyRecord = isRecord(body) ? body : undefined;
  const jointRecord = isRecord(joint) ? joint : undefined;

  validateNamedPhysicsComponent(aerodynamicBody, "AerodynamicBody", path, diagnostics, validateAerodynamicBody);
  validateNamedPhysicsComponent(physicsSurface, "PhysicsSurface", path, diagnostics, validatePhysicsSurface);
  validateNamedPhysicsComponent(tireModel, "TireModel", path, diagnostics, validateTireModel);
  validateNamedPhysicsComponent(wheelAssembly, "WheelAssembly", path, diagnostics, (value, componentPath, output) => validateWheelAssembly(value, componentPath, entityIds, tireModelEntityIds, output));
  validateNamedPhysicsComponent(vehicleController, "VehicleController", path, diagnostics, (value, componentPath, output) => validateVehicleController(value, componentPath, isRecord(wheelAssembly) ? wheelAssembly : undefined, output));
  validateNamedPhysicsComponent(windVolume, "WindVolume", path, diagnostics, validateWindVolume);
  if (aerodynamicBody !== undefined && bodyRecord?.kind !== "dynamic") diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_BODY_DYNAMIC_REQUIRED", message: "AerodynamicBody must be co-located with a dynamic RigidBody.", path: `${path}/components/AerodynamicBody`, severity: "error", suggestion: "Add RigidBody.kind=dynamic to the craft entity." });

  if (compoundCollider !== undefined && compoundColliderRecord === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COMPOUND_COLLIDER_INVALID",
      message: `CompoundCollider '${entity.id}' must be an object.`,
      path: `${path}/components/CompoundCollider`,
      severity: "error",
      suggestion: "Author CompoundCollider.children with stable ids, local poses, and portable primitive or convex-hull shapes.",
    });
  } else if (compoundColliderRecord !== undefined) {
    validateCompoundCollider(compoundColliderRecord, `${path}/components/CompoundCollider`, diagnostics);
  }
  if (colliderRecord !== undefined && compoundColliderRecord !== undefined) {
    diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_AMBIGUOUS", message: "A physics entity cannot declare both Collider and CompoundCollider.", path: `${path}/components/CompoundCollider`, severity: "error", suggestion: "Keep the compound declaration or the single Collider, not both." });
  }

  if (colliderRecord !== undefined) {
    validatePhysicsObjectFields(colliderRecord, COLLIDER_FIELDS, "Collider", `${path}/components/Collider`, "TN_IR_PHYSICS_COLLIDER_FIELD_UNSUPPORTED", diagnostics);
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
      if (
        typeof colliderRecord.radius === "number"
        && Number.isFinite(colliderRecord.radius)
        && typeof colliderRecord.height === "number"
        && Number.isFinite(colliderRecord.height)
        && colliderRecord.height < colliderRecord.radius * 2
      ) {
        diagnostics.push({
          code: "TN_IR_PHYSICS_COLLIDER_HEIGHT_INVALID",
          message: "Collider.height is the total capsule height and must be at least 2 * Collider.radius.",
          path: `${path}/components/Collider/height`,
          severity: "error",
        });
      }
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
    validatePhysicsObjectFields(bodyRecord, RIGID_BODY_FIELDS, "RigidBody", `${path}/components/RigidBody`, "TN_IR_PHYSICS_BODY_FIELD_UNSUPPORTED", diagnostics);
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
  if (bodyRecord !== undefined && collider === undefined && compoundCollider === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COLLIDER_MISSING",
      message: `RigidBody '${entity.id}' must have a Collider or CompoundCollider in the portable physics contract.`,
      path: `${path}/components/Collider`,
    });
  }
  if ((bodyRecord !== undefined || colliderRecord !== undefined || compoundColliderRecord !== undefined) && entity.components.Transform === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_TRANSFORM_MISSING",
      message: `Physics entity '${entity.id}' must have a Transform with a finite pose.`,
      path: `${path}/components/Transform`,
      severity: "error",
      suggestion: "Add a Transform component with a finite position and optional rotation/scale.",
    });
  }
  if (jointRecord !== undefined) {
    validatePhysicsJoint(jointRecord, `${path}/components/PhysicsJoint`, entity.id, entityIds, rigidBodyEntityIds, diagnostics);
  }
}

function validateNamedPhysicsComponent(
  value: unknown,
  component: "AerodynamicBody" | "PhysicsSurface" | "TireModel" | "VehicleController" | "WheelAssembly" | "WindVolume",
  entityPath: string,
  diagnostics: IIrDiagnostic[],
  validate: (value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]) => void,
): void {
  if (value === undefined) return;
  const path = `${entityPath}/components/${component}`;
  if (!isRecord(value)) {
    diagnostics.push({ code: `TN_IR_PHYSICS_${component.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}_INVALID`, message: `${component} must be an object.`, path, severity: "error" });
    return;
  }
  validate(value, path, diagnostics);
}

export function validateAerodynamicBody(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  validateObjectFields(value, new Set(["dragArea", "maxForce", "surfaces", "thrusters"]), path, "TN_IR_PHYSICS_AERODYNAMIC_BODY_FIELD_UNSUPPORTED", diagnostics);
  validateFiniteVec3Range(value.dragArea, 0, 10_000, `${path}/dragArea`, "TN_IR_PHYSICS_AERODYNAMIC_DRAG_INVALID", diagnostics);
  validateFiniteRange(value.maxForce, Number.MIN_VALUE, PHYSICS_CAPABILITY_LIMITS.aerodynamicForce, `${path}/maxForce`, "TN_IR_PHYSICS_AERODYNAMIC_FORCE_INVALID", diagnostics);
  if (!Array.isArray(value.surfaces) || value.surfaces.length === 0 || value.surfaces.length > PHYSICS_CAPABILITY_LIMITS.aerodynamicSurfacesPerBody) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_SURFACES_INVALID", message: `AerodynamicBody.surfaces must contain 1-${PHYSICS_CAPABILITY_LIMITS.aerodynamicSurfacesPerBody} entries.`, path: `${path}/surfaces`, severity: "error" });
  else validateAerodynamicSurfaces(value.surfaces, `${path}/surfaces`, diagnostics);
  if (value.thrusters !== undefined) {
    if (!Array.isArray(value.thrusters) || value.thrusters.length > PHYSICS_CAPABILITY_LIMITS.aerodynamicThrustersPerBody) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_THRUSTERS_INVALID", message: `AerodynamicBody.thrusters must contain at most ${PHYSICS_CAPABILITY_LIMITS.aerodynamicThrustersPerBody} entries.`, path: `${path}/thrusters`, severity: "error" });
    else validateThrusters(value.thrusters, `${path}/thrusters`, diagnostics);
  }
}

function validateAerodynamicSurfaces(values: unknown[], path: string, diagnostics: IIrDiagnostic[]): void {
  const ids = new Set<string>();
  values.forEach((item, index) => {
    const itemPath = `${path}/${index}`;
    if (!isRecord(item)) { diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_SURFACE_INVALID", message: "Aerodynamic surfaces must be objects.", path: itemPath, severity: "error" }); return; }
    validateObjectFields(item, new Set(["area", "aspectRatio", "centerOfPressure", "control", "dragCurve", "id", "liftCurve", "recoveryAngle", "stallAngle"]), itemPath, "TN_IR_PHYSICS_AERODYNAMIC_SURFACE_FIELD_UNSUPPORTED", diagnostics);
    validatePhysicsId(item.id, `${itemPath}/id`, ids, "surface", diagnostics);
    validateFiniteRange(item.area, Number.MIN_VALUE, 10_000, `${itemPath}/area`, "TN_IR_PHYSICS_AERODYNAMIC_AREA_INVALID", diagnostics);
    validateFiniteRange(item.aspectRatio, Number.MIN_VALUE, 100, `${itemPath}/aspectRatio`, "TN_IR_PHYSICS_AERODYNAMIC_ASPECT_INVALID", diagnostics);
    validateFiniteVec3(item.centerOfPressure, `${itemPath}/centerOfPressure`, "TN_IR_PHYSICS_AERODYNAMIC_POINT_INVALID", diagnostics);
    validateFiniteRange(item.stallAngle, Number.MIN_VALUE, Math.PI / 2, `${itemPath}/stallAngle`, "TN_IR_PHYSICS_AERODYNAMIC_STALL_INVALID", diagnostics);
    validateFiniteRange(item.recoveryAngle, 0, Math.PI / 2, `${itemPath}/recoveryAngle`, "TN_IR_PHYSICS_AERODYNAMIC_STALL_INVALID", diagnostics);
    if (typeof item.recoveryAngle === "number" && typeof item.stallAngle === "number" && item.recoveryAngle >= item.stallAngle) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_STALL_INVALID", message: "recoveryAngle must be below stallAngle for deterministic hysteresis.", path: `${itemPath}/recoveryAngle`, severity: "error" });
    validateAerodynamicCurve(item.liftCurve, `${itemPath}/liftCurve`, diagnostics);
    validateAerodynamicCurve(item.dragCurve, `${itemPath}/dragCurve`, diagnostics);
    if (item.control !== undefined) validateAerodynamicControl(item.control, `${itemPath}/control`, diagnostics);
  });
}

function validateAerodynamicCurve(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length < 2 || value.length > PHYSICS_CAPABILITY_LIMITS.aerodynamicCurvePoints) { diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_CURVE_INVALID", message: `Aerodynamic curves must contain 2-${PHYSICS_CAPABILITY_LIMITS.aerodynamicCurvePoints} points.`, path, severity: "error" }); return; }
  let previous = -Infinity;
  value.forEach((point, index) => {
    if (!isRecord(point)) { diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_CURVE_INVALID", message: "Curve points require angle and coefficient.", path: `${path}/${index}`, severity: "error" }); return; }
    validateObjectFields(point, new Set(["angle", "coefficient"]), `${path}/${index}`, "TN_IR_PHYSICS_AERODYNAMIC_CURVE_FIELD_UNSUPPORTED", diagnostics);
    validateFiniteRange(point.angle, -Math.PI, Math.PI, `${path}/${index}/angle`, "TN_IR_PHYSICS_AERODYNAMIC_CURVE_INVALID", diagnostics);
    validateFiniteRange(point.coefficient, -10, 10, `${path}/${index}/coefficient`, "TN_IR_PHYSICS_AERODYNAMIC_CURVE_INVALID", diagnostics);
    if (typeof point.angle === "number" && point.angle <= previous) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_CURVE_NON_MONOTONIC", message: "Aerodynamic curve angles must strictly increase.", path: `${path}/${index}/angle`, severity: "error" });
    if (typeof point.angle === "number") previous = point.angle;
  });
}

function validateAerodynamicControl(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) { diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_CONTROL_INVALID", message: "Surface control must be an object.", path, severity: "error" }); return; }
  validateObjectFields(value, new Set(["binding", "input", "maxDeflection", "response"]), path, "TN_IR_PHYSICS_AERODYNAMIC_CONTROL_FIELD_UNSUPPORTED", diagnostics);
  if (value.binding !== undefined && (typeof value.binding !== "string" || value.binding.length === 0)) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_CONTROL_INVALID", message: "control.binding must be a non-empty input id.", path: `${path}/binding`, severity: "error" });
  if (value.input !== undefined) validateFiniteRange(value.input, -1, 1, `${path}/input`, "TN_IR_PHYSICS_AERODYNAMIC_CONTROL_INVALID", diagnostics);
  validateFiniteRange(value.maxDeflection, 0, Math.PI / 2, `${path}/maxDeflection`, "TN_IR_PHYSICS_AERODYNAMIC_CONTROL_INVALID", diagnostics);
  validateFiniteRange(value.response, Number.MIN_VALUE, 100, `${path}/response`, "TN_IR_PHYSICS_AERODYNAMIC_CONTROL_INVALID", diagnostics);
}

function validateThrusters(values: unknown[], path: string, diagnostics: IIrDiagnostic[]): void {
  const ids = new Set<string>();
  values.forEach((item, index) => {
    const itemPath = `${path}/${index}`;
    if (!isRecord(item)) { diagnostics.push({ code: "TN_IR_PHYSICS_THRUSTER_INVALID", message: "Thrusters must be objects.", path: itemPath, severity: "error" }); return; }
    validateObjectFields(item, new Set(["binding", "direction", "fuelHook", "id", "maxForce", "point", "response", "throttle"]), itemPath, "TN_IR_PHYSICS_THRUSTER_FIELD_UNSUPPORTED", diagnostics);
    validatePhysicsId(item.id, `${itemPath}/id`, ids, "thruster", diagnostics);
    validateFiniteVec3(item.direction, `${itemPath}/direction`, "TN_IR_PHYSICS_THRUSTER_DIRECTION_INVALID", diagnostics);
    if (Array.isArray(item.direction) && item.direction.every((coordinate) => typeof coordinate === "number") && Math.hypot(...item.direction as number[]) < 0.000001) diagnostics.push({ code: "TN_IR_PHYSICS_THRUSTER_DIRECTION_INVALID", message: "Thruster.direction must be non-zero.", path: `${itemPath}/direction`, severity: "error" });
    validateFiniteVec3(item.point, `${itemPath}/point`, "TN_IR_PHYSICS_THRUSTER_POINT_INVALID", diagnostics);
    validateFiniteRange(item.maxForce, Number.MIN_VALUE, PHYSICS_CAPABILITY_LIMITS.aerodynamicForce, `${itemPath}/maxForce`, "TN_IR_PHYSICS_THRUSTER_FORCE_INVALID", diagnostics);
    validateFiniteRange(item.response, Number.MIN_VALUE, 100, `${itemPath}/response`, "TN_IR_PHYSICS_THRUSTER_RESPONSE_INVALID", diagnostics);
    if (item.throttle !== undefined) validateFiniteRange(item.throttle, 0, 1, `${itemPath}/throttle`, "TN_IR_PHYSICS_THRUSTER_THROTTLE_INVALID", diagnostics);
    for (const field of ["binding", "fuelHook"] as const) if (item[field] !== undefined && (typeof item[field] !== "string" || item[field].length === 0)) diagnostics.push({ code: "TN_IR_PHYSICS_THRUSTER_METADATA_INVALID", message: `Thruster.${field} must be a non-empty string.`, path: `${itemPath}/${field}`, severity: "error" });
  });
}

export function validateWindVolume(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  validateObjectFields(value, new Set(["airDensity", "gust", "radius", "shape", "size", "velocity"]), path, "TN_IR_PHYSICS_WIND_FIELD_UNSUPPORTED", diagnostics);
  if (!["box", "sphere"].includes(value.shape as string)) diagnostics.push({ code: "TN_IR_PHYSICS_WIND_SHAPE_INVALID", message: "WindVolume.shape must be box or sphere.", path: `${path}/shape`, severity: "error" });
  validateFiniteVec3(value.velocity, `${path}/velocity`, "TN_IR_PHYSICS_WIND_VELOCITY_INVALID", diagnostics);
  if (value.airDensity !== undefined) validateFiniteRange(value.airDensity, 0, 100, `${path}/airDensity`, "TN_IR_PHYSICS_WIND_DENSITY_INVALID", diagnostics);
  if (value.shape === "box") validatePositiveVec3(value.size, `${path}/size`, "TN_IR_PHYSICS_WIND_SIZE_INVALID", diagnostics);
  if (value.shape === "sphere") validatePositiveFinite(value.radius, `${path}/radius`, "TN_IR_PHYSICS_WIND_RADIUS_INVALID", diagnostics);
  if (value.gust !== undefined) {
    if (!isRecord(value.gust)) diagnostics.push({ code: "TN_IR_PHYSICS_WIND_GUST_INVALID", message: "WindVolume.gust must be an object.", path: `${path}/gust`, severity: "error" });
    else { validateFiniteVec3(value.gust.amplitude, `${path}/gust/amplitude`, "TN_IR_PHYSICS_WIND_GUST_INVALID", diagnostics); validateFiniteRange(value.gust.frequency, 0, 100, `${path}/gust/frequency`, "TN_IR_PHYSICS_WIND_GUST_INVALID", diagnostics); validateIntegerRange(value.gust.seed, 0, 2_147_483_647, `${path}/gust/seed`, "TN_IR_PHYSICS_WIND_GUST_INVALID", diagnostics); }
  }
}

function validatePhysicsId(value: unknown, path: string, ids: Set<string>, kind: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || !PORTABLE_FILTER_NAME.test(value)) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_ID_INVALID", message: `${kind} id must be a stable portable identifier.`, path, severity: "error" });
  else if (ids.has(value)) diagnostics.push({ code: "TN_IR_PHYSICS_AERODYNAMIC_ID_DUPLICATE", message: `${kind} id '${value}' is duplicated.`, path, severity: "error" });
  else ids.add(value);
}

function validatePhysicsSurface(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  validateObjectFields(value, new Set(["combineRule", "grip", "rollingResistance"]), path, "TN_IR_PHYSICS_SURFACE_FIELD_UNSUPPORTED", diagnostics);
  if (!["average", "maximum", "minimum", "multiply"].includes(value.combineRule as string)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_SURFACE_COMBINE_INVALID", message: "PhysicsSurface.combineRule must be average, minimum, multiply, or maximum.", path: `${path}/combineRule`, severity: "error", suggestion: "Use a portable deterministic combine rule; the higher-priority authored rule wins (average < minimum < multiply < maximum)." });
  }
  validateFiniteRange(value.grip, 0, 4, `${path}/grip`, "TN_IR_PHYSICS_SURFACE_GRIP_INVALID", diagnostics);
  validateFiniteRange(value.rollingResistance, 0, 1, `${path}/rollingResistance`, "TN_IR_PHYSICS_SURFACE_ROLLING_RESISTANCE_INVALID", diagnostics);
}

function validateTireModel(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  validateObjectFields(value, new Set(["lateralSlipCurve", "loadSensitivity", "longitudinalSlipCurve", "rollingResistance"]), path, "TN_IR_PHYSICS_TIRE_FIELD_UNSUPPORTED", diagnostics);
  validateSlipCurve(value.longitudinalSlipCurve, `${path}/longitudinalSlipCurve`, diagnostics);
  validateSlipCurve(value.lateralSlipCurve, `${path}/lateralSlipCurve`, diagnostics);
  validateFiniteRange(value.loadSensitivity, 0, 4, `${path}/loadSensitivity`, "TN_IR_PHYSICS_TIRE_LOAD_SENSITIVITY_INVALID", diagnostics);
  validateFiniteRange(value.rollingResistance, 0, 1, `${path}/rollingResistance`, "TN_IR_PHYSICS_TIRE_ROLLING_RESISTANCE_INVALID", diagnostics);
}

function validateSlipCurve(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length < 2 || value.length > PHYSICS_CAPABILITY_LIMITS.slipCurvePoints) {
    diagnostics.push({ code: "TN_IR_PHYSICS_TIRE_SLIP_CURVE_INVALID", message: `Slip curves must contain 2-${PHYSICS_CAPABILITY_LIMITS.slipCurvePoints} points.`, path, severity: "error", suggestion: "Author a bounded curve with strictly increasing slip coordinates." });
    return;
  }
  let previousSlip = Number.NEGATIVE_INFINITY;
  value.forEach((point, index) => {
    const pointPath = `${path}/${index}`;
    if (!isRecord(point)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_TIRE_SLIP_CURVE_INVALID", message: "Slip curve points must be objects with slip and grip fields.", path: pointPath, severity: "error" });
      return;
    }
    validateObjectFields(point, new Set(["grip", "slip"]), pointPath, "TN_IR_PHYSICS_TIRE_SLIP_CURVE_FIELD_UNSUPPORTED", diagnostics);
    validateFiniteRange(point.slip, -4, 4, `${pointPath}/slip`, "TN_IR_PHYSICS_TIRE_SLIP_INVALID", diagnostics);
    validateFiniteRange(point.grip, 0, 4, `${pointPath}/grip`, "TN_IR_PHYSICS_TIRE_GRIP_INVALID", diagnostics);
    if (typeof point.slip === "number" && Number.isFinite(point.slip)) {
      if (point.slip <= previousSlip) {
        diagnostics.push({ code: "TN_IR_PHYSICS_TIRE_SLIP_CURVE_NON_MONOTONIC", message: "Slip curve coordinates must be strictly increasing.", path: `${pointPath}/slip`, severity: "error", suggestion: "Sort points by slip and remove duplicate slip coordinates; grip may rise or fall." });
      }
      previousSlip = point.slip;
    }
  });
}

function validateWheelAssembly(value: Record<string, unknown>, path: string, entityIds: Set<string>, tireModelEntityIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
  validateObjectFields(value, new Set(["maxSteeringAngle", "maxSuspensionForce", "maxTireForce", "wheels"]), path, "TN_IR_PHYSICS_WHEEL_ASSEMBLY_FIELD_UNSUPPORTED", diagnostics);
  validateFiniteRange(value.maxSteeringAngle, Number.MIN_VALUE, PHYSICS_CAPABILITY_LIMITS.wheelSteeringAngle, `${path}/maxSteeringAngle`, "TN_IR_PHYSICS_WHEEL_STEERING_LIMIT_INVALID", diagnostics);
  validateFiniteRange(value.maxSuspensionForce, Number.MIN_VALUE, PHYSICS_CAPABILITY_LIMITS.wheelForce, `${path}/maxSuspensionForce`, "TN_IR_PHYSICS_WHEEL_FORCE_LIMIT_INVALID", diagnostics);
  validateFiniteRange(value.maxTireForce, Number.MIN_VALUE, PHYSICS_CAPABILITY_LIMITS.wheelForce, `${path}/maxTireForce`, "TN_IR_PHYSICS_WHEEL_FORCE_LIMIT_INVALID", diagnostics);
  if (!Array.isArray(value.wheels) || value.wheels.length === 0 || value.wheels.length > PHYSICS_CAPABILITY_LIMITS.wheelsPerAssembly) {
    diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_ASSEMBLY_INVALID", message: `WheelAssembly.wheels must contain 1-${PHYSICS_CAPABILITY_LIMITS.wheelsPerAssembly} wheels.`, path: `${path}/wheels`, severity: "error", suggestion: "Author at least one wheel and split assemblies that exceed the portable wheel budget." });
    return;
  }
  const ids = new Set<string>();
  value.wheels.forEach((wheel, index) => {
    const wheelPath = `${path}/wheels/${index}`;
    if (!isRecord(wheel)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_INVALID", message: "Wheel entries must be objects.", path: wheelPath, severity: "error" });
      return;
    }
    validateObjectFields(wheel, new Set(["attachment", "braked", "driven", "id", "radius", "steering", "suspension", "tire", "visual", "width"]), wheelPath, "TN_IR_PHYSICS_WHEEL_FIELD_UNSUPPORTED", diagnostics);
    if (typeof wheel.id !== "string" || !PORTABLE_FILTER_NAME.test(wheel.id)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_ID_INVALID", message: "Wheel.id must be a stable portable identifier.", path: `${wheelPath}/id`, severity: "error", suggestion: "Use an identifier such as front-left." });
    } else if (ids.has(wheel.id)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_ID_DUPLICATE", message: `Wheel id '${wheel.id}' is duplicated.`, path: `${wheelPath}/id`, severity: "error", suggestion: "Assign every wheel a unique stable id." });
    } else ids.add(wheel.id);
    validateFiniteVec3(wheel.attachment, `${wheelPath}/attachment`, "TN_IR_PHYSICS_WHEEL_ATTACHMENT_INVALID", diagnostics);
    validateWheelDimension(wheel.radius, 0.05, 5, `${wheelPath}/radius`, diagnostics);
    validateWheelDimension(wheel.width, 0.02, 2, `${wheelPath}/width`, diagnostics);
    for (const flag of ["braked", "driven", "steering"] as const) {
      if (typeof wheel[flag] !== "boolean") diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_FLAG_INVALID", message: `Wheel.${flag} must be boolean.`, path: `${wheelPath}/${flag}`, severity: "error" });
    }
    validateEntityReference(wheel.tire, `${wheelPath}/tire`, "TireModel", entityIds, diagnostics, tireModelEntityIds);
    if (wheel.visual !== undefined) validateEntityReference(wheel.visual, `${wheelPath}/visual`, "visual target", entityIds, diagnostics);
    if (!isRecord(wheel.suspension)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_SUSPENSION_INVALID", message: "Wheel.suspension must define bounded travel, springRate, and damperRate.", path: `${wheelPath}/suspension`, severity: "error" });
    } else {
      validateObjectFields(wheel.suspension, new Set(["damperRate", "springRate", "travel"]), `${wheelPath}/suspension`, "TN_IR_PHYSICS_WHEEL_SUSPENSION_FIELD_UNSUPPORTED", diagnostics);
      validateFiniteRange(wheel.suspension.travel, 0, 2, `${wheelPath}/suspension/travel`, "TN_IR_PHYSICS_WHEEL_SUSPENSION_INVALID", diagnostics);
      validateFiniteRange(wheel.suspension.springRate, 0, 1_000_000, `${wheelPath}/suspension/springRate`, "TN_IR_PHYSICS_WHEEL_SUSPENSION_INVALID", diagnostics);
      validateFiniteRange(wheel.suspension.damperRate, 0, 1_000_000, `${wheelPath}/suspension/damperRate`, "TN_IR_PHYSICS_WHEEL_SUSPENSION_INVALID", diagnostics);
    }
  });
}

export function validateVehicleController(value: Record<string, unknown>, path: string, wheelAssembly: Record<string, unknown> | undefined, diagnostics: IIrDiagnostic[]): void {
  validateObjectFields(value, new Set(["assists", "bindings", "brakes", "differential", "engine", "steering", "transmission"]), path, "TN_IR_PHYSICS_VEHICLE_FIELD_UNSUPPORTED", diagnostics);
  if (wheelAssembly === undefined || !Array.isArray(wheelAssembly.wheels)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_WHEELS_MISSING", message: "VehicleController must be co-located with WheelAssembly.", path, severity: "error", suggestion: "Add WheelAssembly to the chassis entity before adding VehicleController." });
    return;
  }
  const wheels = wheelAssembly.wheels.filter(isRecord);
  const driven = wheels.filter((wheel) => wheel.driven === true);
  if (driven.length === 0) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_DRIVEN_WHEELS_MISSING", message: "VehicleController requires at least one driven wheel.", path: `${path}/../WheelAssembly/wheels`, severity: "error", suggestion: "Set driven=true on the wheels connected to the drivetrain." });
  const engine = value.engine;
  if (!isRecord(engine)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_ENGINE_INVALID", message: "VehicleController.engine is required.", path: `${path}/engine`, severity: "error" });
  else {
    validateObjectFields(engine, new Set(["engineBraking", "idleRpm", "redlineRpm", "torqueCurve"]), `${path}/engine`, "TN_IR_PHYSICS_VEHICLE_ENGINE_FIELD_UNSUPPORTED", diagnostics);
    validatePositiveFinite(engine.idleRpm, `${path}/engine/idleRpm`, "TN_IR_PHYSICS_VEHICLE_RPM_INVALID", diagnostics);
    validatePositiveFinite(engine.redlineRpm, `${path}/engine/redlineRpm`, "TN_IR_PHYSICS_VEHICLE_RPM_INVALID", diagnostics);
    validateFiniteRange(engine.engineBraking, 0, PHYSICS_CAPABILITY_LIMITS.wheelForce, `${path}/engine/engineBraking`, "TN_IR_PHYSICS_VEHICLE_ENGINE_BRAKING_INVALID", diagnostics);
    if (typeof engine.idleRpm === "number" && typeof engine.redlineRpm === "number" && engine.idleRpm >= engine.redlineRpm) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_RPM_INVALID", message: "engine.idleRpm must be below engine.redlineRpm.", path: `${path}/engine/redlineRpm`, severity: "error", suggestion: "Increase redlineRpm or lower idleRpm." });
    validateVehicleCurve(engine.torqueCurve, "rpm", "torque", 0, PHYSICS_CAPABILITY_LIMITS.vehicleTorqueCurvePoints, `${path}/engine/torqueCurve`, diagnostics);
    if (Array.isArray(engine.torqueCurve)) engine.torqueCurve.forEach((point, index) => {
      if (isRecord(point) && typeof point.rpm === "number" && typeof engine.redlineRpm === "number" && point.rpm > engine.redlineRpm) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_TORQUE_CURVE_RPM_INVALID", message: "Torque curve RPM cannot exceed engine.redlineRpm.", path: `${path}/engine/torqueCurve/${index}/rpm`, severity: "error" });
      if (isRecord(point) && typeof point.torque === "number" && point.torque > PHYSICS_CAPABILITY_LIMITS.wheelForce) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_TORQUE_CURVE_TORQUE_INVALID", message: `Torque must not exceed ${PHYSICS_CAPABILITY_LIMITS.wheelForce}.`, path: `${path}/engine/torqueCurve/${index}/torque`, severity: "error" });
    });
  }
  const transmission = value.transmission;
  if (!isRecord(transmission)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_TRANSMISSION_INVALID", message: "VehicleController.transmission is required.", path: `${path}/transmission`, severity: "error" });
  else {
    validateObjectFields(transmission, new Set(["clutchResponse", "downshiftRpm", "finalDrive", "forwardRatios", "reverseRatio", "shiftPolicy", "upshiftRpm"]), `${path}/transmission`, "TN_IR_PHYSICS_VEHICLE_TRANSMISSION_FIELD_UNSUPPORTED", diagnostics);
    if (!Array.isArray(transmission.forwardRatios) || transmission.forwardRatios.length < 1 || transmission.forwardRatios.length > PHYSICS_CAPABILITY_LIMITS.vehicleForwardGears || transmission.forwardRatios.some((ratio) => typeof ratio !== "number" || !Number.isFinite(ratio) || ratio <= 0)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID", message: `forwardRatios must contain 1-${PHYSICS_CAPABILITY_LIMITS.vehicleForwardGears} positive finite ratios.`, path: `${path}/transmission/forwardRatios`, severity: "error", suggestion: "Author positive forward ratios in descending conventional order." });
    else if (transmission.forwardRatios.some((ratio, index, ratios) => index > 0 && ratio >= ratios[index - 1]!)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_GEAR_RATIOS_ORDER_INVALID", message: "forwardRatios must be strictly descending.", path: `${path}/transmission/forwardRatios`, severity: "error", suggestion: "Order gears from the largest first-gear ratio to the smallest top-gear ratio." });
    validatePositiveFinite(transmission.reverseRatio, `${path}/transmission/reverseRatio`, "TN_IR_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID", diagnostics);
    validatePositiveFinite(transmission.finalDrive, `${path}/transmission/finalDrive`, "TN_IR_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID", diagnostics);
    validatePositiveFinite(transmission.clutchResponse, `${path}/transmission/clutchResponse`, "TN_IR_PHYSICS_VEHICLE_CLUTCH_RESPONSE_INVALID", diagnostics);
    if (!['automatic', 'manual'].includes(transmission.shiftPolicy as string)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_SHIFT_POLICY_INVALID", message: "shiftPolicy must be automatic or manual.", path: `${path}/transmission/shiftPolicy`, severity: "error" });
    for (const field of ["downshiftRpm", "upshiftRpm"] as const) if (transmission[field] !== undefined) validatePositiveFinite(transmission[field], `${path}/transmission/${field}`, "TN_IR_PHYSICS_VEHICLE_SHIFT_RPM_INVALID", diagnostics);
    if (transmission.shiftPolicy === "automatic" && typeof engine === "object" && engine !== null) {
      const idle = (engine as Record<string, unknown>).idleRpm; const redline = (engine as Record<string, unknown>).redlineRpm;
      const down = transmission.downshiftRpm; const up = transmission.upshiftRpm;
      if (typeof down !== "number" || typeof up !== "number" || typeof idle !== "number" || typeof redline !== "number" || down < idle || up > redline || down >= up) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_SHIFT_RPM_INVALID", message: "Automatic shift thresholds require idleRpm <= downshiftRpm < upshiftRpm <= redlineRpm.", path: `${path}/transmission`, severity: "error", suggestion: "Author bounded, ordered automatic shift thresholds." });
    }
  }
  const differential = value.differential;
  if (!isRecord(differential) || !["open", "locked", "limited-slip"].includes(differential.kind as string)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_DIFFERENTIAL_INVALID", message: "differential.kind must be open, locked, or limited-slip.", path: `${path}/differential`, severity: "error" });
  else {
    validateObjectFields(differential, new Set(["kind", "limitedSlipRatio"]), `${path}/differential`, "TN_IR_PHYSICS_VEHICLE_DIFFERENTIAL_FIELD_UNSUPPORTED", diagnostics);
    if (differential.kind === "limited-slip") validateFiniteRange(differential.limitedSlipRatio, 1, 10, `${path}/differential/limitedSlipRatio`, "TN_IR_PHYSICS_VEHICLE_DIFFERENTIAL_INVALID", diagnostics);
    else if (differential.limitedSlipRatio !== undefined) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_DIFFERENTIAL_INVALID", message: "limitedSlipRatio is only valid for limited-slip differentials.", path: `${path}/differential/limitedSlipRatio`, severity: "error" });
  }
  const steering = value.steering;
  if (!isRecord(steering)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_STEERING_INVALID", message: "VehicleController.steering is required.", path: `${path}/steering`, severity: "error" });
  else {
    validateObjectFields(steering, new Set(["speedCurve"]), `${path}/steering`, "TN_IR_PHYSICS_VEHICLE_STEERING_FIELD_UNSUPPORTED", diagnostics);
    validateVehicleCurve(steering.speedCurve, "speed", "scale", 0, PHYSICS_CAPABILITY_LIMITS.vehicleSteeringCurvePoints, `${path}/steering/speedCurve`, diagnostics);
    if (Array.isArray(steering.speedCurve)) steering.speedCurve.forEach((point, index) => { if (isRecord(point) && typeof point.scale === "number" && point.scale > 1) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_STEERING_SCALE_INVALID", message: "Steering curve scale must be normalized to [0,1].", path: `${path}/steering/speedCurve/${index}/scale`, severity: "error" }); });
  }
  const brakes = value.brakes;
  if (!isRecord(brakes)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_BRAKES_INVALID", message: "VehicleController.brakes is required.", path: `${path}/brakes`, severity: "error" });
  else {
    validateObjectFields(brakes, new Set(["frontBias", "handbrakeWheelIds"]), `${path}/brakes`, "TN_IR_PHYSICS_VEHICLE_BRAKES_FIELD_UNSUPPORTED", diagnostics);
    validateFiniteRange(brakes.frontBias, 0, 1, `${path}/brakes/frontBias`, "TN_IR_PHYSICS_VEHICLE_BRAKE_BIAS_INVALID", diagnostics);
    const wheelIds = new Set(wheels.map((wheel) => wheel.id).filter((id): id is string => typeof id === "string"));
    if (!Array.isArray(brakes.handbrakeWheelIds) || brakes.handbrakeWheelIds.some((id) => typeof id !== "string" || !wheelIds.has(id))) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_HANDBRAKE_WHEELS_INVALID", message: "handbrakeWheelIds must reference authored wheels on this assembly.", path: `${path}/brakes/handbrakeWheelIds`, severity: "error" });
    else if (new Set(brakes.handbrakeWheelIds).size !== brakes.handbrakeWheelIds.length) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_HANDBRAKE_WHEELS_INVALID", message: "handbrakeWheelIds must not contain duplicates.", path: `${path}/brakes/handbrakeWheelIds`, severity: "error" });
  }
  if (value.assists !== undefined) validateVehicleAssists(value.assists, `${path}/assists`, diagnostics);
  if (value.bindings !== undefined) {
    if (!isRecord(value.bindings)) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_BINDINGS_INVALID", message: "bindings must be an object.", path: `${path}/bindings`, severity: "error" });
    else {
      validateObjectFields(value.bindings, new Set(["brake", "clutch", "gearDown", "gearUp", "handbrake", "steer", "throttle"]), `${path}/bindings`, "TN_IR_PHYSICS_VEHICLE_BINDING_FIELD_UNSUPPORTED", diagnostics);
      for (const [name, binding] of Object.entries(value.bindings)) if (typeof binding !== "string" || binding.trim() === "") diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_BINDINGS_INVALID", message: `bindings.${name} must be a non-empty input identifier.`, path: `${path}/bindings/${name}`, severity: "error" });
    }
  }
}

function validateVehicleCurve(value: unknown, x: string, y: string, minimumX: number, maximumPoints: number, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length < 2 || value.length > maximumPoints) { diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_CURVE_INVALID", message: `Curve must contain 2-${maximumPoints} ordered points.`, path, severity: "error" }); return; }
  let previous = -Infinity;
  value.forEach((point, index) => {
    if (!isRecord(point) || typeof point[x] !== "number" || !Number.isFinite(point[x]) || point[x] < minimumX || point[x] <= previous || typeof point[y] !== "number" || !Number.isFinite(point[y]) || point[y] < 0) diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_CURVE_INVALID", message: `Curve points require strictly increasing ${x} and finite non-negative ${y}.`, path: `${path}/${index}`, severity: "error" });
    if (isRecord(point) && typeof point[x] === "number") previous = point[x];
  });
}

function validateVehicleAssists(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) { diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_ASSISTS_INVALID", message: "assists must be an object.", path, severity: "error" }); return; }
  validateObjectFields(value, new Set(["abs", "tcs"]), path, "TN_IR_PHYSICS_VEHICLE_ASSIST_FIELD_UNSUPPORTED", diagnostics);
  for (const name of ["abs", "tcs"] as const) {
    const assist = value[name];
    if (assist === undefined) continue;
    if (!isRecord(assist)) { diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_ASSIST_INVALID", message: `${name} must be an object.`, path: `${path}/${name}`, severity: "error" }); continue; }
    validateObjectFields(assist, new Set(["enabled", "response", "slipThreshold"]), `${path}/${name}`, "TN_IR_PHYSICS_VEHICLE_ASSIST_FIELD_UNSUPPORTED", diagnostics);
    if (typeof assist.enabled !== "boolean") diagnostics.push({ code: "TN_IR_PHYSICS_VEHICLE_ASSIST_INVALID", message: `${name}.enabled must be boolean.`, path: `${path}/${name}/enabled`, severity: "error" });
    validatePositiveFinite(assist.response, `${path}/${name}/response`, "TN_IR_PHYSICS_VEHICLE_ASSIST_RESPONSE_INVALID", diagnostics);
    validateFiniteRange(assist.slipThreshold, 0, 4, `${path}/${name}/slipThreshold`, "TN_IR_PHYSICS_VEHICLE_ASSIST_THRESHOLD_INVALID", diagnostics);
  }
}

function validateWheelDimension(value: unknown, minimum: number, maximum: number, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_GEOMETRY_INVALID", message: `Wheel geometry must be finite and between ${minimum} and ${maximum} meters.`, path, severity: "error", suggestion: "Author positive real-world wheel radius and width values inside the portable bounds." });
  }
}

function validateEntityReference(value: unknown, path: string, label: string, entityIds: Set<string>, diagnostics: IIrDiagnostic[], requiredOwners?: Set<string>): void {
  if (typeof value !== "string" || value.trim() === "" || !entityIds.has(value) || (requiredOwners !== undefined && !requiredOwners.has(value))) {
    diagnostics.push({ code: "TN_IR_PHYSICS_WHEEL_REFERENCE_INVALID", message: `Wheel ${label} reference '${String(value)}' does not resolve to an entity.`, path, severity: "error", suggestion: `Reference an existing entity that owns the ${label} contract.` });
  }
}

function validateCompoundCollider(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const key of Object.keys(value)) {
    if (key !== "children") {
      diagnostics.push({
        code: "TN_IR_PHYSICS_COMPOUND_FIELD_UNSUPPORTED",
        message: `CompoundCollider uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use CompoundCollider.children only; solver handles and backend fields remain adapter-private.",
      });
    }
  }
  if (!Array.isArray(value.children) || value.children.length === 0 || value.children.length > PHYSICS_CAPABILITY_LIMITS.compoundColliderChildren) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COMPOUND_CHILDREN_INVALID",
      message: `CompoundCollider.children must contain 1-${PHYSICS_CAPABILITY_LIMITS.compoundColliderChildren} children.`,
      path: `${path}/children`,
      severity: "error",
      suggestion: "Add at least one child and split bodies that exceed the portable child budget.",
    });
    return;
  }
  const ids = new Set<string>();
  value.children.forEach((child, index) => {
    const childPath = `${path}/children/${index}`;
    if (!isRecord(child)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_CHILD_INVALID", message: "Compound collider child must be an object.", path: childPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(child)) {
      if (!["filter", "id", "localPose", "material", "shape"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_PHYSICS_COMPOUND_CHILD_FIELD_UNSUPPORTED",
          message: `Compound collider child uses unsupported field '${key}'.`,
          path: `${childPath}/${key}`,
          severity: "error",
          suggestion: "Use id, shape, localPose, material, and filter only; raw solver handles are not portable.",
        });
      }
    }
    if (typeof child.id !== "string" || !PORTABLE_FILTER_NAME.test(child.id)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_CHILD_ID_INVALID", message: "Compound collider child id must be a stable portable identifier.", path: `${childPath}/id`, severity: "error", suggestion: "Use a unique identifier such as chassis.front-left." });
    } else if (ids.has(child.id)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_CHILD_ID_DUPLICATE", message: `Compound collider child id '${child.id}' is duplicated.`, path: `${childPath}/id`, severity: "error", suggestion: "Assign every compound collider child a unique stable id." });
    } else {
      ids.add(child.id);
    }
    if (!isRecord(child.localPose)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_LOCAL_POSE_INVALID", message: "Compound collider child localPose must be an object with a finite position.", path: `${childPath}/localPose`, severity: "error" });
    } else {
      validateObjectFields(child.localPose, new Set(["position", "rotation"]), `${childPath}/localPose`, "TN_IR_PHYSICS_COMPOUND_LOCAL_POSE_FIELD_UNSUPPORTED", diagnostics);
      validateFiniteVec3(child.localPose.position, `${childPath}/localPose/position`, "TN_IR_PHYSICS_COMPOUND_LOCAL_POSE_INVALID", diagnostics);
      if (child.localPose.rotation !== undefined && (!Array.isArray(child.localPose.rotation) || child.localPose.rotation.length !== 4 || !child.localPose.rotation.every((part) => typeof part === "number" && Number.isFinite(part)))) {
        diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_LOCAL_POSE_INVALID", message: "Compound collider child localPose.rotation must be a finite quaternion.", path: `${childPath}/localPose/rotation`, severity: "error" });
      }
    }
    if (child.filter !== undefined) {
      if (!isRecord(child.filter)) {
        diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_FILTER_INVALID", message: "Compound collider child filter must be an object.", path: `${childPath}/filter`, severity: "error" });
      } else {
        validateObjectFields(child.filter, new Set(["layer", "mask"]), `${childPath}/filter`, "TN_IR_PHYSICS_COMPOUND_FILTER_FIELD_UNSUPPORTED", diagnostics);
        validatePhysicsFilter(child.filter, `${childPath}/filter`, diagnostics);
      }
    }
    if (child.material !== undefined) {
      if (!isRecord(child.material)) {
        diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_MATERIAL_INVALID", message: "Compound collider child material must be an object.", path: `${childPath}/material`, severity: "error" });
      } else {
        validateObjectFields(child.material, new Set(["friction", "restitution"]), `${childPath}/material`, "TN_IR_PHYSICS_COMPOUND_MATERIAL_FIELD_UNSUPPORTED", diagnostics);
        if (child.material.friction !== undefined) validateFiniteRange(child.material.friction, 0, V9_MAX_PHYSICS_FRICTION, `${childPath}/material/friction`, "TN_IR_PHYSICS_COMPOUND_MATERIAL_INVALID", diagnostics);
        if (child.material.restitution !== undefined) validateFiniteRange(child.material.restitution, 0, 1, `${childPath}/material/restitution`, "TN_IR_PHYSICS_COMPOUND_MATERIAL_INVALID", diagnostics);
      }
    }
    validateCompoundShape(child.shape, `${childPath}/shape`, diagnostics);
  });
}

function validateCompoundShape(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_SHAPE_INVALID", message: "Compound collider child shape must be an object.", path, severity: "error" });
    return;
  }
  if (["mesh", "triangleMesh", "trimesh"].includes(value.kind as string)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COMPOUND_DYNAMIC_TRIANGLE_UNSUPPORTED",
      message: "Dynamic triangle-mesh children are not supported in CompoundCollider.",
      path: `${path}/kind`,
      severity: "error",
      suggestion: "Use box, sphere, capsule, or a compiler-produced bounded convexHull child.",
    });
    return;
  }
  if (value.kind === "box") {
    validateObjectFields(value, new Set(["kind", "size"]), path, "TN_IR_PHYSICS_COMPOUND_SHAPE_FIELD_UNSUPPORTED", diagnostics);
    validatePositiveVec3(value.size, `${path}/size`, "TN_IR_PHYSICS_COMPOUND_SHAPE_INVALID", diagnostics);
  } else if (value.kind === "sphere") {
    validateObjectFields(value, new Set(["kind", "radius"]), path, "TN_IR_PHYSICS_COMPOUND_SHAPE_FIELD_UNSUPPORTED", diagnostics);
    validatePositiveFinite(value.radius, `${path}/radius`, "TN_IR_PHYSICS_COMPOUND_SHAPE_INVALID", diagnostics);
  } else if (value.kind === "capsule") {
    validateObjectFields(value, new Set(["height", "kind", "radius"]), path, "TN_IR_PHYSICS_COMPOUND_SHAPE_FIELD_UNSUPPORTED", diagnostics);
    validatePositiveFinite(value.radius, `${path}/radius`, "TN_IR_PHYSICS_COMPOUND_SHAPE_INVALID", diagnostics);
    validatePositiveFinite(value.height, `${path}/height`, "TN_IR_PHYSICS_COMPOUND_SHAPE_INVALID", diagnostics);
    if (typeof value.height === "number" && typeof value.radius === "number" && value.height < value.radius * 2) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_SHAPE_INVALID", message: "Compound capsule height must be at least twice its radius.", path: `${path}/height`, severity: "error" });
    }
  } else if (value.kind === "convexHull") {
    validateObjectFields(value, new Set(["kind", "points"]), path, "TN_IR_PHYSICS_COMPOUND_SHAPE_FIELD_UNSUPPORTED", diagnostics);
    if (!Array.isArray(value.points) || value.points.length < 4 || value.points.length > PHYSICS_CAPABILITY_LIMITS.convexHullVertices) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_CONVEX_HULL_INVALID", message: `Compound convexHull points must contain 4-${PHYSICS_CAPABILITY_LIMITS.convexHullVertices} vertices.`, path: `${path}/points`, severity: "error", suggestion: "Use compiler-produced bounded convex hull vertices." });
    } else {
      value.points.forEach((point, index) => validateFiniteVec3(point, `${path}/points/${index}`, "TN_IR_PHYSICS_COMPOUND_CONVEX_HULL_INVALID", diagnostics));
      if (value.points.every(isFiniteVec3)) {
        const points = value.points as Array<[number, number, number]>;
        if (hasDuplicateConvexHullPoints(points)) {
          diagnostics.push({
            code: "TN_IR_PHYSICS_COMPOUND_CONVEX_HULL_DEGENERATE",
            message: "Compound convexHull points must be unique.",
            path: `${path}/points`,
            severity: "error",
            suggestion: "Regenerate the convex hull with duplicate vertices removed.",
          });
        } else if (!hasConvexHullVolume(points)) {
          diagnostics.push({
            code: "TN_IR_PHYSICS_COMPOUND_CONVEX_HULL_DEGENERATE",
            message: "Compound convexHull points must span a non-zero three-dimensional volume.",
            path: `${path}/points`,
            severity: "error",
            suggestion: "Regenerate the convex hull from non-coplanar source geometry.",
          });
        }
      }
    }
  } else {
    diagnostics.push({ code: "TN_IR_PHYSICS_COMPOUND_SHAPE_UNSUPPORTED", message: `Compound collider child shape '${String(value.kind)}' is unsupported.`, path: `${path}/kind`, severity: "error", suggestion: "Use box, sphere, capsule, or convexHull." });
  }
}

function isFiniteVec3(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((part) => typeof part === "number" && Number.isFinite(part));
}

function hasDuplicateConvexHullPoints(points: ReadonlyArray<readonly [number, number, number]>): boolean {
  const keys = new Set<string>();
  for (const point of points) {
    const key = `${point[0]},${point[1]},${point[2]}`;
    if (keys.has(key)) return true;
    keys.add(key);
  }
  return false;
}

function hasConvexHullVolume(points: ReadonlyArray<readonly [number, number, number]>): boolean {
  const origin = points[0];
  if (origin === undefined) return false;
  const extent = Math.max(...([0, 1, 2] as const).map((axis) => {
    const coordinates = points.map((point) => point[axis]);
    return Math.max(...coordinates) - Math.min(...coordinates);
  }));
  const minimumSixTimesVolume = Math.max(Number.EPSILON, extent ** 3 * 1e-9);
  for (let firstIndex = 1; firstIndex < points.length - 2; firstIndex += 1) {
    const first = points[firstIndex];
    if (first === undefined) continue;
    for (let secondIndex = firstIndex + 1; secondIndex < points.length - 1; secondIndex += 1) {
      const second = points[secondIndex];
      if (second === undefined) continue;
      for (let thirdIndex = secondIndex + 1; thirdIndex < points.length; thirdIndex += 1) {
        const third = points[thirdIndex];
        if (third === undefined) continue;
        if (Math.abs(tetrahedronSixTimesVolume(origin, first, second, third)) > minimumSixTimesVolume) return true;
      }
    }
  }
  return false;
}

function tetrahedronSixTimesVolume(
  origin: readonly [number, number, number],
  first: readonly [number, number, number],
  second: readonly [number, number, number],
  third: readonly [number, number, number],
): number {
  const ax = first[0] - origin[0];
  const ay = first[1] - origin[1];
  const az = first[2] - origin[2];
  const bx = second[0] - origin[0];
  const by = second[1] - origin[1];
  const bz = second[2] - origin[2];
  const cx = third[0] - origin[0];
  const cy = third[1] - origin[1];
  const cz = third[2] - origin[2];
  return ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx);
}

function validateObjectFields(value: Record<string, unknown>, allowed: ReadonlySet<string>, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) diagnostics.push({ code, message: `Portable physics object uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error", suggestion: "Remove backend-specific or unknown fields and use the descriptor-owned portable fields." });
  }
}

function validatePhysicsObjectFields(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  component: "Collider" | "RigidBody",
  path: string,
  code: "TN_IR_PHYSICS_BODY_FIELD_UNSUPPORTED" | "TN_IR_PHYSICS_COLLIDER_FIELD_UNSUPPORTED",
  diagnostics: IIrDiagnostic[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key) && !isPhysicsFieldHandledBySpecificDiagnostic(component, key)) {
      diagnostics.push({
        code,
        message: `${component} uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: `Remove '${key}' or use a documented ${component} field.`,
      });
    }
  }
}

function isPhysicsFieldHandledBySpecificDiagnostic(component: "Collider" | "RigidBody", key: string): boolean {
  if (/(?:rapier|bevy|native|engine).*(?:handle|body|collider)|(?:handle|rawHandle)$/i.test(key)) {
    return true;
  }
  if (component === "RigidBody") {
    return ["backendSolver", "constraint", "constraints", "joint", "joints", "nondeterministic", "randomSeed", "solverRandomSeed"].includes(key);
  }
  return [
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
  ].includes(key);
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

function validatePhysicsJoint(joint: Record<string, unknown>, path: string, entityId: string, entityIds: Set<string>, rigidBodyEntityIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
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
  } else if (!rigidBodyEntityIds.has(joint.connectedEntity)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_JOINT_TARGET_BODY_MISSING",
      message: "PhysicsJoint.connectedEntity must reference an entity with a RigidBody.",
      path: `${path}/connectedEntity`,
      severity: "error",
      suggestion: "Add a RigidBody to the connected entity or select another rigid-body entity.",
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
