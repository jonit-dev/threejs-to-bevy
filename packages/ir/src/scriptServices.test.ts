import assert from "node:assert/strict";
import test from "node:test";
import { validateScriptAudioUpdateOptions } from "./scriptServices.js";

test("audio playback updates accept bounded absolute targets", () => {
  assert.deepEqual(
    validateScriptAudioUpdateOptions({ pitch: 1.5, rampSeconds: 0.2, volume: 0.75 }),
    { accepted: true, options: { pitch: 1.5, rampSeconds: 0.2, volume: 0.75 } },
  );
  assert.deepEqual(
    validateScriptAudioUpdateOptions({ volume: 0 }),
    { accepted: true, options: { volume: 0 } },
  );
});

test("audio playback updates reject empty, non-finite, and out-of-range values", () => {
  assert.deepEqual(validateScriptAudioUpdateOptions({}), { accepted: false, reason: "empty-update" });
  assert.deepEqual(validateScriptAudioUpdateOptions({ volume: Number.NaN }), { accepted: false, reason: "invalid-volume" });
  assert.deepEqual(validateScriptAudioUpdateOptions({ pitch: 0 }), { accepted: false, reason: "invalid-pitch" });
  assert.deepEqual(validateScriptAudioUpdateOptions({ pitch: 1, rampSeconds: 11 }), {
    accepted: false,
    reason: "invalid-ramp-seconds",
  });
  assert.deepEqual(validateScriptAudioUpdateOptions({ nativeHandle: 1, volume: 1 }), {
    accepted: false,
    reason: "unsupported-option",
  });
});
