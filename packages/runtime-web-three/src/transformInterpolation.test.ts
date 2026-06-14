import assert from "node:assert/strict";
import test from "node:test";

import { interpolateQuat, interpolateTransform, interpolateVec3, smoothDampVec3 } from "./transformInterpolation.js";

test("transformInterpolation should interpolate and smooth transforms", () => {
  assert.deepEqual(interpolateVec3([0, 0, 0], [2, 4, 6], 0.5), [1, 2, 3]);
  const quat = interpolateQuat([0, 0, 0, 1], [0, 0, 1, 0], 0.5);
  assert.ok(Math.abs(Math.hypot(...quat) - 1) < 0.000001);
  const transform = interpolateTransform(
    { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    { position: [2, 0, 0], rotation: [0, 0, 1, 0], scale: [3, 3, 3] },
    0.5,
  );
  assert.deepEqual(transform.position, [1, 0, 0]);
  assert.deepEqual(transform.scale, [2, 2, 2]);
  assert.deepEqual(smoothDampVec3([0, 0, 0], [10, 0, 0], 0, 1), [0, 0, 0]);
  assert.ok(smoothDampVec3([0, 0, 0], [10, 0, 0], 10, 1)[0] > 9);
});
