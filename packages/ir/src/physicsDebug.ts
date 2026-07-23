import type { Vec3 } from "./types.js";

export const PHYSICS_DEBUG_SCHEMA = "threenative.physics-debug-snapshot" as const;
export const PHYSICS_DEBUG_VERSION = "0.1.0" as const;

export const PHYSICS_DEBUG_CATEGORIES = [
  "aero",
  "bond",
  "budget",
  "center-of-mass",
  "collider",
  "contact",
  "force",
  "joint-load",
  "piece",
  "sleep",
  "slip",
  "suspension",
  "wheel",
] as const;

export const PHYSICS_DEBUG_PRIMITIVE_KINDS = ["box", "line", "point", "sphere", "vector"] as const;

export const PHYSICS_DEBUG_LIMITS = Object.freeze({
  artifactPrimitives: 16_384,
  summaryPrimitives: 512,
  timings: 256,
});

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
