import assert from "node:assert/strict";
import test from "node:test";

import { traceAnimationPhysicsResiduals } from "./animationPhysicsResiduals.js";
import { residualAssets, residualWorld } from "./residualFixtures.test-helper.js";

test("should report morph target weight at sampled frame", () => {
  const report = traceAnimationPhysicsResiduals(residualAssets(), residualWorld(), undefined, { morphTimeSeconds: 0.5 });

  assert.deepEqual(report.animation.morphTargets, [
    { asset: "model.hero", clip: "smile", target: "Smile", timeSeconds: 0.5, weight: 0.5 },
  ]);
  assert.deepEqual(report.animation.masks, [
    { asset: "model.hero", clips: ["wave"], id: "upperBody", joints: ["Arm.L", "Arm.R", "Spine"] },
  ]);
  assert.deepEqual(report.animation.vfxCommands, [
    { asset: "model.hero", command: "burst", count: 4, emitter: "dust", maxParticles: 8, seed: 22851936, status: "burst" },
  ]);
});
