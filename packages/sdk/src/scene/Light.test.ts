import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { DirectionalLight, PointLight, SpotLight } from "./Light.js";

test("lights should store portable shadow bias controls", () => {
  const directional = new DirectionalLight({ shadowBias: -0.0005, shadowNormalBias: 0.02 });
  const point = new PointLight({ shadowBias: 0.001, shadowNormalBias: 0.03 });
  const spot = new SpotLight({ shadowBias: 0.002, shadowNormalBias: 0.04 });

  assert.equal(directional.shadowBias, -0.0005);
  assert.equal(directional.shadowNormalBias, 0.02);
  assert.equal(point.shadowBias, 0.001);
  assert.equal(point.shadowNormalBias, 0.03);
  assert.equal(spot.shadowBias, 0.002);
  assert.equal(spot.shadowNormalBias, 0.04);
});

test("lights should reject invalid shadow bias controls", () => {
  assert.throws(
    () => new DirectionalLight({ shadowBias: Number.NaN }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_LIGHT_INVALID_SHADOW_BIAS",
  );
  assert.throws(
    () => new PointLight({ shadowNormalBias: Number.POSITIVE_INFINITY }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_LIGHT_INVALID_SHADOW_BIAS",
  );
});
