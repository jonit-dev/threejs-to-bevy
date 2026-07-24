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

test("aerodynamic assertions prove finite force samples and signed controls", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.effectLog = {
    entries: [{
      payload: { request: { entity: "aircraft", inputs: { surfaces: { elevator: -1 } } } },
      service: "physics.aerodynamics.setInputs",
    }],
  };
  report.observations!.effectLogSeries = [{
    label: "negative pitch",
    snapshot: {
      entries: [{
        payload: { request: { entity: "aircraft", inputs: { surfaces: { elevator: 1 } } } },
        service: "physics.aerodynamics.setInputs",
      }],
    },
    tick: 2,
  }];
  report.observations!.physicsDebugSeries = [
    { label: "positive pitch", snapshot: aeroSnapshot("aircraft", 12), tick: 1 },
    { label: "after", snapshot: aeroSnapshot("aircraft", 16), tick: 2 },
  ];
  const result = evaluateRichPlaytestAssertions({
    report,
    scenario: {
      assert: { aerodynamics: [{ controls: [{ sign: "negative", surface: "elevator" }, { sign: "positive", surface: "elevator" }], entity: "aircraft", minForceSamples: 2, torques: [{ axis: "x", label: "positive pitch", sign: "negative" }] }] },
      name: "flight",
      schemaVersion: 1,
      steps: [{ release: true, waitTicks: 2 }],
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 0,
    },
  });

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.assertions[0]?.pass, true);
});

test("aerodynamic assertions reject wrong control signs and missing force evidence", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.effectLog = {
    entries: [{
      payload: { request: { entity: "aircraft", inputs: { surfaces: { elevator: 1 } } } },
      service: "physics.aerodynamics.setInputs",
    }],
  };
  const result = evaluateRichPlaytestAssertions({
    report,
    scenario: {
      assert: { aerodynamics: [{ controls: [{ sign: "negative", surface: "elevator" }], entity: "aircraft", minForceSamples: 1 }] },
      name: "flight-invalid",
      schemaVersion: 1,
      steps: [{ release: true, waitTicks: 1 }],
      target: "web",
      viewport: { height: 720, width: 1280 },
      warmupFrames: 0,
    },
  });

  assert.equal(result.assertions[0]?.pass, false);
  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_AERODYNAMICS_ASSERTION_FAILED");
});

test("relative aerodynamic torque requires opposing control-induced directions", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.observations!.physicsDebugSeries = [
    { label: "neutral-positive", snapshot: aeroSnapshot("aircraft", 1, -1), tick: 1 },
    { label: "positive", snapshot: aeroSnapshot("aircraft", 1, -2), tick: 2 },
    { label: "neutral-negative", snapshot: aeroSnapshot("aircraft", 1, 1), tick: 3 },
    { label: "negative", snapshot: aeroSnapshot("aircraft", 1, 2), tick: 4 },
  ];
  const scenario: IPlaytestScenario = {
    assert: { aerodynamics: [{ entity: "aircraft", torques: [
      { axis: "x", label: "positive", relativeToLabel: "neutral-positive", sign: "positive" },
      { axis: "x", label: "negative", relativeToLabel: "neutral-negative", sign: "negative" },
    ] }] },
    name: "opposing-torque",
    schemaVersion: 1,
    steps: [{ release: true, waitTicks: 1 }],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
  assert.equal(evaluateRichPlaytestAssertions({ report, scenario }).assertions[0]?.pass, true);
  const nativeScenario = { ...scenario, assert: { aerodynamics: [{ ...scenario.assert!.aerodynamics![0]!, controls: [{ sign: "negative" as const, surface: "elevator" }] }] }, target: "desktop" as const };
  assert.equal(evaluateRichPlaytestAssertions({ report, scenario: nativeScenario }).assertions[0]?.pass, true);
  report.observations!.physicsDebugSeries[3] = { label: "negative", snapshot: aeroSnapshot("aircraft", 1, 0), tick: 4 };
  assert.equal(evaluateRichPlaytestAssertions({ report, scenario }).assertions[0]?.pass, false);
});

test("throughout-steps resource assertions catch recovered transient failures", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.observations!.resources = { FlightState: { after: { stall: false }, before: { stall: false } } };
  report.observations!.resourceSeries = [
    { label: "positive", snapshots: { FlightState: { stall: true } }, tick: 1 },
    { label: "negative", snapshots: { FlightState: { stall: false } }, tick: 2 },
  ];
  const scenario: IPlaytestScenario = {
    assert: { resources: [{ equals: false, id: "FlightState", path: "stall", throughoutSteps: true }] },
    name: "transient-stall",
    schemaVersion: 1,
    steps: [{ release: true, waitTicks: 1 }, { release: true, waitTicks: 1 }],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
  const result = evaluateRichPlaytestAssertions({ report, scenario });
  assert.equal(result.assertions.find((item) => item.id.endsWith("throughoutSteps"))?.pass, false);
  assert.equal(result.diagnostics[0]?.code, "TN_PLAYTEST_RESOURCE_TRANSITION_ASSERTION_FAILED");
});

test("labeled resource transitions do not require an unrelated final-value assertion", () => {
  const report = reportWithRuntimeDiagnostics("web", {});
  report.observations!.resources = { FlightState: { after: { phase: "CRUISE" }, before: { phase: "DITCHED" } } };
  report.observations!.resourceSeries = [
    { label: "observe failure", snapshots: { FlightState: { phase: "DITCHED" } }, tick: 1 },
    { label: "observe restored", snapshots: { FlightState: { phase: "CRUISE" } }, tick: 2 },
  ];
  const scenario: IPlaytestScenario = {
    assert: { resources: [{ atSteps: [
      { label: "observe failure", textIncludes: "DITCHED" },
      { label: "observe restored", textIncludes: "CRUISE" },
    ], id: "FlightState", path: "phase" }] },
    name: "retry-transition",
    schemaVersion: 1,
    steps: [{ label: "observe failure", release: true, waitTicks: 1 }, { label: "observe restored", release: true, waitTicks: 1 }],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
  const passing = evaluateRichPlaytestAssertions({ report, scenario });
  assert.deepEqual(passing.assertions.map((item) => item.id), ["resource.FlightState.phase.atSteps"]);
  assert.equal(passing.assertions[0]?.pass, true);

  report.observations!.resourceSeries[0] = { label: "observe failure", snapshots: { FlightState: { phase: "CRUISE" } }, tick: 1 };
  const failing = evaluateRichPlaytestAssertions({ report, scenario });
  assert.equal(failing.assertions[0]?.pass, false);
  assert.equal(failing.diagnostics[0]?.code, "TN_PLAYTEST_RESOURCE_TRANSITION_ASSERTION_FAILED");
});

function aeroSnapshot(entity: string, value: number, forceY = 1): unknown {
  return { artifact: { primitives: [
    { category: "sleep", entity, id: `sleep:${entity}`, kind: "point", position: [0, 0, 0], value: 0 },
    { category: "aero", entity, from: [0, 0, 1], to: [0, forceY, 1], value },
  ] } };
}

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

test("maximum movement distance should prove a blocked input attempt", () => {
  const scenario: IPlaytestScenario = {
    assert: { movement: { entity: "player", maxDistance: 0.05 } },
    name: "blocked-movement",
    schemaVersion: 1,
    steps: [{ press: "ArrowRight", release: true }],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };
  const result = evaluateRichPlaytestAssertions({ report: { ...reportWithRuntimeDiagnostics("web", {}), distance: 0.01 }, scenario });
  assert.equal(result.assertions.find((item) => item.id === "movement.maxDistance")?.pass, true);
});

test("contact assertions should consume step-series effects after transient entities despawn", () => {
  const report = reportWithRuntimeDiagnostics("web", []);
  report.observations!.effectLogSeries = [{
    label: "projectile-impact",
    snapshot: {
      entries: [{
        payload: {
          request: { ignore: ["player", "projectile.runtime.0001.root"] },
          result: { entityId: "projectile-impact-target", hit: true },
        },
        service: "physics.raycast",
        system: "run-projectile",
      }],
    },
    tick: 12,
  }];
  const scenario: IPlaytestScenario = {
    assert: { contacts: [{ entity: "projectile.runtime.0001.root", kind: "physics.raycast", with: "projectile-impact-target" }] },
    name: "projectile-impact",
    schemaVersion: 1,
    steps: [],
    target: "web",
    viewport: { height: 720, width: 1280 },
    warmupFrames: 0,
  };

  const result = evaluateRichPlaytestAssertions({ report, scenario });
  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.assertions[0]?.pass, true);
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
