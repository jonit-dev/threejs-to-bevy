import assert from "node:assert/strict";
import test from "node:test";

import { validateContactShadowEvidence, type ContactShadowEvidence } from "./contactShadowsGate.js";

test("contact shadow evidence should require monotonic pools and settled static web captures", () => {
  assert.deepEqual(validateContactShadowEvidence(evidence()), []);
  const failing = evidence();
  failing.webObservations![0]!.captureCount = 2;
  failing.nativeMetrics.highOpacityPoolLuminance = 0.5;
  assert.deepEqual(validateContactShadowEvidence(failing).map((entry) => entry.code).sort(), ["TN_VERIFY_CONTACT_SHADOW_OPACITY_NOT_MONOTONIC", "TN_VERIFY_CONTACT_SHADOW_WEB_STATIC_COST_FAILED"]);
});

function evidence(): ContactShadowEvidence {
  const observations = [
    { entityId: "contact.high-opacity", opacity: 0.8 },
    { entityId: "contact.low-opacity", opacity: 0.25 },
  ].map(({ entityId, opacity }) => ({ appliedResolution: 256, blurStep: 8 / 256, captureCount: 1, entityId, height: 4, invalidated: false, opacity, renderCount: 3, requestedResolution: 256, size: [3.5, 3.5] as const, softness: 8, updateMode: "static" as const }));
  const metrics = { centerGroundLuminance: 0.5, highOpacityPoolContrast: 0.3, highOpacityPoolLuminance: 0.2, highOpacityPoolMeanGradient: 0.01, lowOpacityPoolContrast: 0.1, lowOpacityPoolLuminance: 0.4, luminanceStdDev: 0.2, nonBackgroundFraction: 0.5, opacityPoolDelta: 0.2 };
  return {
    fixtureId: "contact-shadows-grounding", nativeBytes: 1024, nativeMetrics: { ...metrics }, nativePath: "native.png", nativeReports: observations.map((observation) => ({ ...observation })), nativeReportPath: "native.json",
    nativeStaticCostProof: "cargo test --manifest-path runtime-bevy/Cargo.toml -p threenative_runtime --test contact_shadows",
    webBytes: 1024, webMetrics: { ...metrics }, webObservations: observations, webPath: "web.png", webReportPath: "web.json",
  };
}
