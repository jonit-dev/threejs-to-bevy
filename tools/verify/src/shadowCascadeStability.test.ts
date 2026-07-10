import assert from "node:assert/strict";
import test from "node:test";

import { validateShadowCascadeEvidence, type CascadeProfileReport } from "./shadowCascadeStability.js";

const expectedProfile = {
  cascadeBlendFraction: 0.1,
  cascadeCount: 2,
  maxDistance: 48,
  splitLambda: 0.5,
  splitScheme: "practical",
  stabilized: true,
} as const;

test("shadow cascade stability should accept identical web/native exact profiles and measured sub-texel stability", () => {
  const profile: CascadeProfileReport = {
    applied: expectedProfile,
    mode: "exact",
    requested: expectedProfile,
  };
  const diagnostics = validateShadowCascadeEvidence({
    expectedProfile,
    fixtureId: "shadow-cascade-stability",
    nativeProfile: profile,
    nativeReportPath: "/artifacts/native.json",
    screenshots: screenshotEvidence(),
    texelStability: {
      cameraMotion: [0.0025, 0.0025, 0],
      cameraMotionTexels: 0.25,
      lightMatrixAfter: [1, 0, 0, 1],
      lightMatrixBefore: [1, 0, 0, 1],
      wholeTexelControlChanged: true,
      wholeTexelControlMatrix: [1, 0, 0, 2],
      wholeTexelControlMotionTexels: 1.25,
      stable: true,
      texelSize: 0.01,
    },
    webProfile: profile,
    webReportPath: "/artifacts/web.json",
  });

  assert.deepEqual(diagnostics, []);
});

test("shadow cascade stability should reject profile drift and static-only evidence", () => {
  const requested: CascadeProfileReport = {
    applied: expectedProfile,
    mode: "exact",
    requested: expectedProfile,
  };
  const diagnostics = validateShadowCascadeEvidence({
    expectedProfile,
    fixtureId: "shadow-cascade-stability",
    nativeProfile: { ...requested, applied: { ...expectedProfile, maxDistance: 32 } },
    nativeReportPath: "/artifacts/native.json",
    screenshots: screenshotEvidence(),
    texelStability: {
      cameraMotion: [0, 0, 0],
      cameraMotionTexels: 0,
      lightMatrixAfter: [1, 0, 0, 1],
      lightMatrixBefore: [1, 0, 0, 1],
      wholeTexelControlChanged: false,
      wholeTexelControlMatrix: [1, 0, 0, 1],
      wholeTexelControlMotionTexels: 1.25,
      stable: true,
      texelSize: 0.01,
    },
    webProfile: requested,
    webReportPath: "/artifacts/web.json",
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_VERIFY_SHADOW_CASCADE_NATIVE_PROFILE_MISMATCH",
    "TN_VERIFY_SHADOW_CASCADE_PROFILE_PARITY_MISMATCH",
    "TN_VERIFY_SHADOW_CASCADE_TEXEL_MOTION_MISSING",
  ]);
});

test("shadow cascade stability should reject blank screenshot evidence", () => {
  const profile: CascadeProfileReport = { applied: expectedProfile, mode: "exact", requested: expectedProfile };
  const blank = { cascadeBoundaryLuminanceDelta: 1, luminanceStdDev: 0, nearShadowEdgeMeanGradient: 0, nonBackgroundFraction: 0, receiverShadowContrast: 0 };
  const diagnostics = validateShadowCascadeEvidence({
    expectedProfile,
    fixtureId: "shadow-cascade-stability",
    nativeProfile: profile,
    nativeReportPath: "/artifacts/native.json",
    screenshots: { nativeBytes: 1024, nativeMetrics: blank, nativePath: "/artifacts/native.png", webBytes: 1024, webMetrics: blank, webPath: "/artifacts/web.png" },
    texelStability: {
      cameraMotion: [0.0025, 0, 0], cameraMotionTexels: 0.25,
      lightMatrixAfter: [1], lightMatrixBefore: [1], stable: true, texelSize: 0.01,
      wholeTexelControlChanged: true, wholeTexelControlMatrix: [2], wholeTexelControlMotionTexels: 1.25,
    },
    webProfile: profile,
    webReportPath: "/artifacts/web.json",
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.path), ["/artifacts/web.png", "/artifacts/native.png"]);
});

function screenshotEvidence() {
  const metrics = { cascadeBoundaryLuminanceDelta: 0.01, luminanceStdDev: 0.18, nearShadowEdgeMeanGradient: 0.04, nonBackgroundFraction: 0.45, receiverShadowContrast: 0.28 };
  return { nativeBytes: 1024, nativeMetrics: metrics, nativePath: "/artifacts/native.png", webBytes: 1024, webMetrics: metrics, webPath: "/artifacts/web.png" };
}
