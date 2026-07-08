import { strict as assert } from "node:assert";
import test from "node:test";
import { RENDER_LOOK_PROFILE_PRESETS, resolveRenderLookProfile } from "./runtimeConfig.js";

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
