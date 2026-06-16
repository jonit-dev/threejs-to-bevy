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
