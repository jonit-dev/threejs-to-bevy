import { assertFiniteNumber, assertNonNegativeNumber, assertNormalizedNumber, assertPositiveNumber, SdkError } from "./errors.js";
import type { Vector3Tuple } from "./math/Vector3.js";

export type PhysicsBodyKind = "dynamic" | "kinematic" | "static";
export type PhysicsColliderKind = "box" | "capsule" | "cylinder" | "mesh" | "sphere";

export interface IPhysicsFilterOptions {
  layer?: string;
  mask?: ReadonlyArray<string>;
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
  friction?: number;
  height?: number;
  kind: PhysicsColliderKind;
  layer?: string;
  mask?: string[];
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

export interface IPhysicsDeclaration {
  body?: IRigidBodyDeclaration;
  collider?: IColliderDeclaration;
  joint?: IPhysicsJointDeclaration;
}

export function rigidBody(
  kind: PhysicsBodyKind,
  options: {
    angularVelocity?: Vector3Tuple;
    ccd?: ICcdDeclaration;
    damping?: number;
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
    gravityScale: options.gravityScale,
    inverseMass: options.inverseMass,
    kind,
    mass: options.mass,
    sleepThreshold: options.sleepThreshold,
    solverIterations: options.solverIterations,
    velocity: options.velocity,
  };
}

export function boxCollider(size: Vector3Tuple, options: { sensor?: ISensorDeclaration; slope?: IColliderSlopeDeclaration; trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  size.forEach((value, index) => {
    assertPositiveNumber(value, "TN_SDK_PHYSICS_COLLIDER_INVALID_SIZE", `Collider.size[${index}]`);
  });
  const sensor = normalizeSensor(options.sensor);
  return { kind: "box", ...(sensor === undefined ? {} : { sensor }), size: [...size] as Vector3Tuple, slope: normalizeSlope(options.slope), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function sphereCollider(radius: number, options: { sensor?: ISensorDeclaration; trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  const sensor = normalizeSensor(options.sensor);
  return { kind: "sphere", radius, ...(sensor === undefined ? {} : { sensor }), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function capsuleCollider(radius: number, height: number, options: { sensor?: ISensorDeclaration; trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  assertPositiveNumber(height, "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height");
  const sensor = normalizeSensor(options.sensor);
  return { height, kind: "capsule", radius, ...(sensor === undefined ? {} : { sensor }), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function cylinderCollider(radius: number, height: number, options: { trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  assertPositiveNumber(height, "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height");
  return { height, kind: "cylinder", radius, trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function meshCollider(options: { mesh?: IMeshColliderDeclaration; trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  const mesh = options.mesh === undefined ? undefined : normalizeMeshCollider(options.mesh);
  return { kind: "mesh", ...(mesh === undefined ? {} : { mesh }), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function physics(options: IPhysicsDeclaration): IPhysicsDeclaration {
  return options;
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

function normalizeFilter(options: IPhysicsFilterOptions): Pick<IColliderDeclaration, "layer" | "mask"> {
  if (options.layer !== undefined && options.layer.trim() === "") {
    throw new SdkError("TN_SDK_PHYSICS_FILTER_INVALID", "Collider.layer must be a non-empty portable filter layer string.");
  }
  if (options.mask?.some((entry) => entry.trim() === "")) {
    throw new SdkError("TN_SDK_PHYSICS_FILTER_INVALID", "Collider.mask entries must be non-empty portable filter layer strings.");
  }
  return {
    ...(options.layer === undefined ? {} : { layer: options.layer }),
    ...(options.mask === undefined ? {} : { mask: [...options.mask] }),
  };
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
  if (phases?.some((phase) => phase !== "enter" && phase !== "stay" && phase !== "exit")) {
    throw new SdkError("TN_SDK_PHYSICS_SENSOR_INVALID", "Collider.sensor.phases may include enter, stay, and exit only.");
  }
  return {
    ...(sensor.interactionKind === undefined ? {} : { interactionKind: sensor.interactionKind }),
    ...(sensor.occupantLimit === undefined ? {} : { occupantLimit: sensor.occupantLimit }),
    ...(phases === undefined ? {} : { phases }),
    ...(sensor.trackOccupants === undefined ? {} : { trackOccupants: sensor.trackOccupants }),
  };
}
