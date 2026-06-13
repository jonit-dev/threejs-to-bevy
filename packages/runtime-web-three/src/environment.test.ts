import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import { applyEnvironmentBookmark, createEnvironmentRuntime } from "./environment.js";
import type { IWebBundle } from "./loadBundle.js";

test("environment should apply the instancing plan during forest load", () => {
  const runtime = createEnvironmentRuntime({
    environmentScene: {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      sourceAssets: [{ asset: "model.env.Rock", category: "rock", id: "env.Rock" }],
      terrain: { bounds: { min: [-5, 0, -5], max: [5, 0, 5] }, heightMode: "flat", id: "terrain.forest" },
      bookmarks: [{ expectedTags: ["rock"], id: "bookmark.start", pitch: -5, position: [0, 1.7, 4], yaw: 180 }],
      instances: [
        { id: "rock.hero", kind: "hero", sourceAsset: "env.Rock", position: [3, 0, 0], tags: ["rock"] },
        { id: "rock.1", kind: "scatter", sourceAsset: "env.Rock", position: [0, 0, 0], tags: ["rock"] },
        { id: "rock.2", kind: "scatter", sourceAsset: "env.Rock", position: [1, 0, 0], tags: ["rock"] },
      ],
      path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
    },
  } as unknown as IWebBundle);

  assert.equal(runtime?.instancingPlan.groups.length, 1);
  assert.equal(runtime?.object.children.some((child) => child instanceof THREE.InstancedMesh), true);
  assert.equal(runtime?.observation.terrain?.id, "terrain.forest");
  assert.deepEqual(runtime?.observation.heroPlacementIds, ["rock.hero"]);
  assert.equal(runtime?.observation.scatterCountsByTag.rock, 2);
  assert.deepEqual(runtime?.observation.bookmarks, ["bookmark.start"]);
});

test("environment should apply bookmark camera position and yaw convention", () => {
  const bundle = {
    environmentScene: {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      sourceAssets: [],
      terrain: { bounds: { min: [-5, 0, -5], max: [5, 0, 5] }, heightMode: "flat", id: "terrain.forest" },
      bookmarks: [{ id: "bookmark.start", pitch: -5, position: [0, 1.7, 4], yaw: 180 }],
      instances: [],
      path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
    },
  } as unknown as IWebBundle;
  const camera = new THREE.PerspectiveCamera();

  assert.equal(applyEnvironmentBookmark(bundle, camera, "bookmark.start"), true);

  assert.deepEqual(camera.position.toArray(), [0, 1.7, 4]);
  assert.equal(camera.rotation.y, 0);
});

test("environment should render terrain control points as a non-flat mesh", () => {
  const runtime = createEnvironmentRuntime({
    environmentScene: {
      schema: "threenative.environment-scene",
      version: "0.1.0",
      sourceAssets: [],
      terrain: {
        bounds: { min: [-4, 0, -4], max: [4, 0, 4] },
        controlPoints: [[0, 0.8, 0], [4, -0.2, 4]],
        heightMode: "controlPoints",
        id: "terrain.rolling",
      },
      instances: [],
      path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
    },
  } as unknown as IWebBundle);
  const terrain = runtime?.object.children.find((child) => child.name === "terrain:terrain.rolling");

  assert.equal(terrain instanceof THREE.Mesh, true);
  const position = (terrain as THREE.Mesh<THREE.BufferGeometry>).geometry.getAttribute("position");
  const heights = new Set(Array.from({ length: position.count }, (_, index) => position.getY(index).toFixed(3)));
  assert.equal(heights.size > 1, true);
});
