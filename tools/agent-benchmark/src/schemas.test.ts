import test from "node:test";
import assert from "node:assert/strict";

import { validateAggregateReport, validateRunReport, validateSession } from "./schemas.js";

test("should accept valid run report when all fields present", () => {
  const session = validSession();
  const result = validateRunReport({
    artifacts: {},
    candidate: "/tmp/game",
    condition: "vanilla",
    diagnostics: [],
    generatedAt: "2026-07-06T00:00:00.000Z",
    ok: true,
    promptId: "collector",
    runId: "run-1",
    schema: "threenative.agent-benchmark-run",
    session,
    version: 2,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("should reject run report when condition is unknown", () => {
  const session = { ...validSession(), condition: "custom-engine" };
  const result = validateSession(session);
  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_SCHEMA_CONDITION"), true);
});

test("should accept version 2 session token breakdown", () => {
  const result = validateSession({
    ...validSession(),
    cachedInputTokens: 2000,
    churnCounters: validChurnCounters(),
    costWeightedTokens: 5800,
    failedCommandCount: 2,
    identicalAssertionRepeatCount: 0,
    inputTokens: 10000,
    maxConsecutiveSameDiagnostic: 1,
    outputTokens: 1000,
    toolOutputBytes: 16384,
    toolStepCount: 9,
    uncachedInputTokens: 8000,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("should reject incomplete churn counters", () => {
  const result = validateSession({
    ...validSession(),
    churnCounters: {
      ...validChurnCounters(),
      repeatedDiagnostic: undefined,
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_SCHEMA_NUMBER"), true);
});

test("should accept typed spec benchmark condition", () => {
  const result = validateSession({
    ...validSession(),
    condition: "typed-spec",
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("should accept equal-proof aggregate threshold", () => {
  const result = validateAggregateReport({
    diagnostics: [],
    dialectConfusionFailureCount: 0,
    generatedAt: "2026-07-07T00:00:00.000Z",
    promptSummaries: [],
    runCount: 0,
    schema: "threenative.agent-benchmark-report",
    typedSpecVerdict: {
      status: "insufficient-data",
      summary: "No prompt has equal-proof typed-spec and direct ThreeNative run reports.",
      threshold: "typed-spec: equal proof repeats >=3; median tokens <= direct ThreeNative; failed commands ==0; retry chains <=1/0",
    },
    verdict: {
      status: "insufficient-data",
      summary: "No prompt has equal-proof successful run reports for both vanilla and ThreeNative.",
      threshold: "equal-proof: continuity <=1.5x vanilla tokens; beyond-one-shot <=1.0x vanilla tokens; repeats >=3; failed commands ==0; retry chains <=1/0",
    },
    version: 2,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

function validSession() {
  return {
    condition: "vanilla",
    humanRubric: { playability: 2, visual: 2 },
    iterationCount: 3,
    promptId: "collector",
    runId: "run-1",
    schema: "threenative.agent-benchmark-session",
    stopReason: "claimed-playable",
    tokenCount: 12000,
    toolStepCount: 4,
    version: 2,
  };
}

function validChurnCounters() {
  return {
    artifactForensics: 0,
    engineSourceSearch: 0,
    failedCommand: 0,
    missingDiscovery: 0,
    missingIterate: 0,
    repeatedAssertion: 0,
    repeatedDiagnostic: 0,
    repeatedFileRead: 0,
    standaloneVerify: 0,
  };
}
