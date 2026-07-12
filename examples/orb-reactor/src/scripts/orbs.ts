import { defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";
import { ORB_COLLECT_RADIUS, ORB_IDS, TOTAL_ORBS, hudOrbs, planarDistance } from "./lib/rules";

export const collectOrbs = defineBehavior(
  {
    id: "collect-orbs",
    schedule: "fixedUpdate",
    resourceReads: ["Orbs", "Match"],
    resourceWrites: ["Orbs", "Match"],
    commands: [
      { kind: "despawn", entity: "orb.01" },
      { kind: "despawn", entity: "orb.02" },
      { kind: "despawn", entity: "orb.03" },
      { kind: "despawn", entity: "orb.04" },
      { kind: "despawn", entity: "orb.05" },
      { kind: "despawn", entity: "orb.06" },
      { kind: "despawn", entity: "orb.07" },
      { kind: "despawn", entity: "orb.08" },
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
      }
    }
  },
);
