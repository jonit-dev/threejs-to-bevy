import assert from "node:assert/strict";
import test from "node:test";

import { validateRuntimeObservationBudget, type RuntimeObservationBudgetEvidence } from "./runtimeObservationBudget.js";

const passing: RuntimeObservationBudgetEvidence = {
  normal: { cpuMs: 10, diagnosticSignatures: ["conflict"], retainedObservations: 0, serializedBytes: 0, writes: 46_080 },
  full: { cpuMs: 20, diagnosticSignatures: ["conflict"], retainedObservations: 2_000, serializedBytes: 100_000, writes: 46_080 },
};

test("accepts bounded normal observations with identical full-audit verdicts", () => {
  assert.deepEqual(validateRuntimeObservationBudget(passing), []);
});

test("rejects retained normal detail and verdict drift", () => {
  const diagnostics = validateRuntimeObservationBudget({
    normal: { ...passing.normal, diagnosticSignatures: ["different"], retainedObservations: 1, serializedBytes: 20 },
    full: passing.full,
  });
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_RUNTIME_OBSERVATION_NORMAL_RETAINED"), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_RUNTIME_OBSERVATION_VERDICT_DRIFT"), true);
});

test("rejects a normal-mode CPU regression", () => {
  const diagnostics = validateRuntimeObservationBudget({
    normal: { ...passing.normal, cpuMs: 19 },
    full: passing.full,
  });
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_RUNTIME_OBSERVATION_CPU_BUDGET"), true);
});
