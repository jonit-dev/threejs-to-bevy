import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";

test("assets should reject missing asset path", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-missing-"));
  try {
    await writeBaseBundle(root);
    await writeJson(root, "assets.manifest.json", {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [{ id: "tex.missing", kind: "texture", format: "png", path: "assets/missing.png" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_ASSET_PATH_MISSING");
    assert.equal(result.diagnostics[0]?.path, "assets.manifest.json/assets/0/path");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("assets should reject unknown texture asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-assets-texture-"));
  try {
    await writeBaseBundle(root);
    await writeJson(root, "materials.ir.json", {
      schema: "threenative.materials",
      version: "0.1.0",
      materials: [{ id: "mat.crate", kind: "standard", color: "#ffffff", baseColorTexture: "tex.unknown" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBaseBundle(root: string): Promise<void> {
  await mkdir(join(root, "assets"), { recursive: true });
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "asset-test",
    requiredCapabilities: {},
    entry: { world: "world.ir.json" },
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
