import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateCascadeSplits,
  calculateCascadeCoverageRanges,
  fitCascadeFrustumSlice,
  scaleCascadeBias,
  snapCascadeCenter,
  type CascadeFrustumSlice,
} from "./cascadeMath.js";

const slice: CascadeFrustumSlice = {
  near: [
    [-1, 1, -1],
    [1, 1, -1],
    [1, -1, -1],
    [-1, -1, -1],
  ],
  far: [
    [-4, 3, -9],
    [4, 3, -9],
    [4, -3, -9],
    [-4, -3, -9],
  ],
};

test("cascadeMath should produce monotonic split distances for all schemes", () => {
  for (const scheme of ["uniform", "logarithmic", "practical"] as const) {
    const splits = calculateCascadeSplits({
      cascadeCount: 4,
      maxDistance: 100,
      nearDistance: 1,
      scheme,
      splitLambda: 0.5,
    });

    assert.equal(splits.length, 4);
    assert.equal(splits.at(-1), 100);
    assert.ok(splits.every((split, index) => index === 0 || split > (splits[index - 1] as number)));
  }
});

test("cascadeMath should blend uniform and logarithmic splits for the practical scheme", () => {
  const uniform = calculateCascadeSplits({ cascadeCount: 4, maxDistance: 100, nearDistance: 1, scheme: "uniform" });
  const logarithmic = calculateCascadeSplits({ cascadeCount: 4, maxDistance: 100, nearDistance: 1, scheme: "logarithmic" });
  const practical = calculateCascadeSplits({ cascadeCount: 4, maxDistance: 100, nearDistance: 1, scheme: "practical", splitLambda: 0.25 });

  for (let index = 0; index < practical.length; index += 1) {
    assert.ok(Math.abs((practical[index] as number) - ((uniform[index] as number) * 0.75 + (logarithmic[index] as number) * 0.25)) < 1e-12);
  }
});

test("cascadeMath should expand adjacent blend coverage without moving requested splits", () => {
  const ranges = calculateCascadeCoverageRanges(1, [20, 60, 100], 0.1);

  assert.deepEqual(ranges.map(({ requestedNear, requestedFar }) => [requestedNear, requestedFar]), [
    [1, 20],
    [20, 60],
    [60, 100],
  ]);
  assert.ok(ranges[0]!.far > 20);
  assert.ok(ranges[1]!.near < 20);
  assert.equal(ranges[0]!.far - 20, 20 - ranges[1]!.near);
  assert.equal(ranges[1]!.far - 60, 60 - ranges[2]!.near);
  assert.deepEqual(calculateCascadeCoverageRanges(1, [20, 60, 100], 0).map(({ near, far }) => [near, far]), [
    [1, 20],
    [20, 60],
    [60, 100],
  ]);
});

test("cascadeMath should fit every frustum corner in stable symmetric bounds", () => {
  const fit = fitCascadeFrustumSlice(slice);
  const translated = fitCascadeFrustumSlice({
    near: slice.near.map(([x, y, z]) => [x + 7, y - 2, z + 11]),
    far: slice.far.map(([x, y, z]) => [x + 7, y - 2, z + 11]),
  });

  assert.deepEqual(fit.center, [0, 0, -5]);
  assert.equal(fit.left, -fit.radius);
  assert.equal(fit.right, fit.radius);
  assert.equal(fit.bottom, -fit.radius);
  assert.equal(fit.top, fit.radius);
  assert.ok([...slice.near, ...slice.far].every(([x, y, z]) => Math.hypot(x - fit.center[0], y - fit.center[1], z - fit.center[2]) <= fit.radius));
  assert.ok(Math.abs(translated.radius - fit.radius) < 1e-12);
});

test("cascadeMath should snap center movement to whole texels", () => {
  const mapSize = 1024;
  const fit = fitCascadeFrustumSlice(slice);
  const texelSize = (fit.right - fit.left) / mapSize;
  const unsnappedCenter: [number, number, number] = [texelSize * 100.25, texelSize * 50.25, 20];
  const baseCenter = snapCascadeCenter(unsnappedCenter, fit, mapSize);
  const subTexelCenter = snapCascadeCenter(
    [unsnappedCenter[0] + texelSize * 0.49, unsnappedCenter[1] + texelSize * 0.49, unsnappedCenter[2]],
    fit,
    mapSize,
  );
  const wholeTexelCenter = snapCascadeCenter([unsnappedCenter[0] + texelSize, unsnappedCenter[1], unsnappedCenter[2]], fit, mapSize);

  // A controller derives the light view matrix from this quantized position.
  // Identical positions therefore produce identical light matrices.
  assert.deepEqual(subTexelCenter, baseCenter);
  assert.equal(wholeTexelCenter[0], baseCenter[0] + texelSize);
  assert.equal(wholeTexelCenter[2], 20);
});

test("cascadeMath should scale bias relative to max distance without exceeding authored values", () => {
  const fit = fitCascadeFrustumSlice(slice);
  const referenceDistance = fit.radius * 4;

  assert.deepEqual(scaleCascadeBias({ bias: -0.0005, normalBias: 0.02 }, fit, referenceDistance), {
    bias: -0.00025,
    normalBias: 0.01,
  });
  assert.deepEqual(scaleCascadeBias({ bias: -0.0005, normalBias: 0.02 }, fit, 1), {
    bias: -0.0005,
    normalBias: 0.02,
  });
});
