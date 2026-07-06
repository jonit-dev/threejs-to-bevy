import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import type { IWorldIr } from "@threenative/ir";

import {
  allocateRenderLayers,
  applyCustomProjection,
  planCameraViews,
  updateCameraHelpers,
} from "./cameras.js";

test("should update a follow camera toward its target with smoothing", () => {
  const target = new THREE.Object3D();
  target.position.set(10, 0, 0);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 0, 0);
  const objectsById = new Map<string, THREE.Object3D>([
    ["camera.main", camera],
    ["player.main", target],
  ]);
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "camera.main",
        components: {
          Camera: {
            far: 100,
            follow: { offset: [0, 2, -4], smoothing: 12, target: "player.main" },
            kind: "perspective",
            near: 0.1,
          },
        },
      },
      { id: "player.main", components: {} },
    ],
  };

  for (let step = 0; step < 30; step += 1) {
    updateCameraHelpers(world, objectsById, 1 / 60);
  }

  assert.ok(camera.position.x > 5);
  assert.ok(camera.position.x < 10);
  assert.ok(camera.position.y > 0);
  assert.ok(camera.position.z < 0);
});

test("should persist follow pose into the world transform so sync passes do not reset it", () => {
  const target = new THREE.Object3D();
  target.position.set(0, 0, -8);
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 2, 8);
  const objectsById = new Map<string, THREE.Object3D>([
    ["camera.main", camera],
    ["player.main", target],
  ]);
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "camera.main",
        components: {
          Camera: {
            far: 100,
            follow: { offset: [0, 2.4, 5.5], smoothing: 8, target: "player.main" },
            kind: "perspective",
            near: 0.1,
          },
          Transform: { position: [0, 2, 8], rotation: [0, 0, 0, 1] },
        },
      },
      { id: "player.main", components: {} },
    ],
  };

  for (let step = 0; step < 240; step += 1) {
    // Mirror the frame loop: syncTransforms re-applies the IR transform
    // before helpers run, so the helper must write its pose back to converge.
    const synced = world.entities[0]?.components.Transform;
    if (synced?.position !== undefined) {
      camera.position.set(...synced.position);
    }
    updateCameraHelpers(world, objectsById, 1 / 60);
  }

  const transform = world.entities[0]?.components.Transform;
  assert.ok(transform?.position !== undefined);
  assert.ok(Math.abs((transform?.position?.[1] ?? 0) - 2.4) < 0.1);
  assert.ok(Math.abs((transform?.position?.[2] ?? 0) - -2.5) < 0.1);
  assert.equal(transform?.rotation?.length, 4);
  assert.ok(Math.abs(camera.position.z - -2.5) < 0.1);
});

test("should allocate render layers deterministically", () => {
  const first = allocateRenderLayers(["ui", "default", "minimap"], []);
  const second = allocateRenderLayers(["minimap", "ui", "default"], []);

  assert.equal(first.get("default"), 0);
  assert.equal(second.get("default"), 0);
  assert.equal(first.get("minimap"), second.get("minimap"));
  assert.equal(first.get("ui"), second.get("ui"));
  assert.notEqual(first.get("minimap"), first.get("ui"));
});

test("should plan ordered active cameras from ActiveCameras", () => {
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "camera.left",
        components: {
          Camera: { far: 100, kind: "perspective", near: 0.1, order: 1, viewport: [0, 0, 0.5, 1] },
        },
      },
      {
        id: "camera.right",
        components: {
          Camera: { far: 100, kind: "perspective", near: 0.1, order: 2, viewport: [0.5, 0, 0.5, 1] },
        },
      },
    ],
    resources: {
      ActiveCameras: { cameras: [{ entity: "camera.right" }, { entity: "camera.left" }] },
    },
  };
  const objectsById = new Map<string, THREE.Object3D>([
    ["camera.left", new THREE.PerspectiveCamera(60, 1, 0.1, 100)],
    ["camera.right", new THREE.PerspectiveCamera(60, 1, 0.1, 100)],
  ]);

  const views = planCameraViews(world, objectsById);
  assert.deepEqual(views.map((view) => view.entityId), ["camera.left", "camera.right"]);
});

test("should apply a custom projection matrix to a web camera", () => {
  const matrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1.002, -0.2002, 0, 0, -1, 0] as const;
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  applyCustomProjection(camera, { handedness: "right", kind: "matrix", matrix });
  assert.deepEqual(camera.projectionMatrix.toArray().map((value) => Number(value.toFixed(4))), [...matrix]);
});
