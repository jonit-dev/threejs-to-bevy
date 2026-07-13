import { ControllerEx, defineBehavior } from "@threenative/script-stdlib";
import type { ScriptContext } from "@threenative/script-stdlib";

export const updateTopDownArchetype = defineBehavior(
  { id: "top-down-archetype", schedule: "fixedUpdate", writes: ["Transform"] },
  (context: ScriptContext): void => {
    const player = context.entity("player") ?? context.query({ limit: 1 })[0];
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
