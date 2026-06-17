import assert from "node:assert/strict";
import test from "node:test";

import { renderDebugOverlay } from "./debugOverlay.js";

test("should render FPS and custom diagnostic entries when overlay is enabled", () => {
  const model = renderDebugOverlay({
    counters: [{ aggregation: "frame", category: "gameplay", id: "counter.enemies", label: "Enemies", severity: "warning", sourcePath: "src/game.ts:12", value: 4 }],
    diagnostics: [{ code: "TN_PLATFORM_AUDIO_AUTOPLAY_BLOCKED", message: "Autoplay blocked.", path: "audio.ir.json/music/0", severity: "warning", suggestion: "Wait for user input." }],
    draw: [
      { id: "line.forward", kind: "line", value: { from: [0, 0, 0], to: [1, 0, 0] } },
      { id: "label.player", kind: "textLabel", label: "Player", value: { position: [0, 2, 0] } },
    ],
    fps: 59.94,
    fpsOverlay: { enabled: true, sampleWindowFrames: 60 },
  });

  assert.equal(model.enabled, true);
  assert.deepEqual(model.primitives.map((primitive) => primitive.id), ["label.player", "line.forward"]);
  assert.equal(model.rows.some((row) => row.label === "FPS" && row.value === "59.94"), true);
  assert.equal(model.rows.some((row) => row.label === "Enemies" && row.severity === "warning"), true);
  assert.equal(model.rows.some((row) => row.category === "TN_PLATFORM_AUDIO_AUTOPLAY_BLOCKED"), true);
});
