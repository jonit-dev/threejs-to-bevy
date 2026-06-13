import { action, axis, defineInputMap, keyboard, pointerButton, touchControl } from "@threenative/sdk";

export const arenaInput = defineInputMap({
  actions: [
    action("Attack", [pointerButton(0), touchControl("attack")]),
    action("Pause", [keyboard("Escape"), touchControl("pause")]),
  ],
  axes: [
    axis("MoveX", { negative: [keyboard("KeyA"), touchControl("move.left")], positive: [keyboard("KeyD"), touchControl("move.right")] }),
    axis("MoveZ", { negative: [keyboard("KeyW"), touchControl("move.up")], positive: [keyboard("KeyS"), touchControl("move.down")] }),
  ],
});
