import assert from "node:assert/strict";
import test from "node:test";
import type { IScenesIr } from "@threenative/ir";

import { traceRenderTransition } from "./renderTransitions.js";

test("should complete fade transition after duration", () => {
  const trace = traceRenderTransition({
    elapsedMs: 250,
    from: "menu",
    readyAssetGroups: ["level.assets"],
    scenes: makeScenes(),
    to: "level",
  });

  assert.equal(trace.status, "complete");
  assert.equal(trace.activeScene, "level");
  assert.deepEqual(trace.frames, [{ alpha: 1, phase: "complete", scene: "level", timeMs: 250 }]);
});

test("should block level entry until asset group ready", () => {
  const trace = traceRenderTransition({
    elapsedMs: 100,
    from: "menu",
    readyAssetGroups: [],
    scenes: makeScenes(),
    to: "level",
    transition: { durationMs: 0, kind: "loadingScreen", loadingScene: "loading" },
  });

  assert.equal(trace.status, "loading");
  assert.equal(trace.activeScene, "loading");
  assert.equal(trace.diagnostics[0]?.code, "TN_SCENE_LOADING_NOT_READY");
});

function makeScenes(): IScenesIr {
  return {
    schema: "threenative.scenes",
    version: "0.1.0",
    initialScene: "menu",
    scenes: [
      { activation: "exclusive", id: "menu", kind: "menu" },
      { activation: "loading", id: "loading", kind: "loading" },
      {
        activation: "exclusive",
        assetGroups: ["level.assets"],
        id: "level",
        kind: "level",
        transitions: { enter: { color: "#000000", durationMs: 200, kind: "fade" } },
      },
    ],
  };
}
