import assert from "node:assert/strict";
import test from "node:test";

import { boxCollider, BoxGeometry, capsuleCollider, meshCollider, Mesh, MeshStandardMaterial, physics, physicsJoint, physicsSurface, rigidBody, Scene, sphereCollider, tireModel, wheelAssembly } from "@threenative/sdk";

import { sceneToWorld } from "./scene-to-world.js";
import { deriveRequiredCapabilities } from "./capabilities.js";

test("physics should emit player collider and kinematic body", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "player",
      material: new MeshStandardMaterial(),
      physics: physics({
        body: rigidBody("kinematic", { damping: 0.2, gravityScale: 0, velocity: [1, 0, 0] }),
        collider: boxCollider([1, 2, 1], { friction: 0.6, layer: "player", mask: ["world"], restitution: 0.1, slope: { axis: "x", direction: 1, rise: 1, run: 2 } }),
      }),
    }),
  );

  const emitted = sceneToWorld(scene);
  const entity = emitted.world.entities.find((item) => item.id === "player");

  assert.deepEqual(entity?.components.RigidBody, { damping: 0.2, gravityScale: 0, kind: "kinematic", velocity: [1, 0, 0] });
  assert.deepEqual(entity?.components.Collider, { friction: 0.6, kind: "box", layer: "player", mask: ["world"], restitution: 0.1, size: [1, 2, 1], slope: { axis: "x", direction: 1, rise: 1, run: 2 } });
});

test("physics should losslessly emit wheel references, tire curves, surfaces, and force limits", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(new Mesh({ geometry: new BoxGeometry(), id: "vehicle", material: new MeshStandardMaterial(), physics: physics({ wheelAssembly: wheelAssembly([{ attachment: [-1, 0, 1], braked: true, driven: true, id: "front-left", radius: 0.35, steering: true, suspension: { damperRate: 2400, springRate: 30_000, travel: 0.25 }, tire: "tire.sport", visual: "wheel.front-left", width: 0.24 }], { maxSteeringAngle: 0.6, maxSuspensionForce: 20_000, maxTireForce: 12_000 }) }) }));
  scene.add(new Mesh({ geometry: new BoxGeometry(), id: "tire.sport", material: new MeshStandardMaterial(), physics: physics({ tireModel: tireModel({ lateralSlipCurve: [{ slip: -1, grip: 0.5 }, { slip: 1, grip: 0.5 }], loadSensitivity: 1, longitudinalSlipCurve: [{ slip: -1, grip: 0.7 }, { slip: 1, grip: 0.7 }], rollingResistance: 0.02 }) }) }));
  scene.add(new Mesh({ geometry: new BoxGeometry(), id: "road", material: new MeshStandardMaterial(), physics: physics({ surface: physicsSurface({ combineRule: "minimum", grip: 0.65, rollingResistance: 0.04 }) }) }));
  scene.add(new Mesh({ geometry: new BoxGeometry(), id: "wheel.front-left", material: new MeshStandardMaterial() }));

  const emitted = sceneToWorld(scene).world.entities;
  assert.deepEqual(emitted.find((entity) => entity.id === "vehicle")?.components.WheelAssembly, { maxSteeringAngle: 0.6, maxSuspensionForce: 20_000, maxTireForce: 12_000, wheels: [{ attachment: [-1, 0, 1], braked: true, driven: true, id: "front-left", radius: 0.35, steering: true, suspension: { damperRate: 2400, springRate: 30_000, travel: 0.25 }, tire: "tire.sport", visual: "wheel.front-left", width: 0.24 }] });
  assert.equal(emitted.find((entity) => entity.id === "tire.sport")?.components.TireModel?.longitudinalSlipCurve[0]?.slip, -1);
  assert.deepEqual(emitted.find((entity) => entity.id === "road")?.components.PhysicsSurface, { combineRule: "minimum", grip: 0.65, rollingResistance: 0.04 });
});

test("physics should losslessly emit every SDK collider field and enroll sensor capabilities", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "sensor",
      material: new MeshStandardMaterial(),
      physics: physics({
        collider: boxCollider([2, 3, 4], {
          center: [0.25, 0.5, -0.25],
          contact: { phases: ["begin", "stay", "end"] },
          friction: 0.4,
          layer: "sensor",
          mask: ["player"],
          material: "checkpoint",
          restitution: 0.2,
          sensor: {
            interactionKind: "checkpoint",
            occupantLimit: 4,
            phases: ["enter", "stay", "exit"],
            trackOccupants: true,
          },
          slope: { axis: "z", direction: -1, rise: 1, run: 3 },
          trigger: true,
        }),
      }),
    }),
  );

  const emitted = sceneToWorld(scene);
  const collider = emitted.world.entities.find((item) => item.id === "sensor")?.components.Collider;

  assert.deepEqual(collider, {
    center: [0.25, 0.5, -0.25],
    contact: { phases: ["begin", "stay", "end"] },
    friction: 0.4,
    kind: "box",
    layer: "sensor",
    mask: ["player"],
    material: "checkpoint",
    restitution: 0.2,
    sensor: {
      interactionKind: "checkpoint",
      occupantLimit: 4,
      phases: ["enter", "stay", "exit"],
      trackOccupants: true,
    },
    size: [2, 3, 4],
    slope: { axis: "z", direction: -1, rise: 1, run: 3 },
    trigger: true,
  });

  const capabilities = deriveRequiredCapabilities({
    assets: { assets: [], schema: "threenative.assets", version: "0.1.0" },
    materials: { materials: [], schema: "threenative.materials", version: "0.1.0" },
    world: emitted.world,
  });
  assert.ok(capabilities.physics?.includes("sensors"));
  assert.ok(capabilities.physics?.includes("interaction-volumes"));
});

test("should emit solver material and sleep metadata when authored", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "crate",
      material: new MeshStandardMaterial(),
      physics: physics({
        body: rigidBody("dynamic", {
          angularVelocity: [0, 0.25, 0],
          damping: 0.05,
          gravityScale: 1,
          inverseMass: 0.5,
          mass: 2,
          sleepThreshold: 0.02,
          solverIterations: 10,
          velocity: [0, -1, 0],
        }),
        collider: boxCollider([1, 1, 1], { friction: 0.7, restitution: 0.2 }),
      }),
    }),
  );

  const emitted = sceneToWorld(scene);
  const entity = emitted.world.entities.find((item) => item.id === "crate");

  assert.deepEqual(entity?.components.RigidBody, {
    angularVelocity: [0, 0.25, 0],
    damping: 0.05,
    gravityScale: 1,
    inverseMass: 0.5,
    kind: "dynamic",
    mass: 2,
    sleepThreshold: 0.02,
    solverIterations: 10,
    velocity: [0, -1, 0],
  });
  assert.deepEqual(entity?.components.Collider, { friction: 0.7, kind: "box", restitution: 0.2, size: [1, 1, 1] });
});

test("should emit bounded mesh collider CCD and suspension joint metadata", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "car.chassis",
      material: new MeshStandardMaterial(),
      physics: physics({
        body: rigidBody("dynamic", { ccd: { enabled: true, maxSubsteps: 4, mode: "swept-aabb" }, velocity: [0, -12, 0] }),
        collider: meshCollider({ mesh: { bounds: { center: [0, 0.25, 0], size: [2, 0.5, 4] }, source: "mesh.car", triangleCount: 128 } }),
      }),
    }),
  );
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "wheel.fl",
      material: new MeshStandardMaterial(),
      physics: physics({
        body: rigidBody("dynamic"),
        collider: boxCollider([0.7, 0.7, 0.7]),
        joint: physicsJoint("suspension", "car.chassis", { axis: [0, 1, 0], damping: 0.6, stiffness: 12, travel: 0.4 }),
      }),
    }),
  );

  const emitted = sceneToWorld(scene);
  const chassis = emitted.world.entities.find((item) => item.id === "car.chassis");
  const wheel = emitted.world.entities.find((item) => item.id === "wheel.fl");

  assert.deepEqual(chassis?.components.RigidBody, { ccd: { enabled: true, maxSubsteps: 4, mode: "swept-aabb" }, kind: "dynamic", velocity: [0, -12, 0] });
  assert.deepEqual(chassis?.components.Collider, { kind: "mesh", mesh: { bounds: { center: [0, 0.25, 0], size: [2, 0.5, 4] }, source: "mesh.car", triangleCount: 128 } });
  assert.deepEqual(wheel?.components.PhysicsJoint, { axis: [0, 1, 0], connectedEntity: "car.chassis", damping: 0.6, kind: "suspension", stiffness: 12, travel: 0.4 });
});

test("physics emit should stay within promoted collider kinds", () => {
  const scene = new Scene({ id: "scene" });
  const colliders = [
    { collider: boxCollider([1, 1, 1]), id: "box" },
    { collider: sphereCollider(0.5), id: "sphere" },
    { collider: capsuleCollider(0.25, 1), id: "capsule" },
    { collider: meshCollider({ mesh: { bounds: { size: [1, 1, 1] }, triangleCount: 12 } }), id: "mesh" },
  ] as const;

  for (const { collider, id } of colliders) {
    scene.add(
      new Mesh({
        geometry: new BoxGeometry(),
        id,
        material: new MeshStandardMaterial(),
        physics: physics({ body: rigidBody("static"), collider }),
      }),
    );
  }

  const emitted = sceneToWorld(scene);
  const emittedKinds = emitted.world.entities
    .map((entity) => entity.components.Collider?.kind)
    .filter((kind): kind is "box" | "capsule" | "mesh" | "sphere" => kind !== undefined)
    .sort();

  assert.deepEqual(emittedKinds, ["box", "capsule", "mesh", "sphere"]);
});
