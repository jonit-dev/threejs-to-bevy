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
        stage: "fixedUpdate",
        writes: [Transform],
      },
      (context) => {
        for (const entity of context.query()) {
          const rotator = entity.get<{ radiansPerSecond?: number }>(Rotator);
          const speed = typeof rotator.radiansPerSecond === "number" ? rotator.radiansPerSecond : 1;
          const angle = context.time.elapsed * speed;
          entity.patch(Transform, {
            rotation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
          });
        }
        context.events.emit(HitEvent, { source: "cube.rotator.center", target: "floor.primitive" });
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        id: "moveTargetPlatform",
        queries: [defineQuery({ with: [Transform, Velocity, Marker] })],
        reads: [Transform, Velocity, Marker],
        stage: "update",
        writes: [Transform],
      },
      (context) => {
        const inputAxis = context.input.axis("MoveX");
        const forwardBias = context.input.action("MoveForward") ? 0.1 : 0;
        for (const entity of context.query()) {
          const transform = entity.get<{ position?: [number, number, number] }>(Transform);
          const velocity = entity.get<{ value?: [number, number, number] }>(Velocity);
          const position = transform.position ?? [0, 0, 0];
          const value = velocity.value ?? [0, 0, 0];
          entity.patch(Transform, {
            position: [
              position[0] + (value[0] + inputAxis * 0.2) * context.time.dt,
              position[1],
              position[2] - forwardBias * context.time.dt,
            ],
          });
        }
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        commands: [commands.spawn("projectile.spawned", [Transform, Velocity, Lifetime, Marker])],
        id: "spawnProjectileCommand",
        stage: "fixedUpdate",
        writes: [Lifetime, Marker, Transform, Velocity],
      },
      (context) => {
        if (context.time.elapsed >= 0 || context.input.action("SpawnProjectile")) {
          context.commands.spawn("projectile.spawned", {
            Lifetime: { remaining: 0.5 },
            Marker: { label: "spawned-projectile" },
            Transform: { position: [0, 0.35, 1.45], rotation: [0, 0, 0, 1], scale: [0.18, 0.18, 0.18] },
            Velocity: { value: [0, 0, -1.5] },
          });
        }
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
        stage: "postUpdate",
        writes: [Lifetime],
      },
      (context) => {
        for (const entity of context.query()) {
          const lifetime = entity.get<{ remaining?: number }>(Lifetime);
          const remaining = Math.max(0, Number(((lifetime.remaining ?? 0) - context.time.dt).toFixed(6)));
          entity.patch(Lifetime, { remaining });
          if (entity.id === "projectile.expired" && remaining <= 0) {
            context.commands.despawn("projectile.expired");
          }
        }
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        eventWrites: [HitEvent],
        id: "raycastHitProbe",
        reads: [Collider, Transform],
        services: ["physics.raycast"],
        stage: "fixedUpdate",
      },
      (context) => {
        const hit = context.physics.raycast({
          direction: [0, -1, 0],
          ignore: ["cube.rotator.center"],
          maxDistance: 3,
          origin: [0, 1, 0],
        });
        if (hit.hit) {
          context.events.emit(HitEvent, { source: "cube.rotator.center", target: hit.entity });
        }
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
        stage: "postUpdate",
        writes: [Transform],
      },
      (context) => {
        const hits = context.events.read(HitEvent);
        if (hits.length === 0) {
          return;
        }
        for (const entity of context.query()) {
          const transform = entity.get<{ scale?: [number, number, number] }>(Transform);
          const scale = transform.scale ?? [1, 1, 1];
          entity.patch(Transform, { scale: [scale[0], scale[1] + 0.02, scale[2]] });
        }
      },
    ),
  )
  .addSystem(
    defineSystem(
      {
        id: "animationServiceProof",
        services: ["animation.play"],
        stage: "update",
      },
      (context) => {
        context.animation.play("cube.rotator.center", "pulse", { loop: false, speed: 1 });
      },
    ),
  );

export default { input, scene, world };
