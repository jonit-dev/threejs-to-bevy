import assert from "node:assert/strict";
import test from "node:test";

import { World } from "./ecs/World.js";
import { SdkError } from "./errors.js";
import { defineGame } from "./game.js";
import { action, defineInputMap, keyboard } from "./input.js";
import { Scene } from "./scene/Scene.js";
import { defineRuntimeConfig } from "./time.js";

test("should serialize game root when scene and world are provided", () => {
  const scene = new Scene({ id: "scene.game" });
  const world = new World();
  const input = defineInputMap({ actions: [action("Jump", [keyboard("Space")])] });
  const runtimeConfig = defineRuntimeConfig({ fixedDelta: 1 / 30, window: { title: "Starter" } });

  const root = defineGame({ input, runtimeConfig, scene, world });

  assert.equal(root.scene, scene);
  assert.equal(root.world, world);
  assert.equal(root.input, input);
  assert.deepEqual(world.toJSON().runtimeConfig, runtimeConfig);
});

test("should reject empty game root when no portable declarations are provided", () => {
  assert.throws(
    () => defineGame({}),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GAME_ROOT_EMPTY",
  );
});

test("should reject runtime config without a world root", () => {
  assert.throws(
    () => defineGame({ runtimeConfig: defineRuntimeConfig(), scene: new Scene({ id: "scene.game" }) }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GAME_RUNTIME_CONFIG_WORLD_REQUIRED",
  );
});
