import assert from "node:assert/strict";
import test from "node:test";

import { World } from "./ecs/World.js";
import { SdkError } from "./errors.js";
import { defineGame } from "./game.js";
import { action, defineInputMap, keyboard } from "./input.js";
import { defineScene } from "./sceneLifecycle.js";
import { Scene } from "./scene/Scene.js";
import { defineRuntimeConfig } from "./time.js";

test("should serialize game root when scene and world are provided", () => {
  const scene = new Scene({ id: "scene.game" });
  const world = new World();
  const input = defineInputMap({ actions: [action("Jump", [keyboard("Space")])] });
  const runtimeConfig = defineRuntimeConfig({
    fixedDelta: 1 / 30,
    renderer: { antialias: "msaa8", bloom: { enabled: true, intensity: 0.35, threshold: 0.8 } },
    window: { title: "Starter" },
  });

  const root = defineGame({ input, runtimeConfig, scene, world });

  assert.equal(root.scene, scene);
  assert.equal(root.world, world);
  assert.equal(root.input, input);
  assert.deepEqual(world.toJSON().runtimeConfig, runtimeConfig);
  assert.equal(world.toJSON().runtimeConfig?.renderer.antialias, "msaa8");
  assert.deepEqual(world.toJSON().runtimeConfig?.renderer.bloom, {
    enabled: true,
    intensity: 0.35,
    threshold: 0.8,
  });
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

test("should serialize game root with lifecycle scenes", () => {
  const menu = defineScene({ id: "menu", kind: "menu", visual: new Scene({ id: "scene.menu.visual" }) });
  const level = defineScene({ id: "level.forest", kind: "level", visual: new Scene({ id: "scene.level.visual" }) });

  const root = defineGame({ initialScene: "menu", scenes: [menu, level] });

  assert.equal(root.initialScene, "menu");
  assert.deepEqual(root.scenes, [menu, level]);
});

test("should require initialScene when scenes are declared", () => {
  const menu = defineScene({ id: "menu", kind: "menu" });

  assert.throws(
    () => defineGame({ scenes: [menu] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GAME_INITIAL_SCENE_REQUIRED",
  );
});

test("should reject unknown initialScene when scenes are declared", () => {
  const menu = defineScene({ id: "menu", kind: "menu" });

  assert.throws(
    () => defineGame({ initialScene: "missing", scenes: [menu] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GAME_INITIAL_SCENE_UNKNOWN",
  );
});

test("should reject duplicate lifecycle scene ids", () => {
  const menu = defineScene({ id: "menu", kind: "menu" });

  assert.throws(
    () => defineGame({ initialScene: "menu", scenes: [menu, menu] }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_GAME_SCENE_DUPLICATE",
  );
});
