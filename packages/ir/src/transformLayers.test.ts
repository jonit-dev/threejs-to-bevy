import assert from "node:assert/strict";
import test from "node:test";

import { composeTransformLayers } from "./transformLayers.js";

test("composes base then cosmetic translation rotation and scale", () => {
  const half = Math.sqrt(0.5);
  const composed = composeTransformLayers(
    { position: [10, 2, 0], rotation: [0, 0, half, half], scale: [2, 3, 4] },
    { position: [1, 0, 0], rotation: [0, half, 0, half], scale: [0.5, 2, 1] },
  );
  assert.deepEqual(composed.position.map(round), [10, 4, 0]);
  assert.deepEqual(composed.rotation.map(round), [-0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(composed.scale, [1, 6, 4]);
});

test("reset cosmetic identity preserves the authored/simulated pose", () => {
  const base = { position: [3, 4, 5] as const, rotation: [0, 0, 0, 1] as const, scale: [2, 2, 2] as const };
  assert.deepEqual(composeTransformLayers(base, {}), base);
});

function round(value: number): number {
  return Number(value.toFixed(6));
}
