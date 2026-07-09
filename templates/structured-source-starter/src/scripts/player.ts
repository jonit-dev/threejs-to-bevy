import { defineBehavior, Vector3 } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";

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
      transform.position = Vector3.add(position, [direction * delta * 2.4, 0, 0]);
    }
  },
);
