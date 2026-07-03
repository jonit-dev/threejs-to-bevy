import assert from "node:assert/strict";
import test from "node:test";

import { analyzeGameScaleEntities } from "./gameScale.js";

test("analyzeGameScaleEntities flags player taller than train", () => {
  const report = analyzeGameScaleEntities([
    { id: "runner", visible: true, worldBounds: { size: [0.5, 1.7, 0.6] } },
    { id: "hazard.train.01", visible: true, worldBounds: { size: [1.2, 1.4, 3.5] } },
  ]);

  assert.equal(report.ok, false);
  assert.equal(report.ratios[0]?.ratio, 1.214286);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_SCALE_PLAYER_OVERSIZED"), true);
});

test("analyzeGameScaleEntities accepts coherent player and train scale", () => {
  const report = analyzeGameScaleEntities([
    { id: "runner", visible: true, worldBounds: { size: [0.45, 1.45, 0.55] } },
    { id: "parked.train.left", visible: true, worldBounds: { size: [2.1, 3.1, 7.4] } },
  ]);

  assert.equal(report.ok, true);
  assert.equal(report.ratios[0]?.ratio, 0.467742);
  assert.equal(report.diagnostics.length, 0);
});
