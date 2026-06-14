import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

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

async function writeInputBundle(root: string): Promise<void> {
  await writeTestBundle(root, { manifest: { files: { input: "input.ir.json" } } });
}
