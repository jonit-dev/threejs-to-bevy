import assert from "node:assert/strict";
import test from "node:test";

import { FOCUSED_GATES, getFocusedGateCommands, listFocusedGateNames, listFocusedGateNamesByProfile } from "./run.js";
import { listScriptGateNames } from "../scriptGates.js";

test("focused gate dispatcher should list current capability gates", () => {
  const names = listFocusedGateNames();
  assert.ok(names.length >= 12, "expected the typed focused gate registry to stay populated");
  for (const name of [
    "verify:animation-physics-residuals",
    "verify:bundle-safety-hardening",
    "verify:input-ui-polish",
    "verify:persistence-reload",
    "verify:production-hardening",
    "verify:rendering-residuals",
    "verify:runtime-gameplay-host",
    "verify:runtime-prefabs-hierarchy",
    "verify:runtime-query-diffing",
    "verify:ui-persistence-settings-facades",
    "verify:scene-lifecycle",
    "verify:v10:ecs-tags-groups",
    "verify:v10:visual-calibration",
    "verify:v9:assets-gltf-scene-workflow",
    "verify:v9:rendering-lights",
  ]) {
    assert.ok(names.includes(name), `${name} should remain registered`);
  }
  assert.deepEqual(names, [...names].sort());
});

test("focused gate dispatcher should register script-backed gates outside package.json", () => {
  for (const name of listScriptGateNames()) {
    assert.ok(FOCUSED_GATES[name], `${name} should be merged into FOCUSED_GATES`);
  }
});

test("focused gate dispatcher should keep command composition outside package.json", () => {
  for (const [name, gate] of Object.entries(FOCUSED_GATES)) {
    assert.ok(gate.description.length > 0, `${name} should explain the gate purpose`);
    assert.ok(gate.commands.length > 0, `${name} should define at least one command`);
    assert.ok(["cargo", "node", "pnpm"].includes(gate.commands.at(-1)?.[0] ?? ""), `${name} should end at the gate command`);
  }
});

test("should expose focused gate ownership metadata", () => {
  for (const [name, gate] of Object.entries(FOCUSED_GATES)) {
    assert.ok(gate.metadata.owner.trim().length > 0, `${name} should declare an owner`);
    assert.equal(gate.metadata.profile, "focused", `${name} should start in the focused profile`);
    assert.ok(gate.metadata.reason.trim().length > 0, `${name} should explain why it is not an ordinary test`);
    assert.ok(gate.metadata.protects.trim().length > 0, `${name} should document its quality requirement`);
  }
});

test("should reject unclassified focused gates", () => {
  for (const [name, gate] of Object.entries(FOCUSED_GATES)) {
    assert.ok(gate.metadata.owner !== "unclassified", `${name} should not use a placeholder owner`);
    assert.ok(gate.metadata.reason !== "unclassified", `${name} should not use a placeholder reason`);
    assert.ok(gate.metadata.protects !== "unclassified", `${name} should not use a placeholder quality requirement`);
  }
});

test("should run setup for standalone focused gate", () => {
  assert.deepEqual(
    getFocusedGateCommands("verify:input-ui-polish"),
    [
      ["pnpm", "--filter", "@threenative/ir", "build"],
      ["pnpm", "--filter", "@threenative/runtime-web-three", "build"],
      ["node", "scripts/verify-input-ui-polish.mjs"],
    ],
  );
});

test("should skip setup when requested by release", () => {
  assert.deepEqual(
    getFocusedGateCommands("verify:input-ui-polish", { forwardedArgs: ["--json"], skipSetup: true }),
    [["node", "scripts/verify-input-ui-polish.mjs", "--json"]],
  );
});

test("should list gates by profile", () => {
  assert.deepEqual(listFocusedGateNamesByProfile("smoke"), []);
  assert.deepEqual(listFocusedGateNamesByProfile("changed"), []);
  assert.deepEqual(listFocusedGateNamesByProfile("release"), [
    "verify:animation-physics-residuals",
    "verify:bundle-safety-hardening",
    "verify:input-ui-polish",
    "verify:persistence-reload",
    "verify:production-hardening",
    "verify:rendering-residuals",
    "verify:runtime-gameplay-host",
    "verify:runtime-prefabs-hierarchy",
    "verify:runtime-query-diffing",
    "verify:ui-persistence-settings-facades",
    "verify:v9:assets-gltf-scene-workflow",
    "verify:v9:rendering-lights",
  ]);
  assert.deepEqual(listFocusedGateNamesByProfile("full"), listFocusedGateNames());
});
