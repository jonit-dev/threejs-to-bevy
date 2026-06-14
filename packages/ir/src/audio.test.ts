import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

test("audio should accept finite non-negative volumes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-volume-"));
  try {
    await writeTestBundle(root, {
      manifest: { entry: { audio: "audio.ir.json" } },
      assets: {
        schema: "threenative.assets",
        version: "0.1.0",
        assets: [
          { id: "arena.music", kind: "audio", format: "ogg", path: "assets/arena.ogg" },
          { id: "hit.sound", kind: "audio", format: "wav", path: "assets/hit.wav" },
        ],
      },
    });
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/arena.ogg"), "");
    await writeFile(join(root, "assets/hit.wav"), "");
    await writeJson(root, "audio.ir.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      music: [{ id: "music.arena", asset: "arena.music", autoplay: true, loop: true, volume: 0.4 }],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", volume: 0.75 }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("audio should reject invalid volume", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-volume-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { audio: "audio.ir.json" } } });
    await writeJson(root, "audio.ir.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      music: [{ id: "music.arena", asset: "arena.music", autoplay: true, loop: true, volume: -1 }],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", volume: Number.NaN }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_AUDIO_VOLUME_INVALID"), true);
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
