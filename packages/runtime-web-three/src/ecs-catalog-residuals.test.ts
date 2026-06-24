import assert from "node:assert/strict";
import test from "node:test";
import type { IWorldIr } from "@threenative/ir";

import { reportWebDisabledEntityQueryParticipation, reportWebGltfMetadataTransformPolicy, reportWebTargetProfileOutputDiagnostic, traceWebQueryCombinations } from "./bevyCatalogResiduals.js";

test("should iterate query combinations in deterministic entity order", () => {
  const world: IWorldIr = {
    entities: [
      { components: { Health: { current: 1 } }, id: "enemy.z" },
      { components: { Transform: {} }, id: "prop" },
      { components: { Health: { current: 1 } }, id: "enemy.a" },
      { components: { Health: { current: 1 } }, id: "enemy.m" },
    ],
    events: {},
    prefabs: [],
    resources: {},
    schema: "threenative.world",
    version: "0.1.0",
  };

  assert.deepEqual(traceWebQueryCombinations(world, "Health"), [
    { a: "enemy.a", b: "enemy.m", order: 1 },
    { a: "enemy.a", b: "enemy.z", order: 2 },
    { a: "enemy.m", b: "enemy.z", order: 3 },
  ]);
  assert.deepEqual(traceWebQueryCombinations(world, "Health", 2), [
    { a: "enemy.a", b: "enemy.m", order: 1 },
    { a: "enemy.a", b: "enemy.z", order: 2 },
  ]);
});

test("should report disabled entity query participation without changing renderer visibility", () => {
  assert.deepEqual(reportWebDisabledEntityQueryParticipation("enemy.hidden", false), {
    entity: "enemy.hidden",
    participatesInQueries: false,
    policy: "portable-participation-state",
    rendererVisibility: "unchanged",
    schema: "threenative.bevy-catalog.ecs",
    version: "0.1.0",
  });
});

test("should report known glTF metadata transform policy", () => {
  assert.deepEqual(reportWebGltfMetadataTransformPolicy("EXT_animation_graph", "AnimationGraph"), {
    extension: "EXT_animation_graph",
    processor: "metadata",
    schema: "threenative.bevy-catalog.assets.gltf-metadata-transform",
    transform: "AnimationGraph",
    version: "0.1.0",
  });
});

test("should report target profile output diagnostics", () => {
  assert.deepEqual(reportWebTargetProfileOutputDiagnostic("web", ["desktop"]), {
    code: "TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED",
    message: "Target profile for 'web' output must include 'web'.",
    path: "target.profile.json/targets",
    severity: "error",
    suggestion: "Add 'web' to target.profile.json targets or choose a non-web output.",
    target: "web",
    value: "desktop",
  });
});
