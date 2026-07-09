import assert from "node:assert/strict";
import test from "node:test";

import { validateVisualPolishEvidence } from "./visualPolish.js";

test("should fail when a promoted material lacks web and native artifacts", () => {
  const diagnostics = validateVisualPolishEvidence({
    calibration: passingCalibration(),
    calibrationReportPath: "/artifacts/calibration.json",
    materialReports: {
      bevy: { materials: [] },
      bevyPath: "/artifacts/material.bevy.json",
      web: { materials: [{ id: "mat.hero", specularIntensity: 0.8, textures: {} }] },
      webPath: "/artifacts/material.web.json",
    },
    shadowReports: {
      bevy: shadowReport(),
      bevyPath: "/artifacts/shadow.bevy.json",
      web: shadowReport(),
      webPath: "/artifacts/shadow.web.json",
    },
    textureVariants: passingTextureVariants(),
    textureVariantReportPath: "/artifacts/texture-variants.json",
  });

  assert.deepEqual(
    diagnostics.filter((diagnostic) => diagnostic.code === "TN_VERIFY_VISUAL_POLISH_MATERIAL_ARTIFACT_MISSING").map((diagnostic) => diagnostic.path),
    ["/artifacts/material.web.json", "/artifacts/material.bevy.json"],
  );
});

test("should accept paired visual polish evidence", () => {
  const material = { id: "mat.hero", specularIntensity: 0.8, textures: { specular: "texture.specular" } };
  const diagnostics = validateVisualPolishEvidence({
    calibration: passingCalibration(),
    calibrationReportPath: "/artifacts/calibration.json",
    materialReports: { bevy: { materials: [material] }, bevyPath: "bevy-material.json", web: { materials: [material] }, webPath: "web-material.json" },
    shadowReports: { bevy: shadowReport(), bevyPath: "bevy-shadow.json", web: shadowReport(), webPath: "web-shadow.json" },
    textureVariants: passingTextureVariants(),
    textureVariantReportPath: "texture-variants.json",
  });
  assert.deepEqual(diagnostics, []);
});

function passingCalibration(): unknown {
  return { ok: true, fixtureResults: ["v10-lighting", "v10-materials", "v10-dense"].map((fixtureId) => ({ artifactDir: `/artifacts/${fixtureId}`, fixtureId, ok: true })) };
}

function passingTextureVariants(): unknown {
  return { loadedBytes: 1024, selectedVariantCount: 2, status: "measured" };
}

function shadowReport(): unknown {
  return { runtimeConfig: { renderer: { renderLook: { shadowProfile: { cascadeCount: 2, enabled: true, filter: "pcf", mapSize: 1024, quality: "medium" } } } } };
}
