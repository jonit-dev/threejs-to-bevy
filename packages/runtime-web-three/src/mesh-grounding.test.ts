import assert from "node:assert/strict";
import test from "node:test";

import { traceAnimationPhysicsResiduals } from "./animationPhysicsResiduals.js";
import { residualAssets, residualWorld } from "./residualFixtures.test-helper.js";

test("should ground character on authored sloped mesh terrain", () => {
  const report = traceAnimationPhysicsResiduals(residualAssets(), residualWorld());

  assert.deepEqual(report.physics.characterGrounding, [
    {
      desired: [2, 1, 0],
      entity: "player",
      groundEntity: "ramp",
      grounded: true,
      resolved: [2, 1, 0],
      start: [0, 1, 0],
    },
  ]);
});
