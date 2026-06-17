import assert from "node:assert/strict";
import test from "node:test";

import { buildSceneInspectionReport } from "./sceneInspection.js";

test("sceneInspection should build deterministic scene inspection reports from bundle documents", () => {
  const report = buildSceneInspectionReport({
    assets: {
      assets: [
        { format: "png", id: "tex.b", kind: "texture", path: "assets/b.png", sourceMode: "bundle" },
        { format: "gltf", id: "model.a", kind: "model", path: "assets/a.gltf", sourceMode: "bundle" },
      ],
      groups: [{ id: "bundle.requiredAssets", required: ["tex.b", "model.a"] }],
      schema: "threenative.assets",
      version: "0.1.0",
    },
    diagnostics: [{ code: "TN_TEST", message: "Diagnostic", path: "z" }],
    manifest: {
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
      name: "inspection-test",
      requiredCapabilities: {},
      schema: "threenative.bundle",
      version: "0.1.0",
    },
    materials: { materials: [], schema: "threenative.materials", version: "0.1.0" },
    world: {
      entities: [
        { components: { Transform: {}, MeshRenderer: { material: "mat", mesh: "mesh" } }, id: "entity.b" },
        { components: {}, id: "entity.a" },
      ],
      schema: "threenative.world",
      version: "0.1.0",
    },
  });

  assert.equal(report.schema, "threenative.scene-inspection");
  assert.deepEqual(report.assets.map((asset) => asset.id), ["model.a", "tex.b"]);
  assert.deepEqual(report.entities.map((entity) => [entity.id, entity.components]), [
    ["entity.a", []],
    ["entity.b", ["MeshRenderer", "Transform"]],
  ]);
  assert.deepEqual(report.diagnostics.map((diagnostic) => diagnostic.code), ["TN_TEST"]);
});

test("sceneInspection should include gltf extras and custom attributes in inspection output", () => {
  const report = buildSceneInspectionReport({
    assets: {
      assets: [{ format: "gltf", id: "model.level", kind: "model", path: "assets/level.gltf", sourceMode: "bundle" }],
      schema: "threenative.assets",
      version: "0.1.0",
    },
    gltfScene: {
      assets: [
        {
          assetId: "model.level",
          customAttributes: [{ componentType: "f32", itemSize: 3, name: "_WIND", shaderConsumption: "inspectionOnly", targetMesh: "mesh:Door" }],
          nodes: [{ extras: { gameplayTag: "door" }, name: "Door", path: "/Root/Door", spawnedHandleEligible: true }],
        },
      ],
      schema: "threenative.gltf-scene",
      version: "0.1.0",
    },
    manifest: {
      entry: { world: "world.ir.json" },
      files: { assets: "assets.manifest.json", gltfScene: "gltf.scene.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
      name: "inspection-test",
      requiredCapabilities: {},
      schema: "threenative.bundle",
      version: "0.1.0",
    },
    materials: { materials: [], schema: "threenative.materials", version: "0.1.0" },
    world: { entities: [], schema: "threenative.world", version: "0.1.0" },
  });

  assert.deepEqual(report.gltfAssets, [
    {
      assetId: "model.level",
      customAttributes: [{ componentType: "f32", itemSize: 3, name: "_WIND", shaderConsumption: "inspectionOnly", targetMesh: "mesh:Door" }],
      nodes: [{ extras: { gameplayTag: "door" }, name: "Door", path: "/Root/Door", spawnedHandleEligible: true }],
    },
  ]);
});
