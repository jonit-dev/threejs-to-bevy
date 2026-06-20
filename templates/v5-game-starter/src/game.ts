import { defineGame } from "@threenative/sdk";
import { arenaScene } from "./scenes/arena.js";

export { stepPlayer, type IPlayerStep } from "./gameplay.js";

// Code-owned composition root. Keep editor-owned scene, input, ECS, and script
// declarations in focused modules so generated projects stay easy to patch.
export default defineGame({
  initialScene: "arena",
  scenes: [arenaScene],
});
