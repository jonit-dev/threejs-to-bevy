import assert from "node:assert/strict";
import test from "node:test";

import { World } from "./ecs/World.js";
import { SdkError } from "./errors.js";
import { defineScene, sceneTransition } from "./sceneLifecycle.js";
import { Scene } from "./scene/Scene.js";

test("should define lifecycle scene with visual scene and world", () => {
  const visual = new Scene({ id: "scene.level.visual" });
  const world = new World();
  const scene = defineScene({
    id: "level.forest",
    kind: "level",
    persistence: { keepEntities: ["player"], keepResources: ["Settings"] },
    preload: { assetGroups: ["level.forest.assets", "bundle.requiredAssets"] },
    transitions: {
      enter: sceneTransition.fade({ color: "#000000", durationMs: 350 }),
      exit: sceneTransition.instant(),
    },
    visual,
    world,
  });

  assert.equal(scene.id, "level.forest");
  assert.equal(scene.kind, "level");
  assert.equal(scene.activation, "exclusive");
  assert.equal(scene.visual, visual);
  assert.equal(scene.world, world);
  assert.deepEqual(scene.preload?.assetGroups, ["bundle.requiredAssets", "level.forest.assets"]);
  assert.deepEqual(scene.persistence, { keepEntities: ["player"], keepResources: ["Settings"] });
  assert.deepEqual(scene.transitions.enter, { color: "#000000", durationMs: 350, kind: "fade" });
});

test("should reject invalid transition duration", () => {
  assert.throws(
    () => sceneTransition.fade({ durationMs: -1 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_SCENE_TRANSITION_DURATION_INVALID",
  );
});

test("should reject unsupported lifecycle options", () => {
  assert.throws(
    () =>
      defineScene({
        hooks: { onEnter: "runtime-only" },
        id: "menu",
        kind: "menu",
      } as never),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_SCENE_UNSUPPORTED_OPTION",
  );
});
