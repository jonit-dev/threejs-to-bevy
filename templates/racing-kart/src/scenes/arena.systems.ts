import { defineQuery, fixedUpdate } from "@threenative/sdk";
import { PlayerKart, Transform } from "./arena.ecs.js";

export const arenaSystems = [
  fixedUpdate("drivePlayerKart", {
    queries: [defineQuery({ with: [PlayerKart, Transform] })],
    reads: [PlayerKart, Transform],
    script: {
      export: "drivePlayerKart",
      module: "src/scripts/player.ts",
    },
    writes: [Transform],
  }),
];
