import assert from "node:assert/strict";
import test from "node:test";

import { createWebAudioElementSink, createWebAudioRuntime, type IWebAudioElement } from "./audio.js";

test("audio should play one shot on damage event", () => {
  const runtime = createWebAudioRuntime({
    schema: "threenative.audio",
    version: "0.1.0",
    music: [],
    oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent" }],
  });

  runtime.handleEvents([{ event: "DamageEvent", payload: { amount: 10 } }]);

  assert.deepEqual(runtime.commands, [{ asset: "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot" }]);
});

test("audio should start looping music", () => {
  const runtime = createWebAudioRuntime({
    schema: "threenative.audio",
    version: "0.1.0",
    music: [{ id: "music.arena", asset: "arena.music", autoplay: true, loop: true }],
    oneShots: [],
  });

  runtime.start();

  assert.deepEqual(runtime.commands, [{ asset: "arena.music", id: "music.arena", kind: "loop" }]);
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

  sink.queue({ asset: "arena.music", id: "music.arena", kind: "loop" });
  sink.queue({ asset: "hit.sound", event: "DamageEvent", id: "sound.hit", kind: "oneShot" });

  assert.equal(elements.length, 2);
  assert.equal(elements[0]?.src, "/game.bundle/assets/arena.ogg");
  assert.equal(elements[0]?.loop, true);
  assert.equal(elements[0]?.plays, 1);
  assert.equal(elements[1]?.src, "/game.bundle/assets/hit.wav");
  assert.equal(elements[1]?.loop, false);
  assert.equal(elements[1]?.plays, 1);
  assert.deepEqual(sink.diagnostics, []);
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

class FakeAudioElement implements IWebAudioElement {
  currentTime = 0;
  loop = false;
  plays = 0;
  src = "";

  play(): void {
    this.plays += 1;
  }
}
