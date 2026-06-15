import assert from "node:assert/strict";
import test from "node:test";
import type { IAssetsManifest, IWorldIr } from "@threenative/ir";

import { pickMesh } from "./picking.js";

test("should pick generated mesh renderer bounds without colliders", () => {
  const result = pickMesh(makeWorld(), makeAssets(), {
    direction: [0, 0, -1],
    maxDistance: 10,
    origin: [0, 0, 2],
  });

  assert.deepEqual(result, {
    distance: 1.5,
    entity: "crate",
    hit: true,
    normal: [0, 0, 1],
    point: [0, 0, 0.5],
  });
});

test("should ignore invisible meshes and choose nearest deterministic hit", () => {
  const result = pickMesh(makeWorld(), makeAssets(), {
    direction: [0, 0, -1],
    ignore: ["crate"],
    maxDistance: 10,
    origin: [0, 0, 2],
  });

  assert.deepEqual(result, {
    distance: 3.75,
    entity: "wall",
    hit: true,
    normal: [0, 0, 1],
    point: [0, 0, -1.75],
  });
});

function makeWorld(): IWorldIr {
  return {
    entities: [
      {
        components: {
          MeshRenderer: { material: "mat.crate", mesh: "mesh.crate" },
          Transform: { position: [0, 0, 0], scale: [1, 1, 1] },
        },
        id: "crate",
      },
      {
        components: {
          MeshRenderer: { material: "mat.hidden", mesh: "mesh.crate", visible: false },
          Transform: { position: [0, 0, 1] },
        },
        id: "hidden",
      },
      {
        components: {
          MeshRenderer: { material: "mat.wall", mesh: "mesh.wall" },
          Transform: { position: [0, 0, -2] },
        },
        id: "wall",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
}

function makeAssets(): IAssetsManifest {
  return {
    assets: [
      { format: "generated", id: "mesh.crate", kind: "mesh", primitive: "box", size: [1, 1, 1] },
      { format: "generated", id: "mesh.wall", kind: "mesh", primitive: "box", size: [2, 2, 0.5] },
    ],
    schema: "threenative.assets",
    version: "0.1.0",
  };
}
