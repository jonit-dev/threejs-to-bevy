import { ControllerEx, defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const movePlayerToGoal = defineBehavior(
  { id: "move-player-to-goal", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    const player = context.entity("player");
    if (player === undefined) return;
    const transform = player.transform();
    const movement = ControllerEx.worldCardinalCharacter({
      dt: context.time.fixedDelta,
      grounded: true,
      input: [context.input.getAxis("MoveX"), 0],
      position: transform.position,
      speed: 2.4,
    });
    transform.setPosition(movement.position);
  },
);
