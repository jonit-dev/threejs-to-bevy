import { defineRuntimeConfig, defineSceneModule, defineUiModule, sceneTransition } from "@threenative/sdk";
import { arenaInput } from "../input/arena.input.js";
import { arenaWorld } from "./arena.ecs.js";
import { arenaVisualScene } from "./arena.entities.js";
import { arenaSystems } from "./arena.systems.js";

for (const system of arenaSystems) {
  arenaWorld.addSystem(system);
}

arenaWorld
  .setInputMap(arenaInput.input)
  .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 60, window: { height: 720, title: "ThreeNative Racing Kart", width: 1280 } }));

const raceHud = defineUiModule({
  bindings: ["resource.RaceState"],
  id: "ui.race-hud",
  source: { sourcePath: "src/scenes/arena.ts" },
  ui: {
    root: {
      children: [
        { id: "hud.title", kind: "text", text: "RACING KART" },
        { id: "hud.lap", kind: "text", text: "LAP 1/3" },
        { id: "hud.position", kind: "text", text: "P1  SPEED READY" },
      ],
      id: "hud.root",
      kind: "column",
    },
    schema: "threenative.ui",
    version: "0.1.0",
  },
});

export const arenaScene = defineSceneModule({
  id: "arena",
  input: arenaInput.input,
  kind: "level",
  source: { sourcePath: "src/scenes/arena.ts" },
  transitions: {
    enter: sceneTransition.fade({ color: "#000000", durationMs: 120 }),
    exit: sceneTransition.fade({ color: "#000000", durationMs: 120 }),
  },
  ui: raceHud.ui,
  visual: arenaVisualScene,
  world: arenaWorld,
});
