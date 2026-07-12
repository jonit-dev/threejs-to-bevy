import assert from "node:assert/strict";
import test from "node:test";

import type { IPlaytestReport } from "./playtest.js";
import { evaluateRichPlaytestAssertions } from "./playtestAssertions.js";
import type { IPlaytestScenario } from "./playtestScenario.js";

test("should fail frame diff when nothing changed", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.observations!.visual = { changedPixelRatio: 0 };
  const result = evaluateRichPlaytestAssertions({ report, scenario: visualScenario({ frameDiff: { minChangedPixelRatio: 0.01 } }) });
  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_FRAME_DIFF_FAILED");
});

test("should fail when entity projected pixels drop mid-scenario", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.observations!.visual = { runtimeDiagnosticsSeries: [renderedBounds("square", [-0.2, -0.2], [0.2, 0.2]), renderedBounds("square", [0, 0], [0.001, 0.001])] };
  const result = evaluateRichPlaytestAssertions({ report, scenario: visualScenario({ entityVisible: { entity: "square", minProjectedPixels: 20, throughoutFrames: true } }) });
  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_ENTITY_VISIBILITY_DROPPED");
});

test("should pass region check on populated region", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.observations!.visual = { nonblankRegions: [{ x: 0, y: 0, width: 100, height: 100, nonblankPixelRatio: 0.8 }] };
  const result = evaluateRichPlaytestAssertions({ report, scenario: visualScenario({ region: { x: 0, y: 0, width: 100, height: 100, minNonblankPixelRatio: 0.5 } }) });
  assert.deepEqual(result.diagnostics, []);
});

test("native visual assertions should emit the standard unsupported diagnostic", () => {
  const report = reportWithRuntimeDiagnostics("bevy", { readiness: [] });
  const scenario = { ...visualScenario({ frameDiff: { minChangedPixelRatio: 0.01 } }), target: "desktop" as const };
  const result = evaluateRichPlaytestAssertions({ report, scenario });
  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_VISUAL_ASSERTION_UNSUPPORTED");
  assert.equal(result.assertions[0]?.details?.skipped, true);
});

function visualScenario(assertion: NonNullable<NonNullable<IPlaytestScenario["assert"]>["visual"]>[number]): IPlaytestScenario {
  return { assert: { visual: [assertion] }, name: "visual", schemaVersion: 1, steps: [{ waitFrames: 1, release: true }], target: "web", viewport: { height: 100, width: 100 }, warmupFrames: 0 };
}

function renderedBounds(entity: string, min: [number, number], max: [number, number]): unknown {
  return { scene: { renderedEntities: [{ id: entity, projectedBounds: { min, max } }] } };
}

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

test("gameplay assertions should read normalized tag counts and state-machine state", () => {
  const result = evaluateRichPlaytestAssertions({
    report: {
      ...reportWithRuntimeDiagnostics("web", {}),
      observations: {
        console: [],
        hud: {},
        network: [],
        resources: {},
        runtimeObservations: {
          gameplay: {
            states: { guard: "chase" },
            tags: { coin: { count: 10, entities: [] } },
          },
        },
        runtimeDiagnostics: {},
      },
    },
    scenario: {
      assert: {
        states: [{ entity: "guard", equals: "chase" }],
        tags: [{ gte: 10, tag: "coin" }],
      },
      name: "gameplay-primitives",
      schemaVersion: 1,
      steps: [{ waitFrames: 1, release: true }],
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 0,
    },
  });

  assert.equal(result.diagnostics.length, 0);
  assert.equal(result.assertions.find((item) => item.id === "tags.coin")?.pass, true);
  assert.equal(result.assertions.find((item) => item.id === "states.guard")?.pass, true);
});

test("gameplay assertions should fail with actionable diagnostics when observations are missing", () => {
  const result = evaluateRichPlaytestAssertions({
    report: reportWithRuntimeDiagnostics("bevy", {}),
    scenario: {
      assert: {
        states: [{ entity: "guard", equals: "chase" }],
        tags: [{ count: 1, tag: "coin" }],
      },
      name: "gameplay-primitives-missing",
      schemaVersion: 1,
      steps: [{ waitFrames: 1, release: true }],
      target: "desktop",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 0,
    },
  });

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_PLAYTEST_TAG_COUNT_ASSERTION_FAILED",
    "TN_PLAYTEST_STATE_ASSERTION_FAILED",
  ]);
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

test("occluded assertion should consume a successful physics raycast effect", () => {
  const report = reportWithRuntimeDiagnostics("web", []);
  report.effectLog = {
    entries: [{
      payload: { request: { entity: "listener", target: "emitter" }, result: { entityId: "wall", hit: true } },
      service: "physics.raycast",
    }],
  };
  const scenario: IPlaytestScenario = {
    assert: { occluded: [{ entity: "listener", target: "emitter" }] },
    name: "audio-occlusion",
    schemaVersion: 1,
    steps: [],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };

  const result = evaluateRichPlaytestAssertions({ report, scenario });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.assertions[0]?.id, "occluded.listener");
  assert.equal(result.assertions[0]?.pass, true);
});

test("occluded assertion should consume an internal rendered-scene query effect", () => {
  const report = reportWithRuntimeDiagnostics("bevy", []);
  report.effectLog = {
    entries: [{
      payload: { request: { entity: "listener", target: "emitter" }, result: { entityId: "wall.render-only", hit: true } },
      service: "render.sceneRayQuery",
    }],
  };
  const scenario: IPlaytestScenario = {
    assert: { occluded: [{ entity: "listener", target: "emitter" }] },
    name: "render-geometry-occlusion",
    schemaVersion: 1,
    steps: [],
    target: "bevy",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };

  const result = evaluateRichPlaytestAssertions({ report, scenario });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.assertions[0]?.pass, true);
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
