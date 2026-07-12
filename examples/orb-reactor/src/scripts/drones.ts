import { defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";
import { DRONE_HIT_RADIUS, DRONE_IDS, HIT_COOLDOWN_SECONDS, START_LIVES, hudLives, planarDistance } from "./lib/rules";

export const droneContacts = defineBehavior(
  {
    id: "drone-contacts",
    schedule: "fixedUpdate",
    resourceReads: ["Lives", "Match", "drone-hit-state"],
    resourceWrites: ["Lives", "Match", "drone-hit-state"],
  },
  (context: ProjectContext): void => {
    const match = context.resources.get("Match", { over: false, started: false, statusText: "" });
    if (match.over) {
      return;
    }
    const player = context.entity("player");
    if (player === undefined) {
      return;
    }
    const playerPosition = player.transform().position;
    const hitState = context.state("drone-hit-state", { nextHitAt: 0 });
    if (context.time.elapsed < hitState.nextHitAt) {
      return;
    }
    for (const droneId of DRONE_IDS) {
      const drone = context.entity(droneId);
      if (drone === undefined) {
        continue;
      }
      if (planarDistance(playerPosition, drone.transform().position) <= DRONE_HIT_RADIUS) {
        const lives = context.resources.get("Lives", { count: START_LIVES, statusText: hudLives(START_LIVES) });
        const remaining = lives.count - 1;
        context.resources.patch("Lives", { count: remaining, statusText: hudLives(remaining) });
        hitState.nextHitAt = context.time.elapsed + HIT_COOLDOWN_SECONDS;
        if (remaining <= 0) {
          context.resources.patch("Match", { over: true, outcome: "lost", statusText: "Security caught you. Game over." });
        }
        return;
      }
    }
  },
);
