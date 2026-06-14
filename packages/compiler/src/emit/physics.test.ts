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
        body: rigidBody("kinematic", { velocity: [1, 0, 0] }),
        collider: boxCollider([1, 2, 1], { layer: "player", mask: ["world"] }),
      }),
    }),
  );

  const emitted = sceneToWorld(scene);
  const entity = emitted.world.entities.find((item) => item.id === "player");

  assert.deepEqual(entity?.components.RigidBody, { kind: "kinematic", velocity: [1, 0, 0] });
  assert.deepEqual(entity?.components.Collider, { kind: "box", layer: "player", mask: ["world"], size: [1, 2, 1] });
});
