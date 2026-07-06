import assert from "node:assert/strict";
import test from "node:test";

import type { IPlaytestReport } from "./playtest.js";
import { evaluateRichPlaytestAssertions } from "./playtestAssertions.js";
import type { IPlaytestScenario } from "./playtestScenario.js";

test("rich visibility assertions should skip native readiness reports without projected bounds", () => {
  const result = evaluateRichPlaytestAssertions({
    report: reportWithRuntimeDiagnostics("bevy", { readiness: [{ entity: "player", present: true, visible: true }] }),
    scenario: visibilityScenario("desktop"),
  });
  const assertion = result.assertions.find((item) => item.id === "visibility.player");

  assert.equal(result.diagnostics.length, 0);
  assert.equal(assertion?.pass, true);
  assert.equal(assertion?.details?.skipped, true);
  assert.equal(assertion?.details?.reason, "native-projected-bounds-unavailable");
});

test("rich visibility assertions should still fail web reports without projected bounds", () => {
  const result = evaluateRichPlaytestAssertions({
    report: reportWithRuntimeDiagnostics("web", { scene: { renderedEntities: [] } }),
    scenario: visibilityScenario("web"),
  });
  const assertion = result.assertions.find((item) => item.id === "visibility.player");

  assert.equal(assertion?.pass, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_VISIBILITY_FAILED"), true);
});

function visibilityScenario(target: "desktop" | "web"): IPlaytestScenario {
  return {
    assert: {
      visibility: [{ entity: "player", maxOffscreenRatio: 0.05, minProjectedPixels: 1200 }],
    },
    name: "visibility",
    schemaVersion: 1,
    steps: [{ holdFrames: 1, release: false }],
    subject: "player",
    target,
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
}

function reportWithRuntimeDiagnostics(runtime: "bevy" | "web", runtimeDiagnostics: unknown): IPlaytestReport {
  return {
    debugColliders: false,
    diagnostics: [],
    distance: 0,
    entity: "player",
    expectMoved: false,
    frames: 1,
    input: "",
    movementThreshold: 0,
    observations: {
      console: [],
      hud: {},
      network: [],
      resources: {},
      runtimeDiagnostics,
    },
    pass: true,
    runtime,
  };
}
