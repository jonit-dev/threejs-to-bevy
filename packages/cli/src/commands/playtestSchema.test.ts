import assert from "node:assert/strict";
import test from "node:test";

import { PLAYTEST_ASSERTION_REGISTRY } from "./playtestAssertions.js";
import { playtestSchemaCommand } from "./playtestSchema.js";
import { loadPlaytestScenario } from "./playtestScenario.js";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

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

test("should accept visual assertion block in scenario schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-visual-schema-"));
  await writeFile(join(root, "visual.playtest.json"), JSON.stringify({ schemaVersion: 1, name: "visual", target: "web", viewport: { width: 100, height: 100 }, warmupFrames: 0, steps: [{ waitFrames: 1, release: true }], assert: { visual: [{ frameDiff: { minChangedPixelRatio: 0.01 }, region: { x: 0, y: 0, width: 10, height: 10 }, entityVisible: { entity: "square", minProjectedPixels: 2, throughoutFrames: true } }] } }));
  const scenario = await loadPlaytestScenario(root, "visual.playtest.json");
  assert.equal(scenario.assert?.visual?.[0]?.entityVisible?.entity, "square");
});

test("gameplay parity schema should describe optional parity comparison fields", async () => {
  const result = await playtestSchemaCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as { inputDelivery: { default: string; values: string[] }; parity: { fields: Array<{ name: string }> } };

  assert.equal(payload.inputDelivery.default, "deterministic");
  assert.deepEqual(payload.inputDelivery.values, ["deterministic", "focused-dom"]);
  assert.equal(payload.parity.fields.some((field) => field.name === "parity.compare.movementDistance.maxDelta"), true);
  assert.equal(payload.parity.fields.some((field) => field.name === "parity.compare.resources[]"), true);
});

test("playtest scenario should normalize and validate input delivery", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-input-delivery-schema-"));
  const base = { schemaVersion: 1, name: "focus", target: "web", viewport: { width: 100, height: 100 }, warmupFrames: 0, steps: [{ holdTicks: 1, press: "KeyW", release: true }] };
  await writeFile(join(root, "focused.playtest.json"), JSON.stringify({ ...base, inputDelivery: "focused-dom" }));
  await writeFile(join(root, "default.playtest.json"), JSON.stringify(base));
  await writeFile(join(root, "invalid.playtest.json"), JSON.stringify({ ...base, inputDelivery: "synthetic-window" }));

  assert.equal((await loadPlaytestScenario(root, "focused.playtest.json")).inputDelivery, "focused-dom");
  assert.equal((await loadPlaytestScenario(root, "default.playtest.json")).inputDelivery, "deterministic");
  await assert.rejects(loadPlaytestScenario(root, "invalid.playtest.json"), /inputDelivery must be deterministic or focused-dom/u);
});
