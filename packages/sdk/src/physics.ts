import { assertFiniteNumber, assertNonNegativeNumber, assertNormalizedNumber, assertPositiveNumber, SdkError } from "./errors.js";
import type { Vector3Tuple } from "./math/Vector3.js";

export type PhysicsBodyKind = "dynamic" | "kinematic" | "static";
export type PhysicsColliderKind = "box" | "capsule" | "mesh" | "sphere";
export type Boolean3Tuple = readonly [boolean, boolean, boolean];

export interface IPhysicsFilterOptions {
  contact?: IContactFilterDeclaration;
  layer?: string;
  mask?: ReadonlyArray<string>;
  material?: string;
}

export type ContactPhase = "begin" | "end" | "stay";
export type ContactSortKey = "phase" | "self" | "other" | "point";

export interface IContactFilterDeclaration {
  phases?: ReadonlyArray<ContactPhase>;
}

export interface IPhysicsContactEventPayload {
  material?: string;
  normal?: Vector3Tuple;
  other: string;
  phase: ContactPhase;
  point?: Vector3Tuple;
  pointIndex: number;
  self: string;
}

export interface IColliderSlopeDeclaration {
  axis: "x" | "z";
  direction: -1 | 1;
  rise: number;
  run: number;
}

export type SensorPhase = "enter" | "exit" | "stay";

export interface ISensorDeclaration {
  interactionKind?: "checkpoint" | "hazard" | "pickup" | "prompt" | "zone";
  occupantLimit?: number;
  phases?: ReadonlyArray<SensorPhase>;
  trackOccupants?: boolean;
}

export interface IRigidBodyDeclaration {
  /** Primitive solver v2 metadata is portable only for box, sphere, and capsule collider bodies. */
  angularVelocity?: Vector3Tuple;
  ccd?: ICcdDeclaration;
  damping?: number;
  enabledRotations?: Boolean3Tuple;
  enabledTranslations?: Boolean3Tuple;
  gravityScale?: number;
  inverseMass?: number;
  kind: PhysicsBodyKind;
  mass?: number;
  sleepThreshold?: number;
  solverIterations?: number;
  velocity?: Vector3Tuple;
}

export interface ICcdDeclaration {
  enabled: boolean;
  maxSubsteps?: number;
  mode: "linear" | "swept-aabb";
}

export interface IMeshColliderDeclaration {
  bounds: {
    center?: Vector3Tuple;
    size: Vector3Tuple;
  };
  source?: string;
  triangleCount: number;
}

export interface IColliderDeclaration {
  center?: Vector3Tuple;
  contact?: IContactFilterDeclaration;
  friction?: number;
  height?: number;
  kind: PhysicsColliderKind;
  layer?: string;
  mask?: string[];
  material?: string;
  mesh?: IMeshColliderDeclaration;
  radius?: number;
  restitution?: number;
  sensor?: ISensorDeclaration;
  size?: Vector3Tuple;
  slope?: IColliderSlopeDeclaration;
  trigger?: boolean;
}

export interface IPhysicsJointDeclaration {
  anchor?: Vector3Tuple;
  axis?: Vector3Tuple;
  connectedEntity: string;
  damping?: number;
  kind: "hinge" | "slider" | "suspension";
  limits?: {
    max: number;
    min: number;
  };
  stiffness?: number;
  travel?: number;
}

export interface IPhysicsSlipCurvePointDeclaration {
  grip: number;
  slip: number;
}

export interface ITireModelDeclaration {
  lateralSlipCurve: ReadonlyArray<IPhysicsSlipCurvePointDeclaration>;
  loadSensitivity: number;
  longitudinalSlipCurve: ReadonlyArray<IPhysicsSlipCurvePointDeclaration>;
  rollingResistance: number;
}

export type PhysicsSurfaceCombineRule = "average" | "maximum" | "minimum" | "multiply";

export interface IPhysicsSurfaceDeclaration {
  combineRule: PhysicsSurfaceCombineRule;
  grip: number;
  rollingResistance: number;
}

export interface IWheelDeclaration {
  attachment: Vector3Tuple;
  braked: boolean;
  driven: boolean;
  id: string;
  radius: number;
  steering: boolean;
  suspension: { damperRate: number; springRate: number; travel: number };
  tire: string;
  visual?: string;
  width: number;
}

export interface IWheelAssemblyDeclaration {
  maxSteeringAngle: number;
  maxSuspensionForce: number;
  maxTireForce: number;
  wheels: ReadonlyArray<IWheelDeclaration>;
}

export interface IWheelControlInput {
  brake: number;
  drive: number;
  steering: number;
}

export interface IVehicleControllerDeclaration {
  assists?: { abs?: IVehicleAssistDeclaration; tcs?: IVehicleAssistDeclaration };
  bindings?: { brake?: string; clutch?: string; gearDown?: string; gearUp?: string; handbrake?: string; steer?: string; throttle?: string };
  brakes: { frontBias: number; handbrakeWheelIds: ReadonlyArray<string> };
  differential: { kind: "limited-slip" | "locked" | "open"; limitedSlipRatio?: number };
  engine: { engineBraking: number; idleRpm: number; redlineRpm: number; torqueCurve: ReadonlyArray<{ rpm: number; torque: number }> };
  steering: { speedCurve: ReadonlyArray<{ scale: number; speed: number }> };
  transmission: { clutchResponse: number; downshiftRpm?: number; finalDrive: number; forwardRatios: ReadonlyArray<number>; reverseRatio: number; shiftPolicy: "automatic" | "manual"; upshiftRpm?: number };
}
export interface IVehicleAssistDeclaration { enabled: boolean; response: number; slipThreshold: number }
export interface IVehicleControllerInputs { brake: number; clutch: number; gear?: number; handbrake: number; steer: number; throttle: number }

export interface IPhysicsDeclaration {
  body?: IRigidBodyDeclaration;
  collider?: IColliderDeclaration;
  joint?: IPhysicsJointDeclaration;
  surface?: IPhysicsSurfaceDeclaration;
  tireModel?: ITireModelDeclaration;
  wheelAssembly?: IWheelAssemblyDeclaration;
  vehicleController?: IVehicleControllerDeclaration;
}

type ColliderCenterOptions = {
  center?: Vector3Tuple;
};

export function rigidBody(
  kind: PhysicsBodyKind,
  options: {
    angularVelocity?: Vector3Tuple;
    ccd?: ICcdDeclaration;
    damping?: number;
    enabledRotations?: Boolean3Tuple;
    enabledTranslations?: Boolean3Tuple;
    gravityScale?: number;
    inverseMass?: number;
    mass?: number;
    sleepThreshold?: number;
    solverIterations?: number;
    velocity?: Vector3Tuple;
  } = {},
): IRigidBodyDeclaration {
  if (kind !== "dynamic" && kind !== "kinematic" && kind !== "static") {
    throw new SdkError("TN_SDK_PHYSICS_BODY_UNSUPPORTED", `Unsupported rigid body kind '${String(kind)}'.`);
  }
  options.angularVelocity?.forEach((value, index) => {
    assertFiniteNumber(value, "TN_SDK_PHYSICS_BODY_INVALID_ANGULAR_VELOCITY", `RigidBody.angularVelocity[${index}]`);
  });
  const ccd = normalizeCcd(options.ccd);
  if (options.damping !== undefined) {
    assertNonNegativeNumber(options.damping, "TN_SDK_PHYSICS_BODY_INVALID_DAMPING", "RigidBody.damping");
  }
  options.enabledRotations?.forEach((value, index) => {
    if (typeof value !== "boolean") {
      throw new SdkError("TN_SDK_PHYSICS_BODY_INVALID_ENABLED_ROTATIONS", `RigidBody.enabledRotations[${index}] must be boolean.`);
    }
  });
  options.enabledTranslations?.forEach((value, index) => {
    if (typeof value !== "boolean") {
      throw new SdkError("TN_SDK_PHYSICS_BODY_INVALID_ENABLED_TRANSLATIONS", `RigidBody.enabledTranslations[${index}] must be boolean.`);
    }
  });
  if (options.gravityScale !== undefined) {
    assertFiniteNumber(options.gravityScale, "TN_SDK_PHYSICS_BODY_INVALID_GRAVITY_SCALE", "RigidBody.gravityScale");
  }
  if (options.inverseMass !== undefined) {
    assertNonNegativeNumber(options.inverseMass, "TN_SDK_PHYSICS_BODY_INVALID_INVERSE_MASS", "RigidBody.inverseMass");
    if (kind !== "dynamic" && options.inverseMass !== 0) {
      throw new SdkError("TN_SDK_PHYSICS_BODY_INVALID_INVERSE_MASS", "RigidBody.inverseMass must be 0 for static and kinematic bodies.");
    }
  }
  if (options.mass !== undefined) {
    assertPositiveNumber(options.mass, "TN_SDK_PHYSICS_BODY_INVALID_MASS", "RigidBody.mass");
  }
  if (options.inverseMass !== undefined && options.mass !== undefined && Math.abs(options.inverseMass - 1 / options.mass) > 0.000001) {
    throw new SdkError("TN_SDK_PHYSICS_BODY_INVALID_INVERSE_MASS", "RigidBody.inverseMass must match 1 / RigidBody.mass when both are authored.");
  }
  if (options.sleepThreshold !== undefined) {
    assertNonNegativeNumber(options.sleepThreshold, "TN_SDK_PHYSICS_BODY_INVALID_SLEEP_THRESHOLD", "RigidBody.sleepThreshold");
  }
  if (options.solverIterations !== undefined && (!Number.isInteger(options.solverIterations) || options.solverIterations < 1 || options.solverIterations > 64)) {
    throw new SdkError("TN_SDK_PHYSICS_BODY_INVALID_SOLVER_ITERATIONS", "RigidBody.solverIterations must be an integer from 1 to 64.");
  }
  options.velocity?.forEach((value, index) => {
    assertFiniteNumber(value, "TN_SDK_PHYSICS_BODY_INVALID_VELOCITY", `RigidBody.velocity[${index}]`);
  });
  return {
    angularVelocity: options.angularVelocity,
    ...(ccd === undefined ? {} : { ccd }),
    damping: options.damping,
    enabledRotations: options.enabledRotations,
    enabledTranslations: options.enabledTranslations,
    gravityScale: options.gravityScale,
    inverseMass: options.inverseMass,
    kind,
    mass: options.mass,
    sleepThreshold: options.sleepThreshold,
    solverIterations: options.solverIterations,
    velocity: options.velocity,
  };
}

export function boxCollider(size: Vector3Tuple, options: { sensor?: ISensorDeclaration; slope?: IColliderSlopeDeclaration; trigger?: boolean } & ColliderCenterOptions & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  size.forEach((value, index) => {
    assertPositiveNumber(value, "TN_SDK_PHYSICS_COLLIDER_INVALID_SIZE", `Collider.size[${index}]`);
  });
  const sensor = normalizeSensor(options.sensor);
  return { ...normalizeColliderCenter(options), kind: "box", ...(sensor === undefined ? {} : { sensor }), size: [...size] as Vector3Tuple, slope: normalizeSlope(options.slope), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function sphereCollider(radius: number, options: { sensor?: ISensorDeclaration; trigger?: boolean } & ColliderCenterOptions & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  const sensor = normalizeSensor(options.sensor);
  return { ...normalizeColliderCenter(options), kind: "sphere", radius, ...(sensor === undefined ? {} : { sensor }), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function capsuleCollider(radius: number, height: number, options: { sensor?: ISensorDeclaration; trigger?: boolean } & ColliderCenterOptions & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  assertPositiveNumber(height, "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height");
  if (height < radius * 2) {
    throw new SdkError("TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height is the total capsule height and must be at least 2 * Collider.radius.");
  }
  const sensor = normalizeSensor(options.sensor);
  return { ...normalizeColliderCenter(options), height, kind: "capsule", radius, ...(sensor === undefined ? {} : { sensor }), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function meshCollider(options: { mesh?: IMeshColliderDeclaration; trigger?: boolean } & ColliderCenterOptions & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  const mesh = options.mesh === undefined ? undefined : normalizeMeshCollider(options.mesh);
  return { ...normalizeColliderCenter(options), kind: "mesh", ...(mesh === undefined ? {} : { mesh }), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function physics(options: IPhysicsDeclaration): IPhysicsDeclaration {
  return options;
}

export function physicsSurface(options: IPhysicsSurfaceDeclaration): IPhysicsSurfaceDeclaration {
  if (!["average", "maximum", "minimum", "multiply"].includes(options.combineRule)) {
    throw new SdkError("TN_SDK_PHYSICS_SURFACE_INVALID", "PhysicsSurface.combineRule must be average, minimum, multiply, or maximum.");
  }
  assertBounded(options.grip, 0, 4, "TN_SDK_PHYSICS_SURFACE_INVALID", "PhysicsSurface.grip");
  assertBounded(options.rollingResistance, 0, 1, "TN_SDK_PHYSICS_SURFACE_INVALID", "PhysicsSurface.rollingResistance");
  return { combineRule: options.combineRule, grip: options.grip, rollingResistance: options.rollingResistance };
}

export function tireModel(options: ITireModelDeclaration): ITireModelDeclaration {
  const longitudinalSlipCurve = normalizeSlipCurve(options.longitudinalSlipCurve, "TireModel.longitudinalSlipCurve");
  const lateralSlipCurve = normalizeSlipCurve(options.lateralSlipCurve, "TireModel.lateralSlipCurve");
  assertBounded(options.loadSensitivity, 0, 4, "TN_SDK_PHYSICS_TIRE_INVALID", "TireModel.loadSensitivity");
  assertBounded(options.rollingResistance, 0, 1, "TN_SDK_PHYSICS_TIRE_INVALID", "TireModel.rollingResistance");
  return { lateralSlipCurve, loadSensitivity: options.loadSensitivity, longitudinalSlipCurve, rollingResistance: options.rollingResistance };
}

export function wheelAssembly(wheels: ReadonlyArray<IWheelDeclaration>, limits: { maxSteeringAngle: number; maxSuspensionForce: number; maxTireForce: number }): IWheelAssemblyDeclaration {
  if (wheels.length === 0 || wheels.length > 16) {
    throw new SdkError("TN_SDK_PHYSICS_WHEEL_ASSEMBLY_INVALID", "WheelAssembly must contain 1-16 wheels.");
  }
  const ids = new Set<string>();
  assertBounded(limits.maxSteeringAngle, Number.MIN_VALUE, Math.PI / 2, "TN_SDK_PHYSICS_WHEEL_STEERING_LIMIT_INVALID", "WheelAssembly.maxSteeringAngle");
  assertBounded(limits.maxSuspensionForce, Number.MIN_VALUE, 1_000_000, "TN_SDK_PHYSICS_WHEEL_FORCE_LIMIT_INVALID", "WheelAssembly.maxSuspensionForce");
  assertBounded(limits.maxTireForce, Number.MIN_VALUE, 1_000_000, "TN_SDK_PHYSICS_WHEEL_FORCE_LIMIT_INVALID", "WheelAssembly.maxTireForce");
  return { maxSteeringAngle: limits.maxSteeringAngle, maxSuspensionForce: limits.maxSuspensionForce, maxTireForce: limits.maxTireForce, wheels: wheels.map((wheel, index) => {
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(wheel.id) || ids.has(wheel.id)) {
      throw new SdkError("TN_SDK_PHYSICS_WHEEL_ID_INVALID", `WheelAssembly.wheels[${index}].id must be a unique portable identifier.`);
    }
    ids.add(wheel.id);
    wheel.attachment.forEach((value, axis) => assertFiniteNumber(value, "TN_SDK_PHYSICS_WHEEL_ATTACHMENT_INVALID", `WheelAssembly.wheels[${index}].attachment[${axis}]`));
    assertBounded(wheel.radius, 0.05, 5, "TN_SDK_PHYSICS_WHEEL_GEOMETRY_INVALID", `WheelAssembly.wheels[${index}].radius`);
    assertBounded(wheel.width, 0.02, 2, "TN_SDK_PHYSICS_WHEEL_GEOMETRY_INVALID", `WheelAssembly.wheels[${index}].width`);
    assertBounded(wheel.suspension.travel, 0, 2, "TN_SDK_PHYSICS_WHEEL_SUSPENSION_INVALID", `WheelAssembly.wheels[${index}].suspension.travel`);
    assertBounded(wheel.suspension.springRate, 0, 1_000_000, "TN_SDK_PHYSICS_WHEEL_SUSPENSION_INVALID", `WheelAssembly.wheels[${index}].suspension.springRate`);
    assertBounded(wheel.suspension.damperRate, 0, 1_000_000, "TN_SDK_PHYSICS_WHEEL_SUSPENSION_INVALID", `WheelAssembly.wheels[${index}].suspension.damperRate`);
    if (wheel.tire.trim() === "" || wheel.visual?.trim() === "") {
      throw new SdkError("TN_SDK_PHYSICS_WHEEL_REFERENCE_INVALID", `WheelAssembly.wheels[${index}] references must be non-empty entity ids.`);
    }
    return { ...wheel, attachment: [...wheel.attachment] as Vector3Tuple, suspension: { ...wheel.suspension } };
  }) };
}

export function wheelControlInput(input: IWheelControlInput): IWheelControlInput {
  assertBounded(input.brake, 0, 1, "TN_SDK_PHYSICS_WHEEL_CONTROL_INVALID", "WheelControlInput.brake");
  assertBounded(input.drive, -1, 1, "TN_SDK_PHYSICS_WHEEL_CONTROL_INVALID", "WheelControlInput.drive");
  assertBounded(input.steering, -1, 1, "TN_SDK_PHYSICS_WHEEL_CONTROL_INVALID", "WheelControlInput.steering");
  return { brake: input.brake, drive: input.drive, steering: input.steering };
}

export function vehicleController(options: IVehicleControllerDeclaration): IVehicleControllerDeclaration {
  if (options.engine.torqueCurve.length < 2 || options.engine.torqueCurve.length > 16) throw new SdkError("TN_SDK_PHYSICS_VEHICLE_CURVE_INVALID", "VehicleController.engine.torqueCurve must contain 2-16 points.");
  let previousRpm = -1;
  for (const [index, point] of options.engine.torqueCurve.entries()) {
    assertNonNegativeNumber(point.rpm, "TN_SDK_PHYSICS_VEHICLE_CURVE_INVALID", `VehicleController.engine.torqueCurve[${index}].rpm`);
    assertNonNegativeNumber(point.torque, "TN_SDK_PHYSICS_VEHICLE_CURVE_INVALID", `VehicleController.engine.torqueCurve[${index}].torque`);
    if (point.rpm <= previousRpm) throw new SdkError("TN_SDK_PHYSICS_VEHICLE_CURVE_INVALID", "VehicleController torque curve RPM values must be strictly increasing.");
    previousRpm = point.rpm;
  }
  assertPositiveNumber(options.engine.idleRpm, "TN_SDK_PHYSICS_VEHICLE_RPM_INVALID", "VehicleController.engine.idleRpm");
  assertPositiveNumber(options.engine.redlineRpm, "TN_SDK_PHYSICS_VEHICLE_RPM_INVALID", "VehicleController.engine.redlineRpm");
  if (options.engine.idleRpm >= options.engine.redlineRpm) throw new SdkError("TN_SDK_PHYSICS_VEHICLE_RPM_INVALID", "VehicleController idle RPM must be below redline RPM.");
  assertNonNegativeNumber(options.engine.engineBraking, "TN_SDK_PHYSICS_VEHICLE_ENGINE_BRAKING_INVALID", "VehicleController.engine.engineBraking");
  if (options.transmission.forwardRatios.length < 1 || options.transmission.forwardRatios.length > 12) throw new SdkError("TN_SDK_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID", "VehicleController requires 1-12 forward ratios.");
  options.transmission.forwardRatios.forEach((ratio, index) => assertPositiveNumber(ratio, "TN_SDK_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID", `VehicleController.transmission.forwardRatios[${index}]`));
  assertPositiveNumber(options.transmission.reverseRatio, "TN_SDK_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID", "VehicleController.transmission.reverseRatio");
  assertPositiveNumber(options.transmission.finalDrive, "TN_SDK_PHYSICS_VEHICLE_GEAR_RATIOS_INVALID", "VehicleController.transmission.finalDrive");
  assertPositiveNumber(options.transmission.clutchResponse, "TN_SDK_PHYSICS_VEHICLE_CLUTCH_RESPONSE_INVALID", "VehicleController.transmission.clutchResponse");
  if (!['automatic', 'manual'].includes(options.transmission.shiftPolicy)) throw new SdkError("TN_SDK_PHYSICS_VEHICLE_SHIFT_POLICY_INVALID", "VehicleController shiftPolicy must be automatic or manual.");
  assertNormalizedNumber(options.brakes.frontBias, "TN_SDK_PHYSICS_VEHICLE_BRAKE_BIAS_INVALID", "VehicleController.brakes.frontBias");
  if (options.differential.kind === "limited-slip") assertBounded(options.differential.limitedSlipRatio ?? Number.NaN, 1, 10, "TN_SDK_PHYSICS_VEHICLE_DIFFERENTIAL_INVALID", "VehicleController.differential.limitedSlipRatio");
  for (const assist of [options.assists?.abs, options.assists?.tcs]) if (assist !== undefined) {
    assertPositiveNumber(assist.response, "TN_SDK_PHYSICS_VEHICLE_ASSIST_RESPONSE_INVALID", "VehicleController assist response");
    assertBounded(assist.slipThreshold, 0, 4, "TN_SDK_PHYSICS_VEHICLE_ASSIST_THRESHOLD_INVALID", "VehicleController assist slipThreshold");
  }
  return structuredClone(options);
}

export function vehicleControllerInputs(input: IVehicleControllerInputs): IVehicleControllerInputs {
  for (const field of ["throttle", "brake", "handbrake", "clutch"] as const) assertNormalizedNumber(input[field], "TN_SDK_PHYSICS_VEHICLE_INPUT_INVALID", `VehicleControllerInputs.${field}`);
  assertBounded(input.steer, -1, 1, "TN_SDK_PHYSICS_VEHICLE_INPUT_INVALID", "VehicleControllerInputs.steer");
  if (input.gear !== undefined && (!Number.isInteger(input.gear) || input.gear < -1 || input.gear > 12)) throw new SdkError("TN_SDK_PHYSICS_VEHICLE_INPUT_INVALID", "VehicleControllerInputs.gear must be -1, 0, or 1-12.");
  return { ...input };
}

function normalizeSlipCurve(points: ReadonlyArray<IPhysicsSlipCurvePointDeclaration>, label: string): IPhysicsSlipCurvePointDeclaration[] {
  if (points.length < 2 || points.length > 16) throw new SdkError("TN_SDK_PHYSICS_TIRE_SLIP_CURVE_INVALID", `${label} must contain 2-16 points.`);
  let previous = Number.NEGATIVE_INFINITY;
  return points.map((point, index) => {
    assertBounded(point.slip, -4, 4, "TN_SDK_PHYSICS_TIRE_SLIP_CURVE_INVALID", `${label}[${index}].slip`);
    assertBounded(point.grip, 0, 4, "TN_SDK_PHYSICS_TIRE_SLIP_CURVE_INVALID", `${label}[${index}].grip`);
    if (point.slip <= previous) throw new SdkError("TN_SDK_PHYSICS_TIRE_SLIP_CURVE_NON_MONOTONIC", `${label}[${index}].slip must be strictly greater than the previous slip coordinate.`);
    previous = point.slip;
    return { grip: point.grip, slip: point.slip };
  });
}

function assertBounded(value: number, min: number, max: number, code: string, label: string): void {
  assertFiniteNumber(value, code, label);
  if (value < min || value > max) throw new SdkError(code, `${label} must be between ${min} and ${max}.`);
}

export function physicsJoint(kind: IPhysicsJointDeclaration["kind"], connectedEntity: string, options: Omit<IPhysicsJointDeclaration, "connectedEntity" | "kind"> = {}): IPhysicsJointDeclaration {
  if (!["hinge", "slider", "suspension"].includes(kind)) {
    throw new SdkError("TN_SDK_PHYSICS_JOINT_UNSUPPORTED", "Physics joint kind must be hinge, slider, or suspension.");
  }
  if (connectedEntity.trim() === "") {
    throw new SdkError("TN_SDK_PHYSICS_JOINT_INVALID", "Physics joint connectedEntity must be a non-empty entity id.");
  }
  options.anchor?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.anchor[${index}]`));
  options.axis?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.axis[${index}]`));
  if (options.damping !== undefined) {
    assertNonNegativeNumber(options.damping, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.damping");
  }
  if (options.stiffness !== undefined) {
    assertNonNegativeNumber(options.stiffness, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.stiffness");
  }
  if (options.travel !== undefined) {
    assertNonNegativeNumber(options.travel, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.travel");
  }
  if (options.limits !== undefined) {
    assertFiniteNumber(options.limits.min, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.limits.min");
    assertFiniteNumber(options.limits.max, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.limits.max");
    if (options.limits.min > options.limits.max) {
      throw new SdkError("TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.limits.min must be less than or equal to limits.max.");
    }
  }
  return { connectedEntity, kind, ...options };
}

function normalizeCcd(value: ICcdDeclaration | undefined): ICcdDeclaration | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value.enabled !== "boolean" || !["linear", "swept-aabb"].includes(value.mode)) {
    throw new SdkError("TN_SDK_PHYSICS_CCD_INVALID", "RigidBody.ccd requires enabled boolean and mode linear or swept-aabb.");
  }
  if (value.maxSubsteps !== undefined && (!Number.isInteger(value.maxSubsteps) || value.maxSubsteps < 1 || value.maxSubsteps > 16)) {
    throw new SdkError("TN_SDK_PHYSICS_CCD_INVALID", "RigidBody.ccd.maxSubsteps must be an integer from 1 to 16.");
  }
  return { enabled: value.enabled, ...(value.maxSubsteps === undefined ? {} : { maxSubsteps: value.maxSubsteps }), mode: value.mode };
}

function normalizeMeshCollider(value: IMeshColliderDeclaration): IMeshColliderDeclaration {
  if (!Number.isInteger(value.triangleCount) || value.triangleCount < 1 || value.triangleCount > 10000) {
    throw new SdkError("TN_SDK_PHYSICS_MESH_COLLIDER_INVALID", "Mesh collider triangleCount must be an integer from 1 to 10000.");
  }
  value.bounds.size.forEach((item, index) => assertPositiveNumber(item, "TN_SDK_PHYSICS_MESH_COLLIDER_INVALID", `Collider.mesh.bounds.size[${index}]`));
  value.bounds.center?.forEach((item, index) => assertFiniteNumber(item, "TN_SDK_PHYSICS_MESH_COLLIDER_INVALID", `Collider.mesh.bounds.center[${index}]`));
  if (value.source !== undefined && value.source.trim() === "") {
    throw new SdkError("TN_SDK_PHYSICS_MESH_COLLIDER_INVALID", "Mesh collider source must be a non-empty asset id when authored.");
  }
  return {
    bounds: {
      ...(value.bounds.center === undefined ? {} : { center: [...value.bounds.center] as Vector3Tuple }),
      size: [...value.bounds.size] as Vector3Tuple,
    },
    ...(value.source === undefined ? {} : { source: value.source }),
    triangleCount: value.triangleCount,
  };
}

function normalizeColliderCenter(options: ColliderCenterOptions): Pick<IColliderDeclaration, "center"> {
  options.center?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_COLLIDER_CENTER_INVALID", `Collider.center[${index}]`));
  return options.center === undefined ? {} : { center: [...options.center] as Vector3Tuple };
}

function normalizeFilter(options: IPhysicsFilterOptions): Pick<IColliderDeclaration, "contact" | "layer" | "mask" | "material"> {
  if (options.layer !== undefined && !isPortableFilterName(options.layer)) {
    throw new SdkError("TN_SDK_PHYSICS_FILTER_INVALID", "Collider.layer must be a non-empty portable filter layer string.");
  }
  if (options.mask !== undefined && (options.mask.length > 32 || options.mask.some((entry) => !isPortableFilterName(entry)))) {
    throw new SdkError("TN_SDK_PHYSICS_FILTER_INVALID", "Collider.mask must contain at most 32 non-empty portable filter layer strings.");
  }
  if (options.material !== undefined && !isPortableFilterName(options.material)) {
    throw new SdkError("TN_SDK_PHYSICS_FILTER_INVALID", "Collider.material must be a non-empty portable contact material string.");
  }
  return {
    ...(options.contact === undefined ? {} : { contact: normalizeContactFilter(options.contact) }),
    ...(options.layer === undefined ? {} : { layer: options.layer }),
    ...(options.mask === undefined ? {} : { mask: [...options.mask] }),
    ...(options.material === undefined ? {} : { material: options.material }),
  };
}

function normalizeContactFilter(value: IContactFilterDeclaration): IContactFilterDeclaration {
  const phases = value.phases === undefined ? undefined : [...value.phases];
  if (phases !== undefined && (phases.length === 0 || phases.some((phase) => phase !== "begin" && phase !== "stay" && phase !== "end"))) {
    throw new SdkError("TN_SDK_PHYSICS_FILTER_INVALID", "Collider.contact.phases must be a non-empty array containing begin, stay, or end only.");
  }
  return phases === undefined ? {} : { phases };
}

function isPortableFilterName(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(value);
}

export interface IPhysicsMaterialOptions {
  friction?: number;
  restitution?: number;
}

function normalizeMaterial(options: IPhysicsMaterialOptions): Pick<IColliderDeclaration, "friction" | "restitution"> {
  if (options.friction !== undefined) {
    assertNonNegativeNumber(options.friction, "TN_SDK_PHYSICS_COLLIDER_INVALID_FRICTION", "Collider.friction");
  }
  if (options.restitution !== undefined) {
    assertNormalizedNumber(options.restitution, "TN_SDK_PHYSICS_COLLIDER_INVALID_RESTITUTION", "Collider.restitution");
  }
  return {
    ...(options.friction === undefined ? {} : { friction: options.friction }),
    ...(options.restitution === undefined ? {} : { restitution: options.restitution }),
  };
}

function normalizeSlope(slope: IColliderSlopeDeclaration | undefined): IColliderSlopeDeclaration | undefined {
  if (slope === undefined) {
    return undefined;
  }
  if (slope.axis !== "x" && slope.axis !== "z") {
    throw new SdkError("TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID", "Collider.slope.axis must be x or z.");
  }
  if (slope.direction !== -1 && slope.direction !== 1) {
    throw new SdkError("TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID", "Collider.slope.direction must be -1 or 1.");
  }
  assertPositiveNumber(slope.rise, "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID", "Collider.slope.rise");
  assertPositiveNumber(slope.run, "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID", "Collider.slope.run");
  return { axis: slope.axis, direction: slope.direction, rise: slope.rise, run: slope.run };
}

function normalizeSensor(sensor: ISensorDeclaration | undefined): ISensorDeclaration | undefined {
  if (sensor === undefined) {
    return undefined;
  }
  if (sensor.occupantLimit !== undefined && (!Number.isInteger(sensor.occupantLimit) || sensor.occupantLimit < 1 || sensor.occupantLimit > 128)) {
    throw new SdkError("TN_SDK_PHYSICS_SENSOR_INVALID", "Collider.sensor.occupantLimit must be an integer from 1 to 128.");
  }
  const phases = sensor.phases === undefined ? undefined : [...sensor.phases];
  if (phases !== undefined && (phases.length === 0 || phases.some((phase) => phase !== "enter" && phase !== "stay" && phase !== "exit"))) {
    throw new SdkError("TN_SDK_PHYSICS_SENSOR_INVALID", "Collider.sensor.phases must be a non-empty array containing enter, stay, or exit only.");
  }
  return {
    ...(sensor.interactionKind === undefined ? {} : { interactionKind: sensor.interactionKind }),
    ...(sensor.occupantLimit === undefined ? {} : { occupantLimit: sensor.occupantLimit }),
    ...(phases === undefined ? {} : { phases }),
    ...(sensor.trackOccupants === undefined ? {} : { trackOccupants: sensor.trackOccupants }),
  };
}
