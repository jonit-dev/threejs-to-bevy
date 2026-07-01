import assert from "node:assert/strict";
import test from "node:test";

import { getAuthoringOperationDescriptor } from "./operationRegistry.js";
import { planAuthoringRecipe } from "./recipes.js";

test("should produce deterministic operations for third-person-controller", () => {
  const plan = planAuthoringRecipe({
    args: {
      cameraId: "camera.main",
      entityId: "player",
      sceneId: "arena",
    },
    recipeId: "third-person-controller",
  });

  assert.equal(plan.ok, true);
  assert.deepEqual(plan.operations, [
    { name: "scene.add_entity", args: { sceneId: "arena", entityId: "player" } },
    { name: "scene.set_rigid_body", args: { sceneId: "arena", entityId: "player", kind: "kinematic" } },
    { name: "scene.set_collider", args: { sceneId: "arena", entityId: "player", kind: "capsule", height: 1.8, radius: 0.35 } },
    { name: "scene.set_character_controller", args: { sceneId: "arena", entityId: "player", grounding: "raycast", moveXAxis: "MoveX", moveZAxis: "MoveZ", speed: 6 } },
    { name: "scene.set_camera_component", args: { sceneId: "arena", entityId: "camera.main", mode: "third-person-follow", targetId: "player" } },
  ]);
  assert.equal(plan.operations.every((operation) => getAuthoringOperationDescriptor(operation.name) !== undefined), true);
});

test("should report stable diagnostics for unsupported recipe ids", () => {
  const plan = planAuthoringRecipe({ args: {}, recipeId: "unknown" });

  assert.equal(plan.ok, false);
  assert.equal(plan.diagnostics[0]?.code, "TN_AUTHORING_RECIPE_UNSUPPORTED");
});
