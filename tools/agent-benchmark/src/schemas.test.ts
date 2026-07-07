import test from "node:test";
import assert from "node:assert/strict";

import { validateRunReport, validateSession } from "./schemas.js";

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
    costWeightedTokens: 5800,
    failedCommandCount: 2,
    inputTokens: 10000,
    outputTokens: 1000,
    toolOutputBytes: 16384,
    toolStepCount: 9,
    uncachedInputTokens: 8000,
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
    version: 2,
  };
}
