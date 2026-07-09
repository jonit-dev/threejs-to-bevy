import assert from "node:assert/strict";
import test from "node:test";

import { compareAssetProbe, compareMaterialProbe, compareTextureProbe } from "./gameplayParityProbes.js";

test("should pass matching GLB load observations", () => {
  const result = compareAssetProbe({
    assert: { assets: [{ animations: ["Idle"], id: "model.soldier", loaded: true, type: "gltf" }] },
    id: "soldier-glb",
    kind: "assetProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { assets: { "model.soldier": { animations: ["Idle"], loaded: true } } },
    web: { assets: { "model.soldier": { animations: ["Idle"], loaded: true } } },
  });

  assert.equal(result.pass, true);
  assert.deepEqual(result.diagnostics, []);
});

test("should fail when a named animation clip is missing on one target", () => {
  const result = compareAssetProbe({
    assert: { assets: [{ animations: ["Walk"], id: "model.soldier", loaded: true, type: "gltf" }] },
    id: "soldier-glb",
    kind: "assetProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { assets: { "model.soldier": { animations: ["Idle"], loaded: true } } },
    web: { assets: { "model.soldier": { animations: ["Idle", "Walk"], loaded: true } } },
  });

  assert.equal(result.pass, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_PARITY_ASSET_DRIFT"), true);
});

test("should fail when texture repeat differs across targets", () => {
  const result = compareTextureProbe({
    assert: { textures: [{ id: "tex.surface.ue-grid", loaded: true, repeat: [24, 24] }] },
    id: "floor-texture",
    kind: "textureProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { textures: { "tex.surface.ue-grid": { loaded: true, repeat: [1, 1] } } },
    web: { textures: { "tex.surface.ue-grid": { loaded: true, repeat: [24, 24] } } },
  });

  assert.equal(result.pass, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_PARITY_TEXTURE_DRIFT"), true);
});

test("should fail when material texture binding differs across targets", () => {
  const result = compareMaterialProbe({
    assert: { materials: [{ baseColorTexture: "tex.surface.ue-grid", id: "mat.floor.ue-grid" }] },
    id: "floor-material",
    kind: "materialProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { materials: { "mat.floor.ue-grid": { baseColorTexture: "tex.other" } } },
    web: { materials: { "mat.floor.ue-grid": { baseColorTexture: "tex.surface.ue-grid" } } },
  });

  assert.equal(result.pass, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_PARITY_MATERIAL_DRIFT"), true);
});

test("should return assertion rows for every requested probe surface", () => {
  const result = compareAssetProbe({
    assert: { assets: [{ animations: ["Idle", "Walk"], id: "model.soldier", loaded: true, type: "gltf" }] },
    id: "soldier-glb",
    kind: "assetProbe",
    targets: ["web", "desktop"],
  }, {
    desktop: { assets: { "model.soldier": { animations: ["Idle", "Walk"], loaded: true } } },
    web: { assets: { "model.soldier": { animations: ["Idle", "Walk"], loaded: true } } },
  });

  assert.equal(result.assertionResults.length, 6);
  assert.equal(result.assertionResults.every((assertion) => assertion.surface === "assets:model.soldier"), true);
});
