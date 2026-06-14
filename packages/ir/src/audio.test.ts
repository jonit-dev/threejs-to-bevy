import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";
import { writeJson, writeTestBundle } from "./testFixtures.js";

test("audio should reject unknown audio asset", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-missing-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { audio: "audio.ir.json" } } });
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
    await writeTestBundle(root, { manifest: { entry: { audio: "audio.ir.json" } } });
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
