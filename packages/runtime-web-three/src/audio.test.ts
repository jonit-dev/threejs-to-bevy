import assert from "node:assert/strict";
import test from "node:test";

import { createWebAudioRuntime } from "./audio.js";

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
