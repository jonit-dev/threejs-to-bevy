import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { IInputIr, IWorldIr } from "./index.js";
import { validateBundle } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("character should accept controller with collider body and input references", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-character-valid-"));
  try {
    await writeTestBundle(root, {
      manifest: { files: { input: "input.ir.json" } },
      world: characterWorld({
        CharacterController: {
          blocking: true,
          grounding: "raycast",
          interactAction: "Interact",
          moveXAxis: "MoveX",
          moveZAxis: "MoveZ",
          speed: 4,
          stepOffset: 0.35,
        },
        Collider: { kind: "box", size: [1, 2, 1] },
        RigidBody: { kind: "kinematic" },
      }),
    });
    await writeJson(root, "input.ir.json", characterInput());

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("character should reject missing dependencies and unsupported advanced controller fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-character-invalid-"));
  try {
    await writeTestBundle(root, {
      manifest: { files: { input: "input.ir.json" } },
      world: characterWorld({
        CharacterController: {
          blocking: "yes",
          grounding: "slope",
          interactAction: "Use",
          moveXAxis: "Strafe",
          moveZAxis: "",
          navmesh: "nav.main",
          speed: 0,
          stepOffset: -0.25,
        },
      }, { transform: false }),
    });
    await writeJson(root, "input.ir.json", characterInput());

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      [
        "TN_IR_CHARACTER_FIELD_UNSUPPORTED",
        "TN_IR_CHARACTER_COLLIDER_MISSING",
        "TN_IR_CHARACTER_TRANSFORM_MISSING",
        "TN_IR_CHARACTER_BODY_MISSING",
        "TN_IR_CHARACTER_SPEED_INVALID",
        "TN_IR_CHARACTER_BLOCKING_INVALID",
        "TN_IR_CHARACTER_STEP_INVALID",
        "TN_IR_CHARACTER_GROUNDING_UNSUPPORTED",
        "TN_IR_CHARACTER_AXIS_MISSING",
        "TN_IR_CHARACTER_INPUT_REF_INVALID",
        "TN_IR_CHARACTER_ACTION_MISSING",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("character should reject controller input references without an input map", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-character-no-input-"));
  try {
    await writeTestBundle(root, {
      world: characterWorld({
        CharacterController: {
          grounding: "raycast",
          moveXAxis: "MoveX",
          moveZAxis: "MoveZ",
          speed: 4,
        },
        Collider: { kind: "box", size: [1, 2, 1] },
        RigidBody: { kind: "kinematic" },
      }),
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.deepEqual(
      result.diagnostics.map((diagnostic) => diagnostic.code),
      ["TN_IR_CHARACTER_BLOCKING_INVALID", "TN_IR_CHARACTER_INPUT_MISSING", "TN_IR_CHARACTER_INPUT_MISSING"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function characterWorld(components: Record<string, unknown>, options: { transform?: boolean } = {}): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "player",
        components: {
          ...(options.transform === false ? {} : { Transform: { position: [0, 1, 0] } }),
          ...components,
        },
      },
    ],
  };
}

function characterInput(): IInputIr {
  return {
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "Interact", bindings: [{ code: "KeyE", device: "keyboard" }] }],
    axes: [
      { id: "MoveX", negative: [{ code: "KeyA", device: "keyboard" }], positive: [{ code: "KeyD", device: "keyboard" }] },
      { id: "MoveZ", negative: [{ code: "KeyW", device: "keyboard" }], positive: [{ code: "KeyS", device: "keyboard" }] },
    ],
  };
}
