import assert from "node:assert/strict";
import test from "node:test";

import { createWebAudioElementSink, createWebAudioRuntime, ScriptAudioRuntimeController, traceWebAudioLifecycle, traceWebAudioSupport, type IWebAudioElement } from "./audio.js";

test("audio should play one shot on damage event", () => {
  const runtime = createWebAudioRuntime({
    schema: "threenative.audio",
    version: "0.1.0",
    music: [],
    oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", volume: 0.75 }],
  });

  runtime.handleEvents([{ event: "DamageEvent", payload: { amount: 10 } }]);

  assert.deepEqual(runtime.commands, [{ asset: "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot", volume: 0.75 }]);
});

test("audio should start looping music", () => {
  const runtime = createWebAudioRuntime({
    schema: "threenative.audio",
    version: "0.1.0",
    music: [{ id: "music.arena", asset: "arena.music", autoplay: true, loop: true, volume: 0.4 }],
    oneShots: [],
  });

  runtime.start();

  assert.deepEqual(runtime.commands, [{ asset: "arena.music", id: "music.arena", kind: "loop", volume: 0.4 }]);
});

test("audio should preserve bus and spatial emitter commands", () => {
  const runtime = createWebAudioRuntime({
    schema: "threenative.audio",
    version: "0.1.0",
    buses: [{ id: "bus.sfx", volume: 0.8 }],
    emitters: [{ id: "emitter.player", position: [1, 2, 3], radius: 12 }],
    listeners: [{ id: "listener.main", position: [0, 1, 5] }],
    music: [{ id: "music.arena", asset: "arena.music", autoplay: true, bus: "bus.sfx", loop: true }],
    oneShots: [{ id: "sound.hit", asset: "hit.sound", bus: "bus.sfx", emitter: "emitter.player", event: "DamageEvent" }],
  });

  runtime.start();
  runtime.handleEvents([{ event: "DamageEvent", payload: { amount: 10 } }]);

  assert.deepEqual(runtime.commands, [
    { asset: "arena.music", bus: "bus.sfx", id: "music.arena", kind: "loop" },
    { asset: "hit.sound", bus: "bus.sfx", emitter: "emitter.player", event: "DamageEvent", id: "sound.hit", kind: "oneShot" },
  ]);
});

test("should report attenuation and ducking observations when listener moves", () => {
  const trace = traceWebAudioSupport(
    {
      schema: "threenative.audio",
      version: "0.1.0",
      buses: [
        { id: "bus.master", gain: 1 },
        { id: "bus.music", gain: 0.8, parent: "bus.master" },
        { id: "bus.sfx", volume: 0.9 },
      ],
      duckingRules: [{ id: "duck.music", attack: 0.05, gain: 0.35, release: 0.2, sourceBus: "bus.sfx", targetBus: "bus.music" }],
      emitters: [{ id: "emitter.alarm", attenuation: { curve: "linear", maxDistance: 10, minDistance: 1, rolloffFactor: 1 }, position: [0, 0, 0] }],
      listeners: [{ id: "listener.main", binding: { kind: "activeCamera" }, position: [1, 0, 0] }],
      music: [
        { id: "music.intro", asset: "intro.music", autoplay: true, loop: true },
        { id: "music.loop", asset: "loop.music", autoplay: false, loop: true },
      ],
      musicTransitions: [{ id: "transition.loop", duration: 2, from: "music.intro", kind: "crossfade", playbackId: "music.state.loop", state: "playing", to: "music.loop" }],
      oneShots: [],
      tones: [{ id: "tone.confirm", bus: "bus.sfx", duration: 0.25, frequency: 880, waveform: "sine" }],
    },
    { "listener.main": [[1, 0, 0], [10, 0, 0]] },
  );

  assert.deepEqual(trace.attenuation.map((item) => item.gain), [1, 0]);
  assert.deepEqual(trace.ducking, [{ gain: 0.35, id: "duck.music", sourceBus: "bus.sfx", targetBus: "bus.music" }]);
  assert.deepEqual(trace.listenerBindings, [{ id: "listener.main", kind: "activeCamera" }]);
  assert.equal(trace.musicTransitions[0]?.playbackId, "music.state.loop");
  assert.equal(trace.tones[0]?.waveform, "sine");
});

test("audio lifecycle trace should stop active loops deterministically", () => {
  const trace = traceWebAudioLifecycle(
    {
      schema: "threenative.audio",
      version: "0.1.0",
      buses: [{ id: "bus.music", volume: 0.4 }, { id: "bus.sfx", volume: 0.8 }],
      emitters: [{ id: "emitter.player", position: [1, 2, 3], radius: 12 }],
      listeners: [{ id: "listener.main", position: [0, 1, 5] }],
      music: [{ id: "music.arena", asset: "arena.music", autoplay: true, bus: "bus.music", loop: true, volume: 0.4 }],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", bus: "bus.sfx", emitter: "emitter.player", event: "DamageEvent", volume: 0.75 }],
    },
    [{ event: "DamageEvent", payload: { amount: 10 } }],
    ["music.arena"],
  );

  assert.deepEqual(trace.activeLoops, []);
  assert.deepEqual(trace.lifecycle, [
    { id: "music.arena", kind: "start" },
    { id: "music.arena", kind: "stop" },
  ]);
  assert.deepEqual(trace.commands, [
    { asset: "arena.music", bus: "bus.music", id: "music.arena", kind: "loop", volume: 0.4 },
    { asset: "hit.sound", bus: "bus.sfx", emitter: "emitter.player", event: "DamageEvent", id: "sound.hit", kind: "oneShot", volume: 0.75 },
  ]);
});

test("audio lifecycle trace should apply playback controls", () => {
  const trace = traceWebAudioLifecycle(
    {
      schema: "threenative.audio",
      version: "0.1.0",
      controls: [
        { id: "music.pause", kind: "pause", target: "music.arena" },
        { id: "music.queryPaused", kind: "query", target: "music.arena" },
        { id: "music.seek", kind: "seek", target: "music.arena", at: 8.5 },
        { id: "music.resume", kind: "resume", target: "music.arena" },
        { id: "music.stop", kind: "stop", target: "music.arena" },
        { id: "music.queryStopped", kind: "query", target: "music.arena" },
      ],
      music: [{ id: "music.arena", asset: "arena.music", autoplay: true, loop: true }],
      oneShots: [],
    },
    [],
  );

  assert.deepEqual(trace.activeLoops, []);
  assert.deepEqual(trace.pausedLoops, []);
  assert.deepEqual(trace.lifecycle, [
    { id: "music.arena", kind: "start" },
    { id: "music.arena", kind: "pause" },
    { id: "music.arena", kind: "query", state: "paused" },
    { at: 8.5, id: "music.arena", kind: "seek" },
    { id: "music.arena", kind: "resume" },
    { id: "music.arena", kind: "stop" },
    { id: "music.arena", kind: "query", state: "stopped" },
  ]);
});

test("audio element sink should play bundle local one shots and loops", () => {
  const elements: FakeAudioElement[] = [];
  const sink = createWebAudioElementSink(
    "/game.bundle",
    {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "arena.music", kind: "audio", format: "ogg", path: "assets/arena.ogg" },
        { id: "hit.sound", kind: "audio", format: "wav", path: "assets/hit.wav" },
      ],
    },
    () => {
      const element = new FakeAudioElement();
      elements.push(element);
      return element;
    },
  );

  sink.queue({ asset: "arena.music", id: "music.arena", kind: "loop", volume: 0.4 });
  sink.queue({ asset: "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot", volume: 0.75 });

  assert.equal(elements.length, 2);
  assert.equal(elements[0]?.src, "/game.bundle/assets/arena.ogg");
  assert.equal(elements[0]?.loop, true);
  assert.equal(elements[0]?.volume, 0.4);
  assert.equal(elements[0]?.plays, 1);
  assert.equal(elements[1]?.src, "/game.bundle/assets/hit.wav");
  assert.equal(elements[1]?.loop, false);
  assert.equal(elements[1]?.volume, 0.75);
  assert.equal(elements[1]?.plays, 1);
  assert.deepEqual(sink.diagnostics, []);

  sink.dispose();
  assert.deepEqual(elements.map((element) => element.pauses), [1, 1]);
  assert.deepEqual(elements.map((element) => element.currentTime), [0, 0]);
});

test("audio element sink should diagnose missing audio assets", () => {
  const sink = createWebAudioElementSink("/game.bundle", {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: [],
  });

  sink.queue({ asset: "missing.sound", id: "sound.missing", kind: "oneShot" });

  assert.equal(sink.diagnostics[0]?.code, "TN_AUDIO_ASSET_MISSING");
  assert.equal(sink.diagnostics[0]?.severity, "error");
});

test("audio element sink should render script services and resume loops after app visibility returns", () => {
  const elements: FakeAudioElement[] = [];
  const audio = {
    schema: "threenative.audio" as const,
    version: "0.1.0" as const,
    music: [{ id: "music.arena", asset: "arena.music", autoplay: false, loop: true, volume: 0.4 }],
    oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", volume: 0.75 }],
  };
  const sink = createWebAudioElementSink(
    "/game.bundle",
    {
      schema: "threenative.assets",
      version: "0.1.0",
      assets: [
        { id: "arena.music", kind: "audio", format: "ogg", path: "assets/arena.ogg" },
        { id: "hit.sound", kind: "audio", format: "wav", path: "assets/hit.wav" },
      ],
    },
    () => {
      const element = new FakeAudioElement();
      elements.push(element);
      return element;
    },
  );

  sink.handleServices([{
    payload: {
      request: { options: { loop: true, volume: 0.2 }, soundId: "music.arena" },
      result: { accepted: true, kind: "loop", loop: true, playbackId: "music.arena#1", soundId: "music.arena", status: "playing", volume: 0.2 },
    },
    service: "audio.play",
  }], audio);
  sink.handleServices([{
    payload: {
      request: { options: {}, soundId: "sound.hit" },
      result: { accepted: true, kind: "oneShot", loop: false, playbackId: "sound.hit#2", soundId: "sound.hit", status: "playing", volume: 0.75 },
    },
    service: "audio.play",
  }], audio);

  assert.deepEqual(elements.map((element) => ({ loop: element.loop, plays: element.plays, src: element.src, volume: element.volume })), [
    { loop: true, plays: 1, src: "/game.bundle/assets/arena.ogg", volume: 0.2 },
    { loop: false, plays: 1, src: "/game.bundle/assets/hit.wav", volume: 0.75 },
  ]);

  sink.pauseLoops();
  assert.equal(elements[0]?.pauses, 1);
  assert.equal(elements[1]?.pauses, 0);
  sink.resumeLoops();
  assert.equal(elements[0]?.plays, 2);

  sink.handleServices([{
    payload: {
      request: { playbackId: "music.arena#1" },
      result: { accepted: true, kind: "loop", loop: true, playbackId: "music.arena#1", soundId: "music.arena", status: "stopped", volume: 0.2 },
    },
    service: "audio.stop",
  }], audio);
  assert.equal(elements[0]?.pauses, 2);
  assert.equal(elements[0]?.currentTime, 0);
});

test("should play and stop declared logical audio", () => {
  const audio = new ScriptAudioRuntimeController({
    schema: "threenative.audio",
    version: "0.1.0",
    music: [{ id: "music.arena", asset: "arena.music", autoplay: true, loop: true, volume: 0.4 }],
    oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", volume: 0.75 }],
  });

  const play = audio.play("sound.hit", { entity: "player" });
  const stop = audio.stop(play.playbackId);
  const query = audio.query(play.playbackId);

  assert.deepEqual(play, {
    accepted: true,
    entity: "player",
    kind: "oneShot",
    loop: false,
    playbackId: "sound.hit#1",
    soundId: "sound.hit",
    status: "playing",
    volume: 0.75,
  });
  assert.deepEqual(stop, {
    accepted: true,
    entity: "player",
    kind: "oneShot",
    loop: false,
    playbackId: "sound.hit#1",
    soundId: "sound.hit",
    status: "stopped",
    volume: 0.75,
  });
  assert.deepEqual(query, stop);
});

class FakeAudioElement implements IWebAudioElement {
  currentTime = 0;
  loop = false;
  plays = 0;
  pauses = 0;
  src = "";
  volume = 1;

  play(): void {
    this.plays += 1;
  }

  pause(): void {
    this.pauses += 1;
  }
}
