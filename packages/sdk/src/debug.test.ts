import assert from "node:assert/strict";
import test from "node:test";

import { debugBounds, debugLine, debugTextLabel, defineDebugDiagnostics, diagnosticCounter, fpsOverlay, platformAudioDiagnostic, unsupportedNetworkingDiagnostic } from "./debug.js";

test("should capture debug draw calls when gameplay systems declare diagnostics", () => {
  const debug = defineDebugDiagnostics({
    counters: [diagnosticCounter("counter.enemies", { category: "gameplay", label: "Enemies", sourcePath: "src/game.ts:12", value: 4 })],
    draw: [
      debugLine("line.forward", { from: [0, 0, 0], lifetimeSeconds: 0.25, to: [1, 0, 0] }),
      debugBounds("bounds.player", { label: "Player Bounds", max: [1, 2, 1], min: [-1, 0, -1] }),
      debugTextLabel("label.player", { label: "Player", position: [0, 2, 0] }),
    ],
    fpsOverlay: fpsOverlay({ sampleWindowFrames: 30 }),
    platformDiagnostics: [
      platformAudioDiagnostic("autoplayBlocked", "audio.ir.json/music/0"),
      unsupportedNetworkingDiagnostic("websocket", "src/net.ts:1"),
    ],
  });

  assert.deepEqual(debug.draw.map((draw) => draw.kind), ["bounds", "textLabel", "line"]);
  assert.equal(debug.counters[0]?.sourcePath, "src/game.ts:12");
  assert.equal(debug.fpsOverlay?.sampleWindowFrames, 30);
  assert.equal(debug.platformDiagnostics.some((diagnostic) => diagnostic.code === "TN_UNSUPPORTED_NETWORKING_WEBSOCKET"), true);
});
