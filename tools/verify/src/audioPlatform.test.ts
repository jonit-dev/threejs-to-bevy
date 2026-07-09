import assert from "node:assert/strict";
import test from "node:test";

import { validateAudioPlatformEvidence } from "./audioPlatform.js";

test("should compare web and native music transition reports", () => {
  const report = {
    audio: {
      lifecycle: { lifecycle: ["start", "pause", "query", "seek", "resume", "stop"].map((kind) => ({ kind })) },
      mixer: { ducking: [{ id: "duck.music" }] },
      support: { attenuation: [{}, {}], musicTransitions: [{ id: "transition.menu" }], tones: [{ id: "tone.confirm" }] },
    },
    boundaries: [
      { code: "TN_AUDIO_RAW_NATIVE_HANDLE_UNSUPPORTED" },
      { code: "TN_AUDIO_CUSTOM_DECODER_UNSUPPORTED" },
      { code: "TN_AUDIO_NETWORK_STREAM_UNSUPPORTED" },
    ],
    platform: {
      diagnostics: [
        "TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED",
        "TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED",
        "TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED",
        "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
      ].map((code) => ({ code })),
      resize: { height: 720, scaleFactor: 2, width: 1280 },
    },
  };

  assert.deepEqual(validateAudioPlatformEvidence({ ok: true, status: "passed" }, report, structuredClone(report)), []);
  report.audio.support.musicTransitions = [];
  assert.deepEqual(validateAudioPlatformEvidence({ ok: true, status: "passed" }, report, structuredClone(report)), ["audio-support:missing:music-transition"]);
});
