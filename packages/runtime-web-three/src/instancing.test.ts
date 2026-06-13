import assert from "node:assert/strict";
import test from "node:test";
import type { IEnvironmentSceneIr } from "@threenative/ir";

import { buildInstancingPlan } from "./instancing.js";

test("instancing should group compatible repeated grass placements into one instanced mesh", () => {
  const plan = buildInstancingPlan(makeScene([
    { id: "grass.1", sourceAsset: "env.Grass", position: [0, 0, 0] },
    { id: "grass.2", sourceAsset: "env.Grass", position: [1, 0, 0] },
  ]));

  assert.equal(plan.groups.length, 1);
  assert.equal(plan.groups[0]?.sourceAsset, "env.Grass");
  assert.equal(plan.groups[0]?.count, 2);
});

test("instancing should keep material override placements out of instanced groups", () => {
  const plan = buildInstancingPlan(makeScene([
    { id: "tree.hero", sourceAsset: "env.Tree", position: [0, 0, 0], tags: ["hero"] },
    { id: "tree.1", sourceAsset: "env.Tree", position: [1, 0, 0] },
  ]));

  assert.equal(plan.groups.length, 0);
  assert.equal(plan.uninstanced.find((item) => item.id === "tree.hero")?.reason, "unique-or-hero-placement");
  assert.deepEqual(plan.diagnostics, []);
  assert.equal(plan.uninstancedRepeatedPropCount, 0);
});

function makeScene(instances: IEnvironmentSceneIr["instances"]): IEnvironmentSceneIr {
  return {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    sourceAssets: [{ asset: "model.env.Grass", category: "grass", id: "env.Grass" }],
    instances,
    path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
  };
}
