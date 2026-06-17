import assert from "node:assert/strict";
import test from "node:test";
import { action, axis, controlsSettings, defineInputMap, keyboard, pointerButton, touchControl } from "@threenative/sdk";

import { inputToIr } from "./input.js";

test("should emit arena input map", () => {
  const input = defineInputMap({
    actions: [action("Attack", [pointerButton(0)]), action("Pause", [keyboard("Escape")])],
    axes: [
      axis("MoveX", { negative: [keyboard("KeyA")], positive: [keyboard("KeyD")], value: touchControl("move-stick", "x") }),
      axis("MoveY", { negative: [keyboard("KeyS")], positive: [keyboard("KeyW")], value: touchControl("move-stick", "y") }),
    ],
  });

  assert.deepEqual(inputToIr(input), {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [
      { id: "Attack", bindings: [{ button: 0, device: "pointer" }] },
      { id: "Pause", bindings: [{ code: "Escape", device: "keyboard" }] },
    ],
    axes: [
      {
        id: "MoveX",
        negative: [{ code: "KeyA", device: "keyboard" }],
        positive: [{ code: "KeyD", device: "keyboard" }],
        value: { axis: "x", control: "move-stick", device: "touch" },
      },
      {
        id: "MoveY",
        negative: [{ code: "KeyS", device: "keyboard" }],
        positive: [{ code: "KeyW", device: "keyboard" }],
        value: { axis: "y", control: "move-stick", device: "touch" },
      },
    ],
  });
});

test("should emit input controls settings metadata for retained ui rebind rows", () => {
  const input = defineInputMap({
    actions: [action("Jump", [keyboard("Space")])],
    axes: [axis("MoveX", { negative: [keyboard("KeyA")], positive: [keyboard("KeyD")] })],
    controlsSettings: controlsSettings({
      profileId: "default",
      rows: [
        {
          actionOrAxisId: "MoveX",
          axisSlot: "positive",
          defaultBindings: [keyboard("KeyD")],
          kind: "axis",
          uiNodeId: "settings.moveX.positive",
        },
        {
          actionOrAxisId: "Jump",
          defaultBindings: [keyboard("Space")],
          kind: "action",
          uiNodeId: "settings.jump",
        },
      ],
    }),
    persistedBindingOverrides: [
      {
        actionOrAxisId: "Jump",
        control: "KeyJ",
        device: "keyboard",
        profileId: "default",
        updatedAt: "2026-06-17T00:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(inputToIr(input).controlsSettings, {
    profileId: "default",
    rows: [
      {
        actionOrAxisId: "Jump",
        captureState: "idle",
        defaultBindings: [{ code: "Space", device: "keyboard" }],
        kind: "action",
        uiNodeId: "settings.jump",
      },
      {
        actionOrAxisId: "MoveX",
        axisSlot: "positive",
        captureState: "idle",
        defaultBindings: [{ code: "KeyD", device: "keyboard" }],
        kind: "axis",
        uiNodeId: "settings.moveX.positive",
      },
    ],
  });
  assert.deepEqual(inputToIr(input).persistedBindingOverrides, [
    {
      actionOrAxisId: "Jump",
      control: "KeyJ",
      device: "keyboard",
      profileId: "default",
      updatedAt: "2026-06-17T00:00:00.000Z",
    },
  ]);
});
