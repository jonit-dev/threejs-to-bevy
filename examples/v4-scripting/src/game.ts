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
  commands,
  defineComponent,
  defineEvent,
  defineQuery,
  defineSystem,
} from "@threenative/sdk";

const Transform = defineComponent("Transform", {
  position: { kind: "vec3", required: false },
  rotation: { kind: "quat", required: false },
  scale: { kind: "vec3", required: false },
});
const Rotator = defineComponent("Rotator", {
  radiansPerSecond: "number",
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

const world = new World();
for (const cube of cubes) {
  world.spawn(cube.id, Rotator({ radiansPerSecond: cube.speed }));
}
world.addEvent(HitEvent).addSystem(
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
        const transform = entity.get<Record<string, unknown>>(Transform);
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
);

export default { scene, world };
