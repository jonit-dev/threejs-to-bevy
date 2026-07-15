import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import type { ICameraViewPlan } from "./cameras.js";
import {
  createWebMeshLodRuntime,
  meshLodGeometries,
  registerWebMeshLod,
  selectMeshLodLevel,
  traceWebMeshLod,
  updateWebMeshLod,
} from "./meshLod.js";

test("should select base and last reached LOD threshold", () => {
  const levels = [{ id: "lod.1", minDistance: 10 }, { id: "lod.2", minDistance: 20 }];
  assert.equal(selectMeshLodLevel(levels, 9.999), undefined);
  assert.equal(selectMeshLodLevel(levels, 10)?.id, "lod.1");
  assert.equal(selectMeshLodLevel(levels, 20)?.id, "lod.2");
  assert.equal(selectMeshLodLevel(levels, 100)?.id, "lod.2");
});

test("should use closest rendered camera and world-space hierarchy positions", () => {
  const { runtime, mesh, lod1, lod2 } = fixture();
  const parent = new THREE.Object3D();
  parent.position.set(100, 0, 0);
  mesh.position.set(5, 0, 0);
  parent.add(mesh);
  const far = new THREE.PerspectiveCamera();
  far.position.set(200, 0, 0);
  const closeParent = new THREE.Object3D();
  closeParent.position.set(100, 0, 0);
  const close = new THREE.PerspectiveCamera();
  close.position.set(14, 0, 0);
  closeParent.add(close);

  updateWebMeshLod(runtime, [view("camera.far"), view("camera.close")], new Map([
    ["camera.far", far],
    ["camera.close", close],
  ]));

  assert.equal(mesh.geometry, lod1);
  assert.deepEqual(traceWebMeshLod(runtime), [{
    distance: 9,
    entity: "prop",
    selectedMesh: "mesh.prop.lod.1",
    threshold: 5,
  }]);
  assert.notEqual(mesh.geometry, lod2);
});

test("should keep the base mesh with a null distance when no rendered camera is valid", () => {
  const { runtime, mesh, base } = fixture();
  updateWebMeshLod(runtime, [view("camera.missing")], new Map());
  assert.equal(mesh.geometry, base);
  assert.deepEqual(traceWebMeshLod(runtime), [{
    distance: null,
    entity: "prop",
    selectedMesh: "mesh.prop",
    threshold: 0,
  }]);
});

test("should avoid geometry reassignment when the selected level is unchanged", () => {
  const { runtime, mesh, lod1 } = fixture();
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(6, 0, 0);
  updateWebMeshLod(runtime, [view("camera")], new Map([["camera", camera]]));
  const selected = mesh.geometry;
  updateWebMeshLod(runtime, [view("camera")], new Map([["camera", camera]]));
  assert.equal(selected, lod1);
  assert.equal(mesh.geometry, selected);
});

test("should retain all cached geometries for entity teardown", () => {
  const { mesh, base, lod1, lod2 } = fixture();
  assert.deepEqual(meshLodGeometries(mesh), [base, lod1, lod2]);
});

test("should sort traces and derive selected assets from installed geometries", () => {
  const first = fixture();
  const secondMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  const secondLod = new THREE.BufferGeometry();
  registerWebMeshLod(first.runtime, {
    base: { geometry: secondMesh.geometry, mesh: "mesh.alpha" },
    entity: "alpha",
    levels: [{ geometry: secondLod, mesh: "mesh.alpha.lod.1", minDistance: 5 }],
    object: secondMesh,
  });
  secondMesh.geometry = secondLod;

  assert.deepEqual(traceWebMeshLod(first.runtime).map((entry) => [entry.entity, entry.selectedMesh, entry.threshold]), [
    ["alpha", "mesh.alpha.lod.1", 5],
    ["prop", "mesh.prop", 0],
  ]);
});

function fixture(): {
  base: THREE.BufferGeometry;
  lod1: THREE.BufferGeometry;
  lod2: THREE.BufferGeometry;
  mesh: THREE.Mesh;
  runtime: ReturnType<typeof createWebMeshLodRuntime>;
} {
  const base = new THREE.BufferGeometry();
  const lod1 = new THREE.BufferGeometry();
  const lod2 = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(base, new THREE.MeshBasicMaterial());
  const runtime = createWebMeshLodRuntime();
  registerWebMeshLod(runtime, {
    base: { geometry: base, mesh: "mesh.prop" },
    entity: "prop",
    levels: [
      { geometry: lod1, mesh: "mesh.prop.lod.1", minDistance: 5 },
      { geometry: lod2, mesh: "mesh.prop.lod.2", minDistance: 10 },
    ],
    object: mesh,
  });
  return { base, lod1, lod2, mesh, runtime };
}

function view(entityId: string): ICameraViewPlan {
  return {
    cameraId: entityId,
    entityId,
    layers: ["default"],
    order: 0,
    targetKind: "backbuffer",
  };
}
