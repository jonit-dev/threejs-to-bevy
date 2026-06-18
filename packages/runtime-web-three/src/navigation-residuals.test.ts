import assert from "node:assert/strict";
import test from "node:test";

import { traceAnimationPhysicsResiduals } from "./animationPhysicsResiduals.js";
import { residualAssets, residualWorld } from "./residualFixtures.test-helper.js";

test("should report off-mesh link traversal", () => {
  const report = traceAnimationPhysicsResiduals(residualAssets(), residualWorld());

  assert.deepEqual(report.navigation.offMeshLinks, [
    { from: "a", id: "jump.a.b", status: "traversed", to: "b" },
  ]);
  assert.deepEqual(report.navigation.crowd, [
    { agent: "agent.a", goal: [2, 0, 0], position: [0, 0, 0] },
    { agent: "agent.b", goal: [2, 0, 0], position: [0.25, 0, 0] },
  ]);
  assert.deepEqual(report.navigation.rebake, { intervalMs: 100, maxObstacles: 4, maxRegions: 8, status: "bounded" });
});
