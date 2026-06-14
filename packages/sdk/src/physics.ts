import { assertPositiveNumber, assertFiniteNumber, SdkError } from "./errors.js";
import type { Vector3Tuple } from "./math/Vector3.js";

export type PhysicsBodyKind = "dynamic" | "kinematic" | "static";
export type PhysicsColliderKind = "box" | "capsule" | "cylinder" | "mesh" | "sphere";

export interface IPhysicsFilterOptions {
  layer?: string;
  mask?: ReadonlyArray<string>;
}

export interface IRigidBodyDeclaration {
  kind: PhysicsBodyKind;
  mass?: number;
  velocity?: Vector3Tuple;
}

export interface IColliderDeclaration {
  height?: number;
  kind: PhysicsColliderKind;
  layer?: string;
  mask?: string[];
  radius?: number;
  size?: Vector3Tuple;
  trigger?: boolean;
}

export interface IPhysicsDeclaration {
  body?: IRigidBodyDeclaration;
  collider?: IColliderDeclaration;
}

export function rigidBody(kind: PhysicsBodyKind, options: { mass?: number; velocity?: Vector3Tuple } = {}): IRigidBodyDeclaration {
  if (kind !== "dynamic" && kind !== "kinematic" && kind !== "static") {
    throw new SdkError("TN_SDK_PHYSICS_BODY_UNSUPPORTED", `Unsupported rigid body kind '${String(kind)}'.`);
  }
  if (options.mass !== undefined) {
    assertPositiveNumber(options.mass, "TN_SDK_PHYSICS_BODY_INVALID_MASS", "RigidBody.mass");
  }
  options.velocity?.forEach((value, index) => {
    assertFiniteNumber(value, "TN_SDK_PHYSICS_BODY_INVALID_VELOCITY", `RigidBody.velocity[${index}]`);
  });
  return { kind, mass: options.mass, velocity: options.velocity };
}

export function boxCollider(size: Vector3Tuple, options: { trigger?: boolean } & IPhysicsFilterOptions = {}): IColliderDeclaration {
  size.forEach((value, index) => {
    assertPositiveNumber(value, "TN_SDK_PHYSICS_COLLIDER_INVALID_SIZE", `Collider.size[${index}]`);
  });
  return { kind: "box", size: [...size] as Vector3Tuple, trigger: options.trigger, ...normalizeFilter(options) };
}

export function sphereCollider(radius: number, options: { trigger?: boolean } & IPhysicsFilterOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  return { kind: "sphere", radius, trigger: options.trigger, ...normalizeFilter(options) };
}

export function capsuleCollider(radius: number, height: number, options: { trigger?: boolean } & IPhysicsFilterOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  assertPositiveNumber(height, "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height");
  return { height, kind: "capsule", radius, trigger: options.trigger, ...normalizeFilter(options) };
}

export function cylinderCollider(radius: number, height: number, options: { trigger?: boolean } & IPhysicsFilterOptions = {}): IColliderDeclaration {
  assertPositiveNumber(radius, "TN_SDK_PHYSICS_COLLIDER_INVALID_RADIUS", "Collider.radius");
  assertPositiveNumber(height, "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT", "Collider.height");
  return { height, kind: "cylinder", radius, trigger: options.trigger, ...normalizeFilter(options) };
}

export function meshCollider(options: { trigger?: boolean } & IPhysicsFilterOptions = {}): IColliderDeclaration {
  return { kind: "mesh", trigger: options.trigger, ...normalizeFilter(options) };
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
