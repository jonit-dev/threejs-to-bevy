import assert from "node:assert/strict";
import test from "node:test";

import { AudioCueEx, PropellerEx } from "./audioHelpers.js";

test("AudioCueEx fires only on a rising edge and resets after release", () => {
  const first = AudioCueEx.rising(false, true);
  const held = AudioCueEx.rising(first.nextActive, true);
  const released = AudioCueEx.rising(held.nextActive, false);
  const second = AudioCueEx.rising(released.nextActive, true);

  assert.equal(first.fire, true);
  assert.equal(held.fire, false);
  assert.equal(released.fire, false);
  assert.equal(second.fire, true);
});

test("AudioCueEx rate limits active cues with deterministic cadence", () => {
  const first = AudioCueEx.rateLimited(2, Number.NEGATIVE_INFINITY, 0.5);
  const early = AudioCueEx.rateLimited(2.49, first.nextReadyAt, 0.5);
  const ready = AudioCueEx.rateLimited(2.5, early.nextReadyAt, 0.5);
  const inactive = AudioCueEx.rateLimited(3, ready.nextReadyAt, 0.5, false);

  assert.deepEqual(first, { fire: true, nextReadyAt: 2.5 });
  assert.deepEqual(early, { fire: false, nextReadyAt: 2.5 });
  assert.deepEqual(ready, { fire: true, nextReadyAt: 3 });
  assert.deepEqual(inactive, { fire: false, nextReadyAt: 3 });
});

test("PropellerEx maps throttle to clip speed and a smoothed bounded disc", () => {
  const idle = PropellerEx.step(0, 0, 1 / 60);
  const powered = PropellerEx.step(idle.discBlend, 1, 0.5);

  assert.equal(idle.clipSpeed, 1.5);
  assert.equal(idle.discScale, 0.0005);
  assert.equal(powered.clipSpeed, 36.5);
  assert.equal(powered.discBlend, 1);
  assert.equal(powered.discScale, 0.5);
});
