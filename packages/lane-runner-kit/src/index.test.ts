import assert from "node:assert/strict";
import test from "node:test";

import { LaneRunnerKit } from "./index.js";

test("lane runner reducer clamps steering and advances distance", () => {
  const start = LaneRunnerKit.initial({ lane: 1, speed: 10 });
  const steered = LaneRunnerKit.steer(start, 1, { laneCount: 3 });
  const clamped = LaneRunnerKit.steer(steered, 1, { laneCount: 3 });
  const advanced = LaneRunnerKit.tick(clamped, 0.5, { acceleration: 2, pointsPerMeter: 3 });

  assert.equal(steered.lane, 2);
  assert.equal(clamped.lane, 2);
  assert.equal(advanced.distance, 5.5);
  assert.equal(advanced.score, 16);
});

test("lane runner reducer fails only on same-lane collision", () => {
  const start = LaneRunnerKit.initial({ lane: 0 });

  assert.equal(LaneRunnerKit.collide(start, 1).status, "playing");
  assert.equal(LaneRunnerKit.collide(start, 0).status, "failed");
});
