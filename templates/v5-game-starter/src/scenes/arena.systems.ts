import { defineQuery, fixedUpdate } from "@threenative/sdk";
import { Player, Transform } from "./arena.ecs.js";

export const arenaSystems = [
  fixedUpdate("movePlayerToGoal", {
    queries: [defineQuery({ with: [Player, Transform] })],
    reads: [Player, Transform],
    script: {
      export: "movePlayerToGoal",
      module: "src/scripts/player.ts",
    },
    writes: [Transform],
  }),
];
