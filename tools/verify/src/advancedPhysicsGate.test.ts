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

function pairedSummaries(
  scenario: string,
  state: Readonly<Record<string, unknown>>,
  webDistance: number,
  desktopDistance: number,
) {
  const summary = (target: "desktop" | "web", distance: number) => ({
    assertions: [
      { details: { distance }, id: "movement", pass: true },
      ...Object.entries(state).map(([id, after]) => ({ details: { after }, id, pass: true })),
    ],
    pass: true,
    proofMetadata: { bundleHash: "bundle", sourceHash: "source" },
    runtime: target === "web" ? "web" : "bevy",
    scenario,
    target,
  });
  return [summary("web", webDistance), summary("desktop", desktopDistance)] as const;
}

test("should complete a lap segment across mixed surfaces and collision damage", () => {
  const expected = {
    "resource.CourseState.checkpoint": 3,
    "resource.CourseState.collisionEntity": "damage-barrier",
    "resource.CourseState.damage": 25,
    "resource.CourseState.events": ["retry", "mixed-surface", "jump", "collision-damage", "finish"],
    "resource.CourseState.jumped": true,
    "resource.CourseState.mixedSurface": true,
    "resource.CourseState.retryCount": 1,
    "resource.CourseState.status": "finished",
  };
  const [web, desktop] = pairedSummaries("vehicle", expected, 72.003, 72);
  assert.deepEqual(validateAdvancedPhysicsPlaytestPair(web, desktop, "vehicle", ["movement", ...Object.keys(expected)], "source", 1, expected), []);
});

test("should take off stall recover and land from recorded controls", () => {
  const expected = {
    "resource.FlightState.landed": true,
    "resource.FlightState.recovered": true,
    "resource.FlightState.retryCount": 1,
    "resource.FlightState.stall": true,
    "resource.FlightState.takeoff": true,
  };
  const [web, desktop] = pairedSummaries("flight", expected, 120, 122);
  assert.deepEqual(validateAdvancedPhysicsPlaytestPair(web, desktop, "flight", ["movement", ...Object.keys(expected)], "source", 4, expected), []);
});

test("should keep destruction regional bounded and causally linked", () => {
  const expected = {
    "resource.DestructionState.impact": true,
    "resource.DestructionState.regionalBreak": true,
    "resource.DestructionState.settled": true,
  };
  const [web, desktop] = pairedSummaries("destruction", expected, 8, 8.5);
  assert.deepEqual(validateAdvancedPhysicsPlaytestPair(web, desktop, "destruction", ["movement", ...Object.keys(expected)], "source", 1, expected), []);
  const retry = { "resource.DestructionState.retryCount": 1 };
  const [retryWeb, retryDesktop] = pairedSummaries("destruction-retry", retry, 24.46, 21.52);
  assert.deepEqual(validateAdvancedPhysicsPlaytestPair(retryWeb, retryDesktop, "destruction-retry", Object.keys(retry), "source", 0, retry), []);
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
