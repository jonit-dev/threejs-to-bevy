import type { IAerodynamicBodyComponent, IAerodynamicCurvePoint, IWindVolumeComponent, IWorldIr, Quat, Vec3 } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";

const DEFAULT_AIR_DENSITY = 1.225;
const GRAVITY = 9.81;
const EPSILON = 0.000001;
// Spawn-state analysis allows a bounded transient sink so naturally stable
// aircraft can build restorative angle of attack without being rejected.
const LIFT_MARGIN = 0.85;
const THRUST_MARGIN = 0.9;

export interface IAerodynamicViabilityMeasurements {
  airDensity: number;
  availableThrust: number;
  cruiseDrag: number;
  lift: number;
  moment: Vec3;
  speed: number;
  weight: number;
}

export interface IAerodynamicViabilityResult {
  diagnostics: IIrDiagnostic[];
  measurements?: IAerodynamicViabilityMeasurements;
  reason?: "aerodynamic-contract-invalid" | "rigid-body-state-missing" | "spawn-transform-missing" | "spawn-velocity-missing";
  status: "analyzed" | "not-applicable";
}

export interface IAerodynamicForceEvaluation {
  bodyDrag: Vec3;
  finite: boolean;
  forceScale: number;
  surfaces: Array<{ angleOfAttack: number; drag: Vec3; force: Vec3; id: string; lift: Vec3; point: Vec3; stalled: boolean }>;
  thrusters: Array<{ force: Vec3; id: string; point: Vec3; throttle: number }>;
  total: Vec3;
}

export function evaluateAerodynamicForces(options: {
  aerodynamicBody: IAerodynamicBodyComponent;
  airDensity: number;
  position?: Vec3;
  previouslyStalled?: ReadonlySet<string>;
  relativeAirVelocity: Vec3;
  rotation?: Quat;
  surfaceDeflections?: Readonly<Record<string, number>>;
  thrusterThrottles?: Readonly<Record<string, number>>;
}): IAerodynamicForceEvaluation {
  const body = options.aerodynamicBody;
  const position = options.position ?? [0, 0, 0];
  const rotation = options.rotation ?? [0, 0, 0, 1];
  const relativeAirVelocity = options.relativeAirVelocity;
  const localAirVelocity = inverseRotate(relativeAirVelocity, rotation);
  const speed = magnitude(relativeAirVelocity);
  const dynamicPressure = 0.5 * options.airDensity * speed * speed;
  const angleOfAttack = speed < EPSILON ? 0 : Math.atan2(-localAirVelocity[1], Math.max(EPSILON, -localAirVelocity[2]));
  const bodyDrag = speed < EPSILON
    ? [0, 0, 0] as Vec3
    : rotate([
        -0.5 * options.airDensity * body.dragArea[0] * localAirVelocity[0] * Math.abs(localAirVelocity[0]),
        -0.5 * options.airDensity * body.dragArea[1] * localAirVelocity[1] * Math.abs(localAirVelocity[1]),
        -0.5 * options.airDensity * body.dragArea[2] * localAirVelocity[2] * Math.abs(localAirVelocity[2]),
      ], rotation);
  const surfaces = body.surfaces.map((surface) => {
    const effectiveAngle = angleOfAttack + (options.surfaceDeflections?.[surface.id] ?? 0);
    const stalled = options.previouslyStalled?.has(surface.id) === true
      ? Math.abs(effectiveAngle) > surface.recoveryAngle
      : Math.abs(effectiveAngle) >= surface.stallAngle;
    const aspectCorrection = surface.aspectRatio / (surface.aspectRatio + 2);
    const liftCoefficient = sampleAerodynamicCurve(surface.liftCurve, effectiveAngle) * aspectCorrection * (stalled ? 0.35 : 1);
    const dragCoefficient = Math.max(0, sampleAerodynamicCurve(surface.dragCurve, effectiveAngle));
    const lift = speed < EPSILON ? [0, 0, 0] as Vec3 : rotate([0, dynamicPressure * surface.area * liftCoefficient, 0], rotation);
    const drag = speed < EPSILON ? [0, 0, 0] as Vec3 : scale(normalize(relativeAirVelocity), -dynamicPressure * surface.area * dragCoefficient);
    return { angleOfAttack, drag, force: add(lift, drag), id: surface.id, lift, point: add(position, rotate(surface.centerOfPressure, rotation)), stalled };
  });
  const thrusters = (body.thrusters ?? []).map((thruster) => {
    const throttle = options.thrusterThrottles?.[thruster.id] ?? 0;
    return {
      force: scale(normalize(rotate(thruster.direction, rotation)), thruster.maxForce * throttle),
      id: thruster.id,
      point: add(position, rotate(thruster.point, rotation)),
      throttle,
    };
  });
  const rawForces = [bodyDrag, ...surfaces.map((surface) => surface.force), ...thrusters.map((thruster) => thruster.force)];
  const total = rawForces.reduce<Vec3>(add, [0, 0, 0]);
  const finite = [...total, ...rawForces.flat()].every(Number.isFinite);
  const forceScale = !finite ? 0 : magnitude(total) > body.maxForce ? body.maxForce / magnitude(total) : 1;
  return {
    bodyDrag: scale(bodyDrag, forceScale),
    finite,
    forceScale,
    surfaces: surfaces.map((surface) => ({ ...surface, drag: scale(surface.drag, forceScale), force: scale(surface.force, forceScale), lift: scale(surface.lift, forceScale) })),
    thrusters: thrusters.map((thruster) => ({ ...thruster, force: scale(thruster.force, forceScale) })),
    total: scale(total, forceScale),
  };
}

export function analyzeAerodynamicViability(options: {
  aerodynamicBody: unknown;
  airDensity?: number;
  nearGroundSupport?: boolean;
  path: string;
  rigidBody: unknown;
  transform: unknown;
  windVelocity?: Vec3;
}): IAerodynamicViabilityResult {
  if (!isAerodynamicBody(options.aerodynamicBody)) {
    return { diagnostics: [], reason: "aerodynamic-contract-invalid", status: "not-applicable" };
  }
  if (!isRecord(options.rigidBody) || options.rigidBody.kind !== "dynamic" || !positiveMass(options.rigidBody)) {
    return { diagnostics: [], reason: "rigid-body-state-missing", status: "not-applicable" };
  }
  if (!isRecord(options.transform)) {
    return { diagnostics: [], reason: "spawn-transform-missing", status: "not-applicable" };
  }
  const velocity = vec3(options.rigidBody.velocity);
  if (velocity === undefined) {
    return { diagnostics: [], reason: "spawn-velocity-missing", status: "not-applicable" };
  }

  const body = options.aerodynamicBody;
  const rotation = quat(options.transform.rotation) ?? [0, 0, 0, 1];
  const relativeAirVelocity = subtract(velocity, options.windVelocity ?? [0, 0, 0]);
  const speed = magnitude(relativeAirVelocity);
  if (speed < EPSILON) {
    return { diagnostics: [], reason: "spawn-velocity-missing", status: "not-applicable" };
  }
  const airDensity = finiteNonNegative(options.airDensity) ? options.airDensity : DEFAULT_AIR_DENSITY;
  const position = vec3(options.transform.position) ?? [0, 0, 0];
  const deflections = Object.fromEntries(body.surfaces.map((surface) => [surface.id, (surface.control?.input ?? 0) * (surface.control?.maxDeflection ?? 0)]));
  const aerodynamic = evaluateAerodynamicForces({ aerodynamicBody: body, airDensity, position, relativeAirVelocity, rotation, surfaceDeflections: deflections });
  const powered = evaluateAerodynamicForces({
    aerodynamicBody: body,
    airDensity,
    position,
    relativeAirVelocity,
    rotation,
    surfaceDeflections: deflections,
    thrusterThrottles: Object.fromEntries((body.thrusters ?? []).map((thruster) => [thruster.id, 1])),
  });
  const forward = normalize(relativeAirVelocity);
  const worldUp: Vec3 = [0, 1, 0];
  const lift = aerodynamic.surfaces.reduce((sum, surface) => sum + dot(surface.lift, worldUp), 0);
  const cruiseDrag = magnitude(powered.bodyDrag) + powered.surfaces.reduce((sum, surface) => sum + magnitude(surface.drag), 0);
  const availableThrust = powered.thrusters.reduce((sum, thruster) => sum + Math.max(0, dot(thruster.force, forward)), 0);
  const moment = [...aerodynamic.surfaces.map((surface) => ({ force: surface.force, point: surface.point })), { force: aerodynamic.bodyDrag, point: position }]
    .reduce<Vec3>((sum, contribution) => add(sum, cross(subtract(contribution.point, position), contribution.force)), [0, 0, 0]);
  const mass = typeof options.rigidBody.mass === "number" ? options.rigidBody.mass : 1 / (options.rigidBody.inverseMass as number);
  const gravityScale = typeof options.rigidBody.gravityScale === "number" ? Math.abs(options.rigidBody.gravityScale) : 1;
  const weight = mass * GRAVITY * gravityScale;
  const measurements = roundedMeasurements({ airDensity, availableThrust, cruiseDrag, lift, moment, speed, weight });
  const diagnostics: IIrDiagnostic[] = [];
  const supportedLiftOff = options.nearGroundSupport === true && canReachSupportedLiftOff({
    aerodynamicBody: body,
    airDensity,
    deflections,
    direction: normalize(relativeAirVelocity),
    position,
    rotation,
    speed,
    weight,
  });

  if (lift < weight * LIFT_MARGIN && !supportedLiftOff) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_AERODYNAMIC_LIFT_BUDGET_INSUFFICIENT",
      fix: { instruction: "Increase spawn airspeed, wing area/lift, or reduce mass until conservative spawn lift reaches weight." },
      message: `Spawn lift ${format(lift)} N is below conservative required lift ${format(weight * LIFT_MARGIN)} N (weight ${format(weight)} N at ${format(speed)} m/s).`,
      path: `${options.path}/surfaces`,
      severity: "error",
      suggestion: "Tune the declared spawn velocity, surface lift curves/area, or RigidBody.mass and validate again.",
      value: measurements.lift,
    });
  }
  if ((body.thrusters?.length ?? 0) > 0 && availableThrust < cruiseDrag * THRUST_MARGIN) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_AERODYNAMIC_THRUST_BUDGET_INSUFFICIENT",
      fix: { instruction: "Increase forward-aligned available thrust or reduce drag at the declared cruise speed." },
      message: `Available forward thrust ${format(availableThrust)} N is below conservative cruise drag ${format(cruiseDrag * THRUST_MARGIN)} N (${format(cruiseDrag)} N measured at ${format(speed)} m/s).`,
      path: `${options.path}/thrusters`,
      severity: "error",
      suggestion: "Tune thruster direction/maxForce, dragArea, or surface drag curves and validate again.",
      value: measurements.availableThrust,
    });
  }
  const damping = typeof options.rigidBody.damping === "number" ? options.rigidBody.damping : 0;
  if (damping >= 0.2 && cruiseDrag > EPSILON) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_AERODYNAMIC_DAMPING_DOUBLE_COUNTED",
      message: `RigidBody damping ${format(damping)} is combined with ${format(cruiseDrag)} N of authored aerodynamic drag.`,
      path: `${options.path.replace(/\/AerodynamicBody$/u, "/RigidBody")}/damping`,
      severity: "warning",
      suggestion: "Prefer aerodynamic drag for flight tuning; keep generic rigid-body damping low unless the combination is intentional.",
      value: damping,
    });
  }
  const momentMagnitude = magnitude(moment);
  const momentBudget = Math.max(10, weight * 0.1);
  if (momentMagnitude > momentBudget) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_AERODYNAMIC_STOWED_TRIM_UNBALANCED",
      fix: { instruction: "Balance baseline surface forces around the center of mass or author a deliberate stowed control input." },
      message: `Stowed surfaces produce moment [${measurements.moment.map(format).join(", ")}] N*m (magnitude ${format(momentMagnitude)} N*m), above ${format(momentBudget)} N*m.`,
      path: `${options.path}/surfaces`,
      severity: "error",
      suggestion: `Balance centerOfPressure and lift curves for surfaces: ${body.surfaces.map((surface) => surface.id).join(", ")}.`,
      value: round(momentMagnitude),
    });
  }

  return { diagnostics, measurements, status: "analyzed" };
}

export function sampleAerodynamicCurve(curve: readonly IAerodynamicCurvePoint[], angle: number): number {
  if (angle <= curve[0]!.angle) return curve[0]!.coefficient;
  if (angle >= curve.at(-1)!.angle) return curve.at(-1)!.coefficient;
  const upper = curve.findIndex((point) => point.angle >= angle);
  const left = curve[upper - 1]!;
  const right = curve[upper]!;
  const alpha = (angle - left.angle) / (right.angle - left.angle);
  return left.coefficient + (right.coefficient - left.coefficient) * alpha;
}

export function resolveAerodynamicWind(entities: IWorldIr["entities"], point: Vec3, elapsed = 0): { airDensity: number; velocity: Vec3 } {
  let airDensity = DEFAULT_AIR_DENSITY;
  let velocity: Vec3 = [0, 0, 0];
  for (const entity of [...entities].sort((left, right) => left.id.localeCompare(right.id))) {
    const volume = entity.components.WindVolume;
    const center = vec3(entity.components.Transform?.position) ?? [0, 0, 0];
    if (!isWindVolume(volume) || !windContains(volume, center, point)) continue;
    velocity = add(velocity, add(volume.velocity, gustVelocity(volume, elapsed)));
    if (volume.airDensity !== undefined) airDensity = volume.airDensity;
  }
  return { airDensity, velocity };
}

export function aerodynamicWorldViabilityDiagnostics(world: IWorldIr, path: string): IIrDiagnostic[] {
  return world.entities.flatMap((entity, index) => {
    if (entity.components.AerodynamicBody === undefined) return [];
    return analyzeAerodynamicWorldEntityViability(world, index, `${path}/entities/${index}/components/AerodynamicBody`).diagnostics;
  });
}

export function analyzeAerodynamicWorldEntityViability(world: IWorldIr, entityIndex: number, path: string): IAerodynamicViabilityResult {
  const entity = world.entities[entityIndex];
  if (entity === undefined) return { diagnostics: [], reason: "aerodynamic-contract-invalid", status: "not-applicable" };
  const position = vec3(entity.components.Transform?.position) ?? [0, 0, 0];
  const wind = resolveAerodynamicWind(world.entities, position, 0);
  return analyzeAerodynamicViability({
    aerodynamicBody: entity.components.AerodynamicBody,
    airDensity: wind.airDensity,
    nearGroundSupport: hasNearGroundSupport(world, entityIndex),
    path,
    rigidBody: entity.components.RigidBody,
    transform: entity.components.Transform,
    windVelocity: wind.velocity,
  });
}

function isAerodynamicBody(value: unknown): value is IAerodynamicBodyComponent {
  return isRecord(value)
    && vec3(value.dragArea) !== undefined
    && finitePositive(value.maxForce)
    && Array.isArray(value.surfaces)
    && value.surfaces.length > 0
    && value.surfaces.every((surface) => isRecord(surface)
      && typeof surface.id === "string"
      && finitePositive(surface.area)
      && finitePositive(surface.aspectRatio)
      && vec3(surface.centerOfPressure) !== undefined
      && isCurve(surface.liftCurve)
      && isCurve(surface.dragCurve)
      && finitePositive(surface.stallAngle)
      && (surface.control === undefined || (isRecord(surface.control)
        && (surface.control.input === undefined || (typeof surface.control.input === "number" && Number.isFinite(surface.control.input)))
        && typeof surface.control.maxDeflection === "number"
        && Number.isFinite(surface.control.maxDeflection))))
    && (value.thrusters === undefined || (Array.isArray(value.thrusters) && value.thrusters.every((thruster) => isRecord(thruster)
      && typeof thruster.id === "string"
      && vec3(thruster.direction) !== undefined
      && finitePositive(thruster.maxForce))));
}

function isCurve(value: unknown): value is readonly IAerodynamicCurvePoint[] {
  return Array.isArray(value)
    && value.length >= 2
    && value.every((point) => isRecord(point) && typeof point.angle === "number" && Number.isFinite(point.angle) && typeof point.coefficient === "number" && Number.isFinite(point.coefficient));
}

function isWindVolume(value: unknown): value is IWindVolumeComponent {
  return isRecord(value)
    && (value.shape === "box" || value.shape === "sphere")
    && vec3(value.velocity) !== undefined
    && (value.airDensity === undefined || finiteNonNegative(value.airDensity))
    && (value.shape !== "box" || vec3(value.size) !== undefined)
    && (value.shape !== "sphere" || finitePositive(value.radius))
    && (value.gust === undefined || (isRecord(value.gust) && vec3(value.gust.amplitude) !== undefined && finiteNonNegative(value.gust.frequency) && Number.isInteger(value.gust.seed)));
}

function positiveMass(value: Record<string, unknown>): boolean {
  return finitePositive(value.mass) || finitePositive(value.inverseMass);
}

function finitePositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function vec3(value: unknown): Vec3 | undefined {
  return Array.isArray(value) && value.length === 3 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? value as unknown as Vec3
    : undefined;
}

function quat(value: unknown): Quat | undefined {
  return Array.isArray(value) && value.length === 4 && value.every((item) => typeof item === "number" && Number.isFinite(item))
    ? value as unknown as Quat
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function roundedMeasurements(value: IAerodynamicViabilityMeasurements): IAerodynamicViabilityMeasurements {
  return { ...value, airDensity: round(value.airDensity), availableThrust: round(value.availableThrust), cruiseDrag: round(value.cruiseDrag), lift: round(value.lift), moment: value.moment.map(round) as unknown as Vec3, speed: round(value.speed), weight: round(value.weight) };
}

function windContains(volume: IWindVolumeComponent, center: Vec3, point: Vec3): boolean {
  const offset = subtract(point, center);
  if (volume.shape === "sphere") return magnitude(offset) <= (volume.radius ?? 0);
  const half = scale(volume.size ?? [0, 0, 0], 0.5);
  return Math.abs(offset[0]) <= half[0] && Math.abs(offset[1]) <= half[1] && Math.abs(offset[2]) <= half[2];
}

function hasNearGroundSupport(world: IWorldIr, entityIndex: number): boolean {
  const entity = world.entities[entityIndex];
  const collider = entity?.components.Collider;
  const position = vec3(entity?.components.Transform?.position);
  if (!isRecord(collider) || collider.kind !== "box" || position === undefined) return false;
  const size = vec3(collider.size);
  if (size === undefined || size.some((axis) => axis <= 0)) return false;
  const half = scale(size, 0.5);
  const bottom = position[1] - half[1];
  const launchProximity = Math.max(...size);
  return world.entities.some((candidate, index) => {
    if (index === entityIndex || candidate.components.RigidBody?.kind !== "static") return false;
    const supportCollider = candidate.components.Collider;
    const supportPosition = vec3(candidate.components.Transform?.position);
    if (!isRecord(supportCollider) || supportCollider.kind !== "box" || supportPosition === undefined) return false;
    const supportSize = vec3(supportCollider.size);
    if (supportSize === undefined || supportSize.some((axis) => axis <= 0)) return false;
    const supportHalf = scale(supportSize, 0.5);
    const horizontalOverlap = Math.abs(position[0] - supportPosition[0]) <= half[0] + supportHalf[0]
      && Math.abs(position[2] - supportPosition[2]) <= half[2] + supportHalf[2];
    const gap = bottom - (supportPosition[1] + supportHalf[1]);
    return horizontalOverlap && gap >= -EPSILON && gap <= launchProximity;
  });
}

function canReachSupportedLiftOff(options: {
  aerodynamicBody: IAerodynamicBodyComponent;
  airDensity: number;
  deflections: Readonly<Record<string, number>>;
  direction: Vec3;
  position: Vec3;
  rotation: Quat;
  speed: number;
  weight: number;
}): boolean {
  if (options.airDensity <= 0 || Math.abs(options.direction[1]) > 0.1 || (options.aerodynamicBody.thrusters?.length ?? 0) === 0) return false;
  const throttles = Object.fromEntries((options.aerodynamicBody.thrusters ?? []).map((thruster) => [thruster.id, 1]));
  let candidateSpeed = Math.max(options.speed, 1);
  for (let sample = 0; sample < 96 && candidateSpeed <= 1_024; sample += 1) {
    const evaluation = evaluateAerodynamicForces({
      aerodynamicBody: options.aerodynamicBody,
      airDensity: options.airDensity,
      position: options.position,
      relativeAirVelocity: scale(options.direction, candidateSpeed),
      rotation: options.rotation,
      surfaceDeflections: options.deflections,
      thrusterThrottles: throttles,
    });
    const lift = evaluation.surfaces.reduce((sum, surface) => sum + dot(surface.lift, [0, 1, 0]), 0);
    const drag = magnitude(evaluation.bodyDrag) + evaluation.surfaces.reduce((sum, surface) => sum + magnitude(surface.drag), 0);
    const thrust = evaluation.thrusters.reduce((sum, thruster) => sum + Math.max(0, dot(thruster.force, options.direction)), 0);
    if (lift >= options.weight * LIFT_MARGIN && thrust >= drag) return true;
    if (thrust < drag) return false;
    candidateSpeed *= 1.08;
  }
  return false;
}

function gustVelocity(volume: IWindVolumeComponent, elapsed: number): Vec3 {
  const gust = volume.gust;
  if (gust === undefined) return [0, 0, 0];
  const phase = elapsed * gust.frequency * Math.PI * 2;
  return [0, 1, 2].map((axis) => gust.amplitude[axis]! * Math.sin(phase + seededPhase(gust.seed, axis))) as unknown as Vec3;
}

function seededPhase(seed: number, axis: number): number {
  let value = (seed ^ Math.imul(axis + 1, 0x9e3779b9)) >>> 0;
  value ^= value << 13;
  value ^= value >>> 17;
  value ^= value << 5;
  return ((value >>> 0) & 0xffff) * (Math.PI * 2 / 65536);
}

function format(value: number): string { return round(value).toFixed(3); }
function round(value: number): number { return Number(value.toFixed(6)); }
function magnitude(value: Vec3): number { return Math.hypot(...value); }
function normalize(value: Vec3): Vec3 { const length = magnitude(value); return length < EPSILON ? [0, 0, 0] : scale(value, 1 / length); }
function scale(value: Vec3, scalar: number): Vec3 { return [value[0] * scalar, value[1] * scalar, value[2] * scalar]; }
function add(left: Vec3, right: Vec3): Vec3 { return [left[0] + right[0], left[1] + right[1], left[2] + right[2]]; }
function subtract(left: Vec3, right: Vec3): Vec3 { return [left[0] - right[0], left[1] - right[1], left[2] - right[2]]; }
function dot(left: Vec3, right: Vec3): number { return left[0] * right[0] + left[1] * right[1] + left[2] * right[2]; }
function cross(left: Vec3, right: Vec3): Vec3 { return [left[1] * right[2] - left[2] * right[1], left[2] * right[0] - left[0] * right[2], left[0] * right[1] - left[1] * right[0]]; }
function rotate([x, y, z]: Vec3, [qx, qy, qz, qw]: Quat): Vec3 { const ix = qw * x + qy * z - qz * y; const iy = qw * y + qz * x - qx * z; const iz = qw * z + qx * y - qy * x; const iw = -qx * x - qy * y - qz * z; return [ix * qw + iw * -qx + iy * -qz - iz * -qy, iy * qw + iw * -qy + iz * -qx - ix * -qz, iz * qw + iw * -qz + ix * -qy - iy * -qx]; }
function inverseRotate(value: Vec3, [x, y, z, w]: Quat): Vec3 { return rotate(value, [-x, -y, -z, w]); }
