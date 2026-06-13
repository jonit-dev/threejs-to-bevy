import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";

test("should reject required gamepad input binding in v2", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ir-input-"));
  try {
    await writeBaseBundle(root);
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
    await writeBaseBundle(root);
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

async function writeBaseBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "input-test",
    requiredCapabilities: {},
    entry: { world: "world.ir.json" },
    files: {
      assets: "assets.manifest.json",
      input: "input.ir.json",
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
    },
  });
  await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
