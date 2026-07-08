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

test("rich visibility assertions should read wrapped web runtime diagnostics", () => {
  const result = evaluateRichPlaytestAssertions({
    report: reportWithRuntimeDiagnostics("web", {
      diagnostics: {
        scene: {
          renderedEntities: [
            {
              id: "player",
              projectedBounds: { min: [-0.1, -0.1], max: [0.1, 0.1] },
            },
          ],
        },
      },
    }),
    scenario: visibilityScenario("web"),
  });
  const assertion = result.assertions.find((item) => item.id === "visibility.player");

  assert.equal(result.diagnostics.length, 0);
  assert.equal(assertion?.pass, true);
});

test("resource assertions should explain moved scenario with unchanged resource state", () => {
  const result = evaluateRichPlaytestAssertions({
    report: {
      ...reportWithRuntimeDiagnostics("web", {}),
      distance: 6.5,
      effectLog: {
        entries: [
          {
            kind: "resource",
            resource: "GameState",
            system: "collector-system",
            value: { scoreText: "Score 0 / 5" },
          },
          {
            command: "setComponent",
            component: "Transform",
            entity: "player",
            kind: "patch",
            system: "collector-system",
            value: { position: [5.35, 0.5, 3.85] },
          },
        ],
      },
      observations: {
        console: [],
        hud: {},
        network: [],
        resources: {
          GameState: {
            after: { scoreText: "Score 0 / 5" },
            before: { scoreText: "Score 0 / 5" },
          },
        },
        runtimeDiagnostics: {},
      },
    },
    scenario: {
      assert: {
        resources: [{ equals: "Score 5 / 5", id: "GameState", path: "scoreText" }],
      },
      name: "collect-all",
      schemaVersion: 1,
      steps: [{ holdFrames: 1, release: false }],
      subject: "player",
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 0,
    },
  });

  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_RESOURCE_STATE_STAGNATED");
  assert.match(result.diagnostics[0]?.message ?? "", /did not change after the scenario moved/);
  assert.match(result.diagnostics[0]?.suggestion ?? "", /collector-system/);
  assert.match(result.diagnostics[0]?.suggestion ?? "", /effect-log\.json/);
  assert.match(result.diagnostics[0]?.suggestion ?? "", /pickup\/contact predicates/);
  assert.match(result.diagnostics[0]?.suggestion ?? "", /stale duplicate systems/);
});

test("hud assertions should explain unchanged observed text", () => {
  const result = evaluateRichPlaytestAssertions({
    report: {
      ...reportWithRuntimeDiagnostics("web", {}),
      observations: {
        console: [],
        hud: {
          "score-label": {
            after: "Score 0 / 5",
            before: "Score 0 / 5",
          },
        },
        network: [],
        resources: {},
        runtimeDiagnostics: {},
      },
    },
    scenario: {
      assert: {
        hud: [{ id: "score-label", textIncludes: "Score 5 / 5" }],
      },
      name: "collect-all",
      schemaVersion: 1,
      steps: [{ holdFrames: 1, release: false }],
      subject: "player",
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 0,
    },
  });

  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_HUD_ASSERTION_FAILED");
  assert.match(result.diagnostics[0]?.suggestion ?? "", /Observed HUD value/);
  assert.match(result.diagnostics[0]?.suggestion ?? "", /tn build/);
});

test("movement axis delta assertions should pass when signed movement reaches threshold", () => {
  const result = evaluateRichPlaytestAssertions({
    report: {
      ...reportWithRuntimeDiagnostics("web", {}),
      movementDelta: [0.1, 0.24, -1.3],
    },
    scenario: movementAxisDeltaScenario("+y", 0.2),
  });

  const assertion = result.assertions.find((item) => item.id === "movement.axisDelta");
  assert.equal(assertion?.pass, true);
  assert.equal(result.diagnostics.length, 0);
});

test("movement axis delta assertions should fail when signed movement is below threshold", () => {
  const result = evaluateRichPlaytestAssertions({
    report: {
      ...reportWithRuntimeDiagnostics("web", {}),
      movementDelta: [0.1, 0.04, -1.3],
    },
    scenario: movementAxisDeltaScenario("+y", 0.2),
  });

  const assertion = result.assertions.find((item) => item.id === "movement.axisDelta");
  assert.equal(assertion?.pass, false);
  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_AXIS_DELTA_ASSERTION_FAILED");
});

test("movement resolved axis delta assertions should read character move effect logs", () => {
  const result = evaluateRichPlaytestAssertions({
    report: {
      ...reportWithRuntimeDiagnostics("web", {}),
      before: { frame: 1, position: [2.15, 0, 3.95], tick: 10 },
      effectLog: {
        entries: [
          { kind: "service", service: "character.move", payload: { result: { entity: "player", resolved: [2.15, 0.12, 2.4] } } },
          { kind: "service", service: "character.move", payload: { result: { entity: "player", groundEntity: "ramp.main", resolved: [2.15, 0.42, 1.7] } } },
        ],
      },
    },
    scenario: movementResolvedAxisDeltaScenario("+y", 0.4),
  });

  const assertion = result.assertions.find((item) => item.id === "movement.resolvedAxisDelta");
  assert.equal(assertion?.pass, true);
  assert.equal(result.diagnostics.length, 0);
});

test("movement resolved axis delta assertions should fail without enough resolved movement", () => {
  const result = evaluateRichPlaytestAssertions({
    report: {
      ...reportWithRuntimeDiagnostics("web", {}),
      before: { frame: 1, position: [2.15, 0, 3.95], tick: 10 },
      effectLog: {
        entries: [
          { kind: "service", service: "character.move", payload: { result: { entity: "player", resolved: [2.15, 0.05, 2.4] } } },
        ],
      },
    },
    scenario: movementResolvedAxisDeltaScenario("+y", 0.4),
  });

  const assertion = result.assertions.find((item) => item.id === "movement.resolvedAxisDelta");
  assert.equal(assertion?.pass, false);
  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_RESOLVED_AXIS_DELTA_ASSERTION_FAILED");
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

function movementAxisDeltaScenario(axis: string, min: number): IPlaytestScenario {
  return {
    assert: {
      movement: { entity: "player", minAxisDelta: { axis, min } },
    },
    name: "movement-axis-delta",
    schemaVersion: 1,
    steps: [{ holdFrames: 1, release: false }],
    subject: "player",
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
}

function movementResolvedAxisDeltaScenario(axis: string, min: number): IPlaytestScenario {
  return {
    assert: {
      movement: { entity: "player", minResolvedAxisDelta: { axis, min } },
    },
    name: "movement-resolved-axis-delta",
    schemaVersion: 1,
    steps: [{ holdFrames: 1, release: false }],
    subject: "player",
    target: "web",
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
