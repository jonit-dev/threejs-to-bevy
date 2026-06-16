import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { OrthographicCamera, PerspectiveCamera } from "./Camera.js";

test("Camera should accept orbit and zoom helper ranges when values are ordered", () => {
  const camera = new PerspectiveCamera({
    far: 100,
    fovY: 60,
    near: 0.1,
    orbit: {
      distance: { min: 2, max: 12 },
      smoothing: 0.2,
      target: "player",
    },
    zoom: {
      max: 8,
      min: 2,
      smoothing: 0.15,
    },
  });

  assert.deepEqual(camera.orbit, {
    distance: { min: 2, max: 12 },
    smoothing: 0.2,
    target: "player",
  });
  assert.deepEqual(camera.zoom, {
    max: 8,
    min: 2,
    smoothing: 0.15,
  });
});

test("Camera should reject screen shake when amplitude is negative", () => {
  assert.throws(
    () =>
      new OrthographicCamera({
        far: 100,
        near: 0.1,
        screenShake: { amplitude: -0.2, frequency: 12 },
        size: 10,
      }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_CAMERA_HELPER_INVALID",
  );
});
