import { action, axis, defineInputMap, defineInputModule, keyboard, pointerButton, touchControl } from "@threenative/sdk";

export const arenaInput = defineInputModule({
  id: "input.arena",
  input: defineInputMap({
    actions: [
      action("Attack", [pointerButton(0), touchControl("attack")]),
      action("Pause", [keyboard("Escape"), touchControl("pause")]),
    ],
    axes: [
      axis("MoveX", { negative: [keyboard("KeyA"), touchControl("move.left")], positive: [keyboard("KeyD"), touchControl("move.right")] }),
      axis("MoveZ", { negative: [keyboard("KeyW"), touchControl("move.up")], positive: [keyboard("KeyS"), touchControl("move.down")] }),
    ],
  }),
  source: { sourcePath: "src/input/arena.input.ts" },
});
