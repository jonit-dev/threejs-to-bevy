import assert from "node:assert/strict";
import test from "node:test";

import { FOCUSED_GATES, listFocusedGateNames } from "./run.js";

test("focused gate dispatcher should list current capability gates", () => {
  assert.deepEqual(
    [
      "verify:animation-physics-residuals",
      "verify:bundle-safety-hardening",
      "verify:input-ui-polish",
      "verify:persistence-reload",
      "verify:production-hardening",
      "verify:rendering-residuals",
      "verify:runtime-gameplay-host",
      "verify:scene-lifecycle",
      "verify:v10:ecs-tags-groups",
      "verify:v10:visual-calibration",
      "verify:v9:assets-gltf-scene-workflow",
      "verify:v9:rendering-lights",
    ],
    listFocusedGateNames(),
  );
});

test("focused gate dispatcher should keep command composition outside package.json", () => {
  for (const [name, gate] of Object.entries(FOCUSED_GATES)) {
    assert.ok(gate.description.length > 0, `${name} should explain the gate purpose`);
    assert.ok(gate.commands.length > 0, `${name} should define at least one command`);
    assert.ok(["cargo", "node"].includes(gate.commands.at(-1)?.[0] ?? ""), `${name} should end at the gate command`);
  }
});
