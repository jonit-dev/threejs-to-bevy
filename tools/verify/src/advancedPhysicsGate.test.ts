import assert from "node:assert/strict";
import test from "node:test";

import { validateAdvancedPhysicsBenchmark, validateAdvancedPhysicsPlaytestPair } from "./advancedPhysicsGate.js";

const workload = { compoundChildren: 256, debrisBodies: 128, projectileBodies: 64, vehicleCount: 16, wheelsPerVehicle: 4 } as const;
const benchmark = (runtime: "web" | "desktop") => ({
  activeBodies: 32, allocatedPieces: 128, allocationTelemetry: { heapUsedEndBytes: 2, heapUsedPeakBytes: 3, heapUsedStartBytes: 1 },
  contacts: 10, executedSystems: ["vehicle-controller", "wheel-raycast", "aerodynamics", "destruction", "rapier"] as const,
  maxStepMs: 2, p50StepMs: 0.5, p95StepMs: 1, queries: 230_400,
  runtime, sampleCount: 3_600, schema: "threenative.advanced-physics-benchmark" as const, simulatedSeconds: 60, sleepingBodies: 176,
  systemTimings: { aerodynamics: { maxMs: 0.1, p95Ms: 0.1 }, destruction: { maxMs: 0.1, p95Ms: 0.1 }, rapier: { maxMs: 1, p95Ms: 1 }, vehicle: { maxMs: 0.5, p95Ms: 0.5 } },
  version: "0.2.0" as const, workload,
});

test("should stay within advanced physics performance budgets", () => {
  assert.deepEqual(validateAdvancedPhysicsBenchmark(benchmark("web"), benchmark("desktop")), []);
});

test("should reject stale missing weakened or single-adapter evidence", () => {
  const valid = { assertions: [{ id: "movement", pass: true }], pass: true, proofMetadata: { bundleHash: "bundle", sourceHash: "source" }, runtime: "web", scenario: "case", target: "web" };
  assert.equal(validateAdvancedPhysicsPlaytestPair(valid, undefined, "case", ["movement"], "source").some((item) => item.code === "TN_VERIFY_ADVANCED_PHYSICS_EVIDENCE_MISSING"), true);
  assert.equal(validateAdvancedPhysicsPlaytestPair(valid, { ...valid, runtime: "bevy", target: "desktop", proofMetadata: { bundleHash: "other", sourceHash: "stale" } }, "case", ["movement", "objective"], "source").length >= 3, true);
  assert.equal(validateAdvancedPhysicsBenchmark({ ...benchmark("web"), sampleCount: 3_599 }, benchmark("desktop")).some((item) => item.code === "TN_VERIFY_ADVANCED_PHYSICS_WORKLOAD"), true);
});
