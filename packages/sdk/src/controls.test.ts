import assert from "node:assert/strict";
import test from "node:test";

import { defineControls } from "./controls.js";
import { SdkError } from "./errors.js";

test("should create keyboard and gamepad movement controls", () => {
  const controls = defineControls({
    actions: [{ gamepadControls: ["buttonSouth"], id: "Interact", keys: ["Space"], pointerButtons: [0] }],
    movement: { gamepad: true },
  });

  assert.deepEqual(
    controls.axes.map((axis) => axis.id),
    ["MoveX", "MoveZ"],
  );
  assert.equal(controls.axes[0]?.value?.device, "gamepad");
  assert.equal(controls.axes[0]?.value?.required, false);
  assert.deepEqual(controls.axes[1]?.negative, [{ code: "KeyW", device: "keyboard" }]);
  assert.deepEqual(
    controls.actions.map((action) => action.id),
    ["Interact"],
  );
  assert.equal(controls.actions[0]?.bindings.length, 3);
});

test("should reject unsupported controls behavior", () => {
  assert.throws(
    () => defineControls({ unsupported: { runtimeRebinding: true } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_CONTROLS_UNSUPPORTED_RUNTIME_REBINDING",
  );
});
