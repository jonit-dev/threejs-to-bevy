import assert from "node:assert/strict";
import test from "node:test";

import { evaluateAudioQuality, parseScriptAudioUsages, type AudioQualityInput } from "./audioQualityGate.js";

function validInput(): AudioQualityInput {
  return {
    assets: [
      {
        assetId: "engine",
        metrics: {
          durationSeconds: 4,
          edgeRmsDeltaDb: 1,
          endToStartDelta: 0.02,
          peakDbfs: -3,
          rmsDbfs: -18,
        },
        path: "assets/engine.ogg",
        provenanceLoop: true,
      },
      {
        assetId: "impact",
        metrics: {
          durationSeconds: 1.5,
          edgeRmsDeltaDb: 2,
          endToStartDelta: 0.04,
          peakDbfs: -2,
          rmsDbfs: -20,
        },
        path: "assets/impact.mp3",
        provenanceLoop: false,
      },
    ],
    sounds: [
      { assetId: "engine", soundId: "engine.loop" },
      { assetId: "impact", soundId: "impact.hit" },
    ],
    usages: [
      { loop: true, path: "src/scripts/game.ts", soundId: "engine.loop", volume: 0.7 },
      { loop: false, path: "src/scripts/game.ts", soundId: "impact.hit", volume: 0.8 },
    ],
  };
}

test("audio quality accepts resolved audible cues with matching loop intent", () => {
  assert.deepEqual(evaluateAudioQuality(validInput()), []);
});

test("audio quality rejects quiet source and effective playback intensity", () => {
  const input = validInput();
  input.assets[1]!.metrics.peakDbfs = -24;
  input.assets[1]!.metrics.rmsDbfs = -42;
  input.usages[1]!.volume = 0.1;

  const codes = evaluateAudioQuality(input).map((diagnostic) => diagnostic.code);
  assert.equal(codes.includes("TN_VERIFY_AUDIO_SOURCE_INTENSITY_LOW"), true);
  assert.equal(codes.includes("TN_VERIFY_AUDIO_PLAYBACK_INTENSITY_LOW"), true);
});

test("audio quality rejects unresolved literal sound ids", () => {
  const input = validInput();
  input.usages.push({ loop: false, path: "src/scripts/game.ts", soundId: "missing.sound", volume: 1 });

  assert.equal(
    evaluateAudioQuality(input).some((diagnostic) => diagnostic.code === "TN_VERIFY_AUDIO_SOUND_UNRESOLVED"),
    true,
  );
});

test("audio quality rejects generated loop intent drift", () => {
  const input = validInput();
  input.assets[0]!.provenanceLoop = false;
  input.assets[1]!.provenanceLoop = true;

  const codes = evaluateAudioQuality(input).map((diagnostic) => diagnostic.code);
  assert.equal(codes.includes("TN_VERIFY_AUDIO_LOOP_PROVENANCE_MISMATCH"), true);
  assert.equal(codes.includes("TN_VERIFY_AUDIO_ONESHOT_PROVENANCE_MISMATCH"), true);
});

test("audio quality rejects short, imbalanced, or discontinuous loops", () => {
  const input = validInput();
  input.assets[0]!.metrics.durationSeconds = 0.5;
  input.assets[0]!.metrics.edgeRmsDeltaDb = 16;
  input.assets[0]!.metrics.endToStartDelta = 0.6;

  const codes = evaluateAudioQuality(input).map((diagnostic) => diagnostic.code);
  assert.equal(codes.includes("TN_VERIFY_AUDIO_LOOP_TOO_SHORT"), true);
  assert.equal(codes.includes("TN_VERIFY_AUDIO_LOOP_EDGE_IMBALANCE"), true);
  assert.equal(codes.includes("TN_VERIFY_AUDIO_LOOP_SEAM_DISCONTINUITY"), true);
});

test("audio quality parses multiline loop and volume options from script calls", () => {
  const parsed = parseScriptAudioUsages(`
    context.audio.play("music.main", {
      loop: true,
      volume: 0.35
    });
  `, "src/scripts/music.ts");

  assert.deepEqual(parsed, {
    dynamicCallCount: 0,
    usages: [
      {
        loop: true,
        path: "src/scripts/music.ts",
        soundId: "music.main",
        volume: 0.35,
      },
    ],
  });
});
