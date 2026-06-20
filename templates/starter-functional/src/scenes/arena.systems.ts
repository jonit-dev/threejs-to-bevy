import { commands, defineQuery, startup, update } from "@threenative/sdk";
import { DamageEvent, Health, Player } from "./arena.ecs.js";

export const arenaSystems = [
  startup("seedV7DamageEvent", {
    commands: [commands.emitEvent(DamageEvent)],
    eventWrites: [DamageEvent],
    script: {
      export: "seedV7DamageEvent",
      module: "src/scripts/player.ts",
    },
  }),
  update("v7ProofLoop", {
    commands: [commands.emitEvent(DamageEvent)],
    eventWrites: [DamageEvent],
    queries: [defineQuery({ with: [Player, Health] })],
    reads: [Player, Health],
    script: {
      export: "v7ProofLoop",
      module: "src/scripts/player.ts",
    },
    services: ["animation.play"],
  }),
] as const;
