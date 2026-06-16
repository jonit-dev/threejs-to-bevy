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
