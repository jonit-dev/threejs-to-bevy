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

test("analyzeGameScaleEntities accepts a vehicle hero without a humanoid player", () => {
  const report = analyzeGameScaleEntities([
    { id: "aircraft", visible: true, worldBounds: { size: [12.65, 3.92, 10.01] } },
    { id: "ocean.visual", visible: true, worldBounds: { size: [8000, 0.005, 8000] } },
  ]);

  assert.equal(report.ok, true);
  assert.equal(report.entities.find((entity) => entity.id === "aircraft")?.roles.includes("vehicle"), true);
  assert.equal(report.diagnostics.length, 0);
});

test("analyzeGameScaleEntities skips self-comparison for dual-role hero entities", () => {
  const report = analyzeGameScaleEntities([
    { id: "hero.boat", visible: true, worldBounds: { size: [2.0, 1.5, 5.0] } },
  ]);

  assert.equal(report.ok, true);
  assert.equal(report.ratios.length, 0);
  assert.equal(report.diagnostics.length, 0);
});

test("analyzeGameScaleEntities warns when no hero surface exists at all", () => {
  const report = analyzeGameScaleEntities([
    { id: "ocean.visual", visible: true, worldBounds: { size: [8000, 0.005, 8000] } },
  ]);

  assert.equal(report.ok, true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_SCALE_PLAYER_MISSING"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_GAME_SCALE_VEHICLE_MISSING"), true);
});
