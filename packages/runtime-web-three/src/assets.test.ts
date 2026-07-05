import assert from "node:assert/strict";
import test from "node:test";

import { resolveWebAssets, traceAssetLoadSynchronization } from "./assets.js";

test("assets should resolve glb asset from manifest", () => {
  const assets = resolveWebAssets("/game.bundle", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [{ id: "model.player", kind: "model", format: "glb", path: "assets/player.glb" }],
  });

  assert.equal(assets.get("model.player")?.url, "/game.bundle/assets/player.glb");
});

test("asset load trace should sort assets and model scene refs deterministically", () => {
  const trace = traceAssetLoadSynchronization(
    {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        {
          id: "texture.hero",
          kind: "texture",
          format: "png",
          path: "assets/hero.png",
          fallback: "texture.hero",
          variants: [{ format: "ktx2", path: "assets/hero.ktx2", targets: ["desktop"] }],
        },
        { id: "model.tree.low", kind: "model", format: "gltf", path: "assets/tree-low.gltf" },
        { id: "model.tree", kind: "model", format: "gltf", path: "assets/tree.gltf" },
      ],
    },
    {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      sourceAssets: [
        {
          asset: "model.tree",
          category: "tree",
          id: "env.tree",
          lod: [{ asset: "model.tree.low", minDistance: 20, maxDistance: 80 }],
        },
      ],
      instances: [
        { id: "tree.b", sourceAsset: "env.tree", kind: "scatter", position: [1, 0, 0] },
        { id: "tree.a", sourceAsset: "env.tree", kind: "hero", position: [0, 0, 0] },
      ],
      path: { id: "path.main", points: [[0, 0, 0], [1, 0, 0]], width: 1 },
    },
  );

  assert.deepEqual(trace, {
    assets: [
      { format: "gltf", id: "model.tree", kind: "model", loadIndex: 0, path: "assets/tree.gltf", phase: "resolved" },
      { format: "gltf", id: "model.tree.low", kind: "model", loadIndex: 1, path: "assets/tree-low.gltf", phase: "resolved" },
      { format: "png", id: "texture.hero", kind: "texture", loadIndex: 2, path: "assets/hero.png", phase: "resolved" },
    ],
    barrier: { id: "bundle.requiredAssets", modelSceneCount: 1, status: "ready", total: 3 },
    gltfScenes: [
      {
        asset: "model.tree",
        category: "tree",
        impostors: [],
        instanceIds: ["tree.a", "tree.b"],
        lodAssets: ["model.tree.low"],
        sourceAsset: "env.tree",
      },
    ],
    textureDelivery: [
      {
        fallback: "texture.hero",
        format: "png",
        id: "texture.hero",
        selectedPath: "assets/hero.png",
        variants: [{ format: "ktx2", path: "assets/hero.ktx2", targets: ["desktop"] }],
      },
    ],
  });
});
