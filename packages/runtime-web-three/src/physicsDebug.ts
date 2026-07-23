import { PHYSICS_DEBUG_CATEGORIES, PHYSICS_DEBUG_DEFAULTS, PHYSICS_DEBUG_LIMITS, PHYSICS_DEBUG_SCHEMA, PHYSICS_DEBUG_VERSION, type IPhysicsDebugCore, type IPhysicsDebugPrimitive, type IPhysicsDebugSnapshot, type IPhysicsDebugTelemetry, type PhysicsDebugCategory } from "@threenative/ir/physicsDebug";
import type { IWorldIr, Vec3 } from "@threenative/ir";

export { PHYSICS_DEBUG_CATEGORIES, PHYSICS_DEBUG_LIMITS, PHYSICS_DEBUG_PRIMITIVE_KINDS, PHYSICS_DEBUG_SCHEMA, PHYSICS_DEBUG_VERSION, type IPhysicsDebugCore, type IPhysicsDebugPrimitive, type IPhysicsDebugSnapshot, type IPhysicsDebugTelemetry, type PhysicsDebugCategory, type PhysicsDebugPrimitiveKind } from "@threenative/ir/physicsDebug";

import { observeLivePhysicsBodies, observePhysicsContactImpulses, observePhysicsDestructionBodies, observePhysicsJointLoads, observePhysicsTelemetryStats, physicsRuntimeStats } from "./physics.js";
import { observePhysicsAerodynamics } from "./physicsAerodynamics.js";
import { observePhysicsDestruction, type IPhysicsDestructionRuntime } from "./physicsDestruction.js";
import { observePhysicsVehicles } from "./physicsVehicle.js";
import { renderDebugOverlay, type IWebDebugOverlayModel } from "./debugOverlay.js";

const systemTimingsByWorld = new WeakMap<IWorldIr, Array<{ milliseconds: number; system: string }>>();

export function beginPhysicsTelemetryTick(world: IWorldIr): void { systemTimingsByWorld.set(world, []); }
export function recordPhysicsSystemTiming(world: IWorldIr, system: string, milliseconds: number): void {
  const timings = systemTimingsByWorld.get(world) ?? [];
  timings.push({ milliseconds: finite(milliseconds), system: system.slice(0, 80) });
  systemTimingsByWorld.set(world, timings);
}

export function collectPhysicsDebugSnapshot(
  world: IWorldIr,
  options: {
    categories?: readonly PhysicsDebugCategory[];
    destructionRuntime?: IPhysicsDestructionRuntime;
    fixedDt: number;
    maxArtifactPrimitives?: number;
    maxSummaryPrimitives?: number;
    maxTimings?: number;
    tick: number;
    timings?: readonly { milliseconds: number; system: string }[];
  },
): IPhysicsDebugSnapshot {
  const enabled = new Set(options.categories ?? PHYSICS_DEBUG_CATEGORIES);
  const all = physicsDebugPrimitives(world, options.destructionRuntime).filter((primitive) => enabled.has(primitive.category)).sort((left, right) => left.id.localeCompare(right.id));
  const summaryCap = boundedCap(options.maxSummaryPrimitives, PHYSICS_DEBUG_DEFAULTS.summaryPrimitives, PHYSICS_DEBUG_LIMITS.summaryPrimitives);
  const artifactCap = boundedCap(options.maxArtifactPrimitives, PHYSICS_DEBUG_DEFAULTS.artifactPrimitives, PHYSICS_DEBUG_LIMITS.artifactPrimitives);
  const telemetry = physicsTelemetry(world, options);
  return {
    artifact: debugCore(all, artifactCap, telemetry),
    schema: PHYSICS_DEBUG_SCHEMA,
    summary: debugCore(all, summaryCap, telemetry),
    version: PHYSICS_DEBUG_VERSION,
  };
}

export function collectPhysicsDebugCore(world: IWorldIr, options: Parameters<typeof collectPhysicsDebugSnapshot>[1] & { maxPrimitives?: number }): IPhysicsDebugCore {
  const snapshot = collectPhysicsDebugSnapshot(world, { ...options, maxArtifactPrimitives: options.maxPrimitives ?? options.maxArtifactPrimitives });
  return snapshot.artifact;
}

export function renderPhysicsDebugOverlay(snapshot: IPhysicsDebugSnapshot, depth: "artifact" | "summary" = "summary"): IWebDebugOverlayModel {
  const selected = snapshot[depth];
  return renderDebugOverlay({
    counters: [
      { aggregation: "frame", category: "physics", id: "physics.active-bodies", label: "Active bodies", severity: "info", sourcePath: "physics/bodies/active", value: selected.telemetry.bodies.active },
      { aggregation: "frame", category: "physics", id: "physics.contacts", label: "Contacts", severity: "info", sourcePath: "physics/contacts", value: selected.telemetry.contacts },
      { aggregation: "frame", category: "physics", id: "physics.allocated-pieces", label: "Allocated pieces", severity: "info", sourcePath: "physics/allocatedPieces", value: selected.telemetry.allocatedPieces },
    ],
    draw: selected.primitives.map((primitive) => ({ id: primitive.id, kind: primitive.kind, target: primitive.entity, value: { category: primitive.category, ...(primitive.from === undefined ? {} : { from: primitive.from }), ...(primitive.position === undefined ? {} : { position: primitive.position }), ...(primitive.size === undefined ? {} : { size: primitive.size }), ...(primitive.to === undefined ? {} : { to: primitive.to }), ...(primitive.value === undefined ? {} : { value: primitive.value }) } })),
  });
}

function physicsDebugPrimitives(world: IWorldIr, destructionRuntime: IPhysicsDestructionRuntime | undefined): IPhysicsDebugPrimitive[] {
  const bodies = new Map(observeLivePhysicsBodies(world, 0).map((body) => [body.entity, body]));
  const primitives: IPhysicsDebugPrimitive[] = [];
  for (const entity of [...world.entities].sort((left, right) => left.id.localeCompare(right.id))) {
    const body = bodies.get(entity.id);
    const position = body?.position ?? entity.components.Transform?.position ?? [0, 0, 0];
    if (body !== undefined && entity.components.RigidBody !== undefined) {
      primitives.push({ category: "center-of-mass", entity: entity.id, id: `center-of-mass:${entity.id}`, kind: "point", position: rounded(position) });
      primitives.push({ category: "sleep", entity: entity.id, id: `sleep:${entity.id}`, kind: "point", position: rounded(position), value: body.sleeping ? 1 : 0 });
    }
    const collider = entity.components.Collider;
    if (collider !== undefined) primitives.push(colliderPrimitive(entity.id, position, collider.center ?? [0, 0, 0], collider));
    for (const child of entity.components.CompoundCollider?.children ?? []) {
      primitives.push(colliderPrimitive(`${entity.id}/${child.id}`, position, child.localPose.position, child.shape));
    }
  }
  for (const [index, contact] of observePhysicsContactImpulses(world).entries()) {
    const position = contact.point ?? midpoint(bodies.get(contact.a)?.position, bodies.get(contact.b)?.position);
    primitives.push({ category: "contact", entity: contact.a, id: `contact:${contact.a}:${contact.b}:${index}`, kind: "point", position: rounded(position), value: finite(contact.impulse) });
  }
  for (const assembly of observePhysicsVehicles(world)) {
    const authored = world.entities.find((entity) => entity.id === assembly.entity)?.components.WheelAssembly;
    const origin = bodies.get(assembly.entity)?.position ?? [0, 0, 0];
    for (const wheel of assembly.wheels) {
      const source = authored?.wheels.find((candidate) => candidate.id === wheel.wheelId);
      const attachment = add(origin, source?.attachment ?? [0, 0, 0]);
      const end = wheel.contact?.point ?? add(attachment, [0, -(source?.suspension.travel ?? 0), 0]);
      primitives.push({ category: "wheel", entity: assembly.entity, id: `wheel:${assembly.entity}:${wheel.wheelId}`, kind: "sphere", position: rounded(end), size: uniformSize(source?.radius ?? 0), value: finite(wheel.angularSpeed) });
      primitives.push({ category: "suspension", entity: assembly.entity, from: rounded(attachment), id: `suspension:${assembly.entity}:${wheel.wheelId}`, kind: "line", to: rounded(end), value: finite(wheel.compression) });
      primitives.push(vector(`slip:${assembly.entity}:${wheel.wheelId}`, "slip", assembly.entity, end, [wheel.lateralSlip, 0, wheel.longitudinalSlip]));
      primitives.push(vector(`force:${assembly.entity}:${wheel.wheelId}`, "force", assembly.entity, end, scale(wheel.contact?.normal ?? [0, 1, 0], wheel.normalLoad)));
    }
  }
  for (const aero of observePhysicsAerodynamics(world)) {
    for (const surface of aero.surfaces) {
      primitives.push(vector(`aero:${aero.entity}:surface:${surface.id}:lift`, "aero", aero.entity, surface.forcePoint, surface.lift));
      primitives.push(vector(`aero:${aero.entity}:surface:${surface.id}:drag`, "aero", aero.entity, surface.forcePoint, surface.drag));
    }
    for (const thruster of aero.thrusters) primitives.push(vector(`aero:${aero.entity}:thruster:${thruster.id}`, "aero", aero.entity, thruster.point, thruster.force));
  }
  for (const joint of observePhysicsJointLoads(world)) {
    const from = bodies.get(joint.entity)?.position ?? [0, 0, 0];
    const to = bodies.get(joint.connectedEntity)?.position ?? from;
    primitives.push({ category: "joint-load", entity: joint.entity, from: rounded(from), id: `joint-load:${joint.entity}`, kind: "line", to: rounded(to), value: finite(Math.hypot(joint.force, joint.torque)) });
  }
  if (destructionRuntime !== undefined) {
    const destruction = observePhysicsDestruction(destructionRuntime);
    const physicalPieces = new Map(destruction.assemblies.flatMap((assembly) => observePhysicsDestructionBodies(world, assembly.id).pieces.map((piece) => [piece.id, piece.position] as const)));
    const semanticPieces = new Map(destruction.pieces.map((piece) => [`${piece.assembly}/${piece.id}`, piece]));
    for (const bond of destruction.bonds) {
      const origin = bodies.get(bond.assembly)?.position ?? world.entities.find((entity) => entity.id === bond.assembly)?.components.Transform?.position ?? [0, 0, 0];
      const endpoint = (piece: string): Vec3 => physicalPieces.get(`${bond.assembly}/${piece}`) ?? add(origin, semanticPieces.get(`${bond.assembly}/${piece}`)?.localPosition ?? [0, 0, 0]);
      primitives.push({ category: "bond", entity: bond.assembly, from: rounded(endpoint(bond.pieces[0])), id: `bond:${bond.assembly}:${bond.id}`, kind: "line", to: rounded(endpoint(bond.pieces[1])), value: bond.broken ? 0 : finite(bond.health) });
    }
    for (const budget of destruction.budgets) primitives.push({ category: "budget", entity: budget.assembly, id: `budget:${budget.assembly}`, kind: "point", position: rounded(bodies.get(budget.assembly)?.position ?? [0, 0, 0]), value: finite(budget.activePieces / Math.max(1, budget.maximumActivePieces)) });
    for (const assembly of destruction.assemblies) {
      for (const physical of observePhysicsDestructionBodies(world, assembly.id).pieces) {
        const piece = semanticPieces.get(physical.id);
        const collider = piece?.collider;
        const kind = collider?.kind === "box" ? "box" : collider?.kind === "sphere" ? "sphere" : "point";
        const size = collider?.kind === "box" ? rounded(scale(collider.halfExtents, 2)) : collider?.kind === "sphere" ? uniformSize(collider.radius) : undefined;
        primitives.push({ category: "piece", entity: assembly.id, id: `piece:${assembly.id}:${physical.id.slice(`${assembly.id}/`.length)}`, kind, position: rounded(physical.position), ...(size === undefined ? {} : { size }), value: pieceLifecycleValue(physical.lifecycle) });
      }
    }
  }
  return primitives;
}

function physicsTelemetry(world: IWorldIr, options: { destructionRuntime?: IPhysicsDestructionRuntime; fixedDt: number; maxTimings?: number; tick: number; timings?: readonly { milliseconds: number; system: string }[] }): IPhysicsDebugTelemetry {
  const stats = observePhysicsTelemetryStats(world);
  const destruction = options.destructionRuntime === undefined ? undefined : observePhysicsDestruction(options.destructionRuntime);
  const observedTimings = systemTimingsByWorld.get(world) ?? [];
  const suppliedTimings = options.timings ?? (observedTimings.length > 0 ? observedTimings : [{ milliseconds: stats.physicsMilliseconds, system: "physics" }]);
  const timings = suppliedTimings
    .map((timing) => ({ milliseconds: finite(timing.milliseconds), system: timing.system.slice(0, 80) }))
    .filter((timing) => timing.system.length > 0)
    .sort((left, right) => left.system.localeCompare(right.system))
    .slice(0, boundedCap(options.maxTimings, PHYSICS_DEBUG_DEFAULTS.timings, PHYSICS_DEBUG_LIMITS.timings));
  return {
    allocatedPieces: destruction?.budgets.reduce((sum, budget) => sum + budget.activePieces, 0) ?? 0,
    bodies: { active: stats.activeBodies, sleeping: stats.sleepingBodies },
    contacts: stats.contacts,
    fixedDt: finite(options.fixedDt),
    queries: stats.queries,
    rebuilds: Math.max(0, physicsRuntimeStats(world).rebuilds),
    solverIterations: stats.solverIterations,
    tick: Math.max(0, Math.floor(finite(options.tick))),
    timings,
  };
}

function colliderPrimitive(entity: string, origin: Vec3, offset: Vec3, collider: { height?: number; kind: string; mesh?: { bounds: { size: Vec3 } }; points?: readonly Vec3[]; radius?: number; size?: Vec3 }): IPhysicsDebugPrimitive {
  const position = rounded(add(origin, offset));
  if (collider.kind === "sphere") return { category: "collider", entity, id: `collider:${entity}`, kind: "sphere", position, size: uniformSize(collider.radius ?? 0) };
  if (collider.kind === "box") return { category: "collider", entity, id: `collider:${entity}`, kind: "box", position, size: rounded(collider.size ?? [0, 0, 0]) };
  if (collider.kind === "capsule") return { category: "collider", entity, from: rounded(add(position, [0, -(collider.height ?? 0) / 2, 0])), id: `collider:${entity}`, kind: "line", to: rounded(add(position, [0, (collider.height ?? 0) / 2, 0])), value: finite(collider.radius) };
  const size = collider.mesh?.bounds.size ?? pointsSize(collider.points ?? []);
  return { category: "collider", entity, id: `collider:${entity}`, kind: "box", position, size: rounded(size) };
}

function vector(id: string, category: PhysicsDebugCategory, entity: string, from: Vec3, value: Vec3): IPhysicsDebugPrimitive { return { category, entity, from: rounded(from), id, kind: "vector", to: rounded(add(from, value)), value: finite(length(value)) }; }
function add(left: readonly number[], right: readonly number[]): Vec3 { return [finiteSigned(left[0]) + finiteSigned(right[0]), finiteSigned(left[1]) + finiteSigned(right[1]), finiteSigned(left[2]) + finiteSigned(right[2])]; }
function scale(value: readonly number[], factor: number): Vec3 { return [finiteSigned(value[0]) * finiteSigned(factor), finiteSigned(value[1]) * finiteSigned(factor), finiteSigned(value[2]) * finiteSigned(factor)]; }
function length(value: readonly number[]): number { return Math.hypot(finiteSigned(value[0]), finiteSigned(value[1]), finiteSigned(value[2])); }
function midpoint(left: Vec3 | undefined, right: Vec3 | undefined): Vec3 { return scale(add(left ?? [0, 0, 0], right ?? left ?? [0, 0, 0]), 0.5); }
function rounded(value: readonly number[]): Vec3 { return [round(value[0]), round(value[1]), round(value[2])]; }
function uniformSize(value: number): Vec3 { const diameter = finite(value) * 2; return [diameter, diameter, diameter]; }
function finite(value: number | undefined): number { return value === undefined || !Number.isFinite(value) || value < 0 ? 0 : value; }
function round(value: number | undefined): number { return Number(finiteSigned(value).toFixed(6)); }
function finiteSigned(value: number | undefined): number { return value === undefined || !Number.isFinite(value) ? 0 : value; }
function boundedCap(value: number | undefined, fallback: number, maximum: number): number { return Math.min(maximum, Math.max(0, Math.floor(value ?? fallback))); }
function debugCore(primitives: IPhysicsDebugPrimitive[], cap: number, telemetry: IPhysicsDebugTelemetry): IPhysicsDebugCore { const omittedPrimitives = Math.max(0, primitives.length - cap); return { omittedPrimitives, primitives: primitives.slice(0, cap), telemetry, truncated: omittedPrimitives > 0 }; }
function pieceLifecycleValue(value: "active" | "bound" | "despawned" | "pooled" | "sleeping"): number { return ({ active: 1, bound: 0, despawned: 4, pooled: 3, sleeping: 2 })[value]; }
function pointsSize(points: readonly Vec3[]): Vec3 {
  if (points.length === 0) return [0, 0, 0];
  const extent = (axis: number) => Math.max(...points.map((point) => point[axis]!)) - Math.min(...points.map((point) => point[axis]!));
  return [extent(0), extent(1), extent(2)];
}
