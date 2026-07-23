import type { IWorldEntity, IWorldIr } from "@threenative/ir";

import { applyLivePhysicsAtPoint, disposePhysicsRuntime, initializePhysicsRuntime, observePhysicsJointLoads, physicsRuntimeStats, preparePhysicsRuntime, stepPhysics } from "./physics.js";
import { collectPhysicsDebugCore } from "./physicsDebug.js";
import type { IPhysicsJointBreakEvent, IPhysicsJointLoadObservation } from "./physicsJoints.js";

type JointKind = NonNullable<IWorldEntity["components"]["PhysicsJoint"]>["kind"];
type PatchAction = "initial" | "patch" | "despawn" | "spawn";
type IJointIdentityObservation = Pick<IPhysicsJointLoadObservation, "active" | "connectedEntity" | "entity" | "kind" | "lifecycle">;

export interface IAdvancedPhysicsJointScenarios {
  fixedDt: number;
  loadRamp: { forcePoint: [number, number, number]; joint: string; samples: Array<{ force: [number, number, number]; steps: number }> };
  patchReconcile: { joint: string; steps: Array<{ action: PatchAction; patch?: unknown }>; unrelatedBodies: string[] };
  perKind: { jointIds: string[]; settleSteps: number };
}

export interface IAdvancedPhysicsJointTrace {
  bundleHash: string;
  fixture: "advanced-physics-joints";
  fixedDt: number;
  debugEvidence: Array<{ category: string; id: string; kind: string }>;
  loadRamp: {
    events: Array<{ observation: IPhysicsJointBreakEvent; tick: number }>;
    removedAtTick: number;
    samples: Array<{ appliedForce: number; observation: IPhysicsJointLoadObservation; relativePositionError: number; relativeRotationError: number; tick: number }>;
  };
  patchReconcile: {
    bodyRebuilds: number;
    jointRebuilds: number;
    steps: Array<{ action: PatchAction; observations: IJointIdentityObservation[] }>;
    unrelatedBodyHandlesPreserved: boolean;
  };
  perKind: IJointIdentityObservation[];
  runtime: "web";
  schema: "threenative.advanced-physics-joints-trace";
  sourceHash: string;
  version: "0.1.0";
}

export async function traceAdvancedPhysicsJoints(input: {
  bundleHash: string;
  expected: unknown;
  fixtureDir: string;
  scenarios: IAdvancedPhysicsJointScenarios;
  sourceHash: string;
  world: IWorldIr;
}): Promise<IAdvancedPhysicsJointTrace> {
  await initializePhysicsRuntime();
  void input.expected;
  void input.fixtureDir;
  const perKindWorld = structuredClone(input.world);
  for (let step = 0; step < input.scenarios.perKind.settleSteps; step += 1) stepPhysics(perKindWorld, input.scenarios.fixedDt);
  const perKind = observationsFor(perKindWorld, input.scenarios.perKind.jointIds);
  const debugEvidence = collectPhysicsDebugCore(perKindWorld, { fixedDt: input.scenarios.fixedDt, maxPrimitives: 4096, tick: input.scenarios.perKind.settleSteps }).primitives.map(({ category, id, kind }) => ({ category, id, kind }));

  const loadRamp = traceLoadRamp(structuredClone(input.world), input.scenarios);
  const patchReconcile = tracePatchReconcile(structuredClone(input.world), input.scenarios);
  disposePhysicsRuntime(perKindWorld);
  return {
    bundleHash: input.bundleHash,
    fixture: "advanced-physics-joints",
    fixedDt: input.scenarios.fixedDt,
    debugEvidence,
    loadRamp,
    patchReconcile,
    perKind,
    runtime: "web",
    schema: "threenative.advanced-physics-joints-trace",
    sourceHash: input.sourceHash,
    version: "0.1.0",
  };
}

function traceLoadRamp(world: IWorldIr, scenarios: IAdvancedPhysicsJointScenarios): IAdvancedPhysicsJointTrace["loadRamp"] {
  let tick = 0;
  let removedAtTick = -1;
  let lastObservation: IPhysicsJointLoadObservation | undefined;
  const events: IAdvancedPhysicsJointTrace["loadRamp"]["events"] = [];
  const samples: IAdvancedPhysicsJointTrace["loadRamp"]["samples"] = [];
  const initialPose = relativePose(world, scenarios.loadRamp.joint);
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  for (const sample of scenarios.loadRamp.samples) {
    for (let step = 0; step < sample.steps; step += 1) {
      if (!applyLivePhysicsAtPoint(world, scenarios.loadRamp.joint, sample.force, scenarios.loadRamp.forcePoint, "force")) {
        throw new Error(`Advanced physics joint trace could not apply load to '${scenarios.loadRamp.joint}'.`);
      }
      tick += 1;
      stepPhysics(world, scenarios.fixedDt, undefined, { gravity: [0, 0, 0] });
      const observation = observePhysicsJointLoads(world).find((candidate) => candidate.entity === scenarios.loadRamp.joint);
      if (observation !== undefined) {
        lastObservation = observation;
        if (!observation.active && removedAtTick < 0) removedAtTick = tick;
      } else if (removedAtTick < 0) {
        removedAtTick = tick;
      }
      const breaks = world.events?.JointBreakEvent as IPhysicsJointBreakEvent[] | undefined;
      for (const event of breaks ?? []) events.push({ observation: event, tick });
    }
    const observation = lastObservation;
    if (observation === undefined) throw new Error(`Advanced physics joint trace could not observe '${scenarios.loadRamp.joint}'.`);
    const errors = relativePoseErrors(initialPose, relativePose(world, scenarios.loadRamp.joint));
    samples.push({ appliedForce: magnitude(sample.force), observation: observePhysicsJointLoads(world).find((candidate) => candidate.entity === scenarios.loadRamp.joint) ?? { ...observation, active: false }, ...errors, tick });
  }
  if (removedAtTick < 0 && events.length > 0) {
    tick += 1;
    stepPhysics(world, scenarios.fixedDt, undefined, { gravity: [0, 0, 0] });
    removedAtTick = tick;
  }
  disposePhysicsRuntime(world);
  return { events, removedAtTick, samples };
}

function tracePatchReconcile(world: IWorldIr, scenarios: IAdvancedPhysicsJointScenarios): IAdvancedPhysicsJointTrace["patchReconcile"] {
  const target = world.entities.find((entity) => entity.id === scenarios.patchReconcile.joint);
  const initial = structuredClone(target?.components.PhysicsJoint);
  if (target === undefined || initial === undefined) throw new Error(`Advanced physics joint patch target '${scenarios.patchReconcile.joint}' is missing.`);
  const steps: IAdvancedPhysicsJointTrace["patchReconcile"]["steps"] = [];
  let baselineRebuilds = 0;
  let baselineCreations = 0;
  for (const [index, authoredStep] of scenarios.patchReconcile.steps.entries()) {
    if (authoredStep.action === "patch") target.components.PhysicsJoint = { ...target.components.PhysicsJoint, ...(authoredStep.patch as object) } as typeof initial;
    if (authoredStep.action === "despawn") delete target.components.PhysicsJoint;
    if (authoredStep.action === "spawn") target.components.PhysicsJoint = structuredClone(initial);
    stepPhysics(world, scenarios.fixedDt, undefined, { gravity: [0, 0, 0] });
    const stats = physicsRuntimeStats(world);
    if (index === 0) {
      baselineRebuilds = stats.rebuilds;
      baselineCreations = stats.jointCreations ?? 0;
    }
    steps.push({ action: authoredStep.action, observations: identityObservations(world) });
  }
  const stats = physicsRuntimeStats(world);
  const result = {
    bodyRebuilds: stats.rebuilds - baselineRebuilds,
    jointRebuilds: (stats.jointCreations ?? 0) - baselineCreations,
    steps,
    unrelatedBodyHandlesPreserved: stats.rebuilds === baselineRebuilds,
  };
  disposePhysicsRuntime(world);
  return result;
}

function observationsFor(world: IWorldIr, entities: readonly string[]): IJointIdentityObservation[] {
  const observations = new Map(identityObservations(world).map((observation) => [observation.entity, observation]));
  return entities.flatMap((entity) => observations.get(entity) ?? []);
}

function identityObservations(world: IWorldIr): IJointIdentityObservation[] {
  return observePhysicsJointLoads(world).map(({ active, connectedEntity, entity, kind, lifecycle }) => ({ active, connectedEntity, entity, kind, lifecycle }));
}

interface IRelativePose { position: readonly [number, number, number]; rotation: readonly [number, number, number, number] }

function relativePose(world: IWorldIr, entityId: string): IRelativePose {
  const entity = world.entities.find((candidate) => candidate.id === entityId);
  const joint = entity?.components.PhysicsJoint;
  const connected = world.entities.find((candidate) => candidate.id === joint?.connectedEntity);
  if (entity?.components.Transform?.position === undefined || connected?.components.Transform?.position === undefined) throw new Error(`Advanced physics joint trace could not resolve relative pose for '${entityId}'.`);
  const position: [number, number, number] = [entity.components.Transform.position[0] - connected.components.Transform.position[0], entity.components.Transform.position[1] - connected.components.Transform.position[1], entity.components.Transform.position[2] - connected.components.Transform.position[2]];
  const rotation = multiplyQuaternion(conjugateQuaternion(connected.components.Transform.rotation ?? [0, 0, 0, 1]), entity.components.Transform.rotation ?? [0, 0, 0, 1]);
  return { position, rotation };
}

function relativePoseErrors(initial: IRelativePose, current: IRelativePose): { relativePositionError: number; relativeRotationError: number } {
  const positionDelta = [current.position[0] - initial.position[0], current.position[1] - initial.position[1], current.position[2] - initial.position[2]];
  const rotationDot = Math.abs(initial.rotation[0] * current.rotation[0] + initial.rotation[1] * current.rotation[1] + initial.rotation[2] * current.rotation[2] + initial.rotation[3] * current.rotation[3]);
  return { relativePositionError: round(magnitude(positionDelta)), relativeRotationError: round(2 * Math.acos(Math.min(1, rotationDot))) };
}

function conjugateQuaternion(value: readonly number[]): readonly [number, number, number, number] { return [-(value[0] ?? 0), -(value[1] ?? 0), -(value[2] ?? 0), value[3] ?? 1]; }
function multiplyQuaternion(left: readonly number[], right: readonly number[]): readonly [number, number, number, number] {
  const [lx, ly, lz, lw] = [left[0] ?? 0, left[1] ?? 0, left[2] ?? 0, left[3] ?? 1];
  const [rx, ry, rz, rw] = [right[0] ?? 0, right[1] ?? 0, right[2] ?? 0, right[3] ?? 1];
  return [lw * rx + lx * rw + ly * rz - lz * ry, lw * ry - lx * rz + ly * rw + lz * rx, lw * rz + lx * ry - ly * rx + lz * rw, lw * rw - lx * rx - ly * ry - lz * rz];
}

function magnitude(value: readonly number[]): number { return Math.hypot(value[0] ?? 0, value[1] ?? 0, value[2] ?? 0); }
function round(value: number): number { return Number(value.toFixed(6)); }

export type IAdvancedPhysicsJointKind = JointKind;
