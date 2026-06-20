import { defineRuntimeConfig, defineSceneModule, sceneTransition } from "@threenative/sdk";
import { arenaInput } from "../input/arena.input.js";
import { arenaWorld } from "./arena.ecs.js";
import { arenaVisualScene } from "./arena.entities.js";
import { arenaSystems } from "./arena.systems.js";

// Code-owned scene assembly. Keep generated/editor data in the narrower modules
// so a single gameplay patch does not need to rewrite visual declarations.
for (const system of arenaSystems) {
  arenaWorld.addSystem(system);
}

arenaWorld
  .setInputMap(arenaInput.input)
  .setRuntimeConfig(defineRuntimeConfig({ window: { title: "ThreeNative V5 Game Starter" } }));

export const arenaScene = defineSceneModule({
  id: "arena",
  input: arenaInput.input,
  kind: "level",
  source: { sourcePath: "src/scenes/arena.ts" },
  transitions: {
    enter: sceneTransition.fade({ color: "#000000", durationMs: 120 }),
    exit: sceneTransition.fade({ color: "#000000", durationMs: 120 }),
  },
  visual: arenaVisualScene,
  world: arenaWorld,
});
