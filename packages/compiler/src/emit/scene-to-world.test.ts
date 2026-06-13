import assert from "node:assert/strict";
import test from "node:test";
import { Object3D, Scene } from "@threenative/sdk";

import { sceneToWorld } from "./scene-to-world.js";

test("should preserve parent child hierarchy", () => {
  const scene = new Scene({ id: "scene" });
  const parent = new Object3D({ id: "parent" });
  const child = new Object3D({ id: "child" });
  parent.add(child);
  scene.add(parent);

  const result = sceneToWorld(scene);
  const childEntity = result.world.entities.find((entity) => entity.id === "child");

  assert.deepEqual(childEntity?.components.Hierarchy, { parent: "parent" });
});
