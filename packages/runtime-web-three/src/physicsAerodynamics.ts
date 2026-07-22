import type { IAerodynamicBodyComponent, IAerodynamicObservation, IAerodynamicSurfaceComponent, IWindVolumeComponent, IWorldIr, Quat, Vec3 } from "@threenative/ir";

import { applyLivePhysicsAtPoint } from "./physics.js";
import type { IWebInputState } from "./input.js";

const DEFAULT_AIR_DENSITY = 1.225;
const EPSILON = 0.000001;

interface IAerodynamicRuntimeState {
  controls: Map<string, number>;
  stalls: Set<string>;
  throttles: Map<string, number>;
}

export interface IAerodynamicInputs {
  surfaces?: Readonly<Record<string, number>>;
  thrusters?: Readonly<Record<string, number>>;
}

interface IForceContribution {
  drag?: Vec3;
  force: Vec3;
  lift?: Vec3;
  point: Vec3;
  surface?: string;
  thruster?: string;
}

const observationsByWorld = new WeakMap<IWorldIr, IAerodynamicObservation[]>();
const stateByWorld = new WeakMap<IWorldIr, Map<string, IAerodynamicRuntimeState>>();

export function setPhysicsAerodynamicInputs(world: IWorldIr, entityId: string, inputs: IAerodynamicInputs): boolean {
  const body = world.entities.find((entity) => entity.id === entityId)?.components.AerodynamicBody;
  if (body === undefined || !validInputs(body, inputs)) return false;
  const state = stateFor(world, entityId);
  for (const [id, value] of Object.entries(inputs.surfaces ?? {})) state.controls.set(id, value);
  for (const [id, value] of Object.entries(inputs.thrusters ?? {})) state.throttles.set(id, value);
  return true;
}

export function applyPhysicsAerodynamicBindings(world: IWorldIr, input: IWebInputState): void {
  for (const entity of world.entities) {
    const body = entity.components.AerodynamicBody;
    if (body === undefined) continue;
    const surfaces = Object.fromEntries(body.surfaces.flatMap((surface) => surface.control?.binding === undefined ? [] : [[surface.id, input.axis(surface.control.binding)]]));
    const thrusters = Object.fromEntries((body.thrusters ?? []).flatMap((thruster) => thruster.binding === undefined ? [] : [[thruster.id, Math.max(0, input.axis(thruster.binding), input.action(thruster.binding) ? 1 : 0)]]));
    if (Object.keys(surfaces).length > 0 || Object.keys(thrusters).length > 0) setPhysicsAerodynamicInputs(world, entity.id, { surfaces, thrusters });
  }
}

export function observePhysicsAerodynamics(world: IWorldIr): IAerodynamicObservation[] {
  return observationsByWorld.get(world)?.map((observation) => structuredClone(observation)) ?? [];
}

export function disposePhysicsAerodynamics(world: IWorldIr): void {
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
    const wind = windAt(world, position, tick, fixedDelta);
    const relativeAirVelocity = subtract(velocity, wind.velocity);
    const localAirVelocity = inverseRotate(relativeAirVelocity, rotation);
    const speed = length(relativeAirVelocity);
    const sideslip = speed < EPSILON ? 0 : Math.atan2(localAirVelocity[0], Math.max(EPSILON, -localAirVelocity[2]));
    const runtime = stateFor(world, entity.id);
    const contributions: IForceContribution[] = [];
    const surfaceObservations: IAerodynamicObservation["surfaces"][number][] = [];
    const thrusterObservations: IAerodynamicObservation["thrusters"][number][] = [];

    if (speed >= EPSILON) {
      const localDrag: Vec3 = [
        -0.5 * wind.airDensity * body.dragArea[0] * localAirVelocity[0] * Math.abs(localAirVelocity[0]),
        -0.5 * wind.airDensity * body.dragArea[1] * localAirVelocity[1] * Math.abs(localAirVelocity[1]),
        -0.5 * wind.airDensity * body.dragArea[2] * localAirVelocity[2] * Math.abs(localAirVelocity[2]),
      ];
      contributions.push({ force: rotate(localDrag, rotation), point: position });
    }

    for (const surface of body.surfaces) {
      const requestedControl = runtime.controls.get(surface.id) ?? surface.control?.input ?? 0;
      const previousControl = runtime.controls.get(`applied:${surface.id}`) ?? surface.control?.input ?? 0;
      const control = approach(previousControl, requestedControl, (surface.control?.response ?? 1) * fixedDelta);
      runtime.controls.set(`applied:${surface.id}`, control);
      const deflection = control * (surface.control?.maxDeflection ?? 0);
      const angleOfAttack = speed < EPSILON ? 0 : Math.atan2(localAirVelocity[1], Math.max(EPSILON, -localAirVelocity[2]));
      const effectiveAngle = angleOfAttack + deflection;
      const wasStalled = runtime.stalls.has(surface.id);
      const stalled = wasStalled ? Math.abs(effectiveAngle) > surface.recoveryAngle : Math.abs(effectiveAngle) >= surface.stallAngle;
      if (stalled) runtime.stalls.add(surface.id); else runtime.stalls.delete(surface.id);
      const point = add(position, rotate(surface.centerOfPressure, rotation));
      let lift: Vec3 = [0, 0, 0];
      let drag: Vec3 = [0, 0, 0];
      if (speed >= EPSILON) {
        const dynamicPressure = 0.5 * wind.airDensity * speed * speed;
        const aspectCorrection = surface.aspectRatio / (surface.aspectRatio + 2);
        const liftCoefficient = sampleCurve(surface.liftCurve, effectiveAngle) * aspectCorrection * (stalled ? 0.35 : 1);
        const dragCoefficient = Math.max(0, sampleCurve(surface.dragCurve, effectiveAngle));
        lift = rotate([0, dynamicPressure * surface.area * liftCoefficient, 0], rotation);
        drag = scale(normalize(relativeAirVelocity), -dynamicPressure * surface.area * dragCoefficient);
        contributions.push({ drag, force: add(lift, drag), lift, point, surface: surface.id });
      }
      surfaceObservations.push({ angleOfAttack: round(angleOfAttack), controlDeflection: round(deflection), drag: rounded(drag), forcePoint: rounded(point), id: surface.id, lift: rounded(lift), stalled });
    }

    for (const thruster of body.thrusters ?? []) {
      const requestedThrottle = runtime.throttles.get(thruster.id) ?? thruster.throttle ?? 0;
      const previousThrottle = runtime.throttles.get(`applied:${thruster.id}`) ?? 0;
      const throttle = approach(previousThrottle, requestedThrottle, thruster.response * fixedDelta);
      runtime.throttles.set(`applied:${thruster.id}`, throttle);
      const point = add(position, rotate(thruster.point, rotation));
      const force = scale(normalize(rotate(thruster.direction, rotation)), thruster.maxForce * throttle);
      contributions.push({ force, point, thruster: thruster.id });
      thrusterObservations.push({ force: rounded(force), ...(thruster.fuelHook === undefined ? {} : { fuelHook: thruster.fuelHook }), id: thruster.id, point: rounded(point), throttle: round(throttle) });
    }

    const diagnostics: IAerodynamicObservation["diagnostics"][number][] = [];
    const total = contributions.reduce<Vec3>((sum, contribution) => add(sum, contribution.force), [0, 0, 0]);
    const finite = [...total, ...contributions.flatMap((contribution) => [...contribution.force, ...contribution.point])].every(Number.isFinite);
    let forceScale = 1;
    if (!finite) {
      diagnostics.push({ code: "TN_PHYSICS_AERODYNAMIC_FORCE_INVALID", path: `world/${entity.id}/AerodynamicBody` });
      forceScale = 0;
    } else if (length(total) > body.maxForce) {
      diagnostics.push({ code: "TN_PHYSICS_AERODYNAMIC_FORCE_OVER_BUDGET", path: `world/${entity.id}/AerodynamicBody/maxForce` });
      forceScale = body.maxForce / length(total);
    }
    for (const contribution of contributions) applyLivePhysicsAtPoint(world, entity.id, scale(contribution.force, forceScale), contribution.point, "force");
    if (forceScale !== 1) {
      for (const observation of surfaceObservations) { observation.lift = rounded(scale(observation.lift, forceScale)); observation.drag = rounded(scale(observation.drag, forceScale)); }
      for (const observation of thrusterObservations) observation.force = rounded(scale(observation.force, forceScale));
    }
    observations.push({ airDensity: round(wind.airDensity), diagnostics, entity: entity.id, relativeAirVelocity: rounded(relativeAirVelocity), sideslip: round(sideslip), surfaces: surfaceObservations, thrusters: thrusterObservations, windVelocity: rounded(wind.velocity) });
  }
  observationsByWorld.set(world, observations);
  return observePhysicsAerodynamics(world);
}

function windAt(world: IWorldIr, point: Vec3, tick: number, fixedDelta: number): { airDensity: number; velocity: Vec3 } {
  let airDensity = DEFAULT_AIR_DENSITY;
  let velocity: Vec3 = [0, 0, 0];
  for (const entity of [...world.entities].sort((left, right) => left.id.localeCompare(right.id))) {
    const volume = entity.components.WindVolume;
    const center = entity.components.Transform?.position ?? [0, 0, 0];
    if (volume === undefined || !contains(volume, center, point)) continue;
    velocity = add(velocity, add(volume.velocity, gustVelocity(volume, tick * fixedDelta)));
    if (volume.airDensity !== undefined) airDensity = volume.airDensity;
  }
  return { airDensity, velocity };
}

function contains(volume: IWindVolumeComponent, center: Vec3, point: Vec3): boolean {
  const offset = subtract(point, center);
  if (volume.shape === "sphere") return length(offset) <= (volume.radius ?? 0);
  const half = scale(volume.size ?? [0, 0, 0], 0.5);
  return Math.abs(offset[0]) <= half[0] && Math.abs(offset[1]) <= half[1] && Math.abs(offset[2]) <= half[2];
}

function gustVelocity(volume: IWindVolumeComponent, elapsed: number): Vec3 {
  const gust = volume.gust;
  if (gust === undefined) return [0, 0, 0];
  const phase = elapsed * gust.frequency * Math.PI * 2;
  return [0, 1, 2].map((axis) => gust.amplitude[axis]! * Math.sin(phase + seededPhase(gust.seed, axis))) as unknown as Vec3;
}

function seededPhase(seed: number, axis: number): number { const value = Math.sin((seed + 1) * (axis + 11) * 12.9898) * 43758.5453; return (value - Math.floor(value)) * Math.PI * 2; }
function sampleCurve(curve: IAerodynamicSurfaceComponent["liftCurve"], angle: number): number { if (angle <= curve[0]!.angle) return curve[0]!.coefficient; if (angle >= curve.at(-1)!.angle) return curve.at(-1)!.coefficient; const upper = curve.findIndex((point) => point.angle >= angle); const left = curve[upper - 1]!; const right = curve[upper]!; const alpha = (angle - left.angle) / (right.angle - left.angle); return left.coefficient + (right.coefficient - left.coefficient) * alpha; }
function stateFor(world: IWorldIr, entity: string): IAerodynamicRuntimeState { const states = stateByWorld.get(world) ?? new Map<string, IAerodynamicRuntimeState>(); stateByWorld.set(world, states); const state = states.get(entity) ?? { controls: new Map(), stalls: new Set(), throttles: new Map() }; states.set(entity, state); return state; }
function validInputs(body: IAerodynamicBodyComponent, inputs: IAerodynamicInputs): boolean { const surfaces = new Set(body.surfaces.map((surface) => surface.id)); const thrusters = new Set((body.thrusters ?? []).map((thruster) => thruster.id)); return Object.entries(inputs.surfaces ?? {}).every(([id, value]) => surfaces.has(id) && Number.isFinite(value) && value >= -1 && value <= 1) && Object.entries(inputs.thrusters ?? {}).every(([id, value]) => thrusters.has(id) && Number.isFinite(value) && value >= 0 && value <= 1); }
function approach(current: number, target: number, maxDelta: number): number { return current + Math.max(-maxDelta, Math.min(maxDelta, target - current)); }
function add(left: Vec3, right: Vec3): Vec3 { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function subtract(left: Vec3, right: Vec3): Vec3 { return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]; }
function scale(value: Vec3, scalar: number): Vec3 { return [value[0] * scalar, value[1] * scalar, value[2] * scalar]; }
function length(value: Vec3): number { return Math.hypot(...value); }
function normalize(value: Vec3): Vec3 { const magnitude = length(value); return magnitude < EPSILON ? [0, 0, 0] : scale(value, 1 / magnitude); }
function rotate([x, y, z]: Vec3, [qx, qy, qz, qw]: Quat): Vec3 { const ix = qw * x + qy * z - qz * y; const iy = qw * y + qz * x - qx * z; const iz = qw * z + qx * y - qy * x; const iw = -qx * x - qy * y - qz * z; return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]; }
function inverseRotate(value: Vec3, [x, y, z, w]: Quat): Vec3 { return rotate(value, [-x, -y, -z, w]); }
function round(value: number): number { return Number(value.toFixed(6)); }
function rounded(value: Vec3): Vec3 { return [round(value[0]), round(value[1]), round(value[2])]; }
