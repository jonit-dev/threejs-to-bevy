import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  World,
  axis,
  boxCollider,
  capsuleCollider,
  characterController,
  defineInputMap,
  defineResource,
  keyboard,
  physics,
  rigidBody,
  sphereCollider,
  staticNavigation,
} from "@threenative/sdk";

const Navigation = defineResource("Navigation", {
  agentRadius: "number",
  areaCosts: "object",
  queries: "object",
  regions: "object",
});

const input = defineInputMap({
  axes: [
    axis("MoveX", { negative: [keyboard("KeyA")], positive: [keyboard("KeyD")] }),
    axis("MoveZ", { negative: [keyboard("KeyW")], positive: [keyboard("KeyS")] }),
  ],
});

const scene = new Scene({ id: "v9.physics.character.scene" });

const floor = new Mesh({
  geometry: new BoxGeometry({ size: [8, 0.2, 8] }),
  id: "arena.floor",
  material: new MeshStandardMaterial({ color: "#2f4f4f", roughness: 0.95 }),
  physics: physics({ body: rigidBody("static"), collider: boxCollider([8, 0.2, 8]) }),
});
floor.position.set(0, -0.1, 0);
scene.add(floor);

const stack = new Mesh({
  geometry: new BoxGeometry({ size: [1, 1, 1] }),
  id: "stack.base",
  material: new MeshStandardMaterial({ color: "#c97b63", roughness: 0.8 }),
  physics: physics({ body: rigidBody("dynamic", { mass: 2, solverIterations: 8 }), collider: boxCollider([1, 1, 1]) }),
});
stack.position.set(-2, 0.6, 0);
scene.add(stack);

const bounce = new Mesh({
  geometry: new SphereGeometry({ radius: 0.5 }),
  id: "bounce.sphere",
  material: new MeshStandardMaterial({ color: "#4f83ff", roughness: 0.45 }),
  physics: physics({
    body: rigidBody("dynamic", { mass: 1, velocity: [1, -1, 0] }),
    collider: sphereCollider(0.5, { restitution: 0.5 }),
  }),
});
bounce.position.set(0, 2, 0);
scene.add(bounce);

const sensor = new Mesh({
  geometry: new BoxGeometry({ size: [2, 2, 2] }),
  id: "sensor.zone",
  material: new MeshStandardMaterial({ color: "#8fd14f", emissive: "#335522", emissiveIntensity: 0.4, roughness: 1 }),
  physics: physics({
    body: rigidBody("static"),
    collider: boxCollider([2, 2, 2], {
      layer: "sensor",
      mask: ["player"],
      sensor: { interactionKind: "pickup", occupantLimit: 4, phases: ["enter", "stay", "exit"], trackOccupants: true },
      trigger: true,
    }),
  }),
});
sensor.position.set(3, 1, 0);
scene.add(sensor);

const player = new Mesh({
  geometry: new CapsuleGeometry({ height: 1.2, radius: 0.35 }),
  id: "player",
  material: new MeshStandardMaterial({ color: "#f4d35e", roughness: 0.55 }),
  physics: physics({
    body: rigidBody("kinematic"),
    collider: capsuleCollider(0.35, 1.2, { layer: "player", mask: ["world", "pushable", "sensor"] }),
  }),
});
player.position.set(1.5, 0.75, 0);
scene.add(player);

const pushable = new Mesh({
  geometry: new BoxGeometry({ size: [1, 1, 1] }),
  id: "crate.light",
  material: new MeshStandardMaterial({ color: "#d97706", roughness: 0.7 }),
  physics: physics({
    body: rigidBody("dynamic", { mass: 2 }),
    collider: boxCollider([1, 1, 1], { layer: "pushable" }),
  }),
});
pushable.position.set(2.2, 0.55, 0);
scene.add(pushable);

const camera = new PerspectiveCamera({ far: 50, fovY: 48, id: "camera.main", near: 0.1 });
camera.position.set(0, 3.5, 7);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#d9e8ff", id: "light.ambient", intensity: 0.55 }));
const key = new DirectionalLight({ color: "#fff4e8", id: "light.key", intensity: 2.2 });
key.position.set(3, 5, 4);
scene.add(key);

const world = new World()
  .spawn("player", characterController({ moveXAxis: "MoveX", moveZAxis: "MoveZ", speed: 1 }))
  .addResource(
    Navigation(
      staticNavigation({
        agentRadius: 0.4,
        areaCosts: { default: 1, slow: 3 },
        queries: [{ goal: [2, 0, 0], id: "path-a-b", start: [0, 0, 0] }],
        regions: [
          {
            area: "default",
            center: [0, 0, 0],
            id: "nav-a",
            neighbors: ["nav-b"],
            points: [
              [-1, -1],
              [1, -1],
              [1, 1],
              [-1, 1],
            ],
          },
          {
            area: "slow",
            center: [2, 0, 0],
            id: "nav-b",
            neighbors: ["nav-a"],
            points: [
              [1, -1],
              [3, -1],
              [3, 1],
              [1, 1],
            ],
          },
        ],
      }),
    ),
  )
  .setInputMap(input);

export default { input, scene, world };
