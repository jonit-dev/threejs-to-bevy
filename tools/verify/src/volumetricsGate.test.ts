import assert from "node:assert/strict";
import test from "node:test";
import { validateVolumetricsEvidence, type VolumetricsEvidence } from "./volumetricsGate.js";

const metrics = {
  baseFogLuminance: 0.45,
  fogHeightGradient: 0.1,
  luminanceStdDev: 0.15,
  nonBackgroundFraction: 0.5,
  shadowNeighborLuminance: 0.2,
  shaftContrast: 0.12,
  shaftLuminance: 0.32,
  topFogLuminance: 0.35,
};

test("volumetrics evidence accepts visible shafts and height gradient", () => {
  assert.deepEqual(validateVolumetricsEvidence(evidence()), []);
});

test("volumetrics evidence rejects missing shaft and height response", () => {
  const value = evidence();
  value.nativeMetrics = { ...metrics, baseFogLuminance: 0.3, fogHeightGradient: 0, shaftContrast: 0, topFogLuminance: 0.3 };
  const diagnostics = validateVolumetricsEvidence(value);
  assert.ok(diagnostics.some((entry) => entry.code === "TN_VERIFY_VOLUMETRICS_SHAFT_NOT_VISIBLE"));
  assert.ok(diagnostics.some((entry) => entry.code === "TN_VERIFY_VOLUMETRICS_HEIGHT_CONTROL_FAILED"));
});

function evidence(): VolumetricsEvidence {
  return {
    fixtureId: "volumetrics",
    nativeBytes: 1024,
    nativeHeightControlMetrics: { ...metrics, baseFogLuminance: 0.3, topFogLuminance: 0.3 },
    nativeShaftControlMetrics: { ...metrics, shaftContrast: 0.05 },
    nativeMetrics: { ...metrics },
    nativePath: "native.png",
    nativeReport: report("analytic-height-post-pass", "bevy-volumetric-light"),
    webBytes: 1024,
    webHeightControlMetrics: { ...metrics, baseFogLuminance: 0.3, topFogLuminance: 0.3 },
    webShaftControlMetrics: { ...metrics, shaftContrast: 0.05 },
    webMetrics: { ...metrics },
    webPath: "web.png",
    webReport: report("analytic-height-fog-half-resolution", "directional-shadow-map-raymarch"),
  };
}

function report(heightMode: string, godRaysMode: string, reason?: string): unknown {
  return {
    environment: {
      volumetrics: {
        godRays: { applied: true, mode: godRaysMode, requested: true },
        heightFog: { applied: true, mode: heightMode, ...(reason === undefined ? {} : { reason }), requested: true },
      },
    },
  };
}
