import assert from "node:assert/strict";
import test from "node:test";

import type { AuthoringOperationArgs } from "./generatedOperations.js";
import { openProject } from "./index.js";

const cameraArgs: AuthoringOperationArgs<"scene.set_camera_component"> = {
  entityId: "camera",
  mode: "perspective",
  sceneId: "main",
};
const rigidBodyArgs: AuthoringOperationArgs<"scene.set_rigid_body"> = {
  entityId: "player",
  kind: "dynamic",
  sceneId: "main",
};

// @ts-expect-error camera mode is descriptor-enumerated, not an arbitrary string
const invalidCameraArgs: AuthoringOperationArgs<"scene.set_camera_component"> = { entityId: "camera", mode: "fish-eye", sceneId: "main" };
// @ts-expect-error entityId is required by the operation descriptor
const missingEntityArgs: AuthoringOperationArgs<"scene.add_entity"> = { sceneId: "main" };

test("operation arguments reject invalid enum and missing required fields at compile time", () => {
  assert.equal(cameraArgs.mode, "perspective");
  assert.equal(rigidBodyArgs.kind, "dynamic");
  assert.equal(invalidCameraArgs.mode, "fish-eye");
  assert.equal(missingEntityArgs.sceneId, "main");
});

test("default operation API is closed while extensions are explicit", () => {
  const project = openProject(".");
  // @ts-expect-error unknown operation names must use unsafeOperation
  project.operation("extension.custom", {});
  project.unsafeOperation("extension.custom", {});
  assert.equal(project.projectPath.length > 0, true);
});
