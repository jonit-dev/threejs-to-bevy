import { characterController, defineComponent, defineEntity, defineEvent, defineResource, defineResourceModule, defineWorldModule } from "@threenative/sdk";

export const Health = defineComponent("Health", { current: "number", max: "number" });
export const Player = defineComponent("Player");
export const GameState = defineResource("GameState", { phase: "string", score: "number" });
export const DamageEvent = defineEvent("DamageEvent", { amount: "number", target: "entity" });

export const playerEntity = defineEntity({
  components: [Player(), Health({ current: 100, max: 100 }), characterController({ interactAction: "Attack", speed: 5 })],
  id: "player",
  source: { sourcePath: "src/scenes/arena.ecs.ts" },
});

export const gameStateResource = defineResourceModule({
  id: "GameState",
  resource: GameState({ phase: "playing", score: 0 }),
  source: { sourcePath: "src/scenes/arena.ecs.ts" },
});

export const arenaWorld = defineWorldModule({
  entities: [playerEntity],
  resources: [gameStateResource],
}).addEvent(DamageEvent);
