import assert from "node:assert/strict";
import test from "node:test";

import { audioBus, audioDuckingRule, audioListener, audioPlaybackControl, defineAudio, generatedTone, loopingMusic, musicTransition, oneShotSound, spatialAudioEmitter } from "./audio.js";

test("audio helpers should preserve optional volume", () => {
  assert.deepEqual(loopingMusic("music.arena", { asset: "arena.music", volume: 0.4 }), {
    asset: "arena.music",
    autoplay: true,
    id: "music.arena",
    loop: true,
    volume: 0.4,
  });
  assert.deepEqual(oneShotSound("sound.hit", { asset: "hit.sound", event: "DamageEvent", volume: 0.75 }), {
    asset: "hit.sound",
    event: "DamageEvent",
    id: "sound.hit",
    volume: 0.75,
  });
});

test("audio helpers should preserve spatial and bus routing metadata", () => {
  const audio = defineAudio({
    buses: [audioBus("bus.sfx", { volume: 0.8 }), audioBus("bus.music", { volume: 0.4 })],
    emitters: [spatialAudioEmitter("emitter.player", { position: [1, 2, 3], radius: 12 })],
    listeners: [audioListener("listener.main", { position: [0, 1, 5] })],
    music: [loopingMusic("music.arena", { asset: "arena.music", bus: "bus.music" })],
    oneShots: [oneShotSound("sound.hit", { asset: "hit.sound", bus: "bus.sfx", emitter: "emitter.player", event: "DamageEvent" })],
  });

  assert.deepEqual(audio.buses, [
    { id: "bus.music", volume: 0.4 },
    { id: "bus.sfx", volume: 0.8 },
  ]);
  assert.deepEqual(audio.emitters, [{ id: "emitter.player", position: [1, 2, 3], radius: 12 }]);
  assert.deepEqual(audio.listeners, [{ id: "listener.main", position: [0, 1, 5] }]);
  assert.equal(audio.music[0]?.bus, "bus.music");
  assert.equal(audio.oneShots[0]?.bus, "bus.sfx");
  assert.equal(audio.oneShots[0]?.emitter, "emitter.player");
});

test("audio helpers should preserve playback controls", () => {
  const audio = defineAudio({
    controls: [
      audioPlaybackControl("music.pause", { kind: "pause", target: "music.arena" }),
      audioPlaybackControl("music.seek", { at: 12.5, kind: "seek", target: "music.arena" }),
      audioPlaybackControl("music.query", { kind: "query", target: "music.arena" }),
    ],
    music: [loopingMusic("music.arena", { asset: "arena.music" })],
  });

  assert.deepEqual(audio.controls, [
    { id: "music.pause", kind: "pause", target: "music.arena" },
    { id: "music.query", kind: "query", target: "music.arena" },
    { at: 12.5, id: "music.seek", kind: "seek", target: "music.arena" },
  ]);
});

test("should capture attenuation and music transitions when audio declarations are valid", () => {
  const audio = defineAudio({
    buses: [
      audioBus("bus.master", { gain: 1 }),
      audioBus("bus.music", { gain: 0.8, parent: "bus.master" }),
      audioBus("bus.sfx", { mute: false, solo: false, volume: 0.9 }),
    ],
    duckingRules: [audioDuckingRule("duck.music", { attack: 0.05, gain: 0.35, release: 0.2, sourceBus: "bus.sfx", targetBus: "bus.music" })],
    emitters: [spatialAudioEmitter("emitter.alarm", { attenuation: { curve: "inverse", maxDistance: 24, minDistance: 1, rolloffFactor: 1 }, position: [2, 0, 0] })],
    listeners: [audioListener("listener.main", { binding: { kind: "activeCamera" }, position: [0, 0, 0] })],
    music: [
      loopingMusic("music.intro", { asset: "intro.music", bus: "bus.music", pitch: 1 }),
      loopingMusic("music.loop", { asset: "loop.music", bus: "bus.music" }),
    ],
    musicTransitions: [
      musicTransition("transition.intro", { duration: 1.5, kind: "intro", playbackId: "music.state.intro", state: "menu", to: "music.intro" }),
      musicTransition("transition.loop", { duration: 2, from: "music.intro", kind: "crossfade", playbackId: "music.state.loop", state: "playing", to: "music.loop" }),
    ],
    oneShots: [oneShotSound("sound.alarm", { asset: "alarm.sound", bus: "bus.sfx", emitter: "emitter.alarm", event: "AlarmEvent", pitch: 1.25 })],
    tones: [generatedTone("tone.confirm", { bus: "bus.sfx", duration: 0.25, frequency: 880, volume: 0.2, waveform: "sine" })],
  });

  assert.deepEqual(audio.listeners[0]?.binding, { kind: "activeCamera" });
  assert.deepEqual(audio.emitters[0]?.attenuation, { curve: "inverse", maxDistance: 24, minDistance: 1, rolloffFactor: 1 });
  assert.equal(audio.buses.find((bus) => bus.id === "bus.music")?.parent, "bus.master");
  assert.equal(audio.duckingRules[0]?.targetBus, "bus.music");
  assert.equal(audio.oneShots[0]?.pitch, 1.25);
  assert.equal(audio.tones[0]?.waveform, "sine");
  assert.equal(audio.musicTransitions[1]?.kind, "crossfade");
});

test("audio helpers should reject missing spatial and bus route metadata", () => {
  assert.throws(() => defineAudio({ music: [loopingMusic("music.arena", { asset: "arena.music", bus: "missing" })] }), {
    message: "Audio playback references unknown bus 'missing'.",
    name: "SdkError",
  });
  assert.throws(
    () => defineAudio({ oneShots: [oneShotSound("sound.hit", { asset: "hit.sound", emitter: "missing", event: "DamageEvent" })] }),
    {
      message: "Audio one-shot references unknown emitter 'missing'.",
      name: "SdkError",
    },
  );
});

test("audio helpers should reject invalid playback controls", () => {
  assert.throws(
    () => defineAudio({ controls: [audioPlaybackControl("music.pause", { kind: "pause", target: "missing.music" })] }),
    {
      message: "Audio playback control 'music.pause' references unknown playback 'missing.music'.",
      name: "SdkError",
    },
  );
  assert.throws(
    () =>
      defineAudio({
        controls: [audioPlaybackControl("music.pause", { at: 1, kind: "pause", target: "music.arena" })],
        music: [loopingMusic("music.arena", { asset: "arena.music" })],
      }),
    {
      message: "Audio playback control 'music.pause' may only set at for seek controls.",
      name: "SdkError",
    },
  );
});

test("audio helpers should reject invalid volume", () => {
  assert.throws(() => loopingMusic("music.arena", { asset: "arena.music", volume: -0.1 }), {
    message: "Audio volume must be a finite number greater than or equal to 0.",
    name: "SdkError",
  });
  assert.throws(() => oneShotSound("sound.hit", { asset: "hit.sound", event: "DamageEvent", volume: Number.POSITIVE_INFINITY }), {
    message: "Audio volume must be a finite number greater than or equal to 0.",
    name: "SdkError",
  });
});
