import assert from "node:assert/strict";
import test from "node:test";

import { classifyLiveSceneUpdate } from "./liveSceneUpdates.js";

test("should hot-patch transform and visibility source changes", () => {
  const result = classifyLiveSceneUpdate({
    changedFiles: ["content/scenes/arena.scene.json"],
    operations: [
      { args: { entityId: "player", sceneId: "arena" }, name: "scene.set_transform" },
      { args: { entityId: "player", sceneId: "arena" }, name: "scene.set_visibility" },
    ],
  });

  assert.equal(result.kind, "hotPatch");
  assert.deepEqual(result.affectedEntities, ["player"]);
  assert.deepEqual(result.affectedFiles, ["content/scenes/arena.scene.json"]);
});

test("should require rebuild for script and asset catalog changes", () => {
  const script = classifyLiveSceneUpdate({ changedFiles: ["src/scripts/player.ts"], operations: [] });
  const assets = classifyLiveSceneUpdate({ changedFiles: ["content/assets/arena.assets.json"], operations: [] });

  assert.equal(script.kind, "rebuildRequired");
  assert.equal(assets.kind, "rebuildRequired");
});
