import assert from "node:assert/strict";
import test from "node:test";

import type { IScenesIr } from "@threenative/ir";

import { applySceneServiceEffects, createSceneLifecycleManager, traceSceneLifecycle } from "./sceneManager.js";

test("should trace change from menu to level", () => {
  const state = traceSceneLifecycle(makeScenes(), [{ kind: "change", scene: "level" }]);

  assert.equal(state.activeScene, "level");
  assert.deepEqual(
    state.trace.map((event) => `${event.scene}:${event.phase}:${event.reason}`),
    [
      "menu:preload:initial",
      "menu:enter:initial",
      "menu:active:initial",
      "menu:exit:change",
      "menu:unload:change",
      "level:preload:change",
      "level:enter:change",
      "level:active:change",
    ],
  );
});

test("should apply scene service effects after system schedule", () => {
  const manager = createSceneLifecycleManager(makeScenes());
  const state = applySceneServiceEffects(manager, [
    {
      payload: {
        request: { scene: "level" },
        result: { accepted: true, operation: "change", scene: "level" },
      },
      service: "scene.change",
    },
  ]);

  assert.equal(state.activeScene, "level");
  assert.deepEqual(state.trace.slice(-3).map((event) => `${event.scene}:${event.phase}:${event.reason}`), [
    "level:preload:change",
    "level:enter:change",
    "level:active:change",
  ]);
});

test("should trace push and pop overlay lifecycle", () => {
  const state = traceSceneLifecycle(makeScenes(), [
    { kind: "change", scene: "level" },
    { kind: "push", scene: "pause" },
    { kind: "pop" },
  ]);

  assert.equal(state.activeScene, "level");
  assert.deepEqual(state.stack, ["level"]);
  assert.deepEqual(
    state.trace.slice(-8).map((event) => `${event.scene}:${event.phase}:${event.reason}`),
    [
      "level:pause:push",
      "pause:preload:push",
      "pause:enter:push",
      "pause:active:push",
      "pause:exit:pop",
      "pause:unload:pop",
      "level:resume:pop",
      "level:active:pop",
    ],
  );
});

function makeScenes(): IScenesIr {
  return {
    schema: "threenative.scenes",
    version: "0.1.0",
    initialScene: "menu",
    scenes: [
      { activation: "exclusive", id: "menu", kind: "menu", entities: ["menu.logo"] },
      { activation: "exclusive", id: "level", kind: "level", entities: ["level.player"] },
      { activation: "overlay", id: "pause", kind: "overlay", entities: ["pause.panel"] },
    ],
  };
}
