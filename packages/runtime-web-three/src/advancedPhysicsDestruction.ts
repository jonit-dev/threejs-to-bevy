import type { IFractureManifest, IWorldIr, Vec3 } from "@threenative/ir";

import { disposePhysicsRuntime, initializePhysicsRuntime, observePhysicsDestructionBodies, preparePhysicsRuntime, type IPhysicsDestructionBodyObservation } from "./physics.js";
import { createPhysicsDestructionRuntime, observePhysicsDestruction, queuePhysicsDestructionDamage, registerPhysicsDestructible, stepPhysicsDestruction, type IPhysicsDestructionCause, type IPhysicsDestructionDamage, type IPhysicsDestructionEvent } from "./physicsDestruction.js";

interface IAuthoredDestructionDamage {
  amount?: number;
  bond: string;
  cause: IPhysicsDestructionCause;
  energy?: number;
  impulse?: number;
  layer?: string;
  tick: number;
}

export interface IAdvancedPhysicsDestructionScenarios {
  assembly: string;
  budgetStress: { bonds: string[]; damageTick: number; sceneMaxActivePieces: number };
  fixedDt: number;
  impactReplay: IAuthoredDestructionDamage[];
  manifest: string;
  regionalDamage: IAuthoredDestructionDamage[];
  seed: number;
}

interface IDestructionPhysicalTrace {
  assemblyCollisionActive: boolean;
  pieces: Array<{
    handle: number;
    id: string;
    lifecycle: "active" | "bound" | "despawned" | "pooled" | "sleeping";
    mass: number;
    position: Vec3;
    velocity: Vec3;
  }>;
}

export interface IAdvancedPhysicsDestructionTrace {
  budget: { activePieces: number; eventTypes: string[]; policy: IFractureManifest["budgets"]["overflowPolicy"] };
  bundleHash: string;
  fixture: "advanced-physics-destruction";
  fixedDt: number;
  impact: { physical: IDestructionPhysicalTrace; ticks: Array<{ events: IPhysicsDestructionEvent[]; tick: number }> };
  regional: { brokenBonds: string[]; inactivePieces: string[]; physical: IDestructionPhysicalTrace };
  runtime: "web";
  schema: "threenative.advanced-physics-destruction-trace";
  sourceHash: string;
  version: "0.1.0";
}

export async function traceAdvancedPhysicsDestruction(input: {
  bundleHash: string;
  expected: unknown;
  fixtureDir: string;
  manifest: IFractureManifest;
  scenarios: IAdvancedPhysicsDestructionScenarios;
  sourceHash: string;
  world: IWorldIr;
}): Promise<IAdvancedPhysicsDestructionTrace> {
  await initializePhysicsRuntime();
  void input.expected;
  void input.fixtureDir;
  assertCanonicalInputs(input);
  const impact = traceImpact(structuredClone(input.world), input.manifest, input.scenarios);
  const regional = traceRegional(structuredClone(input.world), input.manifest, input.scenarios);
  const budget = traceBudget(structuredClone(input.world), input.manifest, input.scenarios);
  return {
    budget,
    bundleHash: input.bundleHash,
    fixture: "advanced-physics-destruction",
    fixedDt: input.scenarios.fixedDt,
    impact,
    regional,
    runtime: "web",
    schema: "threenative.advanced-physics-destruction-trace",
    sourceHash: input.sourceHash,
    version: "0.1.0",
  };
}

function traceImpact(world: IWorldIr, manifest: IFractureManifest, scenarios: IAdvancedPhysicsDestructionScenarios): IAdvancedPhysicsDestructionTrace["impact"] {
  const runtime = registeredRuntime(world, manifest, scenarios);
  const ticks = [...new Set(scenarios.impactReplay.map((damage) => damage.tick))].sort((left, right) => left - right).map((tick) => {
    for (const damage of scenarios.impactReplay.filter((candidate) => candidate.tick === tick)) queueAuthoredDamage(runtime, scenarios.assembly, damage);
    return { events: stepPhysicsDestruction(runtime, world, tick, scenarios.fixedDt), tick };
  });
  const physical = physicalTrace(observePhysicsDestructionBodies(world, scenarios.assembly), scenarios.assembly);
  disposePhysicsRuntime(world);
  return { physical, ticks };
}

function traceRegional(world: IWorldIr, manifest: IFractureManifest, scenarios: IAdvancedPhysicsDestructionScenarios): IAdvancedPhysicsDestructionTrace["regional"] {
  const runtime = registeredRuntime(world, manifest, scenarios);
  for (const damage of [...scenarios.impactReplay, ...scenarios.regionalDamage].sort((left, right) => left.tick - right.tick || left.bond.localeCompare(right.bond))) {
    queueAuthoredDamage(runtime, scenarios.assembly, damage);
  }
  const finalTick = Math.max(...scenarios.impactReplay.map((damage) => damage.tick), ...scenarios.regionalDamage.map((damage) => damage.tick));
  for (let tick = 0; tick <= finalTick; tick += 1) stepPhysicsDestruction(runtime, world, tick, scenarios.fixedDt);
  const observation = observePhysicsDestruction(runtime);
  const result = {
    brokenBonds: observation.bonds.filter((bond) => bond.assembly === scenarios.assembly && bond.broken).map((bond) => bond.id).sort(),
    inactivePieces: observation.pieces.filter((piece) => piece.assembly === scenarios.assembly && piece.lifecycle === "bound").map((piece) => piece.id).sort(),
    physical: physicalTrace(observePhysicsDestructionBodies(world, scenarios.assembly), scenarios.assembly),
  };
  disposePhysicsRuntime(world);
  return result;
}

function traceBudget(world: IWorldIr, manifest: IFractureManifest, scenarios: IAdvancedPhysicsDestructionScenarios): IAdvancedPhysicsDestructionTrace["budget"] {
  const runtime = registeredRuntime(world, manifest, scenarios, scenarios.budgetStress.sceneMaxActivePieces);
  for (const bond of [...scenarios.budgetStress.bonds].sort()) {
    queuePhysicsDestructionDamage(runtime, { amount: Number.MAX_SAFE_INTEGER, assembly: scenarios.assembly, bond, cause: { kind: "script" }, tick: scenarios.budgetStress.damageTick });
  }
  const events = stepPhysicsDestruction(runtime, world, scenarios.budgetStress.damageTick, scenarios.fixedDt);
  const activePieces = observePhysicsDestruction(runtime).pieces.filter((piece) => piece.assembly === scenarios.assembly && piece.lifecycle === "active").length;
  disposePhysicsRuntime(world);
  return { activePieces, eventTypes: events.map((event) => event.type), policy: manifest.budgets.overflowPolicy };
}

function registeredRuntime(world: IWorldIr, manifest: IFractureManifest, scenarios: IAdvancedPhysicsDestructionScenarios, maxActivePieces?: number) {
  const entity = world.entities.find((candidate) => candidate.id === scenarios.assembly);
  const component = entity?.components.Destructible;
  if (component === undefined) throw new Error(`Advanced physics destruction trace could not find Destructible '${scenarios.assembly}'.`);
  const runtime = createPhysicsDestructionRuntime(maxActivePieces === undefined ? {} : { maxActivePieces });
  registerPhysicsDestructible(runtime, { ...component, entity: scenarios.assembly }, manifest);
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  return runtime;
}

function queueAuthoredDamage(runtime: ReturnType<typeof createPhysicsDestructionRuntime>, assembly: string, authored: IAuthoredDestructionDamage): void {
  const damage: IPhysicsDestructionDamage = { ...authored, assembly };
  if (!queuePhysicsDestructionDamage(runtime, damage)) throw new Error(`Advanced physics destruction trace could not queue '${authored.bond}' at tick ${authored.tick}.`);
}

function physicalTrace(observation: IPhysicsDestructionBodyObservation, assembly: string): IDestructionPhysicalTrace {
  return {
    assemblyCollisionActive: observation.assemblyCollisionActive,
    pieces: observation.pieces.map(({ handle, id, lifecycle, mass, position, velocity }) => ({ handle, id: id.slice(`${assembly}/`.length), lifecycle, mass: round(mass), position: roundVec3(position), velocity: roundVec3(velocity) })),
  };
}

function assertCanonicalInputs(input: { manifest: IFractureManifest; scenarios: IAdvancedPhysicsDestructionScenarios }): void {
  const manifestReference = input.scenarios.manifest.split("/").at(-1)?.replace(/\.json$/, "");
  if (manifestReference !== input.manifest.id) throw new Error(`Advanced physics destruction scenario references '${input.scenarios.manifest}', not '${input.manifest.id}'.`);
  if (!Number.isFinite(input.scenarios.fixedDt) || input.scenarios.fixedDt <= 0) throw new Error("Advanced physics destruction fixedDt must be positive.");
}

function round(value: number): number { return Number(value.toFixed(6)); }
function roundVec3(value: Vec3): Vec3 { return [round(value[0]), round(value[1]), round(value[2])]; }
