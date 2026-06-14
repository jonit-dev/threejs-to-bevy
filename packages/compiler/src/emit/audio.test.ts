import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, audioAsset, audioBus, audioListener, audioPlaybackControl, defineAudio, loopingMusic, oneShotSound, spatialAudioEmitter } from "@threenative/sdk";
import { validateBundle } from "@threenative/ir";

import { emitAudio } from "./audio.js";
import { emitBundle } from "./bundle.js";

test("audio should emit hit sound and looping music", () => {
  const audio = emitAudio(
    defineAudio({
      music: [loopingMusic("music.arena", { asset: "arena.music", volume: 0.4 })],
      oneShots: [oneShotSound("sound.hit", { asset: "hit.sound", event: "DamageEvent", volume: 0.75 })],
    }),
  );

  assert.equal(audio.schema, "threenative.audio");
  assert.deepEqual(audio.oneShots, [{ asset: "hit.sound", event: "DamageEvent", id: "sound.hit", volume: 0.75 }]);
  assert.deepEqual(audio.music, [{ asset: "arena.music", autoplay: true, id: "music.arena", loop: true, volume: 0.4 }]);
});

test("audio should emit spatial and bus routing metadata", () => {
  const audio = emitAudio(
    defineAudio({
      buses: [audioBus("bus.sfx", { volume: 0.8 })],
      emitters: [spatialAudioEmitter("emitter.player", { position: [1, 2, 3], radius: 12 })],
      listeners: [audioListener("listener.main", { position: [0, 1, 5] })],
      music: [loopingMusic("music.arena", { asset: "arena.music", bus: "bus.sfx" })],
      oneShots: [oneShotSound("sound.hit", { asset: "hit.sound", bus: "bus.sfx", emitter: "emitter.player", event: "DamageEvent" })],
    }),
  );

  assert.deepEqual(audio.buses, [{ id: "bus.sfx", volume: 0.8 }]);
  assert.deepEqual(audio.emitters, [{ id: "emitter.player", position: [1, 2, 3], radius: 12 }]);
  assert.deepEqual(audio.listeners, [{ id: "listener.main", position: [0, 1, 5] }]);
  assert.equal(audio.music[0]?.bus, "bus.sfx");
  assert.equal(audio.oneShots[0]?.emitter, "emitter.player");
});

test("audio should emit playback controls", () => {
  const audio = emitAudio(
    defineAudio({
      controls: [
        audioPlaybackControl("music.pause", { kind: "pause", target: "music.arena" }),
        audioPlaybackControl("music.seek", { at: 10, kind: "seek", target: "music.arena" }),
      ],
      music: [loopingMusic("music.arena", { asset: "arena.music" })],
    }),
  );

  assert.deepEqual(audio.controls, [
    { id: "music.pause", kind: "pause", target: "music.arena" },
    { at: 10, id: "music.seek", kind: "seek", target: "music.arena" },
  ]);
});

test("audio should emit bundle assets and validate playback declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-audio-bundle-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/hit.wav"), "");
    await writeFile(join(root, "assets/arena.ogg"), "");

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      {
        audio: defineAudio({
          music: [loopingMusic("music.arena", { asset: audioAsset("arena.music", "assets/arena.ogg") })],
          oneShots: [oneShotSound("sound.hit", { asset: audioAsset("hit.sound", "assets/hit.wav"), event: "DamageEvent" })],
        }),
        scene: makeScene(),
      },
    );

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8"));
    const audio = JSON.parse(await readFile(join(bundlePath, "audio.ir.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(manifest.entry.audio, "audio.ir.json");
    assert.deepEqual(
      assets.assets.filter((asset: { kind: string }) => asset.kind === "audio").map((asset: { id: string }) => asset.id),
      ["arena.music", "hit.sound"],
    );
    assert.equal(audio.oneShots[0].asset, "hit.sound");
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeScene(): Scene {
  const scene = new Scene({ id: "scene" });
  scene.add(
    new Mesh({
      geometry: new BoxGeometry(),
      id: "cube",
      material: new MeshStandardMaterial({ color: "#ffffff" }),
    }),
  );
  return scene;
}
