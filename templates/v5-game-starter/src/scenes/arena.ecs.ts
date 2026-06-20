import { PrefabTransform as Transform, defineComponent, defineEntity, defineWorldModule } from "@threenative/sdk";

export { Transform };

export const Player = defineComponent("Player", { speed: "number" });
export const Goal = defineComponent("Goal", { reached: "boolean" });

export const playerEntity = defineEntity({
  components: [Player({ speed: 2.4 })],
  id: "player",
  source: { sourcePath: "src/scenes/arena.ecs.ts" },
  transform: {
    position: [0, 0.35, 0],
    scale: [0.55, 0.55, 0.55],
  },
});

export const goalEntity = defineEntity({
  components: [Goal({ reached: false })],
  id: "goal",
  source: { sourcePath: "src/scenes/arena.ecs.ts" },
  transform: {
    position: [1.8, 0.3, -1.6],
    scale: [0.45, 0.45, 0.45],
  },
});

export const arenaWorld = defineWorldModule({
  entities: [goalEntity, playerEntity],
});
