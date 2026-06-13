import assert from "node:assert/strict";
import test from "node:test";

import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, textureAsset } from "@threenative/sdk";

import { sceneToWorld } from "./scene-to-world.js";

test("assets should emit texture asset references", () => {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "crate",
      material: new MeshStandardMaterial({
        baseColorTexture: textureAsset("tex.crate", "assets/crate.png"),
        color: "#ffffff",
      }),
    }),
  );

  const emitted = sceneToWorld(scene);

  assert.deepEqual(emitted.assets, [
    {
      format: "generated",
      id: "mesh.crate",
      kind: "mesh",
      primitive: "box",
      size: [1, 1, 1],
    },
    {
      format: "png",
      id: "tex.crate",
      kind: "texture",
      path: "assets/crate.png",
    },
  ]);
  assert.equal(emitted.materials[0]?.baseColorTexture, "tex.crate");
});
