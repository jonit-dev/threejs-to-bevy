import assert from "node:assert/strict";
import test from "node:test";

import { resolveWebAssets } from "./assets.js";

test("assets should resolve glb asset from manifest", () => {
  const assets = resolveWebAssets("/game.bundle", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [{ id: "model.player", kind: "model", format: "glb", path: "assets/player.glb" }],
  });

  assert.equal(assets.get("model.player")?.url, "/game.bundle/assets/player.glb");
});
