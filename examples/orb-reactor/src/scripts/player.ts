import { ControllerEx, defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";
import { ARENA_BOUND, PLAYER_SPEED, clamp } from "./lib/rules";

export const movePlayer = defineBehavior(
  {
    id: "move-player",
    schedule: "fixedUpdate",
    writes: ["Transform"],
    resourceReads: ["Match"],
    resourceWrites: ["Match"],
  },
  (context: ProjectContext): void => {
    const match = context.resources.get("Match", { over: false, started: false, statusText: "Collect the orbs before meltdown" });
    if (match.over) {
      return;
    }
    const player = context.entity("player");
    if (player === undefined) {
      return;
    }
    const moveX = context.input.getAxis("MoveX");
    const moveZ = context.input.getAxis("MoveZ");
    if (moveX === 0 && moveZ === 0) {
      return;
    }
    if (!match.started) {
      context.resources.patch("Match", { started: true, statusText: "Reactor unstable. Move!" });
    }
    const transform = player.transform();
    const position = transform.position;
    const movement = ControllerEx.worldCardinalCharacter({
      dt: context.time.fixedDelta,
      grounded: true,
      input: [moveX, -moveZ],
      position,
      speed: PLAYER_SPEED,
    });
    transform.setPosition([
      clamp(movement.position[0], -ARENA_BOUND, ARENA_BOUND),
      position[1],
      clamp(movement.position[2], -ARENA_BOUND, ARENA_BOUND),
    ]);
  },
);
