import { defineBehavior, Vector3 } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";
import { movementDelta } from "./lib/movement";

export const movePlayerToGoal = defineBehavior(
  {
    id: "move-player-to-goal",
    schedule: "fixedUpdate",
    writes: ["Transform"],
  },
  (context: ProjectContext): void => {
    for (const entity of context.query()) {
      const transform = entity.transform();
      const position = transform.position;
      const direction = context.input.getAxis("MoveX");
      const delta = context.time.fixedDelta;
      const nextPosition = Vector3.add(position, movementDelta(direction, delta));
      transform.position = [nextPosition[0], nextPosition[1], nextPosition[2]];
    }
  },
);
