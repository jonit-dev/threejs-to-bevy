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

export interface IRigidBodyDeclaration {
  damping?: number;
  gravityScale?: number;
  kind: PhysicsBodyKind;
  mass?: number;
  velocity?: Vector3Tuple;
}

export interface IColliderDeclaration {
  friction?: number;
  height?: number;
  kind: PhysicsColliderKind;
  layer?: string;
  mask?: string[];
  radius?: number;
  restitution?: number;
  size?: Vector3Tuple;
  slope?: IColliderSlopeDeclaration;
  trigger?: boolean;
}

export interface IPhysicsDeclaration {
  body?: IRigidBodyDeclaration;
  collider?: IColliderDeclaration;
}

export function rigidBody(kind: PhysicsBodyKind, options: { damping?: number; gravityScale?: number; mass?: number; velocity?: Vector3Tuple } = {}): IRigidBodyDeclaration {
  if (kind !== "dynamic" && kind !== "kinematic" && kind !== "static") {
    throw new SdkError("TN_SDK_PHYSICS_BODY_UNSUPPORTED", `Unsupported rigid body kind '${String(kind)}'.`);
  }
  if (options.damping !== undefined) {
    assertNonNegativeNumber(options.damping, "TN_SDK_PHYSICS_BODY_INVALID_DAMPING", "RigidBody.damping");
  }
  if (options.gravityScale !== undefined) {
    assertFiniteNumber(options.gravityScale, "TN_SDK_PHYSICS_BODY_INVALID_GRAVITY_SCALE", "RigidBody.gravityScale");
  }
  if (options.mass !== undefined) {
    assertPositiveNumber(options.mass, "TN_SDK_PHYSICS_BODY_INVALID_MASS", "RigidBody.mass");
  }
  options.velocity?.forEach((value, index) => {
    assertFiniteNumber(value, "TN_SDK_PHYSICS_BODY_INVALID_VELOCITY", `RigidBody.velocity[${index}]`);
  });
  return { damping: options.damping, gravityScale: options.gravityScale, kind, mass: options.mass, velocity: options.velocity };
}

export function boxCollider(size: Vector3Tuple, options: { slope?: IColliderSlopeDeclaration; trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  size.forEach((value, index) => {
    assertPositiveNumber(value, "TN_SDK_PHYSICS_COLLIDER_INVALID_SIZE", `Collider.size[${index}]`);
  });
  return { kind: "box", size: [...size] as Vector3Tuple, slope: normalizeSlope(options.slope), trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function sphereCollider(radius: number, options: { trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  return { kind: "sphere", radius, trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function capsuleCollider(radius: number, height: number, options: { trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  assertPositiveNumber(height, "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height");
  return { height, kind: "capsule", radius, trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function cylinderCollider(radius: number, height: number, options: { trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  assertPositiveNumber(height, "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height");
  return { height, kind: "cylinder", radius, trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function meshCollider(options: { trigger?: boolean } & IPhysicsFilterOptions & IPhysicsMaterialOptions = {}): IColliderDeclaration {
  return { kind: "mesh", trigger: options.trigger, ...normalizeFilter(options), ...normalizeMaterial(options) };
}

export function physics(options: IPhysicsDeclaration): IPhysicsDeclaration {
  return options;
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
