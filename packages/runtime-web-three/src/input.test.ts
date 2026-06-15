import assert from "node:assert/strict";
import test from "node:test";
import type { IInputIr } from "@threenative/ir";

import { createInputState, requestPointerLock } from "./input.js";

test("input should map wasd to move axis", () => {
  const input = createInputState(makeInput());

  input.handleKeyDown({ code: "KeyD" });
  assert.equal(input.axis("MoveX"), 1);

  input.handleKeyDown({ code: "KeyA" });
  assert.equal(input.axis("MoveX"), 0);

  input.handleKeyUp({ code: "KeyD" });
  assert.equal(input.axis("MoveX"), -1);
});

test("input should track pointer action pressed released and position", () => {
  const input = createInputState(makeInput());

  input.handlePointerMove({ clientX: 50, clientY: 25, movementX: 3 }, { height: 100, width: 200 });
  input.handlePointerDown({ button: 0 });

  assert.equal(input.axis("PointerX"), 0.25);
  assert.equal(input.axis("PointerDeltaX"), 3);
  assert.equal(input.action("Attack"), true);
  assert.equal(input.pressed("Attack"), true);

  input.beginFrame();
  assert.equal(input.pressed("Attack"), false);
  input.handlePointerUp({ button: 0 });
  assert.equal(input.released("Attack"), true);
});

test("input should map gamepad controls to actions and axes", () => {
  const input = createInputState(makeInput());

  input.handleGamepadButton("buttonSouth", true);
  input.handleGamepadAxis("leftStickX", 0.75);

  assert.equal(input.action("Interact"), true);
  assert.equal(input.pressed("Interact"), true);
  assert.equal(input.axis("GamepadMoveX"), 0.75);

  input.beginFrame();
  input.handleGamepadButton("buttonSouth", false);
  input.handleGamepadAxis("leftStickX", -2);

  assert.equal(input.released("Interact"), true);
  assert.equal(input.axis("GamepadMoveX"), -1);
});

test("input should map touch controls to actions and axes", () => {
  const input = createInputState(makeInput());

  input.handleTouchControl("jump", true);
  input.handleTouchAxis("move-stick", "x", -0.5);

  assert.equal(input.action("Jump"), true);
  assert.equal(input.axis("TouchMoveX"), -0.5);

  input.handleTouchControl("jump", false);
  input.handleTouchAxis("move-stick", "x", 2);

  assert.equal(input.action("Jump"), false);
  assert.equal(input.axis("TouchMoveX"), 1);
});

test("input should report pointer lock denied when browser rejects request", async () => {
  const state = await requestPointerLock({
    requestPointerLock: async () => {
      throw new Error("denied");
    },
  });

  assert.equal(state.status, "denied");
  assert.equal(state.diagnostics[0]?.code, "TN_WEB_POINTER_LOCK_DENIED");
});

function makeInput(): IInputIr {
  return {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [
      { id: "Attack", bindings: [{ button: 0, device: "pointer" }] },
      { id: "Interact", bindings: [{ control: "buttonSouth", device: "gamepad", required: false }] },
      { id: "Jump", bindings: [{ control: "jump", device: "touch" }] },
    ],
    axes: [
      {
        id: "MoveX",
        negative: [{ code: "KeyA", device: "keyboard" }],
        positive: [{ code: "KeyD", device: "keyboard" }],
      },
      {
        id: "PointerX",
        negative: [],
        positive: [],
        value: { axis: "x", device: "pointer" },
      },
      {
        id: "PointerDeltaX",
        negative: [],
        positive: [],
        value: { axis: "deltaX", device: "pointer" },
      },
      {
        id: "GamepadMoveX",
        negative: [],
        positive: [],
        value: { control: "leftStickX", device: "gamepad", required: false },
      },
      {
        id: "TouchMoveX",
        negative: [],
        positive: [],
        value: { axis: "x", control: "move-stick", device: "touch" },
      },
    ],
  };
}
