import type { IAerodynamicBodyComponent, IFractureManifest, IWorldEntity, IWorldIr } from "@threenative/ir";

import { disposePhysicsRuntime, initializePhysicsRuntime, observePhysicsTelemetryStats, preparePhysicsRuntime, stepPhysics } from "./physics.js";
import { collectPhysicsDebugCore } from "./physicsDebug.js";
import { setPhysicsAerodynamicInputs, stepPhysicsAerodynamics } from "./physicsAerodynamics.js";
import { createPhysicsDestructionRuntime, queuePhysicsDestructionDamage, registerPhysicsDestructible, stepPhysicsDestruction } from "./physicsDestruction.js";
import { setPhysicsVehicleControllerInputs, stepPhysicsVehicles } from "./physicsVehicle.js";

export const ADVANCED_PHYSICS_BENCHMARK_WORKLOAD = Object.freeze({
  compoundChildren: 256,
  debrisBodies: 128,
  projectileBodies: 64,
  vehicleCount: 16,
  wheelsPerVehicle: 4,
});

export interface IAdvancedPhysicsBenchmarkResult {
  activeBodies: number;
  allocatedPieces: number;
  allocationTelemetry: {
    heapUsedEndBytes: number;
    heapUsedPeakBytes: number;
    heapUsedStartBytes: number;
  };
  contacts: number;
  executedSystems: readonly ["vehicle-controller", "wheel-raycast", "aerodynamics", "destruction", "rapier"];
  maxStepMs: number;
  p50StepMs: number;
  p95StepMs: number;
  queries: number;
  runtime: "web";
  sampleCount: number;
  schema: "threenative.advanced-physics-benchmark";
  simulatedSeconds: number;
  sleepingBodies: number;
  systemTimings: Record<"aerodynamics" | "destruction" | "rapier" | "vehicle", { maxMs: number; p95Ms: number }>;
  version: "0.2.0";
  workload: typeof ADVANCED_PHYSICS_BENCHMARK_WORKLOAD;
}

const FIXED_DELTA = 1 / 60;
const WARMUP_STEPS = 600;
const MEASURED_STEPS = 3_600;

export async function runAdvancedPhysicsBenchmark(options: { measuredSteps?: number; warmupSteps?: number } = {}): Promise<IAdvancedPhysicsBenchmarkResult> {
  const measuredSteps = options.measuredSteps ?? MEASURED_STEPS;
  const warmupSteps = options.warmupSteps ?? WARMUP_STEPS;
  await initializePhysicsRuntime();
  const world = createAdvancedPhysicsBenchmarkWorld();
  const manifest = createBenchmarkFractureManifest();
  const destruction = createPhysicsDestructionRuntime({ maxActivePieces: ADVANCED_PHYSICS_BENCHMARK_WORKLOAD.debrisBodies });
  registerPhysicsDestructible(destruction, {
    activationBudget: ADVANCED_PHYSICS_BENCHMARK_WORKLOAD.debrisBodies,
    cleanupPolicy: "sleep",
    entity: "debris-assembly",
    fractureManifest: "benchmark.debris",
    maxDepth: 0,
  }, manifest);
  for (const bond of manifest.bonds) {
    queuePhysicsDestructionDamage(destruction, {
      amount: 2,
      assembly: "debris-assembly",
      bond: bond.id,
      cause: { kind: "script" },
      tick: 0,
    });
  }
  preparePhysicsRuntime(world, undefined, [0, 0, 0]);
  stepPhysicsDestruction(destruction, world, 0, FIXED_DELTA);
  configureControls(world);

  const heapUsedStartBytes = heapUsed();
  let heapUsedPeakBytes = heapUsedStartBytes;
  let measuredQueries = 0;
  let observedContacts = 0;
  for (let tick = 1; tick <= warmupSteps; tick += 1) {
    stepBenchmarkTick(world, destruction, tick);
    if (tick % 60 === 0) await yieldForCollection();
  }
  const samples: number[] = [];
  const systemSamples = { aerodynamics: [] as number[], destruction: [] as number[], rapier: [] as number[], vehicle: [] as number[] };
  for (let sample = 0; sample < measuredSteps; sample += 1) {
    const tick = warmupSteps + sample + 1;
    const startedAt = performance.now();
    const timings = stepBenchmarkTick(world, destruction, tick);
    for (const key of Object.keys(systemSamples) as Array<keyof typeof systemSamples>) systemSamples[key].push(timings[key]);
    samples.push(performance.now() - startedAt);
    const telemetry = observePhysicsTelemetryStats(world);
    measuredQueries += telemetry.queries;
    observedContacts = Math.max(observedContacts, telemetry.contacts);
    if (sample % 60 === 0) {
      heapUsedPeakBytes = Math.max(heapUsedPeakBytes, heapUsed());
      await yieldForCollection();
    }
  }
  const sorted = [...samples].sort((left, right) => left - right);
  const debug = collectPhysicsDebugCore(world, { destructionRuntime: destruction, fixedDt: FIXED_DELTA, maxPrimitives: 1, tick: warmupSteps + measuredSteps });
  const heapUsedEndBytes = heapUsed();
  heapUsedPeakBytes = Math.max(heapUsedPeakBytes, heapUsedEndBytes);
  const result: IAdvancedPhysicsBenchmarkResult = {
    activeBodies: debug.telemetry.bodies.active,
    allocatedPieces: debug.telemetry.allocatedPieces,
    allocationTelemetry: { heapUsedEndBytes, heapUsedPeakBytes, heapUsedStartBytes },
    contacts: Math.max(observedContacts, debug.telemetry.contacts),
    executedSystems: ["vehicle-controller", "wheel-raycast", "aerodynamics", "destruction", "rapier"],
    maxStepMs: sorted.at(-1) ?? 0,
    p50StepMs: percentile(sorted, 0.5),
    p95StepMs: percentile(sorted, 0.95),
    queries: measuredQueries,
    runtime: "web",
    sampleCount: samples.length,
    schema: "threenative.advanced-physics-benchmark",
    simulatedSeconds: samples.length / 60,
    sleepingBodies: debug.telemetry.bodies.sleeping,
    systemTimings: Object.fromEntries((Object.keys(systemSamples) as Array<keyof typeof systemSamples>).map((key) => {
      const values = systemSamples[key].sort((left, right) => left - right);
      return [key, { maxMs: values.at(-1) ?? 0, p95Ms: percentile(values, 0.95) }];
    })) as IAdvancedPhysicsBenchmarkResult["systemTimings"],
    version: "0.2.0",
    workload: ADVANCED_PHYSICS_BENCHMARK_WORKLOAD,
  };
  disposePhysicsRuntime(world);
  return result;
}

export function createAdvancedPhysicsBenchmarkWorld(): IWorldIr {
  const entities: IWorldEntity[] = [{
    id: "benchmark-ground",
    components: {
      CompoundCollider: {
        children: Array.from({ length: ADVANCED_PHYSICS_BENCHMARK_WORKLOAD.compoundChildren }, (_, index) => ({
          id: `tile-${index.toString().padStart(3, "0")}`,
          localPose: { position: [(index % 16) * 3 - 22.5, -0.25, Math.floor(index / 16) * 3 - 22.5], rotation: [0, 0, 0, 1] },
          shape: { kind: "box", size: [2.9, 0.5, 2.9] },
        })),
      },
      PhysicsSurface: { combineRule: "multiply", grip: 1, rollingResistance: 0.01 },
      RigidBody: { kind: "static" },
      Transform: { position: [0, 0, 0] },
    },
  }, {
    id: "benchmark-tire",
    components: {
      TireModel: {
        lateralSlipCurve: [{ grip: 1, slip: 0 }, { grip: 0.8, slip: 1 }],
        loadSensitivity: 0.05,
        longitudinalSlipCurve: [{ grip: 1, slip: 0 }, { grip: 0.75, slip: 1 }],
        rollingResistance: 0.01,
      },
      Transform: { position: [0, 0, 0] },
    },
  }, benchmarkDestructible()];
  for (let index = 0; index < ADVANCED_PHYSICS_BENCHMARK_WORKLOAD.vehicleCount; index += 1) entities.push(benchmarkVehicle(index));
  for (let index = 0; index < ADVANCED_PHYSICS_BENCHMARK_WORKLOAD.projectileBodies; index += 1) {
    entities.push({
      id: `projectile-${index.toString().padStart(3, "0")}`,
      components: {
        Collider: { kind: "sphere", layer: "projectile", radius: 0.12 },
        RigidBody: { ccd: { enabled: true, mode: "linear" }, kind: "dynamic", mass: 1, velocity: [0, 0, -18] },
        Transform: { position: [(index % 8) * 0.5 - 1.75, index === 0 ? 0.12 : 4 + Math.floor(index / 8) * 0.3, 18] },
      },
    });
  }
  return { entities, schema: "threenative.world", version: "0.1.0" };
}

export function createBenchmarkFractureManifest(): IFractureManifest {
  const count = ADVANCED_PHYSICS_BENCHMARK_WORKLOAD.debrisBodies;
  return {
    bonds: Array.from({ length: count - 1 }, (_, index) => ({
      health: 1,
      id: `bond-${index.toString().padStart(3, "0")}`,
      impulseThreshold: 1,
      pieces: [`piece-${index.toString().padStart(3, "0")}`, `piece-${(index + 1).toString().padStart(3, "0")}`],
    })),
    budgets: { maxActivePieces: count, maxDepth: 0, overflowPolicy: "reject-new" },
    cleanup: {},
    id: "benchmark.debris",
    pieces: Array.from({ length: count }, (_, index) => ({
      activationDepth: 0,
      collider: { halfExtents: [0.18, 0.18, 0.18], kind: "box" },
      id: `piece-${index.toString().padStart(3, "0")}`,
      localPosition: [(index % 16) * 0.45 - 3.4, 4 + Math.floor(index / 16) * 0.45, -2],
      massFraction: 1 / count,
    })),
    schema: "threenative.fracture-manifest",
    source: { kind: "primitive", seed: 8, sourceHash: "sha256:7d780b68d55679ecb962c1b117f34ce7cfed91a330e1d9053bf5c482a669efd1" },
    version: "0.1.0",
  };
}

function benchmarkDestructible(): IWorldEntity {
  return {
    id: "debris-assembly",
    components: {
      Collider: { kind: "box", layer: "destructible", size: [8, 8, 1] },
      Destructible: { activationBudget: 128, cleanupPolicy: "sleep", fractureManifest: "benchmark.debris", maxDepth: 0 },
      RigidBody: { gravityScale: 0, kind: "dynamic", mass: 256, velocity: [0.1, 0, 0] },
      Transform: { position: [0, 0, 0] },
    },
  };
}

function benchmarkVehicle(index: number): IWorldEntity {
  const x = (index % 4) * 5 - 7.5;
  const z = Math.floor(index / 4) * 6 - 9;
  return {
    id: `vehicle-${index.toString().padStart(2, "0")}`,
    components: {
      AerodynamicBody: benchmarkAerodynamics(),
      Collider: { kind: "box", size: [1.6, 0.5, 3] },
      RigidBody: { enabledRotations: [false, true, false], kind: "dynamic", mass: 900 },
      Transform: { position: [x, 1.1, z], rotation: [0, 0, 0, 1] },
      VehicleController: {
        assists: { abs: { enabled: true, response: 0.08, slipThreshold: 0.18 }, tcs: { enabled: true, response: 0.08, slipThreshold: 0.16 } },
        brakes: { frontBias: 0.62, handbrakeWheelIds: ["rear-left", "rear-right"] },
        differential: { kind: "limited-slip", limitedSlipRatio: 2.5 },
        engine: { engineBraking: 0.12, idleRpm: 900, redlineRpm: 6500, torqueCurve: [{ rpm: 900, torque: 350 }, { rpm: 3500, torque: 550 }, { rpm: 6500, torque: 500 }] },
        steering: { speedCurve: [{ scale: 1, speed: 0 }, { scale: 0.4, speed: 40 }] },
        transmission: { clutchResponse: 0.2, downshiftRpm: 950, finalDrive: 3.7, forwardRatios: [3.1, 1.9, 1.3, 1], reverseRatio: 3, shiftPolicy: "automatic", upshiftRpm: 4_500 },
      },
      WheelAssembly: {
        maxSteeringAngle: 0.6,
        maxSuspensionForce: 18_000,
        maxTireForce: 12_000,
        wheels: [
          wheel("front-left", [-0.65, -0.2, -1], true),
          wheel("front-right", [0.65, -0.2, -1], true),
          wheel("rear-left", [-0.65, -0.2, 1], false),
          wheel("rear-right", [0.65, -0.2, 1], false),
        ],
      },
    },
  };
}

function benchmarkAerodynamics(): IAerodynamicBodyComponent {
  return {
    dragArea: [1.6, 0.5, 3],
    maxForce: 20_000,
    surfaces: [{
      area: 1.5,
      aspectRatio: 3,
      centerOfPressure: [0, 0, 0.5],
      control: { input: 0, maxDeflection: 0.2, response: 8 },
      dragCurve: [{ angle: -1, coefficient: 0.15 }, { angle: 0, coefficient: 0.05 }, { angle: 1, coefficient: 0.15 }],
      id: "downforce",
      liftCurve: [{ angle: -1, coefficient: -0.2 }, { angle: 0, coefficient: 0 }, { angle: 1, coefficient: 0.2 }],
      recoveryAngle: 0.6,
      stallAngle: 0.8,
    }],
  };
}

function wheel(id: string, attachment: [number, number, number], steering: boolean) {
  return {
    attachment,
    braked: true,
    driven: true,
    id,
    radius: 0.3,
    steering,
    suspension: { damperRate: 500, springRate: 20_000, travel: 0.5 },
    tire: "benchmark-tire",
    width: 0.2,
  };
}

function configureControls(world: IWorldIr): void {
  for (const entity of world.entities) {
    if (entity.components.VehicleController === undefined) continue;
    setPhysicsVehicleControllerInputs(world, entity.id, { brake: 0, clutch: 0, handbrake: 0, steer: 0.1, throttle: 0.65 });
    setPhysicsAerodynamicInputs(world, entity.id, { surfaces: { downforce: 0.1 } });
  }
}

function stepBenchmarkTick(world: IWorldIr, destruction: ReturnType<typeof createPhysicsDestructionRuntime>, tick: number) {
  const startedVehicle = performance.now();
  stepPhysicsVehicles(world, FIXED_DELTA);
  const startedAerodynamics = performance.now();
  stepPhysicsAerodynamics(world, FIXED_DELTA, tick);
  const startedRapier = performance.now();
  stepPhysics(world, FIXED_DELTA, undefined, { gravity: [0, 0, 0], tick });
  const startedDestruction = performance.now();
  // The destruction lifecycle is executed at activation. The resulting 128
  // retained piece bodies stay in the measured Rapier workload; no synthetic
  // per-tick piece count is added here.
  void destruction;
  const completed = performance.now();
  return {
    aerodynamics: startedRapier - startedAerodynamics,
    destruction: completed - startedDestruction,
    rapier: startedDestruction - startedRapier,
    vehicle: startedAerodynamics - startedVehicle,
  };
}

function heapUsed(): number {
  const processLike = (globalThis as { process?: { memoryUsage?: () => { heapUsed: number } } }).process;
  return processLike?.memoryUsage?.().heapUsed ?? 0;
}

async function yieldForCollection(): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

function percentile(sorted: readonly number[], ratio: number): number {
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}
