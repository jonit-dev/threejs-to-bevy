import physicsInvariantRegistry from "./physicsInvariantRegistry.json" with { type: "json" };

export const PHYSICS_INVARIANT_REGISTRY = Object.freeze(physicsInvariantRegistry);
export const PHYSICS_PHASE3_VEHICLE_TOLERANCES = Object.freeze(physicsInvariantRegistry.phase3VehicleComparison.vehicle);
export const PHYSICS_PHASE3_OUTCOME_TOLERANCES = Object.freeze(physicsInvariantRegistry.phase3VehicleComparison.outcome);

export const PHYSICS_CAPABILITY_LIMITS = Object.freeze({
  aerodynamicCurvePoints: 16,
  aerodynamicForce: 10_000_000,
  aerodynamicSurfacesPerBody: 16,
  aerodynamicThrustersPerBody: 16,
  compoundColliderChildren: 32,
  convexHullVertices: 64,
  jointsPerBody: 16,
  jointsPerWorld: 256,
  slipCurvePoints: 16,
  vehicleForwardGears: 12,
  // Debounce one suspension contact sample before switching drivetrain coupling to raw airborne wheel speed.
  vehicleGroundedCouplingGraceTicks: 1,
  // Limited-slip torque remains equal until the eligible wheels' absolute longitudinal-slip spread exceeds this normalized delta.
  vehicleLimitedSlipActivationDelta: 0.05,
  // Ignore backend-scale chassis and wheel noise when choosing engine-braking shaft direction.
  vehicleShaftDirectionEpsilon: 0.0001,
  vehicleTorqueCurvePoints: 16,
  vehicleSteeringCurvePoints: 16,
  wheelForce: 1_000_000,
  wheelSteeringAngle: Math.PI / 2,
  wheelsPerAssembly: 16,
});

export const PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION = "0.4.0";

export const PHYSICS_OBSERVATION_TOLERANCES = Object.freeze({
  aerodynamicAngle: { absolute: 0.00001, relative: 0.001 },
  aerodynamicControl: { absolute: 0.00001, relative: 0.001 },
  aerodynamicForce: { absolute: 0.01, relative: 0.001 },
  aerodynamicVelocity: { absolute: 0.0001, relative: 0.001 },
  angularVelocity: { absolute: 0.0001, relative: 0.001 },
  distance: { absolute: 0.0001, relative: 0.001 },
  linearVelocity: { absolute: 0.0001, relative: 0.001 },
  normal: { absolute: 0.0001, relative: 0.001 },
  point: { absolute: 0.0001, relative: 0.001 },
  position: { absolute: 0.0001, relative: 0.001 },
  wheelAngularSpeed: { absolute: 0.001, relative: 0.005 },
  // Paired Rapier JS/Rust wheel traces have bounded lateral solver drift; keep it isolated from generic rigid-body evidence.
  wheelChassisAngularVelocity: { absolute: 0.0045, relative: 0.015 },
  wheelChassisPosition: { absolute: 0.125, relative: 0.002 },
  wheelChassisRotation: { absolute: 0.003, relative: 0.002 },
  wheelChassisVelocity: { absolute: 0.08, relative: 0.003 },
  wheelChassisSpeed: { absolute: 0.02, relative: 0.002 },
  wheelContactDistance: { absolute: 0.003, relative: 0.01 },
  wheelContactNormal: { absolute: 0.007, relative: 0.005 },
  wheelContactPoint: { absolute: 0.13, relative: 0.005 },
  // Calibrated from paired Rapier JS/Rust fixed-step traces; exact contact semantics and outcome bounds remain separately gated.
  wheelCompression: { absolute: 0.008, relative: 0.05 },
  wheelLateralSlip: { absolute: 0.003, relative: 0.012 },
  wheelLongitudinalSlip: { absolute: 0.002, relative: 0.005 },
  wheelNormalLoad: { absolute: 5, relative: 0.35 },
  wheelRideHeight: { absolute: 0.003, relative: 0.002 },
  wheelVisualPosition: { absolute: 0.13, relative: 0.005 },
  wheelVisualSpinAngle: { absolute: 0.02, relative: 0.01 },
  wheelVisualSteeringAngle: { absolute: 0.001, relative: 0.005 },
  vehicleClutch: { absolute: 0.001, relative: 0.001 },
  vehicleDriveTorque: { absolute: 0.1, relative: 0.01 },
  vehicleEngineRpm: { absolute: 1, relative: 0.005 },
  vehicleSpeed: { absolute: 0.02, relative: 0.002 },
  vehicleTorquePath: { absolute: 0.1, relative: 0.01 },
} as const);

export const PHYSICS_CAPABILITY_DESCRIPTORS = [
  {
    adapters: ["bevy", "web"] as const,
    authoringOperation: "physics.aerodynamics.add",
    compilerComponent: "AerodynamicBody",
    component: "AerodynamicBody",
    fixture: "advanced-physics-aerodynamics",
    gate: "advanced-physics-aerodynamics",
    limits: { curvePoints: PHYSICS_CAPABILITY_LIMITS.aerodynamicCurvePoints, force: PHYSICS_CAPABILITY_LIMITS.aerodynamicForce, surfaces: PHYSICS_CAPABILITY_LIMITS.aerodynamicSurfacesPerBody, thrusters: PHYSICS_CAPABILITY_LIMITS.aerodynamicThrustersPerBody },
    observationFields: ["relativeAirVelocity", "sideslip", "surfaces", "thrusters", "windVelocity", "airDensity", "diagnostics"] as const,
    sdkHelpers: ["aerodynamicBody", "aerodynamicSurface", "thruster"] as const,
    stage: "contract" as const,
    unit: "SI",
  },
  {
    adapters: ["bevy", "web"] as const,
    authoringOperation: "physics.wind.add",
    compilerComponent: "WindVolume",
    component: "WindVolume",
    fixture: "advanced-physics-aerodynamics",
    gate: "advanced-physics-aerodynamics",
    sdkHelpers: ["windVolume"] as const,
    stage: "contract" as const,
    unit: "meters-per-second",
  },
  {
    adapters: ["bevy", "web"] as const,
    authoringOperation: "scene.set_component",
    component: "CompoundCollider",
    fixture: "advanced-physics-foundation",
    gate: "physics-self-verification",
    kinds: ["box", "capsule", "convexHull", "sphere"] as const,
    limits: { children: PHYSICS_CAPABILITY_LIMITS.compoundColliderChildren, convexHullVertices: PHYSICS_CAPABILITY_LIMITS.convexHullVertices },
    unit: "meters",
  },
  {
    adapters: ["bevy", "web"] as const,
    authoringOperation: "scene.set_component",
    compilerComponent: "PhysicsSurface",
    component: "PhysicsSurface",
    fixture: "advanced-physics-wheels",
    gate: "advanced-physics-wheels",
    sdkHelpers: ["physicsSurface"] as const,
    stage: "promoted" as const,
    unit: "coefficient",
  },
  {
    adapters: ["bevy", "web"] as const,
    authoringOperation: "scene.set_component",
    compilerComponent: "TireModel",
    component: "TireModel",
    fixture: "advanced-physics-wheels",
    gate: "advanced-physics-wheels",
    limits: { slipCurvePoints: PHYSICS_CAPABILITY_LIMITS.slipCurvePoints },
    sdkHelpers: ["tireModel"] as const,
    stage: "promoted" as const,
    unit: "normalized-slip",
  },
  {
    adapters: ["bevy", "web"] as const,
    authoringOperation: "scene.set_component",
    compilerComponent: "WheelAssembly",
    component: "WheelAssembly",
    fixture: "advanced-physics-wheels",
    gate: "advanced-physics-wheels",
    limits: { force: PHYSICS_CAPABILITY_LIMITS.wheelForce, steeringAngle: PHYSICS_CAPABILITY_LIMITS.wheelSteeringAngle, wheels: PHYSICS_CAPABILITY_LIMITS.wheelsPerAssembly },
    sdkHelpers: ["wheelAssembly", "wheelControlInput"] as const,
    stage: "promoted" as const,
    unit: "meters",
    visualConsumption: true,
  },
  {
    adapters: ["bevy", "web"] as const,
    authoringOperation: "physics.vehicle.add",
    compilerComponent: "VehicleController",
    component: "VehicleController",
    fixture: "advanced-physics-drivetrain",
    gate: "advanced-physics-drivetrain",
    inputFields: ["throttle", "brake", "handbrake", "steer", "clutch", "gear"] as const,
    limits: { forwardGears: PHYSICS_CAPABILITY_LIMITS.vehicleForwardGears, groundedCouplingGraceTicks: PHYSICS_CAPABILITY_LIMITS.vehicleGroundedCouplingGraceTicks, limitedSlipActivationDelta: PHYSICS_CAPABILITY_LIMITS.vehicleLimitedSlipActivationDelta, steeringCurvePoints: PHYSICS_CAPABILITY_LIMITS.vehicleSteeringCurvePoints, torqueCurvePoints: PHYSICS_CAPABILITY_LIMITS.vehicleTorqueCurvePoints },
    observationFields: ["speed", "engineRpm", "gear", "clutch", "shiftState", "driveTorque", "torquePath", "absActive", "tcsActive", "inputs"] as const,
    observationSemantics: { speed: "Y-up ground-plane linear-velocity magnitude; excludes vertical velocity" } as const,
    sdkHelpers: ["vehicleController", "vehicleControllerInputs"] as const,
    stage: "contract" as const,
    unit: "SI",
  },
] as const;

export const PHYSICS_SURFACE_COMBINE_PRIORITY = Object.freeze({ average: 0, minimum: 1, multiply: 2, maximum: 3 } as const);

export function combinePhysicsSurfaceValues(left: number, leftRule: PhysicsSurfaceCombineRule, right: number, rightRule: PhysicsSurfaceCombineRule): number {
  const rule = PHYSICS_SURFACE_COMBINE_PRIORITY[leftRule] >= PHYSICS_SURFACE_COMBINE_PRIORITY[rightRule] ? leftRule : rightRule;
  if (rule === "minimum") return Math.min(left, right);
  if (rule === "maximum") return Math.max(left, right);
  if (rule === "multiply") return left * right;
  return (left + right) / 2;
}

export const PHYSICS_SCRIPT_SERVICE_DESCRIPTORS = [
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.addForce", mutation: true, service: "physics.addForce", unit: "newtons" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.addForceAtPoint", mutation: true, service: "physics.addForceAtPoint", unit: "newtons" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.addTorque", mutation: true, service: "physics.addTorque", unit: "newton-meters" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.aerodynamics.setInputs", mutation: true, service: "physics.aerodynamics.setInputs", unit: "normalized-input" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.applyAngularImpulse", mutation: true, service: "physics.applyAngularImpulse", unit: "newton-meter-seconds" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.applyImpulse", mutation: true, service: "physics.applyImpulse", unit: "newton-seconds" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.applyImpulseAtPoint", mutation: true, service: "physics.applyImpulseAtPoint", unit: "newton-seconds" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.overlap", mutation: false, service: "physics.overlap", unit: "meters" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.raycast", mutation: false, service: "physics.raycast", unit: "meters" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.sensor", mutation: false, service: "physics.sensor", unit: "none" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.setAngularVelocity", mutation: true, service: "physics.setAngularVelocity", unit: "radians-per-second" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.setLinearVelocity", mutation: true, service: "physics.setLinearVelocity", unit: "meters-per-second" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.shapeCast", mutation: false, service: "physics.shapeCast", unit: "meters" },
  { adapters: ["bevy", "web"] as const, context: "ctx.physics.vehicle.setInputs", mutation: true, service: "physics.vehicle.setInputs", unit: "normalized-input" },
] as const;

export type PhysicsScriptService = (typeof PHYSICS_SCRIPT_SERVICE_DESCRIPTORS)[number]["service"];

export interface IPhysicsDescriptorConsumers {
  authoringOperations: readonly string[];
  bevyComponents: readonly string[];
  bevyHostServices: readonly string[];
  bevyRuntimeServices: readonly string[];
  bevyVisualComponents: readonly string[];
  compilerComponents: readonly string[];
  fixtures: readonly string[];
  gates: readonly string[];
  irComponents: readonly string[];
  irServices: readonly string[];
  sdkServices: readonly string[];
  sdkComponents: readonly string[];
  stdlibContexts: readonly string[];
  webComponents: readonly string[];
  webHostServices: readonly string[];
  webRuntimeServices: readonly string[];
  webVisualComponents: readonly string[];
}

export interface IPhysicsPromotionRequirements {
  authoringOperation: string;
  component: string;
  fixture: string;
  gate: string;
  sdkHelpers: readonly string[];
  service: string;
}

export function physicsPromotionReadinessDrift(requirements: IPhysicsPromotionRequirements, consumers: IPhysicsDescriptorConsumers): string[] {
  const missing: string[] = [];
  const requireConsumer = (group: keyof IPhysicsDescriptorConsumers, value: string, owner: string): void => {
    if (!consumers[group].includes(value)) missing.push(`${owner} missing ${group}:${value}`);
  };
  for (const group of ["irComponents", "compilerComponents", "webComponents", "bevyComponents"] as const) {
    requireConsumer(group, requirements.component, requirements.component);
  }
  requireConsumer("authoringOperations", requirements.authoringOperation, requirements.component);
  for (const helper of requirements.sdkHelpers) requireConsumer("sdkComponents", helper, requirements.component);
  requireConsumer("fixtures", requirements.fixture, requirements.component);
  requireConsumer("gates", requirements.gate, requirements.component);
  for (const group of ["irServices", "sdkServices", "webHostServices", "webRuntimeServices", "bevyHostServices", "bevyRuntimeServices"] as const) {
    requireConsumer(group, requirements.service, requirements.service);
  }
  requireConsumer("stdlibContexts", `ctx.${requirements.service}`, requirements.service);
  return missing.sort();
}

export function physicsDescriptorDrift(consumers: IPhysicsDescriptorConsumers): string[] {
  const missing: string[] = [];
  const requireConsumer = (group: keyof IPhysicsDescriptorConsumers, value: string, owner: string): void => {
    if (!consumers[group].includes(value)) missing.push(`${owner} missing ${group}:${value}`);
  };
  for (const descriptor of PHYSICS_CAPABILITY_DESCRIPTORS) {
    requireConsumer("irComponents", descriptor.component, descriptor.component);
    requireConsumer("authoringOperations", descriptor.authoringOperation, descriptor.component);
    if ("compilerComponent" in descriptor) requireConsumer("compilerComponents", descriptor.compilerComponent, descriptor.component);
    if ("sdkHelpers" in descriptor) for (const helper of descriptor.sdkHelpers) requireConsumer("sdkComponents", helper, descriptor.component);
    if (!("stage" in descriptor) || descriptor.stage === "promoted") {
      if ("fixture" in descriptor) requireConsumer("fixtures", descriptor.fixture, descriptor.component);
      if ("gate" in descriptor) requireConsumer("gates", descriptor.gate, descriptor.component);
    }
    const adapters: readonly string[] = descriptor.adapters;
    if (adapters.includes("web")) requireConsumer("webComponents", descriptor.component, descriptor.component);
    if (adapters.includes("bevy")) requireConsumer("bevyComponents", descriptor.component, descriptor.component);
    if ("visualConsumption" in descriptor && descriptor.visualConsumption) {
      if (adapters.includes("web")) requireConsumer("webVisualComponents", descriptor.component, descriptor.component);
      if (adapters.includes("bevy")) requireConsumer("bevyVisualComponents", descriptor.component, descriptor.component);
    }
  }
  for (const descriptor of PHYSICS_SCRIPT_SERVICE_DESCRIPTORS) {
    requireConsumer("irServices", descriptor.service, descriptor.service);
    requireConsumer("sdkServices", descriptor.service, descriptor.service);
    requireConsumer("stdlibContexts", descriptor.context, descriptor.service);
    const adapters: readonly string[] = descriptor.adapters;
    if (adapters.includes("web")) {
      requireConsumer("webHostServices", descriptor.service, descriptor.service);
      requireConsumer("webRuntimeServices", descriptor.service, descriptor.service);
    }
    if (adapters.includes("bevy")) {
      requireConsumer("bevyHostServices", descriptor.service, descriptor.service);
      requireConsumer("bevyRuntimeServices", descriptor.service, descriptor.service);
    }
  }
  return missing.sort();
}
import type { PhysicsSurfaceCombineRule } from "./types.js";
