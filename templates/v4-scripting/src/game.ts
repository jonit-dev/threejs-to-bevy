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
  action,
  axis,
  commands,
  defineComponent,
  defineEvent,
  defineInputMap,
  defineQuery,
  defineSystem,
  keyboard,
} from "@threenative/sdk";

const Transform = defineComponent("Transform", {
  position: { kind: "vec3", required: false },
  rotation: { kind: "quat", required: false },
  scale: { kind: "vec3", required: false },
});
const Collider = defineComponent("Collider", {
  kind: "string",
  size: { kind: "vec3", required: false },
});
const Lifetime = defineComponent("Lifetime", {
  remaining: "number",
});
const Marker = defineComponent("Marker", {
  label: "string",
});
const Rotator = defineComponent("Rotator", {
  radiansPerSecond: "number",
});
const Velocity = defineComponent("Velocity", {
  value: { kind: "vec3", required: true },
});
const HitEvent = defineEvent("HitEvent", {
  source: "entity",
  target: "entity",
});

const scene = new Scene({ id: "scene.v4-scripting" });
const floorMaterial = new MeshStandardMaterial({ color: "#24272e", roughness: 0.9 });
const blueMaterial = new MeshStandardMaterial({ color: "#2f80ed", roughness: 0.55 });
const orangeMaterial = new MeshStandardMaterial({ color: "#ff9f1c", roughness: 0.7 });
const greenMaterial = new MeshStandardMaterial({ color: "#2ec4b6", roughness: 0.65 });
const targetMaterial = new MeshStandardMaterial({ color: "#e8f044", roughness: 0.6 });

const floor = new Mesh({
  geometry: new PlaneGeometry({ size: [7, 5] }),
  id: "floor.primitive",
  material: floorMaterial,
});
floor.position.set(0, -0.7, 0);
floor.rotation.set(-Math.PI / 2, 0, 0);
scene.add(floor);

const cubes = [
  { id: "cube.rotator.left", material: blueMaterial, position: [-1.4, 0, 0] as const, speed: 1.1 },
  { id: "cube.rotator.center", material: orangeMaterial, position: [0, 0.15, -0.35] as const, speed: 1.7 },
  { id: "cube.rotator.right", material: greenMaterial, position: [1.4, 0, 0] as const, speed: 1.35 },
];

for (const cube of cubes) {
  const mesh = new Mesh({
    geometry: new BoxGeometry({ size: [0.85, 0.85, 0.85] }),
    id: cube.id,
    material: cube.material,
  });
  mesh.position.set(cube.position[0], cube.position[1], cube.position[2]);
  scene.add(mesh);
}

const target = new Mesh({
  geometry: new BoxGeometry({ size: [0.5, 0.5, 0.5] }),
  id: "cube.target",
  material: targetMaterial,
});
target.position.set(0, 0.85, -1.15);
scene.add(target);

const camera = new PerspectiveCamera({
  far: 80,
  fovY: 52,
  id: "camera.main",
  near: 0.1,
});
camera.position.set(0, 1.7, 5.2);
scene.add(camera);
scene.setActiveCamera(camera);

const keyLight = new DirectionalLight({ color: "#ffffff", id: "light.key", intensity: 2.4 });
keyLight.position.set(3, 4, 3);
scene.add(keyLight);
scene.add(new AmbientLight({ color: "#dce8ff", id: "light.ambient", intensity: 0.55 }));

const input = defineInputMap({
  actions: [action("MoveForward", [keyboard("KeyW")]), action("SpawnProjectile", [keyboard("Space")])],
  axes: [axis("MoveX", { negative: [keyboard("KeyA")], positive: [keyboard("KeyD")] })],
});

const world = new World();
for (const cube of cubes) {
  world.spawn(cube.id, Rotator({ radiansPerSecond: cube.speed }));
}
world
  .spawn("floor.primitive", Collider({ kind: "box", size: [7, 0.1, 5] }))
  .spawn("cube.target", Velocity({ value: [0.35, 0, 0] }), Marker({ label: "target" }))
  .spawn(
    "projectile.expired",
    Lifetime({ remaining: 0.01 }),
    Marker({ label: "expired-projectile" }),
    Transform({ position: [0, 0.25, 1.25], rotation: [0, 0, 0, 1], scale: [0.2, 0.2, 0.2] }),
    Velocity({ value: [0, 0, -1] }),
  )
  .addEvent(HitEvent)
  .setInputMap(input)
  .addSystem(
    defineSystem(
      {
        commands: [commands.setComponent("cube.rotator.center", Transform), commands.emitEvent(HitEvent)],
        eventWrites: [HitEvent],
        id: "rotatePrimitiveCubes",
        queries: [defineQuery({ with: [Transform, Rotator] })],
        reads: [Transform, Rotator],
        script: {
          export: "rotatePrimitiveCubes",
          module: "src/scripts/systems.ts",
        },
        stage: "fixedUpdate",
        writes: [Transform],
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        id: "moveTargetPlatform",
        queries: [defineQuery({ with: [Transform, Velocity, Marker] })],
        reads: [Transform, Velocity, Marker],
        script: {
          export: "moveTargetPlatform",
          module: "src/scripts/systems.ts",
        },
        stage: "update",
        writes: [Transform],
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        commands: [commands.spawn("projectile.spawned", [Transform, Velocity, Lifetime, Marker])],
        id: "spawnProjectileCommand",
        script: {
          export: "spawnProjectileCommand",
          module: "src/scripts/systems.ts",
        },
        stage: "fixedUpdate",
        writes: [Lifetime, Marker, Transform, Velocity],
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        commands: [commands.despawn("projectile.expired")],
        id: "expireProjectile",
        queries: [defineQuery({ with: [Lifetime, Marker] })],
        reads: [Lifetime, Marker],
        script: {
          export: "expireProjectile",
          module: "src/scripts/systems.ts",
        },
        stage: "postUpdate",
        writes: [Lifetime],
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        eventWrites: [HitEvent],
        id: "raycastHitProbe",
        reads: [Collider, Transform],
        script: {
          export: "raycastHitProbe",
          module: "src/scripts/systems.ts",
        },
        services: ["physics.raycast"],
        stage: "fixedUpdate",
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        eventReads: [HitEvent],
        id: "hitEventHandoff",
        queries: [defineQuery({ with: [Transform, Rotator] })],
        reads: [Transform, Rotator],
        script: {
          export: "hitEventHandoff",
          module: "src/scripts/systems.ts",
        },
        stage: "postUpdate",
        writes: [Transform],
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        id: "animationServiceProof",
        script: {
          export: "animationServiceProof",
          module: "src/scripts/systems.ts",
        },
        services: ["animation.play"],
        stage: "update",
      },
    ),
  );

export default { input, scene, world };
