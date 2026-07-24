import assert from "node:assert/strict";
import test from "node:test";

import { BoresightEx } from "./camera.js";

test("BoresightEx projects forward aim to the viewport center", () => {
  assert.deepEqual(BoresightEx.project({
    aim: [0, 0, -1],
    aspect: 16 / 9,
    verticalFov: Math.PI / 3,
  }), { visible: true, x: 0.5, y: 0.5 });
});

test("BoresightEx responds to camera pitch, FOV, and aspect", () => {
  const pitched = BoresightEx.project({
    aim: [0, 0, -1],
    aspect: 16 / 9,
    cameraPitch: -10 * Math.PI / 180,
    verticalFov: 52 * Math.PI / 180,
  });
  const wide = BoresightEx.project({
    aim: [0.4, 0, -1],
    aspect: 2,
    verticalFov: Math.PI / 3,
  });
  const narrow = BoresightEx.project({
    aim: [0.4, 0, -1],
    aspect: 1,
    verticalFov: Math.PI / 3,
  });

  assert.ok(pitched.y < 0.5, "a downward-pitched camera places level boresight above center");
  assert.ok(wide.x < narrow.x, "wider aspect keeps the same horizontal aim closer to center");
});

test("BoresightEx reports rear-facing aim as hidden", () => {
  assert.deepEqual(BoresightEx.project({
    aim: [0, 0, 1],
    aspect: 1,
    verticalFov: Math.PI / 3,
  }), { visible: false, x: 0.5, y: 0.5 });
});
