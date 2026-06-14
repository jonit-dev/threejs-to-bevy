import assert from "node:assert/strict";
import test from "node:test";

import { loopingMusic, oneShotSound } from "./audio.js";

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
