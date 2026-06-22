import { defineControls, defineInputModule } from "@threenative/sdk";

export const arenaInput = defineInputModule({
  id: "input.arena",
  input: defineControls({
    actions: [{ id: "Boost", keys: ["Space"] }],
    movement: "wasd",
  }),
  source: { sourcePath: "src/input/arena.input.ts" },
});
