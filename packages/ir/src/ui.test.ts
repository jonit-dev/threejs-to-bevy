import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";

test("ui should reject dom event handler", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-ui-handler-"));
  try {
    await writeBaseBundle(root);
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "pause",
        kind: "button",
        label: "Pause",
        action: "Pause",
        onClick: "window.alert('no')",
      },
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_UI_FIELD_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBaseBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "ui-test",
    requiredCapabilities: {},
    entry: { world: "world.ir.json", ui: "ui.ir.json" },
    files: {
      assets: "assets.manifest.json",
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
