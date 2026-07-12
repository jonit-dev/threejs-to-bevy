import { defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";
import { ORB_COLLECT_RADIUS, ORB_IDS, TOTAL_ORBS, hudOrbs, planarDistance } from "./lib/rules";

export const collectOrbs = defineBehavior(
  {
    id: "collect-orbs",
    schedule: "fixedUpdate",
    eventWrites: ["match.win"],
    resourceReads: ["Orbs", "Match"],
    resourceWrites: ["Orbs", "Match"],
    commands: [
      { kind: "despawn", tag: "orb" },
    ],
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
    const orbs = context.resources.get("Orbs", { collected: 0, statusText: hudOrbs(0) });
    let collected = orbs.collected;
    for (const orbId of ORB_IDS) {
      const orb = context.entity(orbId);
      if (orb === undefined) {
        continue;
      }
      if (planarDistance(playerPosition, orb.transform().position) <= ORB_COLLECT_RADIUS) {
        context.commands.despawn(orbId);
        collected += 1;
      }
    }
    if (collected !== orbs.collected) {
      context.resources.patch("Orbs", { collected, statusText: hudOrbs(collected) });
      if (collected >= TOTAL_ORBS) {
        context.resources.patch("Match", { over: true, outcome: "won", statusText: "Reactor stabilized. You win!" });
        context.events.emit("match.win", { collected });
      }
    }
  },
);
