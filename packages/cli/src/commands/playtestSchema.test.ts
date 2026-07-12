import assert from "node:assert/strict";
import test from "node:test";

import { PLAYTEST_ASSERTION_REGISTRY } from "./playtestAssertions.js";
import { playtestSchemaCommand } from "./playtestSchema.js";

test("should list every executable assertion kind when schema is requested", async () => {
  const result = await playtestSchemaCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as {
    assertionKinds: string[];
    assertions: Array<{ kind: string }>;
    examples: { retryPath: { steps: Array<{ press?: string }> }; stepSequence: Array<{ holdTicks?: number; press?: string }> };
  };
  const registryKinds = PLAYTEST_ASSERTION_REGISTRY.map((entry) => entry.kind).sort();

  assert.equal(result.exitCode, 0);
  assert.deepEqual(payload.assertionKinds.toSorted(), registryKinds);
  assert.deepEqual(payload.assertions.map((entry) => entry.kind).toSorted(), registryKinds);
  assert.equal(payload.examples.retryPath.steps.some((step) => step.press === "KeyR"), true);
  assert.equal(payload.examples.stepSequence.some((step) => step.holdTicks !== undefined), true);
  assert.equal(payload.assertions.some((entry) => entry.kind === "resources"), true);
  assert.equal(payload.assertions.some((entry) => entry.kind === "hud"), true);
});

test("gameplay parity schema should describe optional parity comparison fields", async () => {
  const result = await playtestSchemaCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as { parity: { fields: Array<{ name: string }> } };

  assert.equal(payload.parity.fields.some((field) => field.name === "parity.compare.movementDistance.maxDelta"), true);
  assert.equal(payload.parity.fields.some((field) => field.name === "parity.compare.resources[]"), true);
});
