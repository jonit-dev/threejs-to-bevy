import type { IIrSystemDeclaration, IPhysicsQueryHitObservation, IWorldIr, Vec3 } from "@threenative/ir";

import { disposePhysicsRuntime, initializePhysicsRuntime, observeLivePhysicsBodies, preparePhysicsRuntime, queryHitObservation, stepPhysics } from "./physics.js";
import { createSystemContext } from "./systems/context.js";
import { applySystemEffects } from "./systems/effects.js";

export interface IAdvancedPhysicsFoundationTrace {
  body: IAdvancedPhysicsFoundationBodyTrace;
  causalNegative: { body: IAdvancedPhysicsFoundationBodyTrace; query?: IPhysicsQueryHitObservation };
  commandOrder: readonly ["physics.raycast", "physics.addForceAtPoint", "physics.applyImpulseAtPoint"];
  events: string[];
  fixedDelta: number;
  query?: IPhysicsQueryHitObservation;
  runtime: "web";
}

export interface IAdvancedPhysicsFoundationBodyTrace {
  angularVelocity: Vec3;
  position: Vec3;
  rotation: readonly [number, number, number, number];
  velocity: Vec3;
}

const commandOrder = ["physics.raycast", "physics.addForceAtPoint", "physics.applyImpulseAtPoint"] as const;

export async function traceAdvancedPhysicsFoundation(
  sourceWorld: IWorldIr,
  options: { entity?: string; fixedDelta?: number; gravity?: Vec3 } = {},
): Promise<IAdvancedPhysicsFoundationTrace> {
  await initializePhysicsRuntime();
  const fixedDelta = options.fixedDelta ?? 1 / 60;
  const entity = options.entity ?? sourceWorld.entities.find((candidate) => candidate.components.CompoundCollider !== undefined)?.id;
  if (entity === undefined) throw new Error("Advanced physics foundation trace requires an entity with CompoundCollider.");
  const world = structuredClone(sourceWorld);
  const causalWorld = structuredClone(sourceWorld);
  const queryRequest = foundationRaycast(world, entity);
  preparePhysicsRuntime(world, undefined, options.gravity);
  const queued = createSystemContext(world, { delta: fixedDelta, fixedDelta, schedule: "fixedUpdate", systemName: "advancedPhysicsFoundation", tick: 0 });
  const queryResult = queued.context.physics.raycast(queryRequest);
  queued.context.physics.addForceAtPoint(entity, [2, 0, 0], foundationPoint(world, entity));
  queued.context.physics.applyImpulseAtPoint(entity, [0, 0, 4], foundationPoint(world, entity));
  const applied = applySystemEffects(world, foundationSystem(), queued, { frame: 0, tick: 0 });
  if (applied.diagnostics.some((diagnostic) => diagnostic.severity === "error")) {
    throw new Error(applied.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n"));
  }
  const physicsEvents = stepPhysics(world, fixedDelta, undefined, { gravity: options.gravity });

  preparePhysicsRuntime(causalWorld, undefined, options.gravity);
  const causalContext = createSystemContext(causalWorld, { delta: fixedDelta, fixedDelta, schedule: "fixedUpdate", systemName: "advancedPhysicsFoundation.causalNegative", tick: 0 });
  const causalQueryResult = causalContext.context.physics.raycast(queryRequest);
  stepPhysics(causalWorld, fixedDelta, undefined, { gravity: options.gravity });

  const query = queryHitObservation(queryResult, world);
  const causalQuery = queryHitObservation(causalQueryResult, causalWorld);
  const result: IAdvancedPhysicsFoundationTrace = {
    body: foundationBody(world, entity),
    causalNegative: { body: foundationBody(causalWorld, entity), ...(causalQuery === undefined ? {} : { query: causalQuery }) },
    commandOrder,
    events: [
      ...queued.services.map((service) => service.service),
      ...physicsEvents.map((event) => `${event.phase}:${event.a}:${event.childA ?? ""}:${event.b}:${event.childB ?? ""}`),
    ],
    fixedDelta,
    ...(query === undefined ? {} : { query }),
    runtime: "web",
  };
  disposePhysicsRuntime(world);
  disposePhysicsRuntime(causalWorld);
  return result;
}

function foundationBody(world: IWorldIr, entity: string): IAdvancedPhysicsFoundationBodyTrace {
  const body = observeLivePhysicsBodies(world, 1).find((candidate) => candidate.entity === entity);
  if (body === undefined) throw new Error(`Advanced physics foundation trace could not observe '${entity}'.`);
  return { angularVelocity: body.angularVelocity, position: body.position, rotation: body.rotation, velocity: body.velocity };
}

function foundationPoint(world: IWorldIr, entity: string): [number, number, number] {
  const position = world.entities.find((candidate) => candidate.id === entity)?.components.Transform?.position ?? [0, 0, 0];
  return [position[0], position[1] + 1, position[2]];
}

function foundationRaycast(world: IWorldIr, entity: string): { direction: [number, number, number]; maxDistance: number; origin: [number, number, number] } {
  const target = world.entities.find((candidate) => candidate.id === entity);
  const position = target?.components.Transform?.position ?? [0, 0, 0];
  const local = target?.components.CompoundCollider?.children[0]?.localPose.position ?? [0, 0, 0];
  return { direction: [0, 0, 1], maxDistance: 10, origin: [position[0] + local[0], position[1] + local[1], position[2] + local[2] - 5] };
}

function foundationSystem(): IIrSystemDeclaration {
  return {
    commands: [],
    eventReads: [],
    eventWrites: [],
    name: "advancedPhysicsFoundation",
    queries: [],
    reads: [],
    resourceReads: [],
    resourceWrites: [],
    schedule: "fixedUpdate",
    services: [...commandOrder],
    writes: [],
  };
}
