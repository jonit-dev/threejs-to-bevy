import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "./errors.js";
import { defineRuntimeConfig } from "./time.js";

test("defineRuntimeConfig should reject invalid time and window values", () => {
  assert.throws(() => defineRuntimeConfig({ fixedDelta: 0 }), SdkError);
  assert.throws(() => defineRuntimeConfig({ fixedDelta: Number.NaN }), SdkError);
  assert.throws(() => defineRuntimeConfig({ window: { height: 0 } }), SdkError);
  assert.throws(() => defineRuntimeConfig({ window: { width: Number.POSITIVE_INFINITY } }), SdkError);
  assert.throws(() => defineRuntimeConfig({ window: { title: "" } }), SdkError);
});

test("defineRuntimeConfig should reject invalid bloom values", () => {
  assert.throws(() => defineRuntimeConfig({ renderer: { bloom: { intensity: -1 } } }), SdkError);
  assert.throws(() => defineRuntimeConfig({ renderer: { bloom: { threshold: Number.NaN } } }), SdkError);
});

test("defineRuntimeConfig should serialize promoted renderer quality settings when valid", () => {
  const config = defineRuntimeConfig({
    renderer: {
      colorGrading: { contrast: 0.1, exposure: 1.2, saturation: 0.85, toneMapping: "aces" },
      renderPath: "forward",
    },
  });

  assert.deepEqual(config.renderer.colorGrading, { contrast: 0.1, exposure: 1.2, saturation: 0.85, toneMapping: "aces" });
  assert.equal(config.renderer.renderPath, "forward");
});

test("defineRuntimeConfig should reject invalid color grading values", () => {
  assert.throws(() => defineRuntimeConfig({ renderer: { colorGrading: { exposure: 0 } } }), SdkError);
  assert.throws(() => defineRuntimeConfig({ renderer: { colorGrading: { saturation: -1 } } }), SdkError);
  assert.throws(() => defineRuntimeConfig({ renderer: { colorGrading: { lut: "" } } }), SdkError);
});
