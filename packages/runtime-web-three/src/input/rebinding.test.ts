import assert from "node:assert/strict";
import test from "node:test";
import type { IInputIr } from "@threenative/ir";

import { createInputState, persistBindingOverride, type IControlsSettingsStorage } from "../input.js";

test("should apply persisted keyboard rebinding override before first snapshot", () => {
  const storage = memoryStorage();
  persistBindingOverride(
    {
      actionOrAxisId: "Jump",
      control: "KeyJ",
      device: "keyboard",
      profileId: "default",
      updatedAt: "2026-06-17T00:00:00.000Z",
    },
    storage,
  );

  const input = createInputState(makeInput(), { storage });
  input.handleKeyDown({ code: "Space" });
  assert.equal(input.action("Jump"), false);

  input.handleKeyDown({ code: "KeyJ" });
  assert.equal(input.action("Jump"), true);
  assert.equal(input.pressed("Jump"), true);
});

function memoryStorage(): IControlsSettingsStorage {
  const values = new Map<string, string>();
  return {
    getItem(key) {
      return values.get(key) ?? null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
  };
}

function makeInput(): IInputIr {
  return {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "Jump", bindings: [{ code: "Space", device: "keyboard" }] }],
    axes: [],
    controlsSettings: {
      profileId: "default",
      rows: [
        {
          actionOrAxisId: "Jump",
          captureState: "idle",
          defaultBindings: [{ code: "Space", device: "keyboard" }],
          kind: "action",
          uiNodeId: "settings.jump",
        },
      ],
    },
  };
}
