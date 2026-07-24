import assert from "node:assert/strict";
import test from "node:test";

import { buildIntentContract, evaluateIntentCoverage } from "./intentContract.js";

test("should distinguish push interaction from projectile knockdown", () => {
  const push = buildIntentContract("grid puzzle where the player pushes crates onto goals");
  const knockdown = buildIntentContract("launch a projectile to knock down physics targets");

  assert.equal(push.contract.id, "intent.grid-push");
  assert.deepEqual(push.contract.requiredCapabilities, ["move.grid", "interaction.push", "objective.occupancy", "state.retry"]);
  assert.equal(push.contract.requiredCapabilities.includes("physics-target"), false);
  assert.equal(knockdown.contract.id, "intent.physics-knockdown");
  assert.deepEqual(knockdown.contract.requiredCapabilities, ["physics-target"]);
});

test("should report uncovered responsibilities for an unfamiliar goal", () => {
  const { contract } = buildIntentContract("grid puzzle where the player pushes crates onto goals");
  const coverage = evaluateIntentCoverage(contract, ["controller.top-down", "physics-target"]);

  assert.deepEqual(coverage.coveredResponsibilityIds, []);
  assert.deepEqual(coverage.uncoveredResponsibilityIds, ["move.grid", "interaction.push", "objective.occupancy", "state.retry"]);
});

test("should keep normalized intent stable across every frozen benchmark prompt", () => {
  const fixtures = new Map<string, { assertions: string[]; intent: string }>([
    ["collect pickups and win", { assertions: ["keyboard-movement", "pickup-objective", "win-state", "retry-path"], intent: "intent.top-down-collector" }],
    ["lane runner with obstacles and retry", { assertions: ["lane-movement", "obstacle-fail", "distance-objective", "retry-path"], intent: "intent.lane-runner" }],
    ["checkpoint kart race with laps", { assertions: ["ordered-checkpoints", "timer-or-counter", "finish-state", "retry-path"], intent: "intent.checkpoint-race" }],
    ["physics knockdown targets with projectiles", { assertions: ["launch-or-push", "target-displacement", "score-updates", "retry-path"], intent: "intent.physics-knockdown" }],
    ["grid puzzle where the player pushes crates onto goals", { assertions: ["webgl-canvas", "grid-movement", "crate-push", "goal-progress", "retry-path"], intent: "intent.grid-push" }],
    ["wave defense with enemies attacking a base", { assertions: ["webgl-canvas", "defender-input", "wave-progression", "base-failure", "retry-path"], intent: "intent.wave-defense" }],
    ["turn-based tactics with unit selection and an enemy turn", { assertions: ["webgl-canvas", "unit-selection-movement", "enemy-turn", "objective-outcomes", "retry-path"], intent: "intent.turn-based-tactics" }],
  ]);

  for (const [goal, expected] of fixtures) {
    const { ambiguousInterpretationIds, contract } = buildIntentContract(goal);
    assert.equal(contract.id, expected.intent, goal);
    assert.deepEqual(contract.acceptanceAssertions.map((item) => item.id), expected.assertions, goal);
    assert.deepEqual(ambiguousInterpretationIds, [], goal);
    assert.equal(contract.verbs.every((verb) => verb.required && verb.subject !== "" && verb.action !== "" && verb.object !== ""), true);
    assert.equal(contract.acceptanceAssertions.every((item) => item.required), true);
  }
});

test("should not expose internal proof aliases for frozen unfamiliar prompts", () => {
  const aliases = new Set(["push-only", "occupancy-progress", "wave-progress", "base-fail-retry", "objective-fail-retry"]);
  for (const goal of [
    "grid puzzle where the player pushes crates onto goals",
    "wave defense with enemies attacking a base",
    "turn-based tactics with unit selection and an enemy turn",
  ]) {
    const ids = buildIntentContract(goal).contract.acceptanceAssertions.map((item) => item.id);
    assert.equal(ids.some((id) => aliases.has(id)), false, goal);
  }
});

test("should identify tied incompatible interpretations", () => {
  const result = buildIntentContract("push target");

  assert.deepEqual(result.ambiguousInterpretationIds, ["grid-push", "physics-knockdown"]);
});

test("should own holdout prototype proof roles in the intent contract", () => {
  for (const [goal, prototypeId] of [
    ["wave defense with enemies attacking a base", "continuous-arena-pooled-pressure"],
    ["turn-based tactics with unit selection and an enemy turn", "alternating-grid-single-pursuit"],
  ] as const) {
    const contract = buildIntentContract(goal).contract;
    assert.equal(contract.prototype?.id, prototypeId);
    assert.deepEqual(Object.keys(contract.prototype?.proofRoles ?? {}).sort(), contract.acceptanceAssertions.map((assertion) => assertion.id).sort());
  }
  assert.equal(buildIntentContract("grid puzzle where the player pushes crates onto goals").contract.prototype, undefined);
});

test("should derive exact flight objective ticks only from one explicit duration", () => {
  const explicit = buildIntentContract("fly an aircraft and remain airborne for 45 seconds");
  const missing = buildIntentContract("fly an aircraft through a storm");
  const ambiguous = buildIntentContract("fly an aircraft for 30 seconds, then for 2 minutes");

  assert.equal(explicit.contract.id, "intent.flight");
  assert.equal(explicit.contract.objectiveDurationTicks, 2_700);
  assert.deepEqual(explicit.diagnostics, []);
  assert.equal(missing.contract.objectiveDurationTicks, undefined);
  assert.equal(missing.diagnostics[0]?.code, "TN_GAME_PLAN_OBJECTIVE_DURATION_REQUIRED");
  assert.equal(ambiguous.contract.objectiveDurationTicks, undefined);
  assert.equal(ambiguous.diagnostics[0]?.code, "TN_GAME_PLAN_OBJECTIVE_DURATION_AMBIGUOUS");
});
