import assert from "node:assert/strict";
import test from "node:test";
import type { IAssetsManifest, IWorldIr } from "@threenative/ir";
import * as THREE from "three";

import { pickMesh, pointerRay } from "./picking.js";

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

test("should resolve glb child hit to owning entity id", () => {
  const root = new THREE.Group();
  root.userData.entityId = "piece.wp1";
  const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  child.userData.entityId = "piece.wp1";
  root.add(child);
  root.updateWorldMatrix(true, true);

  const result = pickMesh(makeWorld(), makeAssets(), {
    direction: [0, 0, -1],
    maxDistance: 10,
    origin: [0, 0, 2],
  }, new Map([["piece.wp1", root]]));

  assert.equal(result.hit && result.entity, "piece.wp1");
});

test("should exclude glb child meshes when parent entity is ignored", () => {
  const piece = new THREE.Group();
  piece.userData.entityId = "piece.wp1";
  piece.add(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1)));
  const square = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 0.5));
  square.position.z = -2;
  square.userData.entityId = "square.behind";
  piece.updateWorldMatrix(true, true);
  square.updateWorldMatrix(true, true);

  const result = pickMesh(makeWorld(), makeAssets(), {
    direction: [0, 0, -1],
    ignore: ["piece.wp1"],
    maxDistance: 10,
    origin: [0, 0, 2],
  }, new Map<string, THREE.Object3D>([["piece.wp1", piece], ["square.behind", square]]));

  assert.equal(result.hit && result.entity, "square.behind");
});

test("should report an unowned hit without shadowing an owned hit behind it", () => {
  const unowned = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  const owned = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  unowned.position.z = 1;
  owned.position.z = -1;
  owned.userData.entityId = "piece.wp1";
  unowned.updateWorldMatrix(true, true);
  owned.updateWorldMatrix(true, true);

  const request = { direction: [0, 0, -1] as [number, number, number], maxDistance: 10, origin: [0, 0, 3] as [number, number, number] };
  const ownedResult = pickMesh(makeWorld(), makeAssets(), request, new Map<string, THREE.Object3D>([["decoration", unowned], ["piece.wp1", owned]]));
  assert.equal(ownedResult.hit && ownedResult.entity, "piece.wp1");

  const unownedResult = pickMesh(makeWorld(), makeAssets(), request, new Map<string, THREE.Object3D>([["decoration", unowned]]));
  assert.equal(unownedResult.hit && unownedResult.entity, null);
});

test("should generate a perspective pointer ray from active camera", () => {
  const result = pointerRay(makeWorld(), { pointer: [0.5, 0.5] });

  assert.deepEqual(result, {
    direction: [0, 0, -1],
    hit: true,
    maxDistance: 100,
    origin: [0, 0, 4],
  });
});

test("should generate an orthographic pointer ray with screen offset", () => {
  const result = pointerRay(makeWorld(), { aspect: 2, camera: "camera.ui", maxDistance: 25, pointer: [1, 0] });

  assert.deepEqual(result, {
    direction: [0, 0, -1],
    hit: true,
    maxDistance: 25,
    origin: [4, 2, 2],
  });
});

function makeWorld(): IWorldIr {
  return {
    entities: [
      {
        components: {
          Camera: { far: 100, fovY: 60, kind: "perspective", near: 0.1 },
          Transform: { position: [0, 0, 4] },
        },
        id: "camera.main",
      },
      {
        components: {
          Camera: { far: 50, kind: "orthographic", near: 0.1, size: 4 },
          Transform: { position: [0, 0, 2] },
        },
        id: "camera.ui",
      },
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
    resources: { ActiveCamera: { entity: "camera.main" } },
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
