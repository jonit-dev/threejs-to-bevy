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

test("audio should accept spatial and bus routing metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-spatial-"));
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
      buses: [{ id: "bus.sfx", volume: 0.8 }],
      listeners: [{ id: "listener.main", position: [0, 1, 5] }],
      emitters: [{ id: "emitter.player", position: [1, 2, 3], radius: 12 }],
      music: [{ id: "music.arena", asset: "arena.music", autoplay: true, bus: "bus.sfx", loop: true }],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", bus: "bus.sfx", emitter: "emitter.player", event: "DamageEvent" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("audio should reject invalid spatial and bus routing metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-spatial-invalid-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { audio: "audio.ir.json" } } });
    await writeJson(root, "audio.ir.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      buses: [{ id: "bus.sfx" }],
      listeners: [{ id: "listener.main", position: [0, 1] }],
      emitters: [{ id: "emitter.player", position: [1, 2, 3], radius: -1 }],
      music: [{ id: "music.arena", asset: "arena.music", autoplay: true, bus: "missing.bus", loop: true }],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", emitter: "missing.emitter", event: "DamageEvent" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_AUDIO_BUS_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_AUDIO_EMITTER_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_AUDIO_LISTENER_POSITION_INVALID"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_AUDIO_EMITTER_RADIUS_INVALID"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("audio should reject mixer fields", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-unsupported-"));
  try {
    await writeTestBundle(root, { manifest: { entry: { audio: "audio.ir.json" } } });
    await writeJson(root, "audio.ir.json", {
      schema: "threenative.audio",
      version: "0.1.0",
      mixer: { master: 0.8 },
      streamingUrl: "https://example.invalid/arena.ogg",
      buses: [{ id: "bus.sfx", codec: "opus" }],
      listeners: [{ id: "listener.main", position: [0, 1, 5], platformHandle: "native" }],
      emitters: [{ id: "emitter.player", position: [1, 2, 3], networkUrl: "wss://example.invalid/audio" }],
      music: [{ id: "music.arena", asset: "arena.music", loop: true, stream: true }],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", platformHandle: "native" }],
    });

    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_IR_AUDIO_FIELD_UNSUPPORTED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
