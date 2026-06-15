import assert from "node:assert/strict";
import test from "node:test";
import type { IInputIr } from "@threenative/ir";

import { createDragPickingRecognizer, createInputState, createTouchGestureRecognizer, rebindInput, reportGamepadCapabilities, requestPointerLock } from "./input.js";

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

test("input should report gamepad capabilities and diagnostics", () => {
  const report = reportGamepadCapabilities(makeInput(), {
    getGamepads: () => [
      {
        axes: [0, 0],
        buttons: [{ pressed: false, touched: false, value: 0 }],
        connected: true,
        hapticActuators: [],
        id: "Standard Controller",
        index: 0,
        mapping: "standard",
        timestamp: 1,
        vibrationActuator: null,
      } as unknown as Gamepad,
    ],
  });

  assert.deepEqual(report.connected, [{ axes: 2, buttons: 1, id: "Standard Controller", index: 0, mapping: "standard" }]);
  assert.deepEqual(report.declaredControls, [
    { control: "buttonSouth", kind: "button", required: false },
    { control: "leftStickX", kind: "axis", required: false },
  ]);
  assert.deepEqual(report.diagnostics, []);
  assert.equal(report.supported, true);
});

test("input should report missing gamepad api and unknown controls", () => {
  const report = reportGamepadCapabilities({
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "Cheat", bindings: [{ control: "turbo", device: "gamepad" }] }],
    axes: [],
  }, {});

  assert.equal(report.supported, false);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_WEB_GAMEPAD_API_UNAVAILABLE"), true);
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_WEB_GAMEPAD_CONTROL_UNKNOWN" && diagnostic.severity === "error"), true);
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

test("input should recognize tap swipe and pinch gestures", () => {
  const recognizer = createTouchGestureRecognizer();

  assert.deepEqual(recognizer.update({ timeMs: 0, touches: [{ id: 1, x: 10, y: 10 }] }), []);
  assert.deepEqual(recognizer.update({ timeMs: 120, touches: [] }), [
    { durationMs: 120, id: 1, kind: "tap", x: 10, y: 10 },
  ]);

  recognizer.update({ timeMs: 200, touches: [{ id: 2, x: 10, y: 10 }] });
  recognizer.update({ timeMs: 260, touches: [{ id: 2, x: 80, y: 15 }] });
  assert.deepEqual(recognizer.update({ timeMs: 320, touches: [] }), [
    { deltaX: 70, deltaY: 5, direction: "right", durationMs: 120, id: 2, kind: "swipe" },
  ]);

  recognizer.update({ timeMs: 400, touches: [{ id: 3, x: 0, y: 0 }, { id: 4, x: 10, y: 0 }] });
  recognizer.update({ timeMs: 460, touches: [{ id: 3, x: -5, y: 0 }, { id: 4, x: 15, y: 0 }] });
  assert.deepEqual(recognizer.update({ timeMs: 520, touches: [] }), [
    { centerX: 5, centerY: 0, distance: 20, durationMs: 120, kind: "pinch", scale: 2 },
  ]);
});

test("input should rebind actions and axes without mutating source maps", () => {
  const source = makeInput();
  const actionRebind = rebindInput(source, { id: "Attack", kind: "action" }, { code: "KeyF", device: "keyboard" });
  const axisRebind = rebindInput(actionRebind.input, { id: "MoveX", kind: "axis", slot: "positive" }, { code: "ArrowRight", device: "keyboard" });

  assert.deepEqual(actionRebind.diagnostics, []);
  assert.deepEqual(axisRebind.diagnostics, []);
  assert.deepEqual(axisRebind.input.actions.find((action) => action.id === "Attack")?.bindings, [{ code: "KeyF", device: "keyboard" }]);
  assert.deepEqual(axisRebind.input.axes.find((axis) => axis.id === "MoveX")?.positive, [{ code: "ArrowRight", device: "keyboard" }]);
  assert.deepEqual(source.actions.find((action) => action.id === "Attack")?.bindings, [{ button: 0, device: "pointer" }]);
});

test("input should report rebinding diagnostics", () => {
  const missing = rebindInput(makeInput(), { id: "Missing", kind: "action" }, { code: "KeyF", device: "keyboard" });
  const duplicate = rebindInput(makeInput(), { id: "Attack", kind: "action" }, { code: "KeyD", device: "keyboard" });
  const gamepad = rebindInput(makeInput(), { id: "Attack", kind: "action" }, { control: "buttonNorth", device: "gamepad" });

  assert.equal(missing.diagnostics[0]?.code, "TN_INPUT_REBIND_ACTION_MISSING");
  assert.equal(duplicate.diagnostics.some((diagnostic) => diagnostic.code === "TN_INPUT_REBIND_DUPLICATE"), true);
  assert.equal(gamepad.diagnostics.some((diagnostic) => diagnostic.code === "TN_INPUT_REBIND_GAMEPAD_REQUIRED" && diagnostic.severity === "warning"), true);
});

test("input should ignore slow or tiny touch movement", () => {
  const recognizer = createTouchGestureRecognizer();

  recognizer.update({ timeMs: 0, touches: [{ id: 1, x: 0, y: 0 }] });
  recognizer.update({ timeMs: 900, touches: [{ id: 1, x: 30, y: 0 }] });

  assert.deepEqual(recognizer.update({ timeMs: 950, touches: [] }), []);
});

test("input should recognize drag and drop picking events", () => {
  const recognizer = createDragPickingRecognizer({ moveThreshold: 0.05 });

  assert.deepEqual(recognizer.update({ buttonDown: true, pickedEntity: "crate", pointer: [0.1, 0.1], timeMs: 0 }), []);
  assert.deepEqual(recognizer.update({ buttonDown: true, pickedEntity: "crate", pointer: [0.12, 0.11], timeMs: 16 }), []);
  assert.deepEqual(recognizer.update({ buttonDown: true, pickedEntity: "floor", pointer: [0.2, 0.16], timeMs: 32 }), [
    { entity: "crate", kind: "start", pointer: [0.1, 0.1], timeMs: 32 },
    { delta: [0.1, 0.06], entity: "crate", kind: "move", pointer: [0.2, 0.16], timeMs: 32 },
  ]);
  assert.deepEqual(recognizer.update({ buttonDown: false, pickedEntity: "floor", pointer: [0.25, 0.2], timeMs: 48 }), [
    { delta: [0.15, 0.1], entity: "crate", kind: "drop", pointer: [0.25, 0.2], target: "floor", timeMs: 48 },
  ]);
});

test("input should cancel picked drag before threshold", () => {
  const recognizer = createDragPickingRecognizer({ moveThreshold: 0.05 });

  recognizer.update({ buttonDown: true, pickedEntity: "crate", pointer: [0.1, 0.1], timeMs: 0 });

  assert.deepEqual(recognizer.update({ buttonDown: false, pointer: [0.11, 0.11], timeMs: 16 }), [
    { entity: "crate", kind: "cancel", pointer: [0.11, 0.11], timeMs: 16 },
  ]);
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
