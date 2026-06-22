import assert from "node:assert/strict";
import test from "node:test";

import { stepKart } from "./gameplay.js";

test("should accelerate the kart along the track", () => {
  const result = stepKart([0, 0.34, 4.4], { heading: 0, speed: 0 }, { accelerate: true, steer: 0 }, 0.5);

  assert.deepEqual(result.position, [0, 0.34, 2.4]);
  assert.equal(result.speed, 4);
});

test("should steer while preserving authored height", () => {
  const result = stepKart([0, 0.34, 4.4], { heading: 0, speed: 6 }, { accelerate: false, steer: 1 }, 0.25);

  assert.equal(result.position[1], 0.34);
  assert.equal(result.heading, 0.45);
  assert.equal(result.speed, 5);
});
