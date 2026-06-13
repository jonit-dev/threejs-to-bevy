import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadBundle } from "./loadBundle.js";

test("loadBundle should load optional ui ir", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-ui-bundle-"));
  try {
    await writeJson(root, "manifest.json", {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "ui",
      requiredCapabilities: {},
      entry: { world: "world.ir.json", ui: "ui.ir.json" },
      files: {
        assets: "assets.manifest.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
      },
    });
    await writeJson(root, "world.ir.json", {
      schema: "threenative.world",
      version: "0.1.0",
      entities: [],
      resources: {},
    });
    await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
    await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
    await writeJson(root, "target.profile.json", {
      schema: "threenative.target-profile",
      version: "0.1.0",
      targets: ["web"],
    });
    await writeJson(root, "ui.ir.json", {
      schema: "threenative.ui",
      version: "0.1.0",
      root: {
        id: "hud",
        kind: "stack",
        children: [{ id: "hud.pause", kind: "button", action: "Pause", label: "Pause" }],
      },
    });

    const bundle = await loadBundle(root);

    assert.equal(bundle.ui?.root.children?.[0]?.kind, "button");
    assert.equal(bundle.ui?.root.children?.[0]?.action, "Pause");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), `${JSON.stringify(value)}\n`);
}
