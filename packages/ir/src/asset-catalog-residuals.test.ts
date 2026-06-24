import assert from "node:assert/strict";
import test from "node:test";

import { BEVY_CATALOG_RESIDUAL_ROWS, diagnoseBevyCatalogResidualDeclarations } from "./bevyCatalogResiduals.js";

test("should reject asset export outside declared artifact roots", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    assets: {
      exports: [{ artifactRoot: "artifacts/generated", id: "mesh.runtime", path: "../outside/mesh.json" }],
    },
  });

  assert.equal(diagnostics[0]?.code, "TN_CATALOG_ASSET_EXPORT_ROOT_UNSUPPORTED");
  assert.equal(diagnostics[0]?.path, "bevy-catalog-residuals.json/assets/exports/0/path");
  assert.match(diagnostics[0]?.message ?? "", /mesh\.runtime/);
});

test("should reject executable glTF extension processors", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    assets: {
      gltfExtensions: [{ extension: "EXT_animation_graph_processor", processor: "executable" }],
    },
  });

  assert.equal(diagnostics[0]?.code, "TN_CATALOG_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED");
  assert.match(diagnostics[0]?.suggestion ?? "", /AnimationGraph/);
  const row = BEVY_CATALOG_RESIDUAL_ROWS.find((candidate) => candidate.id === "assets.gltf-extension-processing");
  assert.equal(row?.status, "diagnostic-only");
  assert.deepEqual(row?.diagnosticCodes, ["TN_CATALOG_GLTF_EXTENSION_PROCESSOR_UNSUPPORTED", "TN_CATALOG_GLTF_METADATA_TRANSFORM_UNSUPPORTED"]);
});

test("should allow known glTF metadata transform imports", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    assets: {
      gltfExtensions: [{ extension: "EXT_animation_graph", processor: "metadata", transform: "AnimationGraph" }],
    },
  });

  assert.deepEqual(diagnostics, []);
  const row = BEVY_CATALOG_RESIDUAL_ROWS.find((candidate) => candidate.id === "assets.gltf-extension-processing");
  assert.deepEqual(row?.reportEvidence, ["web.gltf-metadata-transform-policy", "bevy.gltf-metadata-transform-policy"]);
});

test("should reject unknown glTF metadata transform imports", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    assets: {
      gltfExtensions: [{ extension: "VENDOR_custom_metadata", processor: "metadata", transform: "VendorSceneScript" }],
    },
  });

  assert.equal(diagnostics[0]?.code, "TN_CATALOG_GLTF_METADATA_TRANSFORM_UNSUPPORTED");
  assert.equal(diagnostics[0]?.path, "bevy-catalog-residuals.json/assets/gltfExtensions/0/transform");
  assert.match(diagnostics[0]?.suggestion ?? "", /AnimationGraph/);
});

test("should preserve target profile diagnostics for output targets", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    assets: {
      targetProfiles: [
        { output: "web", targets: ["desktop"] },
        { output: "package", path: "target.profile.json/targets", targets: ["web"] },
      ],
    },
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED",
    "TN_CATALOG_TARGET_PROFILE_OUTPUT_UNSUPPORTED",
  ]);
  assert.equal(diagnostics[0]?.target, "web");
  assert.equal(diagnostics[0]?.value, "desktop");
  assert.equal(diagnostics[1]?.path, "target.profile.json/targets");
  assert.equal(diagnostics[1]?.target, "package");
  const row = BEVY_CATALOG_RESIDUAL_ROWS.find((candidate) => candidate.id === "assets.target-profile-diagnostics");
  assert.equal(row?.status, "promoted");
});

test("should promote schema-backed generated assets as bundle artifacts", () => {
  const row = BEVY_CATALOG_RESIDUAL_ROWS.find((candidate) => candidate.id === "assets.generated-persistence");

  assert.equal(row?.status, "promoted");
  assert.deepEqual(row?.reportEvidence, [
    "compiler.generated-asset-manifest-entry",
    "web.generated-asset-policy",
    "bevy.generated-asset-policy",
  ]);
});
