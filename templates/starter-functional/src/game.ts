import { defineGame, defineScene, sceneTransition } from "@threenative/sdk";
import arena from "./scenes/arena.js";

const arenaScene = defineScene({
  id: "arena",
  kind: "level",
  visual: arena.scene,
  world: arena.world,
  input: arena.input,
  ui: arena.ui,
  audio: arena.audio,
  transitions: {
    enter: sceneTransition.fade({ color: "#000000", durationMs: 150 }),
    exit: sceneTransition.fade({ color: "#000000", durationMs: 150 }),
  },
  persistence: {
    keepEntities: ["player"],
    keepResources: ["GameState"],
  },
});

export default defineGame({
  initialScene: "arena",
  scenes: [arenaScene],
});
