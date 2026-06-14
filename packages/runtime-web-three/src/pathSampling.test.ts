import assert from "node:assert/strict";
import test from "node:test";

import { ease, sampleCatmullRom, sampleCubicBezier, sampleLine, sampleQuadraticBezier } from "./pathSampling.js";

test("pathSampling should sample easing curves and spline paths", () => {
  assert.equal(ease("easeInOutQuad", 0.25), 0.125);
  assert.deepEqual(sampleLine([0, 0, 0], [2, 0, 0], 2), [
    [0, 0, 0],
    [1, 0, 0],
    [2, 0, 0],
  ]);
  assert.deepEqual(sampleQuadraticBezier([0, 0, 0], [1, 2, 0], [2, 0, 0], 2)[1], [1, 1, 0]);
  assert.deepEqual(sampleCubicBezier([0, 0, 0], [0, 2, 0], [2, 2, 0], [2, 0, 0], 2)[1], [1, 1.5, 0]);
  const catmull = sampleCatmullRom(
    [
      [0, 0, 0],
      [1, 1, 0],
      [2, 0, 0],
    ],
    2,
  );
  assert.deepEqual(catmull[0], [0, 0, 0]);
  assert.deepEqual(catmull.at(-1), [2, 0, 0]);
});
