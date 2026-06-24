import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { sortedPersistedBindingOverrides } from "./input.js";
import { validateBundle } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("should reject required gamepad input binding in v2", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-input-"));
  try {
    await writeInputBundle(root);
    await writeJson(root, "input.ir.json", {
      schema: "threenative.input",
      version: "0.1.0",
      actions: [
        {
          id: "Attack",
          bindings: [{ device: "gamepad", control: "buttonSouth", required: true }],
        },
      ],
      axes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_INPUT_GAMEPAD_UNSUPPORTED_V2");
    assert.equal(result.diagnostics[0]?.path, "input.ir.json/actions/0/bindings/0");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject duplicate input binding", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-input-duplicate-"));
  try {
    await writeInputBundle(root);
    await writeJson(root, "input.ir.json", {
      schema: "threenative.input",
      version: "0.1.0",
      actions: [
        {
          id: "Pause",
          bindings: [
            { device: "keyboard", code: "Escape" },
            { device: "keyboard", code: "Escape" },
          ],
        },
      ],
      axes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_INPUT_BINDING_DUPLICATE");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported richer touch and gamepad gesture declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-input-gestures-"));
  try {
    await writeInputBundle(root);
    await writeJson(root, "input.ir.json", {
      schema: "threenative.input",
      version: "0.1.0",
      gestureRecognizers: [{ kind: "longPress", thresholdMs: 450 }],
      actions: [
        {
          id: "Inspect",
          bindings: [{ device: "touch", control: "inspect", gesture: "longPress" }],
        },
        {
          id: "Combo",
          bindings: [{ device: "gamepad", control: "buttonSouth", required: false, chord: ["buttonNorth"] }],
        },
      ],
      axes: [],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_IR_INPUT_GESTURE_UNSUPPORTED").map((diagnostic) => diagnostic.path),
      [
        "input.ir.json/gestureRecognizers",
        "input.ir.json/actions/0/bindings/0/gesture",
        "input.ir.json/actions/1/bindings/0/chord",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should validate input persisted binding override records when controls are declared", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-input-overrides-"));
  try {
    await writeInputBundle(root);
    const overrides = sortedPersistedBindingOverrides([
      {
        actionOrAxisId: "MoveX",
        axisSlot: "positive",
        control: "KeyL",
        device: "keyboard",
        modifiers: ["Shift", "Alt"],
        profileId: "default",
        updatedAt: "2026-06-17T00:00:00.000Z",
      },
      {
        actionOrAxisId: "Jump",
        control: "KeyJ",
        device: "keyboard",
        profileId: "default",
        updatedAt: "2026-06-17T00:00:01.000Z",
      },
    ]);
    await writeJson(root, "input.ir.json", {
      schema: "threenative.input",
      version: "0.1.0",
      actions: [{ id: "Jump", bindings: [{ device: "keyboard", code: "Space" }] }],
      axes: [{ id: "MoveX", negative: [{ device: "keyboard", code: "KeyA" }], positive: [{ device: "keyboard", code: "KeyD" }] }],
      controlsSettings: {
        profileId: "default",
        rows: [
          {
            actionOrAxisId: "Jump",
            captureState: "idle",
            defaultBindings: [{ device: "keyboard", code: "Space" }],
            kind: "action",
            uiNodeId: "settings.jump",
          },
          {
            actionOrAxisId: "MoveX",
            axisSlot: "positive",
            captureState: "idle",
            defaultBindings: [{ device: "keyboard", code: "KeyD" }],
            kind: "axis",
            uiNodeId: "settings.moveX.positive",
          },
        ],
      },
      persistedBindingOverrides: overrides,
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
    assert.deepEqual(overrides.map((override) => `${override.actionOrAxisId}:${override.axisSlot ?? ""}:${override.control}`), [
      "Jump::KeyJ",
      "MoveX:positive:KeyL",
    ]);
    assert.deepEqual(overrides[0]?.modifiers, undefined);
    assert.deepEqual(overrides[1]?.modifiers, ["Alt", "Shift"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject input persisted binding override when action is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-input-overrides-missing-"));
  try {
    await writeInputBundle(root);
    await writeJson(root, "input.ir.json", {
      schema: "threenative.input",
      version: "0.1.0",
      actions: [{ id: "Jump", bindings: [{ device: "keyboard", code: "Space" }] }],
      axes: [],
      controlsSettings: {
        profileId: "default",
        rows: [
          {
            actionOrAxisId: "Jump",
            captureState: "idle",
            defaultBindings: [{ device: "keyboard", code: "Space" }],
            kind: "action",
            uiNodeId: "settings.jump",
          },
        ],
      },
      persistedBindingOverrides: [
        {
          actionOrAxisId: "Dash",
          control: "KeyJ",
          device: "keyboard",
          profileId: "default",
          updatedAt: "2026-06-17T00:00:00.000Z",
        },
      ],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_INPUT_OVERRIDE_TARGET_MISSING");
    assert.equal(result.diagnostics[0]?.path, "input.ir.json/persistedBindingOverrides/0/actionOrAxisId");
    assert.match(result.diagnostics[0]?.suggestion ?? "", /Declare 'Dash'/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeInputBundle(root: string): Promise<void> {
  await writeTestBundle(root, { manifest: { files: { input: "input.ir.json" } } });
}
