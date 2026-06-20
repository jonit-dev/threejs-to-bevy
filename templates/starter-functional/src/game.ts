import { defineGame } from "@threenative/sdk";
import { arenaScene } from "./scenes/arena.js";

// Code-owned composition root: keep scene modules small so editor or agent
// changes can target the source file that owns the changed concept.
export default defineGame({
  initialScene: "arena",
  scenes: [arenaScene],
});
