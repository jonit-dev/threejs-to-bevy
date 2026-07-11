import assert from "node:assert/strict";
import test from "node:test";
import { BoxGeometry, Matrix4 } from "three";
import { ToolingSceneRayQuery } from "./sceneRayQuery.js";

test("scene ray query should hit a unit cube from a known origin", () => {
  const query = new ToolingSceneRayQuery([{ entityId: "cube", geometry: new BoxGeometry(1, 1, 1), matrixWorld: new Matrix4() }]);
  const hit = query.raycast([0, 0, 3], [0, 0, -1], 10);

  assert.ok(hit);
  assert.equal(hit.entityId, "cube");
  assert.equal(hit.distance, 2.5);
  assert.deepEqual(hit.point, [0, 0, 0.5]);
  assert.deepEqual(hit.normal, [0, 0, 1]);
  assert.equal(query.occluded([0, 0, 3], [0, 0, 0]), true);
  assert.equal(query.occluded([0, 0, 3], [0, 3, 3]), false);
});

test("scene ray query should share one BVH while respecting instance transforms", () => {
  const geometry = new BoxGeometry(1, 1, 1);
  const query = new ToolingSceneRayQuery([
    { entityId: "cube.left", geometry, matrixWorld: new Matrix4().makeTranslation(-2, 0, 0) },
    { entityId: "cube.right", geometry, matrixWorld: new Matrix4().makeTranslation(2, 0, 0) },
  ]);

  assert.equal(query.raycast([-2, 0, 3], [0, 0, -1], 10)?.entityId, "cube.left");
  assert.equal(query.raycast([2, 0, 3], [0, 0, -1], 10)?.entityId, "cube.right");
  assert.deepEqual(query.resourceObservation(), { geometryCount: 1, instanceCount: 2 });
});
