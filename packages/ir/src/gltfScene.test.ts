import assert from "node:assert/strict";
import test from "node:test";

import { MAX_GLTF_EXTRAS_BYTES, validateGltfSceneMetadata, type IGltfSceneMetadataIr } from "./gltfScene.js";

test("should reject oversized gltf extras", () => {
  const metadata: IGltfSceneMetadataIr = {
    assets: [
      {
        assetId: "model.level",
        customAttributes: [],
        nodes: [
          {
            extras: { payload: "x".repeat(MAX_GLTF_EXTRAS_BYTES + 1) },
            name: "Door",
            path: "/Root/Door",
            spawnedHandleEligible: true,
          },
        ],
      },
    ],
    schema: "threenative.gltf-scene",
    version: "0.1.0",
  };

  const diagnostics = validateGltfSceneMetadata(metadata);

  const diagnostic = diagnostics.find((item) => item.code === "TN_IR_GLTF_SCENE_EXTRAS_TOO_LARGE");
  assert.equal(diagnostic?.path, "gltf.scene.json/assets/0/nodes/0/extras");
  assert.match(diagnostic?.message ?? "", /model\.level/);
  assert.match(diagnostic?.message ?? "", /\/Root\/Door/);
  assert.equal(diagnostic?.limit, MAX_GLTF_EXTRAS_BYTES);
  assert.match(diagnostic?.suggestion ?? "", /Move large metadata/);
});

test("should reject duplicate spawned gltf handle paths", () => {
  const metadata: IGltfSceneMetadataIr = {
    assets: [
      {
        assetId: "model.level",
        customAttributes: [],
        nodes: [
          { name: "Door", path: "/Root/Door", spawnedHandleEligible: true },
          { name: "Door", path: "/Root/Door", spawnedHandleEligible: true },
        ],
      },
    ],
    schema: "threenative.gltf-scene",
    version: "0.1.0",
  };

  const diagnostics = validateGltfSceneMetadata(metadata);

  assert.equal(diagnostics.filter((item) => item.code === "TN_IR_GLTF_SCENE_HANDLE_PATH_DUPLICATE").length, 2);
  assert.equal(diagnostics[0]?.path, "gltf.scene.json/assets/0/nodes/1/path");
  assert.match(diagnostics[0]?.suggestion ?? "", /full node paths/);
});
