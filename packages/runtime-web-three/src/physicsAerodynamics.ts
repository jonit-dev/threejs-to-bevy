import type { IAerodynamicBodyComponent, IAerodynamicObservation, IScriptAerodynamicsInputs, IWorldIr, Quat, Vec3 } from "@threenative/ir";
import { evaluateAerodynamicForces, resolveAerodynamicWind } from "@threenative/ir/aerodynamicViability";

import { applyLivePhysicsAtPoint } from "./physics.js";
import type { IWebInputState } from "./input.js";

const EPSILON = 0.000001;

interface IAerodynamicRuntimeState {
  controls: Map<string, number>;
  stalls: Set<string>;
  throttles: Map<string, number>;
}

export type IAerodynamicInputs = IScriptAerodynamicsInputs;

const observationsByWorld = new WeakMap<IWorldIr, IAerodynamicObservation[]>();
const manualInputsByWorld = new WeakMap<IWorldIr, Set<string>>();
const stateByWorld = new WeakMap<IWorldIr, Map<string, IAerodynamicRuntimeState>>();

export function setPhysicsAerodynamicInputs(world: IWorldIr, entityId: string, inputs: IAerodynamicInputs): boolean {
  const body = world.entities.find((entity) => entity.id === entityId)?.components.AerodynamicBody;
  if (body === undefined || !validInputs(body, inputs)) return false;
  const manual = manualInputsByWorld.get(world) ?? new Set<string>();
  manual.add(entityId);
  manualInputsByWorld.set(world, manual);
  applyInputs(stateFor(world, entityId), inputs);
  return true;
}

function applyInputs(state: IAerodynamicRuntimeState, inputs: IAerodynamicInputs): void {
  for (const id of [...state.controls.keys()]) if (!id.startsWith("applied:")) state.controls.delete(id);
  for (const id of [...state.throttles.keys()]) if (!id.startsWith("applied:")) state.throttles.delete(id);
  for (const [id, value] of Object.entries(inputs.surfaces ?? {})) state.controls.set(id, value);
  for (const [id, value] of Object.entries(inputs.thrusters ?? {})) state.throttles.set(id, value);
}

export function applyPhysicsAerodynamicBindings(world: IWorldIr, input: IWebInputState): void {
  for (const entity of world.entities) {
    const body = entity.components.AerodynamicBody;
    if (body === undefined) continue;
    if (manualInputsByWorld.get(world)?.has(entity.id) === true) continue;
    const surfaces = Object.fromEntries(body.surfaces.flatMap((surface) => surface.control?.binding === undefined ? [] : [[surface.id, input.axis(surface.control.binding)]]));
    const thrusters = Object.fromEntries((body.thrusters ?? []).flatMap((thruster) => thruster.binding === undefined ? [] : [[thruster.id, Math.max(0, input.axis(thruster.binding), input.action(thruster.binding) ? 1 : 0)]]));
    if (Object.keys(surfaces).length > 0 || Object.keys(thrusters).length > 0) applyInputs(stateFor(world, entity.id), { surfaces, thrusters });
  }
}

export function observePhysicsAerodynamics(world: IWorldIr): IAerodynamicObservation[] {
  return observationsByWorld.get(world)?.map((observation) => structuredClone(observation)) ?? [];
}

export function disposePhysicsAerodynamics(world: IWorldIr): void {
  manualInputsByWorld.delete(world);
  observationsByWorld.delete(world);
  stateByWorld.delete(world);
}

export function stepPhysicsAerodynamics(world: IWorldIr, fixedDelta: number, tick: number): IAerodynamicObservation[] {
  const observations: IAerodynamicObservation[] = [];
  for (const entity of [...world.entities].sort((left, right) => left.id.localeCompare(right.id))) {
    const body = entity.components.AerodynamicBody;
    const rigidBody = entity.components.RigidBody;
    const transform = entity.components.Transform;
    if (body === undefined || rigidBody?.kind !== "dynamic" || transform === undefined) continue;
    const position = transform.position ?? [0, 0, 0];
    const rotation = transform.rotation ?? [0, 0, 0, 1];
    const velocity = rigidBody.velocity ?? [0, 0, 0];
    const wind = resolveAerodynamicWind(world.entities, position, tick * fixedDelta);
    const relativeAirVelocity = subtract(velocity, wind.velocity);
    const localAirVelocity = inverseRotate(relativeAirVelocity, rotation);
    const speed = length(relativeAirVelocity);
    const sideslip = speed < EPSILON ? 0 : Math.atan2(localAirVelocity[0], Math.max(EPSILON, -localAirVelocity[2]));
    const runtime = stateFor(world, entity.id);
    const surfaceDeflections: Record<string, number> = {};
    for (const surface of body.surfaces) {
      const requestedControl = runtime.controls.get(surface.id) ?? surface.control?.input ?? 0;
      const previousControl = runtime.controls.get(`applied:${surface.id}`) ?? surface.control?.input ?? 0;
      const control = approach(previousControl, requestedControl, (surface.control?.response ?? 1) * fixedDelta);
      runtime.controls.set(`applied:${surface.id}`, control);
      surfaceDeflections[surface.id] = control * (surface.control?.maxDeflection ?? 0);
    }
    const thrusterThrottles: Record<string, number> = {};
    for (const thruster of body.thrusters ?? []) {
      const requestedThrottle = runtime.throttles.get(thruster.id) ?? thruster.throttle ?? 0;
      const previousThrottle = runtime.throttles.get(`applied:${thruster.id}`) ?? 0;
      const throttle = approach(previousThrottle, requestedThrottle, thruster.response * fixedDelta);
      runtime.throttles.set(`applied:${thruster.id}`, throttle);
      thrusterThrottles[thruster.id] = throttle;
    }
    const evaluation = evaluateAerodynamicForces({
      aerodynamicBody: body,
      airDensity: wind.airDensity,
      position,
      previouslyStalled: runtime.stalls,
      relativeAirVelocity,
      rotation,
      surfaceDeflections,
      thrusterThrottles,
    });
    runtime.stalls.clear();
    for (const surface of evaluation.surfaces) if (surface.stalled) runtime.stalls.add(surface.id);
    const diagnostics: IAerodynamicObservation["diagnostics"][number][] = [];
    if (!evaluation.finite) {
      diagnostics.push({ code: "TN_PHYSICS_AERODYNAMIC_FORCE_INVALID", path: `world/${entity.id}/AerodynamicBody` });
    } else if (evaluation.forceScale < 1) {
      diagnostics.push({ code: "TN_PHYSICS_AERODYNAMIC_FORCE_OVER_BUDGET", path: `world/${entity.id}/AerodynamicBody/maxForce` });
    }
    applyLivePhysicsAtPoint(world, entity.id, evaluation.bodyDrag, position, "force");
    for (const surface of evaluation.surfaces) applyLivePhysicsAtPoint(world, entity.id, surface.force, surface.point, "force");
    for (const thruster of evaluation.thrusters) applyLivePhysicsAtPoint(world, entity.id, thruster.force, thruster.point, "force");
    const surfaceObservations: IAerodynamicObservation["surfaces"][number][] = evaluation.surfaces.map((surface) => ({
      angleOfAttack: round(surface.angleOfAttack),
      controlDeflection: round(surfaceDeflections[surface.id] ?? 0),
      drag: rounded(surface.drag),
      forcePoint: rounded(surface.point),
      id: surface.id,
      lift: rounded(surface.lift),
      stalled: surface.stalled,
    }));
    const thrusterObservations: IAerodynamicObservation["thrusters"][number][] = evaluation.thrusters.map((thruster) => {
      const source = body.thrusters?.find((candidate) => candidate.id === thruster.id);
      return { force: rounded(thruster.force), ...(source?.fuelHook === undefined ? {} : { fuelHook: source.fuelHook }), id: thruster.id, point: rounded(thruster.point), throttle: round(thruster.throttle) };
    });
    observations.push({ airDensity: round(wind.airDensity), diagnostics, entity: entity.id, relativeAirVelocity: rounded(relativeAirVelocity), sideslip: round(sideslip), surfaces: surfaceObservations, thrusters: thrusterObservations, windVelocity: rounded(wind.velocity) });
  }
  observationsByWorld.set(world, observations);
  return observePhysicsAerodynamics(world);
}

function stateFor(world: IWorldIr, entity: string): IAerodynamicRuntimeState { const states = stateByWorld.get(world) ?? new Map<string, IAerodynamicRuntimeState>(); stateByWorld.set(world, states); const state = states.get(entity) ?? { controls: new Map(), stalls: new Set(), throttles: new Map() }; states.set(entity, state); return state; }
function validInputs(body: IAerodynamicBodyComponent, inputs: IAerodynamicInputs): boolean { const surfaces = new Set(body.surfaces.map((surface) => surface.id)); const thrusters = new Set((body.thrusters ?? []).map((thruster) => thruster.id)); return Object.entries(inputs.surfaces ?? {}).every(([id, value]) => surfaces.has(id) && Number.isFinite(value) && value >= -1 && value <= 1) && Object.entries(inputs.thrusters ?? {}).every(([id, value]) => thrusters.has(id) && Number.isFinite(value) && value >= 0 && value <= 1); }
function approach(current: number, target: number, maxDelta: number): number { return current + Math.max(-maxDelta, Math.min(maxDelta, target - current)); }
function subtract(left: Vec3, right: Vec3): Vec3 { return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]; }
function length(value: Vec3): number { return Math.hypot(...value); }
function rotate([x, y, z]: Vec3, [qx, qy, qz, qw]: Quat): Vec3 { const ix = qw * x + qy * z - qz * y; const iy = qw * y + qz * x - qx * z; const iz = qw * z + qx * y - qy * x; const iw = -qx * x - qy * y - qz * z; return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]; }
function inverseRotate(value: Vec3, [x, y, z, w]: Quat): Vec3 { return rotate(value, [-x, -y, -z, w]); }
function round(value: number): number { return Number(value.toFixed(6)); }
function rounded(value: Vec3): Vec3 { return [round(value[0]), round(value[1]), round(value[2])]; }
