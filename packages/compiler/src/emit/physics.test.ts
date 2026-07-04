import assert from "node:assert/strict";
import test from "node:test";

import { boxCollider, BoxGeometry, capsuleCollider, meshCollider, Mesh, MeshStandardMaterial, physics, physicsJoint, rigidBody, Scene, sphereCollider } from "@threenative/sdk";

import { sceneToWorld } from "./scene-to-world.js";

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
