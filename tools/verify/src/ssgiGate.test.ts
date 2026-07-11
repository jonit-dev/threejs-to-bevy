import assert from "node:assert/strict";
import test from "node:test";
import { validateSsgiEvidence, type SsgiEvidence, type SsgiScreenshotMetrics } from "./ssgiGate.js";

const disabled: SsgiScreenshotMetrics = { highFrequencyEnergy: 0.002, indirectLuminance: 0.2, indirectRedChroma: 0.01, luminanceStdDev: 0.12, nonBackgroundFraction: 0.5 };
const authored: SsgiScreenshotMetrics = { highFrequencyEnergy: 0.004, indirectLuminance: 0.22, indirectRedChroma: 0.03, luminanceStdDev: 0.12, nonBackgroundFraction: 0.5 };
const high: SsgiScreenshotMetrics = { highFrequencyEnergy: 0.005, indirectLuminance: 0.25, indirectRedChroma: 0.05, luminanceStdDev: 0.12, nonBackgroundFraction: 0.5 };

test("SSGI evidence accepts causal monotone lift and web hue bleed", () => {
  assert.deepEqual(validateSsgiEvidence(evidence()), []);
});

test("SSGI evidence rejects no-op captures and fallback reports", () => {
  const value = evidence();
  value.webMetrics = { ...disabled };
  value.nativeMetrics = { ...disabled };
  value.webReport = report("disabled", "rollout-gap", true);
  const diagnostics = validateSsgiEvidence(value);
  assert.ok(diagnostics.some((entry) => entry.code === "TN_VERIFY_SSGI_INDIRECT_LIFT_MISSING"));
  assert.ok(diagnostics.some((entry) => entry.code === "TN_VERIFY_SSGI_WEB_COLOR_BLEED_MISSING"));
  assert.ok(diagnostics.some((entry) => entry.code === "TN_VERIFY_SSGI_WEB_REPORT_MISSING"));
});

test("SSGI evidence rejects visually noisy web captures", () => {
  const value = evidence();
  value.webMetrics = { ...authored, highFrequencyEnergy: 0.02 };
  assert.ok(validateSsgiEvidence(value).some((entry) => entry.code === "TN_VERIFY_SSGI_WEB_NOISE_EXCESSIVE"));
});

test("SSGI evidence rejects a frozen camera motion proof", () => {
  const value = evidence();
  value.webMotionDisplacementMae = 0;
  assert.ok(validateSsgiEvidence(value).some((entry) => entry.code === "TN_VERIFY_SSGI_WEB_CAMERA_MOTION_MISSING"));
});

function evidence(): SsgiEvidence {
  return {
    fixtureId: "photoreal-ssgi-red-wall-test",
    nativeBytes: 1024,
    nativeDisabledMetrics: disabled,
    nativeHighMetrics: high,
    nativeMetrics: authored,
    nativePath: "native.png",
    nativeReport: report("spatial-neighborhood-no-temporal", "baseline"),
    webBytes: 1024,
    webDisabledMetrics: disabled,
    webHighMetrics: high,
    webMetrics: authored,
    webMotionBoilingMae: 0.002,
    webMotionDisplacementMae: 0.08,
    webMotionGhostingMae: 0.01,
    webMotionPath: "motion.png",
    webPath: "web.png",
    webReport: report("screen-space-temporal", "baseline"),
  };
}

function report(appliedMode: string, status: string, diagnostic = false): unknown {
  return { runtimeConfig: { renderer: { featureReports: [{ appliedMode, ...(diagnostic ? { diagnostic: { code: "TN_RENDER_FEATURE_FALLBACK" } } : {}), feature: "renderer.screenSpaceGlobalIllumination", requestedMode: "screen-space", status }] } } };
}
