import assert from "node:assert/strict";
import test from "node:test";

import {
  debugBounds,
  debugBox,
  debugCameraFrustum,
  debugLightVolume,
  debugLine,
  debugRay,
  debugSphere,
  debugTextLabel,
  debugTransformAxes,
  debugUiNodeRect,
  defineDebugDiagnostics,
  diagnosticCounter,
  fpsOverlay,
  platformAudioDiagnostic,
  unsupportedNetworkingDiagnostic,
} from "./debug.js";

test("should capture debug draw calls when gameplay systems declare diagnostics", () => {
  const debug = defineDebugDiagnostics({
    counters: [diagnosticCounter("counter.enemies", { category: "gameplay", label: "Enemies", sourcePath: "src/game.ts:12", value: 4 })],
    draw: [
      debugLine("line.forward", { from: [0, 0, 0], lifetimeSeconds: 0.25, to: [1, 0, 0] }),
      debugRay("ray.aim", { direction: [0, 0, -1], origin: [0, 1, 0] }),
      debugBounds("bounds.player", { label: "Player Bounds", max: [1, 2, 1], min: [-1, 0, -1] }),
      debugSphere("sphere.pickup", { center: [3, 1, 0], radius: 0.5 }),
      debugBox("box.trigger", { center: [0, 1, 3], size: [2, 2, 2] }),
      debugTextLabel("label.player", { label: "Player", position: [0, 2, 0] }),
      debugTransformAxes("axes.player", { length: 1, target: "entity.player" }),
      debugCameraFrustum("frustum.camera", { target: "entity.camera" }),
      debugLightVolume("light.sun", { target: "light.sun" }),
      debugUiNodeRect("ui.health", { target: "ui.health" }),
    ],
    fpsOverlay: fpsOverlay({ sampleWindowFrames: 30 }),
    platformDiagnostics: [
      platformAudioDiagnostic("autoplayBlocked", "audio.ir.json/music/0"),
      unsupportedNetworkingDiagnostic("websocket", "src/net.ts:1"),
    ],
  });

  assert.deepEqual(debug.draw.map((draw) => draw.kind), [
    "transformAxes",
    "bounds",
    "box",
    "cameraFrustum",
    "textLabel",
    "lightVolume",
    "line",
    "ray",
    "sphere",
    "uiNodeRect",
  ]);
  assert.equal(debug.counters[0]?.sourcePath, "src/game.ts:12");
  assert.equal(debug.fpsOverlay?.sampleWindowFrames, 30);
  assert.equal(debug.platformDiagnostics.some((diagnostic) => diagnostic.code === "TN_UNSUPPORTED_NETWORKING_WEBSOCKET"), true);
});
