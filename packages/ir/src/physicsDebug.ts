import type { Vec3 } from "./types.js";
import physicsDebugRegistry from "./physicsDebugRegistry.json" with { type: "json" };

export const PHYSICS_DEBUG_SCHEMA = physicsDebugRegistry.schema as "threenative.physics-debug-snapshot";
export const PHYSICS_DEBUG_VERSION = physicsDebugRegistry.version as "0.1.0";

export const PHYSICS_DEBUG_CATEGORIES = Object.freeze(physicsDebugRegistry.categories) as readonly ["aero", "bond", "budget", "center-of-mass", "collider", "contact", "force", "joint-load", "piece", "sleep", "slip", "suspension", "wheel"];

export const PHYSICS_DEBUG_PRIMITIVE_KINDS = Object.freeze(physicsDebugRegistry.primitiveKinds) as readonly ["box", "line", "point", "sphere", "vector"];

export const PHYSICS_DEBUG_LIMITS = Object.freeze({
  ...physicsDebugRegistry.limits,
});
export const PHYSICS_DEBUG_DEFAULTS = Object.freeze({ ...physicsDebugRegistry.defaults });

export type PhysicsDebugCategory = (typeof PHYSICS_DEBUG_CATEGORIES)[number];
export type PhysicsDebugPrimitiveKind = (typeof PHYSICS_DEBUG_PRIMITIVE_KINDS)[number];

export interface IPhysicsDebugPrimitive {
  category: PhysicsDebugCategory;
  entity?: string;
  from?: Vec3;
  id: string;
  kind: PhysicsDebugPrimitiveKind;
  position?: Vec3;
  size?: Vec3;
  to?: Vec3;
  value?: number;
}

export interface IPhysicsDebugTelemetry {
  allocatedPieces: number;
  bodies: { active: number; sleeping: number };
  contacts: number;
  fixedDt: number;
  queries: number;
  rebuilds: number;
  solverIterations: number;
  tick: number;
  timings: Array<{ milliseconds: number; system: string }>;
}

export interface IPhysicsDebugCore {
  omittedPrimitives: number;
  primitives: IPhysicsDebugPrimitive[];
  telemetry: IPhysicsDebugTelemetry;
  truncated: boolean;
}

export interface IPhysicsDebugSnapshot {
  artifact: IPhysicsDebugCore;
  schema: typeof PHYSICS_DEBUG_SCHEMA;
  summary: IPhysicsDebugCore;
  version: typeof PHYSICS_DEBUG_VERSION;
}
