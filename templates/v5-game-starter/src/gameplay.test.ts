import assert from "node:assert/strict";
import test from "node:test";

import { stepPlayer } from "./gameplay.js";

test("should update player state when movement input is applied", () => {
  const result = stepPlayer([0, 0.35, 0], { moveX: 1, moveZ: -1 }, 0.5);

  assert.deepEqual(result.position, [1.2, 0.35, -1.2]);
  assert.equal(result.reachedGoal, false);
});

test("should report when player reaches the goal", () => {
  const result = stepPlayer([1.65, 0.35, -1.45], { moveX: 0, moveZ: 0 }, 1 / 60);

  assert.equal(result.reachedGoal, true);
});
