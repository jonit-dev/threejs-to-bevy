import assert from "node:assert/strict";
import test from "node:test";
import type { IInputIr } from "@threenative/ir";

import { createInputState } from "./input.js";

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

function makeInput(): IInputIr {
  return {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "Attack", bindings: [{ button: 0, device: "pointer" }] }],
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
    ],
  };
}
