import assert from "node:assert/strict";
import test from "node:test";

import { analyzeGltfFidelityReports, type GltfFidelityConformanceReport } from "./gltfFidelity.js";

test("should pass when runtime glTF metadata reports match", () => {
  const web = report("web-three");
  const bevy = report("bevy");

  assert.deepEqual(analyzeGltfFidelityReports(web, bevy), []);
});

test("should fail when runtime metadata reports drift", () => {
  const web = report("web-three");
  const bevy = report("bevy");
  bevy.gltfFidelity!.assets[0]!.materials[0] = {
    extensions: [{ extension: "KHR_materials_clearcoat", path: "/materials/0/extensions/KHR_materials_clearcoat", properties: ["clearcoatFactor"], status: "inspectionOnly" }],
    material: "material:HeroVisor",
    textureTransforms: [],
  };

  const diagnostics = analyzeGltfFidelityReports(web, bevy);

  assert.equal(diagnostics[0]?.code, "TN_GLTF_FIDELITY_METADATA_DRIFT");
  assert.equal(diagnostics[0]?.path, "gltfFidelity/assets/model.hero/materials");
});

function report(_runtime: "bevy" | "web-three"): GltfFidelityConformanceReport {
  return {
    gltfFidelity: {
      assets: [
        {
          assetId: "model.hero",
          customAttributes: [],
          materials: [
            {
              extensions: [{ extension: "KHR_materials_clearcoat", path: "/materials/0/extensions/KHR_materials_clearcoat", properties: ["clearcoatFactor"], status: "promoted" }],
              material: "material:HeroVisor",
              textureTransforms: [],
            },
          ],
          morphTargets: [{ mesh: "mesh:Face", path: "/meshes/0/extras/targetNames/0", source: "mesh.extras.targetNames", target: "Smile" }],
        },
      ],
    },
  };
}
