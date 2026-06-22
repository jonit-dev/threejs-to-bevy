import { PrefabTransform as Transform, defineComponent, defineEntity, defineResource, defineResourceModule, defineWorldModule } from "@threenative/sdk";

export { Transform };

export const PlayerKart = defineComponent("PlayerKart", { acceleration: "number", maxSpeed: "number" });
export const RivalKart = defineComponent("RivalKart", { lane: "number" });
export const TrackMarker = defineComponent("TrackMarker", { laneWidth: "number" });
export const RaceState = defineResource("RaceState", { lap: "number", position: "number", speed: "number" });

export const playerEntity = defineEntity({
  components: [PlayerKart({ acceleration: 10, maxSpeed: 16 })],
  id: "kart.player",
  source: { sourcePath: "src/scenes/arena.ecs.ts" },
  transform: {
    position: [0, 0.34, 4.4],
    rotation: [0, 0, 0, 1],
    scale: [1.2, 0.32, 1.8],
  },
});

export const rivalEntities = [
  defineEntity({
    components: [RivalKart({ lane: -1 })],
    id: "kart.rival.red",
    source: { sourcePath: "src/scenes/arena.ecs.ts" },
    transform: { position: [-1.9, 0.34, 1.2], rotation: [0, 0.04, 0, 0.9992], scale: [1.2, 0.32, 1.8] },
  }),
  defineEntity({
    components: [RivalKart({ lane: 1 })],
    id: "kart.rival.yellow",
    source: { sourcePath: "src/scenes/arena.ecs.ts" },
    transform: { position: [1.7, 0.34, -1.0], rotation: [0, -0.09, 0, 0.9959], scale: [1.2, 0.32, 1.8] },
  }),
  defineEntity({
    components: [RivalKart({ lane: -1 })],
    id: "kart.rival.green",
    source: { sourcePath: "src/scenes/arena.ecs.ts" },
    transform: { position: [-2.7, 0.34, -3.7], rotation: [0, 0.21, 0, 0.9777], scale: [1.2, 0.32, 1.8] },
  }),
];

export const trackEntity = defineEntity({
  components: [TrackMarker({ laneWidth: 3.6 })],
  id: "track.calibration",
  source: { sourcePath: "src/scenes/arena.ecs.ts" },
  transform: {
    position: [0, 0, 0],
  },
});

export const raceStateResource = defineResourceModule({
  id: "RaceState",
  resource: RaceState({ lap: 1, position: 1, speed: 0 }),
  source: { sourcePath: "src/scenes/arena.ecs.ts" },
});

export const arenaWorld = defineWorldModule({
  entities: [playerEntity, ...rivalEntities, trackEntity],
  resources: [raceStateResource],
});
