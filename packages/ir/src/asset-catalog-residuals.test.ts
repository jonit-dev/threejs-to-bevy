import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseBevyCatalogResidualDeclarations } from "./bevyCatalogResiduals.js";

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
});
