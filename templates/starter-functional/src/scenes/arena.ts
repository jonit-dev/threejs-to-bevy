import { defineRuntimeConfig, defineSceneModule, sceneTransition } from "@threenative/sdk";
import { arenaAudio } from "../audio/arena.audio.js";
import { arenaInput } from "../input/arena.input.js";
import { raceHud } from "../ui/race-hud.js";
import { arenaWorld } from "./arena.ecs.js";
import { arenaVisualScene } from "./arena.entities.js";
import { arenaSystems } from "./arena.systems.js";

// Code-owned scene assembly. Editor-owned data should live in the narrower
// asset/input/UI/entity modules so patches do not need to rewrite this file.
for (const system of arenaSystems) {
  arenaWorld.addSystem(system);
}

arenaWorld
  .setInputMap(arenaInput.input)
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { height: 720, title: "ThreeNative V7 Functional", width: 1280 } }));

export const arenaScene = defineSceneModule({
  audio: arenaAudio.audio,
  id: "arena",
  input: arenaInput.input,
  kind: "level",
  persistence: {
    keepEntities: ["player"],
    keepResources: ["GameState"],
  },
  source: { sourcePath: "src/scenes/arena.ts" },
  transitions: {
    enter: sceneTransition.fade({ color: "#000000", durationMs: 150 }),
    exit: sceneTransition.fade({ color: "#000000", durationMs: 150 }),
  },
  ui: raceHud.ui,
  visual: arenaVisualScene,
  world: arenaWorld,
});
