import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";

test("audio should reject unknown audio asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-missing-"));
  try {
    await writeBaseBundle(root);
    await writeJson(root, "audio.ir.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      music: [],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_AUDIO_ASSET_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("audio should reject spatial and mixer fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-unsupported-"));
  try {
    await writeBaseBundle(root);
    await writeJson(root, "audio.ir.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      mixer: { master: 0.8 },
      music: [],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", position: [0, 0, 0] }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_AUDIO_FIELD_UNSUPPORTED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBaseBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "audio-test",
    requiredCapabilities: {},
    entry: { world: "world.ir.json", audio: "audio.ir.json" },
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
