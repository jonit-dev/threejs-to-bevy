import { defineBehavior } from "@threenative/script-stdlib";
import type { ProjectContext } from "../../.threenative/types/project-context";
import { hudTime } from "./lib/rules";

export const meltdownTimer = defineBehavior(
  {
    id: "meltdown-timer",
    schedule: "fixedUpdate",
    resourceReads: ["RoundTimer", "Match"],
    resourceWrites: ["RoundTimer", "Match"],
  },
  (context: ProjectContext): void => {
    const timer = context.resources.get("RoundTimer", { remaining: 45, statusText: hudTime(45) });
    const statusText = hudTime(timer.remaining);
    if (statusText !== timer.statusText) {
      context.resources.patch("RoundTimer", { statusText });
    }
    const match = context.resources.get("Match", { over: false, started: false, statusText: "" });
    if (!match.over && timer.remaining <= 0) {
      context.resources.patch("Match", { over: true, outcome: "lost", statusText: "Meltdown. The reactor is lost." });
    }
  },
);
