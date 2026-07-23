import { assertFiniteNumber, assertNonNegativeNumber, assertNormalizedNumber, assertPositiveNumber, SdkError } from "./errors.js";
import type { Vector3Tuple } from "./math/Vector3.js";

export type PhysicsBodyKind = "dynamic" | "kinematic" | "static";
export type PhysicsColliderKind = "box" | "capsule" | "mesh" | "sphere";
export type Boolean3Tuple = readonly [boolean, boolean, boolean];
export type QuaternionTuple = readonly [number, number, number, number];

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
  breakForce?: number;
  breakTorque?: number;
  connectedAnchor?: Vector3Tuple;
  connectedEntity: string;
  connectedRotation?: QuaternionTuple;
  damping?: number;
  kind: "ball" | "fixed" | "hinge" | "rope" | "slider" | "suspension";
  length?: number;
  limits?: {
    max: number;
    min: number;
  };
  motor?: {
    damping?: number;
    maxForce?: number;
    maxTorque?: number;
    mode: "position" | "velocity";
    stiffness?: number;
    target: number;
  };
  rotation?: QuaternionTuple;
  stiffness?: number;
  travel?: number;
}

export interface IDestructibleDeclaration {
  activationBudget?: number;
  bondStrength?: number;
  cleanupPolicy?: "despawn" | "pool" | "sleep";
  fractureManifest: string;
  impactFilter?: { layers?: ReadonlyArray<string>; minImpulse?: number };
  maxDepth?: number;
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
  aerodynamicBody?: IAerodynamicBodyDeclaration;
  body?: IRigidBodyDeclaration;
  collider?: IColliderDeclaration;
  destructible?: IDestructibleDeclaration;
  joint?: IPhysicsJointDeclaration;
  surface?: IPhysicsSurfaceDeclaration;
  tireModel?: ITireModelDeclaration;
  wheelAssembly?: IWheelAssemblyDeclaration;
  vehicleController?: IVehicleControllerDeclaration;
  windVolume?: IWindVolumeDeclaration;
}

export interface IAerodynamicCurvePointDeclaration { angle: number; coefficient: number }
export interface IAerodynamicSurfaceDeclaration { area: number; aspectRatio: number; centerOfPressure: Vector3Tuple; control?: { binding?: string; input?: number; maxDeflection: number; response: number }; dragCurve: ReadonlyArray<IAerodynamicCurvePointDeclaration>; id: string; liftCurve: ReadonlyArray<IAerodynamicCurvePointDeclaration>; recoveryAngle: number; stallAngle: number }
export interface IThrusterDeclaration { binding?: string; direction: Vector3Tuple; fuelHook?: string; id: string; maxForce: number; point: Vector3Tuple; response: number; throttle?: number }
export interface IAerodynamicBodyDeclaration { dragArea: Vector3Tuple; maxForce: number; surfaces: ReadonlyArray<IAerodynamicSurfaceDeclaration>; thrusters?: ReadonlyArray<IThrusterDeclaration> }
export interface IWindVolumeDeclaration { airDensity?: number; gust?: { amplitude: Vector3Tuple; frequency: number; seed: number }; radius?: number; shape: "box" | "sphere"; size?: Vector3Tuple; velocity: Vector3Tuple }

export function aerodynamicSurface(options: IAerodynamicSurfaceDeclaration): IAerodynamicSurfaceDeclaration {
  validatePortableId(options.id, "AerodynamicSurface.id");
  assertPositiveNumber(options.area, "TN_SDK_PHYSICS_AERO_AREA_INVALID", "AerodynamicSurface.area");
  assertPositiveNumber(options.aspectRatio, "TN_SDK_PHYSICS_AERO_ASPECT_INVALID", "AerodynamicSurface.aspectRatio");
  assertPositiveNumber(options.stallAngle, "TN_SDK_PHYSICS_AERO_STALL_INVALID", "AerodynamicSurface.stallAngle");
  assertNonNegativeNumber(options.recoveryAngle, "TN_SDK_PHYSICS_AERO_STALL_INVALID", "AerodynamicSurface.recoveryAngle");
  if (options.recoveryAngle >= options.stallAngle) throw new SdkError("TN_SDK_PHYSICS_AERO_STALL_INVALID", "AerodynamicSurface.recoveryAngle must be below stallAngle.");
  validatePhysicsVector(options.centerOfPressure, "AerodynamicSurface.centerOfPressure");
  validateAeroCurve(options.liftCurve, "liftCurve");
  validateAeroCurve(options.dragCurve, "dragCurve");
  if (options.control !== undefined) {
    assertNonNegativeNumber(options.control.maxDeflection, "TN_SDK_PHYSICS_AERO_CONTROL_INVALID", "AerodynamicSurface.control.maxDeflection");
    assertPositiveNumber(options.control.response, "TN_SDK_PHYSICS_AERO_CONTROL_INVALID", "AerodynamicSurface.control.response");
    if (options.control.input !== undefined) assertNormalizedNumber(options.control.input, "TN_SDK_PHYSICS_AERO_CONTROL_INVALID", "AerodynamicSurface.control.input");
  }
  return { ...options, centerOfPressure: [...options.centerOfPressure], dragCurve: options.dragCurve.map((point) => ({ ...point })), liftCurve: options.liftCurve.map((point) => ({ ...point })) };
}

export function thruster(options: IThrusterDeclaration): IThrusterDeclaration {
  validatePortableId(options.id, "Thruster.id");
  validatePhysicsVector(options.direction, "Thruster.direction");
  if (Math.hypot(...options.direction) < 0.000001) throw new SdkError("TN_SDK_PHYSICS_THRUSTER_DIRECTION_INVALID", "Thruster.direction must be non-zero.");
  validatePhysicsVector(options.point, "Thruster.point");
  assertPositiveNumber(options.maxForce, "TN_SDK_PHYSICS_THRUSTER_FORCE_INVALID", "Thruster.maxForce");
  assertPositiveNumber(options.response, "TN_SDK_PHYSICS_THRUSTER_RESPONSE_INVALID", "Thruster.response");
  if (options.throttle !== undefined) assertNormalizedNumber(options.throttle, "TN_SDK_PHYSICS_THRUSTER_THROTTLE_INVALID", "Thruster.throttle");
  return { ...options, direction: [...options.direction], point: [...options.point] };
}

export function aerodynamicBody(options: IAerodynamicBodyDeclaration): IAerodynamicBodyDeclaration {
  options.dragArea.forEach((value, index) => assertNonNegativeNumber(value, "TN_SDK_PHYSICS_AERO_DRAG_INVALID", `AerodynamicBody.dragArea[${index}]`));
  assertPositiveNumber(options.maxForce, "TN_SDK_PHYSICS_AERO_FORCE_INVALID", "AerodynamicBody.maxForce");
  if (options.surfaces.length === 0 || options.surfaces.length > 16) throw new SdkError("TN_SDK_PHYSICS_AERO_SURFACES_INVALID", "AerodynamicBody.surfaces must contain 1-16 surfaces.");
  if ((options.thrusters?.length ?? 0) > 16) throw new SdkError("TN_SDK_PHYSICS_AERO_THRUSTERS_INVALID", "AerodynamicBody.thrusters must contain at most 16 thrusters.");
  const surfaces = options.surfaces.map(aerodynamicSurface);
  const thrusters = options.thrusters?.map(thruster);
  if (new Set(surfaces.map((surface) => surface.id)).size !== surfaces.length || (thrusters !== undefined && new Set(thrusters.map((item) => item.id)).size !== thrusters.length)) throw new SdkError("TN_SDK_PHYSICS_AERO_ID_DUPLICATE", "Aerodynamic surface and thruster ids must be unique within their lists.");
  return { dragArea: [...options.dragArea], maxForce: options.maxForce, surfaces, ...(thrusters === undefined ? {} : { thrusters }) };
}

export function windVolume(options: IWindVolumeDeclaration): IWindVolumeDeclaration {
  validatePhysicsVector(options.velocity, "WindVolume.velocity");
  if (options.airDensity !== undefined) assertNonNegativeNumber(options.airDensity, "TN_SDK_PHYSICS_WIND_DENSITY_INVALID", "WindVolume.airDensity");
  if (options.shape === "box") {
    if (options.size === undefined) throw new SdkError("TN_SDK_PHYSICS_WIND_SHAPE_INVALID", "Box WindVolume requires size.");
    options.size.forEach((value, index) => assertPositiveNumber(value, "TN_SDK_PHYSICS_WIND_SHAPE_INVALID", `WindVolume.size[${index}]`));
  } else if (options.shape === "sphere") {
    if (options.radius === undefined) throw new SdkError("TN_SDK_PHYSICS_WIND_SHAPE_INVALID", "Sphere WindVolume requires radius.");
    assertPositiveNumber(options.radius, "TN_SDK_PHYSICS_WIND_SHAPE_INVALID", "WindVolume.radius");
  } else throw new SdkError("TN_SDK_PHYSICS_WIND_SHAPE_INVALID", "WindVolume.shape must be box or sphere.");
  if (options.gust !== undefined) {
    validatePhysicsVector(options.gust.amplitude, "WindVolume.gust.amplitude");
    assertNonNegativeNumber(options.gust.frequency, "TN_SDK_PHYSICS_WIND_GUST_INVALID", "WindVolume.gust.frequency");
    if (!Number.isInteger(options.gust.seed) || options.gust.seed < 0) throw new SdkError("TN_SDK_PHYSICS_WIND_GUST_INVALID", "WindVolume.gust.seed must be a non-negative integer.");
  }
  return { ...options, velocity: [...options.velocity] };
}

function validatePhysicsVector(value: Vector3Tuple, field: string): void { value.forEach((item, index) => assertFiniteNumber(item, "TN_SDK_PHYSICS_VECTOR_INVALID", `${field}[${index}]`)); }
function validatePortableId(value: string, field: string): void { if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,63}$/.test(value)) throw new SdkError("TN_SDK_PHYSICS_ID_INVALID", `${field} must be a stable portable identifier.`); }
function validateAeroCurve(curve: ReadonlyArray<IAerodynamicCurvePointDeclaration>, field: string): void {
  if (curve.length < 2 || curve.length > 16) throw new SdkError("TN_SDK_PHYSICS_AERO_CURVE_INVALID", `AerodynamicSurface.${field} must contain 2-16 points.`);
  let previous = -Infinity;
  for (const point of curve) { assertFiniteNumber(point.angle, "TN_SDK_PHYSICS_AERO_CURVE_INVALID", `${field}.angle`); assertFiniteNumber(point.coefficient, "TN_SDK_PHYSICS_AERO_CURVE_INVALID", `${field}.coefficient`); if (point.angle <= previous) throw new SdkError("TN_SDK_PHYSICS_AERO_CURVE_INVALID", `AerodynamicSurface.${field} angles must strictly increase.`); previous = point.angle; }
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

export function destructible(options: IDestructibleDeclaration): IDestructibleDeclaration {
  if (!/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+\.json$/u.test(options.fractureManifest)) throw new SdkError("TN_SDK_PHYSICS_DESTRUCTIBLE_MANIFEST_INVALID", "Destructible.fractureManifest must be a bundle-relative JSON path.");
  if (options.bondStrength !== undefined) assertPositiveNumber(options.bondStrength, "TN_SDK_PHYSICS_DESTRUCTIBLE_BOND_STRENGTH_INVALID", "Destructible.bondStrength");
  if (options.activationBudget !== undefined && (!Number.isInteger(options.activationBudget) || options.activationBudget < 1 || options.activationBudget > 256)) throw new SdkError("TN_SDK_PHYSICS_DESTRUCTIBLE_BUDGET_INVALID", "Destructible.activationBudget must be an integer from 1 to 256.");
  if (options.maxDepth !== undefined && (!Number.isInteger(options.maxDepth) || options.maxDepth < 0 || options.maxDepth > 8)) throw new SdkError("TN_SDK_PHYSICS_DESTRUCTIBLE_DEPTH_INVALID", "Destructible.maxDepth must be an integer from 0 to 8.");
  if (options.cleanupPolicy !== undefined && !["despawn", "pool", "sleep"].includes(options.cleanupPolicy)) throw new SdkError("TN_SDK_PHYSICS_DESTRUCTIBLE_CLEANUP_INVALID", "Destructible.cleanupPolicy must be despawn, pool, or sleep.");
  if (options.impactFilter?.minImpulse !== undefined) assertNonNegativeNumber(options.impactFilter.minImpulse, "TN_SDK_PHYSICS_DESTRUCTIBLE_FILTER_INVALID", "Destructible.impactFilter.minImpulse");
  if ((options.impactFilter?.layers?.length ?? 0) > 32) throw new SdkError("TN_SDK_PHYSICS_DESTRUCTIBLE_FILTER_INVALID", "Destructible.impactFilter.layers must contain at most 32 entries.");
  return { ...options, ...(options.impactFilter === undefined ? {} : { impactFilter: { ...options.impactFilter, ...(options.impactFilter.layers === undefined ? {} : { layers: [...options.impactFilter.layers] }) } }) };
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
  if (!["ball", "fixed", "hinge", "rope", "slider", "suspension"].includes(kind)) {
    throw new SdkError("TN_SDK_PHYSICS_JOINT_UNSUPPORTED", "Physics joint kind must be ball, fixed, hinge, rope, slider, or suspension.");
  }
  if (connectedEntity.trim() === "") {
    throw new SdkError("TN_SDK_PHYSICS_JOINT_INVALID", "Physics joint connectedEntity must be a non-empty entity id.");
  }
  options.anchor?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.anchor[${index}]`));
  options.axis?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.axis[${index}]`));
  options.connectedAnchor?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.connectedAnchor[${index}]`));
  options.rotation?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.rotation[${index}]`));
  options.connectedRotation?.forEach((value, index) => assertFiniteNumber(value, "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.connectedRotation[${index}]`));
  if (options.rotation !== undefined && Math.hypot(...options.rotation) < 0.000001) throw new SdkError("TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.rotation must be a non-zero quaternion.");
  if (options.connectedRotation !== undefined && Math.hypot(...options.connectedRotation) < 0.000001) throw new SdkError("TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.connectedRotation must be a non-zero quaternion.");
  if (options.damping !== undefined) {
    assertNonNegativeNumber(options.damping, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.damping");
  }
  if (options.stiffness !== undefined) {
    assertNonNegativeNumber(options.stiffness, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.stiffness");
  }
  if (options.travel !== undefined) {
    assertNonNegativeNumber(options.travel, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.travel");
  }
  if (options.length !== undefined) assertPositiveNumber(options.length, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.length");
  if (options.breakForce !== undefined) assertPositiveNumber(options.breakForce, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.breakForce");
  if (options.breakTorque !== undefined) assertPositiveNumber(options.breakTorque, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.breakTorque");
  if (options.limits !== undefined) {
    assertFiniteNumber(options.limits.min, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.limits.min");
    assertFiniteNumber(options.limits.max, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.limits.max");
    if (options.limits.min > options.limits.max) {
      throw new SdkError("TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.limits.min must be less than or equal to limits.max.");
    }
  }
  if (options.motor !== undefined) {
    if (!["hinge", "slider", "suspension"].includes(kind)) throw new SdkError("TN_SDK_PHYSICS_JOINT_MOTOR_UNSUPPORTED", `PhysicsJoint.motor is unsupported by '${kind}'; use hinge, slider, or suspension.`);
    assertFiniteNumber(options.motor.target, "TN_SDK_PHYSICS_JOINT_INVALID", "PhysicsJoint.motor.target");
    for (const key of ["damping", "maxForce", "maxTorque", "stiffness"] as const) if (options.motor[key] !== undefined) assertNonNegativeNumber(options.motor[key], "TN_SDK_PHYSICS_JOINT_INVALID", `PhysicsJoint.motor.${key}`);
    if (kind === "hinge" && options.motor.maxForce !== undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_MOTOR_LIMIT_UNSUPPORTED", "Hinge motors use maxTorque, not maxForce.");
    if ((kind === "slider" || kind === "suspension") && options.motor.maxTorque !== undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_MOTOR_LIMIT_UNSUPPORTED", `${kind} motors use maxForce, not maxTorque.`);
    if (kind === "hinge" && options.motor.maxTorque === undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_MOTOR_BOUND_REQUIRED", "Hinge motors require maxTorque so effort is bounded.");
    if ((kind === "slider" || kind === "suspension") && options.motor.maxForce === undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_MOTOR_BOUND_REQUIRED", `${kind} motors require maxForce so effort is bounded.`);
  }
  if (kind === "rope" && (options.length === undefined || options.length <= 0)) throw new SdkError("TN_SDK_PHYSICS_JOINT_INVALID", "Rope joints require a positive PhysicsJoint.length.");
  if (kind !== "rope" && options.length !== undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_FIELD_UNSUPPORTED", `PhysicsJoint.length is unsupported by '${kind}'.`);
  if (["hinge", "slider", "suspension"].includes(kind) && options.axis === undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_AXIS_REQUIRED", `PhysicsJoint.axis is required for '${kind}'.`);
  if (["ball", "fixed", "rope"].includes(kind) && options.axis !== undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_FIELD_UNSUPPORTED", `PhysicsJoint.axis is unsupported by '${kind}'.`);
  if (!["hinge", "slider", "suspension"].includes(kind) && options.limits !== undefined) throw new SdkError("TN_SDK_PHYSICS_JOINT_FIELD_UNSUPPORTED", `PhysicsJoint.limits is unsupported by '${kind}'.`);
  if (kind !== "suspension" && (options.travel !== undefined || options.stiffness !== undefined || options.damping !== undefined)) throw new SdkError("TN_SDK_PHYSICS_JOINT_FIELD_UNSUPPORTED", `Suspension compatibility fields are unsupported by '${kind}'.`);
  if (kind !== "fixed" && (options.rotation !== undefined || options.connectedRotation !== undefined)) throw new SdkError("TN_SDK_PHYSICS_JOINT_FIELD_UNSUPPORTED", `PhysicsJoint rotation frames are unsupported by '${kind}'.`);
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
