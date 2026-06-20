import assert from "node:assert/strict";
import test from "node:test";

import { defineSceneModule } from "./authoring.js";
import { SdkError } from "./errors.js";

test("authoring scene modules should lower to scene lifecycle declarations", () => {
  const scene = defineSceneModule({
    id: "scene.arena",
    kind: "level",
    source: {
      sourceId: "scene.arena",
      sourcePath: "src/scenes/arena.ts",
    },
  });

  assert.equal(scene.id, "scene.arena");
  assert.equal(scene.kind, "level");
  assert.deepEqual(scene.authoring, {
    sourceId: "scene.arena",
    sourcePath: "src/scenes/arena.ts",
  });
});

test("authoring scene modules should reject invalid source metadata", () => {
  assert.throws(
    () => defineSceneModule({ id: "scene", kind: "level", source: { sourceId: "../scene" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_AUTHORING_SOURCE_ID_INVALID",
  );
  assert.throws(
    () => defineSceneModule({ id: "scene", kind: "level", source: { sourcePath: "dist/game.bundle" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_AUTHORING_SOURCE_PATH_INVALID",
  );
});
