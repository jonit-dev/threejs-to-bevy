import assert from "node:assert/strict";
import test from "node:test";

import { validateLightingShowcaseEvidence, type LightingShowcaseMetrics } from "./lightingShowcaseGate.js";

const healthy: LightingShowcaseMetrics = {
  bloomHaloLuminance: 0.2,
  contrast: 0.18,
  floorHazeLuminance: 0.18,
  hazeGradientRatio: 2.5,
  highlightFraction: 0.025,
  meanLuminance: 0.24,
  nonBlackFraction: 0.82,
  overexposedFraction: 0.01,
  shadowFraction: 0.35,
  shaftLuminance: 0.24,
  shaftNeighborLuminance: 0.16,
  shaftRatio: 1.5,
  surfaceDetailEnergy: 0.006,
  warmChroma: 0.08,
};
const report = {
  contactShadows: [{}],
  environment: {
    bakedGiProbes: { applied: true },
    volumetrics: { godRays: { applied: true }, heightFog: { applied: true } },
  },
  runtimeConfig: { renderer: { postProcessing: { applied: ["bloom"] } } },
};

test("lighting showcase evidence accepts a composed parity-range scene", () => {
  assert.deepEqual(validateLightingShowcaseEvidence({ native: healthy, nativePath: "native.png", nativeReport: report, web: healthy, webPath: "web.png", webReport: report }), []);
});

test("lighting showcase evidence rejects component-only volumetrics with no pixel response", () => {
  const native = { ...healthy, bloomHaloLuminance: 0.03, hazeGradientRatio: 1.02, shaftRatio: 1.01 };
  const codes = validateLightingShowcaseEvidence({ native, nativePath: "native.png", nativeReport: report, web: healthy, webPath: "web.png", webReport: report }).map((entry) => entry.code);
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_SHAFT_NOT_VISIBLE"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_HAZE_GRADIENT_MISSING"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_BLOOM_HALO_MISSING"));
});

test("lighting showcase evidence rejects cross-engine regional luminance and chroma drift", () => {
  const native = { ...healthy, floorHazeLuminance: 0.25, shaftLuminance: 0.4, surfaceDetailEnergy: 0.0005, warmChroma: 0.2 };
  const codes = validateLightingShowcaseEvidence({ native, nativePath: "native.png", nativeReport: report, web: healthy, webPath: "web.png", webReport: report }).map((entry) => entry.code);
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_SHAFT_LUMINANCE_PARITY"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_HAZE_LUMINANCE_PARITY"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_CHROMA_PARITY"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_SURFACE_DETAIL_MISSING"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_SURFACE_DETAIL_PARITY"));
});

test("lighting showcase evidence rejects black native output and broad clipping", () => {
  const native = { ...healthy, meanLuminance: 0.03, nonBlackFraction: 0.12, overexposedFraction: 0.2, shadowFraction: 0.9, warmChroma: 0 };
  const codes = validateLightingShowcaseEvidence({ native, nativePath: "native.png", nativeReport: report, web: healthy, webPath: "web.png", webReport: report }).map((entry) => entry.code);
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_CONTENT_MISSING"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_CLIPPING"));
  assert.ok(codes.includes("TN_VERIFY_LIGHTING_SHOWCASE_EXPOSURE_PARITY"));
});
