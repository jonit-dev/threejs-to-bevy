import {
  AmbientLight,
  BoxGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  World,
  PrefabTransform as Transform,
  defineComponent,
  defineControls,
  defineGame,
  defineQuery,
  defineRuntimeConfig,
  fixedUpdate,
  primitiveActorPrefab,
} from "@threenative/sdk";

export interface IPlayerStep {
  reachedGoal: boolean;
  position: [number, number, number];
}

export function stepPlayer(
  position: readonly [number, number, number],
  input: { moveX: number; moveZ: number },
  dt: number,
): IPlayerStep {
  const speed = 2.4;
  const next: [number, number, number] = [
    Number((position[0] + input.moveX * speed * dt).toFixed(6)),
    position[1],
    Number((position[2] + input.moveZ * speed * dt).toFixed(6)),
  ];
  return {
    position: next,
    reachedGoal: Math.hypot(next[0] - 1.8, next[2] + 1.6) <= 0.55,
  };
}

const Player = defineComponent("Player", { speed: "number" });
const Goal = defineComponent("Goal", { reached: "boolean" });

const scene = new Scene({ id: "scene.v5-game-starter" });
const floorMaterial = new MeshStandardMaterial({ color: "#34373d", roughness: 0.85 });
const playerMaterial = new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.55 });
const goalMaterial = new MeshStandardMaterial({ color: "#f2c94c", roughness: 0.5 });

const floor = new Mesh({
  geometry: new PlaneGeometry({ size: [6, 5] }),
  id: "arena.floor",
  material: floorMaterial,
});
floor.position.set(0, -0.05, 0);
floor.rotation.set(-Math.PI / 2, 0, 0);
scene.add(floor);

const player = primitiveActorPrefab({
  components: [Player({ speed: 2.4 })],
  geometry: new BoxGeometry({ size: [0.55, 0.55, 0.55] }),
  id: "player",
  material: playerMaterial,
  position: [0, 0.35, 0],
  scale: [0.55, 0.55, 0.55],
});
scene.add(player.mesh);

const goal = primitiveActorPrefab({
  components: [Goal({ reached: false })],
  geometry: new BoxGeometry({ size: [0.45, 0.45, 0.45] }),
  id: "goal",
  material: goalMaterial,
  position: [1.8, 0.3, -1.6],
  scale: [0.45, 0.45, 0.45],
});
scene.add(goal.mesh);

const camera = new PerspectiveCamera({ far: 80, fovY: 52, id: "camera.main", near: 0.1 });
camera.position.set(0, 3.2, 5.8);
camera.rotation.set(-0.48, 0, 0);
scene.add(camera);
scene.setActiveCamera(camera);

const keyLight = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 2.3 });
keyLight.position.set(3, 5, 4);
scene.add(keyLight);
scene.add(new AmbientLight({ color: "#dce8ff", id: "light.ambient", intensity: 0.55 }));

const input = defineControls({
  actions: [{ id: "Interact", keys: ["Space"] }],
  movement: "wasd",
});

const world = new World()
  .spawn(player.id, ...player.components)
  .spawn(goal.id, ...goal.components)
  .setInputMap(input)
  .addSystem(
    fixedUpdate("movePlayerToGoal", {
      queries: [defineQuery({ with: [Player, Transform] })],
      reads: [Player, Transform],
      writes: [Transform],
      run: (context) => {
        for (const entity of context.query()) {
          const transform = entity.get<{ position?: [number, number, number] }>(Transform);
          const position = transform.position ?? [0, 0.35, 0];
          const speed = 2.4;
          entity.patch(Transform, {
            position: [
              Number((position[0] + context.input.axis("MoveX") * speed * context.time.dt).toFixed(6)),
              position[1],
              Number((position[2] + context.input.axis("MoveZ") * speed * context.time.dt).toFixed(6)),
            ],
          });
        }
      },
    }),
  );

export default defineGame({
  input,
  runtimeConfig: defineRuntimeConfig({ window: { title: "ThreeNative V5 Game Starter" } }),
  scene,
  world,
});
