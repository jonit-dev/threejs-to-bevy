import {
  AmbientLight,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  TorusGeometry,
  World,
  boxCollider,
  capsuleCollider,
  defineComponent,
  defineQuery,
  fixedUpdate,
  physics,
  rigidBody,
  sphereCollider,
} from "@threenative/sdk";

const Transform = defineComponent("Transform", {
  position: { kind: "vec3", required: false },
  rotation: { kind: "quat", required: false },
  scale: { kind: "vec3", required: false },
});
const ShowcaseBody = defineComponent("ShowcaseBody", {
  base: { kind: "vec3", required: true },
  channel: "string",
  phase: "number",
});

const scene = new Scene({ id: "physics.self.verification.showcase.scene" });

const materials = {
  amber: new MeshStandardMaterial({ color: "#f59e0b", roughness: 0.48 }),
  blue: new MeshStandardMaterial({ color: "#2563eb", roughness: 0.42 }),
  cyan: new MeshStandardMaterial({ color: "#22d3ee", roughness: 0.35 }),
  floor: new MeshStandardMaterial({ color: "#243244", roughness: 0.92 }),
  green: new MeshStandardMaterial({ color: "#22c55e", roughness: 0.55 }),
  grid: new MeshStandardMaterial({ color: "#64748b", roughness: 0.78 }),
  magenta: new MeshStandardMaterial({ color: "#c026d3", roughness: 0.5 }),
  red: new MeshStandardMaterial({ color: "#ef4444", roughness: 0.5 }),
  slate: new MeshStandardMaterial({ color: "#475569", roughness: 0.7 }),
  violet: new MeshStandardMaterial({ color: "#7c3aed", roughness: 0.5 }),
  white: new MeshStandardMaterial({ color: "#e2e8f0", roughness: 0.35 }),
  yellow: new MeshStandardMaterial({ color: "#fde047", roughness: 0.4 }),
};

const floor = new Mesh({
  geometry: new PlaneGeometry({ size: [22, 16] }),
  id: "showcase.floor",
  material: materials.floor,
  physics: physics({ body: rigidBody("static"), collider: boxCollider([22, 0.2, 16], { layer: "world" }) }),
  receiveShadow: true,
});
floor.position.set(0, -0.04, 0);
floor.rotation.set(-Math.PI / 2, 0, 0);
scene.add(floor);

for (let index = -5; index <= 5; index += 1) {
  const stripe = new Mesh({
    geometry: new BoxGeometry({ size: [0.04, 0.03, 15] }),
    id: `showcase.grid.x.${index}`,
    material: materials.grid,
  });
  stripe.position.set(index * 2, 0.02, 0);
  scene.add(stripe);
}

function addBox(id: string, position: readonly [number, number, number], size: readonly [number, number, number], material: MeshStandardMaterial, body: "static" | "dynamic" | "kinematic" = "dynamic") {
  const mesh = new Mesh({
    castShadow: true,
    geometry: new BoxGeometry({ size }),
    id,
    material,
    physics: physics({ body: rigidBody(body, { mass: body === "dynamic" ? 1 : undefined }), collider: boxCollider(size as [number, number, number], { layer: body === "static" ? "world" : "dynamic", mask: ["world", "dynamic", "sensor"] }) }),
  });
  mesh.position.set(position[0], position[1], position[2]);
  scene.add(mesh);
  return mesh;
}

function addSphere(id: string, position: readonly [number, number, number], radius: number, material: MeshStandardMaterial, restitution: number) {
  const mesh = new Mesh({
    castShadow: true,
    geometry: new SphereGeometry({ radius }),
    id,
    material,
    physics: physics({
      body: rigidBody("dynamic", { mass: 1, velocity: [0, -2, 0] }),
      collider: sphereCollider(radius, { mask: ["world"], restitution }),
    }),
  });
  mesh.position.set(position[0], position[1], position[2]);
  scene.add(mesh);
  return mesh;
}

addSphere("gravity.bounce.high", [-7.2, 2.8, -2.7], 0.45, materials.blue, 0.75);
addSphere("gravity.bounce.low", [-5.8, 2.2, -2.7], 0.45, materials.red, 0.05);
addBox("friction.slider.fast", [-7.1, 0.35, 0.1], [0.8, 0.7, 0.8], materials.cyan);
addBox("friction.slider.slow", [-5.8, 0.35, 1.4], [0.8, 0.7, 0.8], materials.amber);

for (let level = 0; level < 4; level += 1) {
  addBox(`mass.stack.${level}`, [-2.7, 0.48 + level * 0.92, -1.2], [0.95, 0.9, 0.95], level % 2 === 0 ? materials.green : materials.violet);
}
addBox("mass.heavy.block", [-1.1, 0.55, -1.2], [1.25, 1.1, 1.25], materials.slate);

const character = new Mesh({
  castShadow: true,
  geometry: new CapsuleGeometry({ height: 1.35, radius: 0.34 }),
  id: "character.controller",
  material: materials.yellow,
  physics: physics({ body: rigidBody("kinematic"), collider: capsuleCollider(0.34, 1.35, { layer: "player", mask: ["world", "dynamic", "sensor"] }) }),
});
character.position.set(1.8, 0.82, 1.9);
scene.add(character);
addBox("character.wall", [4.2, 0.8, 1.9], [0.35, 1.6, 2.2], materials.red, "static");
addBox("character.step", [2.8, 0.18, 3.4], [1.1, 0.36, 0.9], materials.green, "static");
addBox("character.push.crate", [3.0, 0.5, 0.2], [0.9, 0.9, 0.9], materials.amber);

const sensor = addBox("query.sensor.volume", [1.1, 1.0, -3.5], [1.6, 2.0, 1.6], materials.magenta, "static");
sensor.scale.set(1, 1, 1);
const ray = addBox("query.raycast.beam", [2.8, 0.16, -3.5], [3.4, 0.08, 0.08], materials.white, "static");
ray.rotation.set(0, 0, 0);
addBox("query.hit.target", [4.8, 0.65, -3.5], [0.9, 1.3, 0.9], materials.blue, "static");

addBox("mesh.ccd.track", [6.8, 0.18, -0.8], [4.8, 0.35, 1.5], materials.slate, "static");
addBox("mesh.ccd.chassis", [6.8, 1.1, -0.8], [1.5, 0.5, 1.0], materials.amber);
for (const x of [6.25, 7.35]) {
  const wheel = new Mesh({
    geometry: new TorusGeometry({ majorRadius: 0.24, minorRadius: 0.06 }),
    id: `mesh.ccd.wheel.${x}`,
    material: materials.white,
  });
  wheel.position.set(x, 0.72, -0.23);
  wheel.rotation.set(Math.PI / 2, 0, 0);
  scene.add(wheel);
}

addBox("joint.anchor", [6.0, 1.0, 2.9], [0.35, 0.35, 0.35], materials.red, "static");
addBox("joint.hinge.arm", [7.0, 1.0, 2.9], [1.5, 0.2, 0.2], materials.cyan);
const jointPin = new Mesh({
  geometry: new CylinderGeometry({ height: 0.25, radius: 0.18 }),
  id: "joint.pin",
  material: materials.yellow,
});
jointPin.position.set(6.35, 1.0, 2.9);
jointPin.rotation.set(Math.PI / 2, 0, 0);
scene.add(jointPin);

const camera = new PerspectiveCamera({ far: 100, fovY: 46, id: "camera.main", near: 0.1 });
camera.position.set(0, 8.6, 12.4);
camera.rotation.set(-0.62, 0, 0);
scene.add(camera);
scene.setActiveCamera(camera);

scene.add(new AmbientLight({ color: "#dbeafe", id: "light.ambient", intensity: 0.68 }));
const keyLight = new DirectionalLight({ color: "#fff7ed", id: "light.key", intensity: 2.3 });
keyLight.position.set(4, 8, 6);
scene.add(keyLight);

const world = new World()
  .spawn("gravity.bounce.high", ShowcaseBody({ base: [-7.2, 0.45, -2.7], channel: "bounce-high", phase: 0 }))
  .spawn("gravity.bounce.low", ShowcaseBody({ base: [-5.8, 0.45, -2.7], channel: "bounce-low", phase: 0.4 }))
  .spawn("friction.slider.fast", ShowcaseBody({ base: [-7.1, 0.35, 0.1], channel: "slide-fast", phase: 0 }))
  .spawn("friction.slider.slow", ShowcaseBody({ base: [-5.8, 0.35, 1.4], channel: "slide-slow", phase: 0.3 }))
  .spawn("mass.stack.0", ShowcaseBody({ base: [-2.7, 0.48, -1.2], channel: "stack", phase: 0 }))
  .spawn("mass.stack.1", ShowcaseBody({ base: [-2.7, 1.4, -1.2], channel: "stack", phase: 0.4 }))
  .spawn("mass.stack.2", ShowcaseBody({ base: [-2.7, 2.32, -1.2], channel: "stack", phase: 0.8 }))
  .spawn("mass.stack.3", ShowcaseBody({ base: [-2.7, 3.24, -1.2], channel: "stack", phase: 1.2 }))
  .spawn("character.controller", ShowcaseBody({ base: [1.8, 0.82, 1.9], channel: "character", phase: 0 }))
  .spawn("character.push.crate", ShowcaseBody({ base: [3.0, 0.5, 0.2], channel: "crate", phase: 0.2 }))
  .spawn("query.sensor.volume", ShowcaseBody({ base: [1.1, 1.0, -3.5], channel: "pulse", phase: 0 }))
  .spawn("query.raycast.beam", ShowcaseBody({ base: [2.8, 0.16, -3.5], channel: "beam", phase: 0 }))
  .spawn("mesh.ccd.chassis", ShowcaseBody({ base: [6.8, 1.1, -0.8], channel: "chassis", phase: 0 }))
  .spawn("joint.hinge.arm", ShowcaseBody({ base: [7.0, 1.0, 2.9], channel: "joint", phase: 0 }))
  .spawn("joint.pin", ShowcaseBody({ base: [6.35, 1.0, 2.9], channel: "pin", phase: 0 }))
  .addSystem(
    fixedUpdate("animatePhysicsShowcase", {
      queries: [defineQuery({ with: [Transform, ShowcaseBody] })],
      reads: [Transform, ShowcaseBody],
      writes: [Transform],
      run(context) {
        const elapsed = context.time.elapsed;
        for (const entity of context.query()) {
          const body = entity.get<{ base: [number, number, number]; channel: string; phase: number }>(ShowcaseBody);
          const base = body.base;
          const t = elapsed + body.phase;
          let position: [number, number, number] = [...base];
          let rotation: [number, number, number, number] = [0, 0, 0, 1];
          let scale: [number, number, number] = [1, 1, 1];

          if (body.channel === "bounce-high") {
            position = [base[0], base[1] + 2.6 * Math.abs(Math.sin(t * 1.35)), base[2]];
          } else if (body.channel === "bounce-low") {
            position = [base[0], base[1] + 0.9 * Math.abs(Math.sin(t * 1.35)), base[2]];
          } else if (body.channel === "slide-fast") {
            position = [base[0] + 1.2 * Math.sin(t * 0.9), base[1], base[2]];
          } else if (body.channel === "slide-slow") {
            position = [base[0] + 0.35 * Math.sin(t * 0.9), base[1], base[2]];
          } else if (body.channel === "stack") {
            position = [base[0] + 0.05 * Math.sin(t * 1.7), base[1], base[2] + 0.03 * Math.cos(t * 1.3)];
          } else if (body.channel === "character") {
            position = [base[0] + 1.35 * Math.sin(t * 0.62), base[1] + 0.1 * Math.abs(Math.sin(t * 1.24)), base[2]];
          } else if (body.channel === "crate") {
            position = [base[0] + 0.6 * Math.max(0, Math.sin(t * 0.62)), base[1], base[2]];
          } else if (body.channel === "pulse") {
            scale = [1 + 0.08 * Math.sin(t * 2.4), 1 + 0.08 * Math.sin(t * 2.4), 1 + 0.08 * Math.sin(t * 2.4)];
          } else if (body.channel === "beam") {
            scale = [0.65 + 0.35 * Math.abs(Math.sin(t * 2.2)), 1, 1];
          } else if (body.channel === "chassis") {
            position = [base[0], base[1] + 1.4 * Math.abs(Math.sin(t * 1.5)), base[2]];
          } else if (body.channel === "joint") {
            const angle = Math.sin(t * 1.25) * 0.65;
            rotation = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
          } else if (body.channel === "pin") {
            const angle = t * 1.25;
            rotation = [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
          }

          entity.patch(Transform, { position, rotation, scale });
        }
      },
    }),
  );

export default { scene, world };
