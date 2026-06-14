import assert from "node:assert/strict";
import test from "node:test";

import { characterController } from "./character.js";
import { SdkError } from "./errors.js";

test("should create deterministic character controller metadata", () => {
  const controller = characterController({ interactAction: "Interact", speed: 5, stepOffset: 0.35 });

  assert.equal(controller.schema.name, "CharacterController");
  assert.deepEqual(controller.data, {
    blocking: true,
    grounding: "raycast",
    interactAction: "Interact",
    moveXAxis: "MoveX",
    moveZAxis: "MoveZ",
    speed: 5,
    stepOffset: 0.35,
  });
});

test("should reject unsupported advanced character options", () => {
  assert.throws(
    () => characterController({ unsupported: { navmesh: true } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_CHARACTER_NAVMESH_UNSUPPORTED",
  );
  assert.throws(
    () => characterController({ unsupported: { slopeLimit: 45 } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_CHARACTER_SLOPE_UNSUPPORTED",
  );
  assert.throws(
    () => characterController({ stepOffset: -0.1 }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_CHARACTER_STEP_INVALID",
  );
});
