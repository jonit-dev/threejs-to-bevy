import { defineGame } from "@threenative/sdk";
import { arenaScene } from "./scenes/arena.js";

export { stepKart, type IKartStep } from "./gameplay.js";

// Code-owned composition root. Keep scene, input, ECS, and script declarations
// in focused modules so generated projects stay easy to inspect and patch.
export default defineGame({
  initialScene: "arena",
  scenes: [arenaScene],
});
