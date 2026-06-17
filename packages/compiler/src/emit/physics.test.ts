import assert from "node:assert/strict";
import test from "node:test";

import { boxCollider, BoxGeometry, Mesh, MeshStandardMaterial, physics, rigidBody, Scene } from "@threenative/sdk";

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
