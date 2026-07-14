import { strict as assert } from "node:assert";
import test from "node:test";
import { RENDER_LOOK_PROFILE_PRESETS, resolveRenderLookProfile, resolveRenderLookShadowProfile, resolveRenderLookSsgiQualityLimit } from "./runtimeConfig.js";
import { validateRuntimeConfig } from "./runtimeConfigValidation.js";

test("should resolve cinematic profile per target profile", () => {
  const desktop = resolveRenderLookProfile("cinematic", "desktop-web");
  const mobile = resolveRenderLookProfile("cinematic", "mobile-web");
  const native = resolveRenderLookProfile("cinematic", "native");

  assert.equal(desktop.profile, "cinematic");
  assert.equal(desktop.targetProfile, "desktop-web");
  assert.equal(desktop.antialias, "msaa8");
  assert.equal(mobile.targetProfile, "mobile-web");
  assert.equal(mobile.antialias, "fxaa");
  assert.equal(mobile.shadowQuality, "medium");
  assert.equal(mobile.bloomIntensity < desktop.bloomIntensity, true);
  assert.equal(native.targetProfile, "native");
  assert.equal(native.antialias, "msaa4");
  assert.equal(native.bloomIntensity < desktop.bloomIntensity, true);
});

test("should clamp SSGI high quality outside the desktop web tier", () => {
  assert.equal(resolveRenderLookSsgiQualityLimit("desktop-web"), "high");
  assert.equal(resolveRenderLookSsgiQualityLimit("mobile-web"), "medium");
  assert.equal(resolveRenderLookSsgiQualityLimit("native"), "high");
});

test("runtime config should resolve bounded shadow quality profiles", () => {
  assert.deepEqual(resolveRenderLookShadowProfile("low"), {
    cascadeCount: 1, enabled: true, filter: "basic", mapSize: 512, quality: "low",
  });
  assert.deepEqual(resolveRenderLookShadowProfile("medium"), {
    cascadeCount: 2, enabled: true, filter: "pcf", mapSize: 1024, quality: "medium",
  });
  assert.deepEqual(resolveRenderLookShadowProfile("high"), {
    cascadeCount: 4, enabled: true, filter: "pcf-soft", mapSize: 2048, quality: "high",
  });
});

test("runtime config should validate portable world gravity", () => {
  const valid: import("./validate.js").IIrDiagnostic[] = [];
  validateRuntimeConfig({ schema: "threenative.runtime-config", version: "0.1.0", physics: { gravity: [0, -3.71, 1] }, time: { fixedDelta: 1 / 60, paused: false }, window: { height: 720, width: 1280 } }, "runtime.config.json", valid);
  assert.deepEqual(valid, []);

  const invalid: import("./validate.js").IIrDiagnostic[] = [];
  validateRuntimeConfig({ schema: "threenative.runtime-config", version: "0.1.0", physics: { gravity: [0, Number.NaN] }, time: { fixedDelta: 1 / 60, paused: false }, window: { height: 720, width: 1280 } }, "runtime.config.json", invalid);
  assert.equal(invalid[0]?.code, "TN_IR_RUNTIME_PHYSICS_GRAVITY_INVALID");
});

test("should preserve authored render look overrides over profile values", () => {
  const resolved = resolveRenderLookProfile({
    version: 1,
    profile: "stylized",
    overrides: {
      bloomIntensity: 0.75,
      contrast: 0.1,
      environmentIntensity: 1.7,
      exposure: 0.95,
      saturation: 1.5,
      shadowQuality: "high",
    },
  }, "mobile-web");

  assert.equal(resolved.bloomIntensity, 0.75);
  assert.equal(resolved.contrast, 0.1);
  assert.equal(resolved.environmentIntensity, 1.7);
  assert.equal(resolved.exposure, 0.95);
  assert.equal(resolved.saturation, 1.5);
  assert.equal(resolved.shadowQuality, "high");
  assert.equal(resolved.toneMapping, RENDER_LOOK_PROFILE_PRESETS.stylized.toneMapping);
});
