import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";
import { tmpdir } from "node:os";

import { NativeHeadlessUnsupportedError } from "../native/bevy.js";

import { advanceWebFixedTicks, evaluateMovementDiagnostics, nativeHarnessCommandStream, nativeSceneQueryEffectLog, parseAxisExpectation, playtestCommand, resourceObservationDiagnostics } from "./playtest.js";

test("web playtest exact stepping delegates N ticks without unpausing", async () => {
  const pauses: boolean[] = [];
  let advanced = 0;
  const previousRuntime = globalThis.__THREENATIVE_RUNTIME__;
  globalThis.__THREENATIVE_RUNTIME__ = {
    setPaused: (paused) => pauses.push(paused),
    stepFixedTicks: async (ticks) => {
      advanced += ticks;
      return { endTick: advanced, startTick: advanced - ticks, ticks };
    },
  };
  const page = {
    evaluate: async <T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T> => fn(arg),
    waitForFunction: async () => { throw new Error("exact stepping must not poll rendered frames"); },
    waitForTimeout: async () => { throw new Error("exact stepping must not wait for rendered frames"); },
  };
  try {
    assert.equal(await advanceWebFixedTicks(page as never, 7), "exact-fixed-ticks");
    assert.equal(advanced, 7);
    assert.deepEqual(pauses, []);
  } finally {
    globalThis.__THREENATIVE_RUNTIME__ = previousRuntime;
  }
});

test("web playtest exact stepping retains the older-runtime frame fallback", async () => {
  const pauses: boolean[] = [];
  let samples = 0;
  const previousRuntime = globalThis.__THREENATIVE_RUNTIME__;
  globalThis.__THREENATIVE_RUNTIME__ = {
    performanceSnapshot: () => ({ summary: { sampleCount: samples } }),
    setPaused: (paused) => pauses.push(paused),
  };
  const page = {
    evaluate: async <T, A>(fn: (arg: A) => T | Promise<T>, arg: A): Promise<T> => fn(arg),
    waitForFunction: async (_fn: unknown, expected: number) => { samples = expected; },
    waitForTimeout: async () => {},
  };
  try {
    assert.equal(await advanceWebFixedTicks(page as never, 2), "rendered-frame-fallback");
    assert.deepEqual(pauses, [false, true]);
    assert.equal(samples, 2);
  } finally {
    globalThis.__THREENATIVE_RUNTIME__ = previousRuntime;
  }
});

test("native playtest should route occlusion assertions through rendered scene queries", () => {
  const scenario = {
    assert: { occluded: [{ entity: "listener", target: "emitter" }] },
    name: "render-occlusion",
    schemaVersion: 1 as const,
    steps: [],
    target: "bevy" as const,
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
  const stream = nativeHarnessCommandStream(scenario, {}) as { commands: Array<Record<string, unknown>> };
  assert.deepEqual(stream.commands[0], {
    from: "listener",
    tick: 5,
    to: "emitter",
    type: "sceneOcclusion",
  });

  assert.deepEqual(nativeSceneQueryEffectLog([{
    sceneQueries: [{ distance: 2, from: "listener", hit: true, occluder: "wall.render-only", to: "emitter" }],
  }]), {
    entries: [{
      payload: {
        request: { entity: "listener", target: "emitter" },
        result: { distance: 2, entityId: "wall.render-only", hit: true },
      },
      service: "render.sceneRayQuery",
    }],
  });
});

test("native playtest should route typed overlay messages through the proof harness", () => {
  const scenario = {
    name: "overlay-message",
    schemaVersion: 1 as const,
    steps: [{
      overlayMessage: { overlayId: "hud", payload: { side: "white" }, type: "chess:choose-side" },
      release: true,
    }],
    target: "desktop" as const,
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
  const stream = nativeHarnessCommandStream(scenario, {}) as { commands: Array<Record<string, unknown>> };
  assert.deepEqual(stream.commands[0], {
    messageType: "chess:choose-side",
    overlayId: "hud",
    payload: { side: "white" },
    tick: 6,
    type: "overlayMessage",
  });
});

test("native playtest should capture resized and restored window states", () => {
  const scenario = {
    name: "overlay-window-lifecycle",
    schemaVersion: 1 as const,
    steps: [
      { release: true, screenshot: "resized", waitFrames: 3, window: { height: 640, operation: "resize" as const, width: 1000 } },
      { release: true, waitFrames: 2, window: { operation: "minimize" as const } },
      { release: true, screenshot: "restored", waitFrames: 4, window: { operation: "restore" as const } },
    ],
    target: "desktop" as const,
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
  const stream = nativeHarnessCommandStream(scenario, {
    stepScreenshots: { resized: "/proof/resized.png", restored: "/proof/restored.png" },
  }) as { commands: Array<Record<string, unknown>> };

  assert.deepEqual(stream.commands.slice(0, 6), [
    { height: 640, operation: "resize", tick: 6, type: "window", width: 1000 },
    { path: "/proof/resized.png", tick: 9, type: "screenshot" },
    { operation: "minimize", tick: 9, type: "window" },
    { operation: "restore", tick: 11, type: "window" },
    { path: "/proof/restored.png", tick: 15, type: "screenshot" },
    { tick: 17, type: "exit" },
  ]);
});

test("native playtest should fast-forward exact holdTicks and waitTicks in command order", () => {
  const scenario = {
    name: "exact-native-ticks",
    schemaVersion: 1 as const,
    steps: [
      { holdTicks: 125, press: "KeyW", release: true },
      { kind: "wait" as const, release: true, screenshot: "settled", waitTicks: 64 },
    ],
    target: "desktop" as const,
    viewport: { height: 720, width: 1280 },
    warmupFrames: 5,
  };
  const stream = nativeHarnessCommandStream(scenario, {
    afterArtifact: "/proof/after.png",
    beforeArtifact: "/proof/before.png",
    stepScreenshots: { settled: "/proof/settled.png" },
  }) as { commands: Array<Record<string, unknown>> };

  assert.deepEqual(stream.commands, [
    { path: "/proof/before.png", tick: 5, type: "screenshot" },
    { code: "KeyW", pressed: true, tick: 6, type: "key" },
    { frames: 60, tick: 6, type: "advance" },
    { frames: 60, tick: 66, type: "advance" },
    { frames: 5, tick: 126, type: "advance" },
    { code: "KeyW", pressed: false, tick: 131, type: "key" },
    { frames: 60, tick: 131, type: "advance" },
    { frames: 4, tick: 191, type: "advance" },
    { path: "/proof/settled.png", tick: 195, type: "screenshot" },
    { path: "/proof/after.png", tick: 196, type: "screenshot" },
    { tick: 197, type: "exit" },
  ]);
});

test("playtest command should pass when target transform changes after input", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player.car", "--press", "KeyW", "--frames", "60", "--expect-moved", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 60, position: [1, 0, 0], tick: 60 },
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 1,
        entity: options.entityId,
        expectAxis: options.expectAxis,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementDelta: [1, 0, 0],
        movementThreshold: options.movementThreshold,
        pass: true,
        performance: {
          averageFrameMs: 16,
          averageFps: 62.5,
          budgetFrameMs: 16.666666666666668,
          framesOverBudget: 0,
          jankFramePercent: 0,
          minFps: 50,
          p95FrameMs: 18,
          p95Fps: 55.55555555555556,
          sampleCount: 3,
          source: "web-runtime",
          worstFrameMs: 20,
        },
        runtime: "web",
        url: "http://127.0.0.1:5173/",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { summary: string }; code: string; distance: number; entity: string; input: string; next: string; notice: string; performance: { sampleCount: number; source: string }; reproduceCommand: string; scenario: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.next, "tn iterate --project . --json");
  assert.match(payload.notice, /Standalone playtest is subsumed/);
  assert.equal(payload.entity, "player.car");
  assert.equal(payload.input, "KeyW");
  assert.equal(payload.distance, 1);
  assert.equal(payload.performance.source, "web-runtime");
  assert.equal(payload.performance.sampleCount, 3);
  assert.equal(payload.scenario, "player.car-KeyW");
  assert.match(payload.artifacts.summary, /artifacts\/playtest\/player.car-KeyW\/.+\/summary\.json$/);
  assert.match(payload.reproduceCommand, /tn playtest --project \./);
  assert.equal(JSON.parse(await readFile(payload.artifacts.summary, "utf8")).code, "TN_PLAYTEST_OK");
});

test("playtest command should omit effect log and observations from default json stdout", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyW", "--frames", "60", "--expect-moved", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 60, position: [1, 0, 0], tick: 60 },
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 1,
        effectLog: [{ frame: 1, type: "input" }],
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementThreshold: options.movementThreshold,
        observations: {
          console: [],
          effectLog: [{ frame: 1, type: "input" }],
          hud: {},
          network: [],
          resources: {},
          runtimeDiagnostics: { frames: Array.from({ length: 100 }, (_, index) => ({ index })) },
        },
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { effectLog: string; observations: string }; counts: { effectCount: number }; effectLog?: unknown; observations?: unknown; schema: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.schema, "threenative.playtest-summary");
  assert.equal("effectLog" in payload, false);
  assert.equal("observations" in payload, false);
  assert.equal(payload.counts.effectCount, 1);
  assert.match(payload.artifacts.effectLog, /effect-log\.json$/);
  assert.match(payload.artifacts.observations, /observations\.json$/);
});

test("playtest command should emit a bounded write audit artifact when requested", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyW", "--frames", "1", "--audit-writes", "--json"],
    root,
    {
      runner: async (options) => {
        assert.equal(options.auditWrites, true);
        return {
          before: { frame: 0, position: [0, 0, 0], tick: 0 },
          debugColliders: options.debugColliders,
          distance: 0,
          diagnostics: [],
          entity: options.entityId,
          expectMoved: options.expectMoved,
          frames: options.frames,
          input: options.press,
          movementThreshold: options.movementThreshold,
          pass: true,
          runtime: "web" as const,
          writeAudit: { observations: [], schema: "threenative.runtime-write-audit", version: "0.1.0" },
        };
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { writeAudit?: string }; code: string };
  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.match(payload.artifacts.writeAudit ?? "", /write-audit\.json$/);
  assert.deepEqual(JSON.parse(await readFile(payload.artifacts.writeAudit ?? "", "utf8")), {
    observations: [],
    schema: "threenative.runtime-write-audit",
    version: "0.1.0",
  });
});

test("playtest command should include effect log only when effects stdout is requested", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyW", "--frames", "60", "--effects", "stdout", "--json"],
    root,
    {
      runner: async (options) => ({
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 0,
        effectLog: [{ frame: 1, type: "input" }],
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementThreshold: options.movementThreshold,
        observations: { console: [], effectLog: [{ frame: 1, type: "input" }], hud: {}, network: [], resources: {}, runtimeDiagnostics: {} },
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { effectLog?: unknown[]; observations?: unknown };

  assert.equal(result.exitCode, 0);
  assert.deepEqual(payload.effectLog, [{ frame: 1, type: "input" }]);
  assert.ok(payload.observations);
});

test("playtest command should keep full playtest logs on disk", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyW", "--frames", "60", "--json"],
    root,
    {
      runner: async (options) => ({
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 0,
        effectLog: [{ frame: 1, type: "input" }],
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementThreshold: options.movementThreshold,
        observations: { console: [], effectLog: [{ frame: 1, type: "input" }], hud: {}, network: [], resources: {}, runtimeDiagnostics: {} },
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { effectLog: string; observations: string; summary: string } };
  const effectLog = JSON.parse(await readFile(payload.artifacts.effectLog, "utf8")) as unknown[];
  const observations = JSON.parse(await readFile(payload.artifacts.observations, "utf8")) as { effectLog: unknown[] };
  const summary = JSON.parse(await readFile(payload.artifacts.summary, "utf8")) as { effectLog?: unknown; observations?: unknown };

  assert.deepEqual(effectLog, [{ frame: 1, type: "input" }]);
  assert.deepEqual(observations.effectLog, [{ frame: 1, type: "input" }]);
  assert.equal("effectLog" in summary, false);
  assert.equal("observations" in summary, false);
});

test("playtest command should write bounded summary json with deep log pointers", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyW", "--frames", "60", "--stable-artifacts", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 60, position: [1, 0, 0], tick: 60 },
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 1,
        effectLog: Array.from({ length: 250 }, (_, index) => ({ frame: index, type: "frame" })),
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementThreshold: options.movementThreshold,
        observations: {
          console: [],
          effectLog: [],
          hud: {},
          network: [],
          physicsDebug: {
            artifact: { primitives: Array.from({ length: 250 }, (_, index) => ({ category: "force", id: `force.${index}`, kind: "line" })) },
            schema: "threenative.physics-debug-snapshot",
            summary: { primitives: [] },
            version: "0.1.0",
          },
          resources: {},
          runtimeDiagnostics: { frames: Array.from({ length: 250 }, (_, index) => ({ index })) },
        },
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { effectLog: string; observations: string; summary: string }; schema: string };
  const summaryText = await readFile(payload.artifacts.summary, "utf8");
  const summary = JSON.parse(summaryText) as { artifacts: { effectLog: string; observations: string }; effectLog?: unknown; finalPoses: unknown[]; observations?: unknown; schema: string };
  const observations = JSON.parse(await readFile(payload.artifacts.observations, "utf8")) as { physicsDebug: { artifact: { primitives: unknown[] } } };

  assert.equal(payload.schema, "threenative.playtest-summary");
  assert.equal(summary.schema, "threenative.playtest-summary");
  assert.equal("effectLog" in summary, false);
  assert.equal("observations" in summary, false);
  assert.match(summary.artifacts.effectLog, /effect-log\.json$/);
  assert.match(summary.artifacts.observations, /observations\.json$/);
  assert.equal(summary.finalPoses.length, 1);
  assert.equal(observations.physicsDebug.artifact.primitives.length, 250);
  assert.ok(Buffer.byteLength(summaryText, "utf8") < 4096);
  assert.ok(Buffer.byteLength(result.stdout, "utf8") < 4096);
});

test("playtest command should report latest playtest summary without reading deep logs to stdout", async () => {
  const root = await playtestTempRoot();
  await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyW", "--frames", "60", "--stable-artifacts", "--json"],
    root,
    {
      runner: async (options) => ({
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 0,
        effectLog: Array.from({ length: 250 }, (_, index) => ({ frame: index, type: "frame" })),
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementThreshold: options.movementThreshold,
        observations: { console: [], effectLog: [], hud: {}, network: [], resources: {}, runtimeDiagnostics: { frames: Array.from({ length: 250 }, (_, index) => ({ index })) } },
        pass: true,
        runtime: "web",
      }),
    },
  );
  const report = await playtestCommand(["report", "--project", ".", "--latest", "--scenario", "player-KeyW", "--json"], root);
  const payload = JSON.parse(report.stdout) as { artifacts: { effectLog: string }; effectLog?: unknown; observations?: unknown; scenario: string };

  assert.equal(report.exitCode, 0);
  assert.equal(payload.scenario, "player-KeyW");
  assert.equal("effectLog" in payload, false);
  assert.equal("observations" in payload, false);
  assert.match(payload.artifacts.effectLog, /effect-log\.json$/);
  assert.ok(Buffer.byteLength(report.stdout, "utf8") < 4096);
});

test("playtest command should fail when entity does not move after input", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player.car", "--press", "KeyW", "--frames", "60", "--expect-moved", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 60, position: [0, 0, 0], tick: 60 },
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
        distance: 0,
        entity: options.entityId,
        expectAxis: options.expectAxis,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementDelta: [0, 0, 0],
        movementThreshold: options.movementThreshold,
        pass: false,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string }> };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PLAYTEST_FAILED");
  assert.equal(payload.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_INPUT_NO_EFFECT"), true);
});

test("playtest command should pass expect-axis to runner", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyD", "--frames", "45", "--expect-moved", "--expect-axis", "x", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 45, position: [2.5, 0.03, 3], tick: 45 },
        before: { frame: 0, position: [0, 0, 3], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 2.5,
        entity: options.entityId,
        expectAxis: options.expectAxis,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementDelta: [2.5, 0.03, 0],
        movementThreshold: options.movementThreshold,
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string; expectAxis: string; movementDelta: [number, number, number] };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.expectAxis, "x");
  assert.deepEqual(payload.movementDelta, [2.5, 0.03, 0]);
});

test("playtest command should reject invalid expect-axis", async () => {
  const result = await playtestCommand(
    ["--project", "examples/metro-surfer-heist", "--entity", "runner", "--press", "KeyD", "--frames", "45", "--expect-axis", "forward", "--json"],
    "/repo",
  );
  const payload = JSON.parse(result.stdout) as { code: string; message: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PLAYTEST_EXPECT_AXIS_INVALID");
  assert.match(payload.message, /x, y, z/);
});

test("playtest command should pass debug collider flag to runner", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "ball", "--press", "Space", "--frames", "20", "--debug", "--json"],
    root,
    {
      runner: async (options) => ({
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliderCount: 12,
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 0,
        entity: options.entityId,
        expectAxis: options.expectAxis,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementThreshold: options.movementThreshold,
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { debugColliderCount: number; debugColliders: boolean };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.debugColliders, true);
  assert.equal(payload.debugColliderCount, 12);
});

test("playtest command should pass signed expect-axis and follow options to runner", async () => {
  const root = await playtestTempRoot();
  let received: { expectAxis?: string; follow?: { entityId: string; within: number } } | undefined;
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyW", "--frames", "45", "--expect-moved", "--expect-axis", "-z", "--follow", "camera.main", "--follow-within", "7.5", "--json"],
    root,
    {
      runner: async (options) => {
        received = { expectAxis: options.expectAxis, follow: options.follow };
        return {
          after: { frame: 45, position: [0, 0.02, 2], tick: 45 },
          before: { frame: 0, position: [0, 0.02, 5], tick: 0 },
          debugColliders: options.debugColliders,
          diagnostics: [],
          distance: 3,
          entity: options.entityId,
          expectAxis: options.expectAxis,
          expectMoved: options.expectMoved,
          follow: { entity: "camera.main", moved: 2.6, separation: 6, within: options.follow?.within ?? 0 },
          frames: options.frames,
          input: options.press,
          movementDelta: [0, 0, -3],
          movementThreshold: options.movementThreshold,
          pass: true,
          runtime: "web",
        };
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string; expectAxis: string; follow: { entity: string; within: number } };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.expectAxis, "-z");
  assert.equal(payload.follow.entity, "camera.main");
  assert.deepEqual(received, { expectAxis: "-z", follow: { entityId: "camera.main", within: 7.5 } });
});

test("playtest command should load scenario steps and preserve order", async () => {
  const root = await playtestTempRoot();
  await writeFile(
    join(root, "smoke.playtest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      name: "smoke-movement",
      target: "web",
      subject: "player",
      setup: { entities: [{ entity: "player", position: [0, 0.02, 5] }] },
      steps: [
        { label: "forward", press: "KeyW", holdFrames: 45, release: true, waitFrames: 5 },
        { label: "right", press: "KeyD", holdFrames: 20, release: true },
      ],
      assert: { movement: { entity: "player", minDistance: 0.25, axis: "-z" }, camera: { entity: "camera.main", follows: "player", within: 8 } },
    }, null, 2)}\n`,
    "utf8",
  );
  let receivedSteps: readonly unknown[] = [];
  let receivedSetup: unknown;
  const result = await playtestCommand(
    ["--project", ".", "--scenario", "smoke.playtest.json", "--stable-artifacts", "--json"],
    root,
    {
      runner: async (options) => {
        receivedSteps = options.scenario.steps;
        receivedSetup = options.scenario.setup;
        return {
          after: { frame: 65, position: [0, 0, -1], tick: 65 },
          before: { frame: 0, position: [0, 0, 0], tick: 0 },
          debugColliders: options.debugColliders,
          diagnostics: [],
          distance: 1,
          entity: options.entityId,
          expectAxis: options.expectAxis,
          expectMoved: options.expectMoved,
          follow: { entity: "camera.main", moved: 1, separation: 4, within: options.follow?.within ?? 0 },
          frames: options.frames,
          input: options.press,
          movementDelta: [0, 0, -1],
          movementThreshold: options.movementThreshold,
          pass: true,
          runtime: "web",
        };
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { directory: string; manifest: string }; code: string; scenario: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.scenario, "smoke-movement");
  assert.equal(payload.artifacts.directory, join(root, "artifacts/playtest/smoke-movement/latest"));
  assert.deepEqual(receivedSteps, [
    { holdFrames: 45, label: "forward", press: "KeyW", release: true, waitFrames: 5 },
    { holdFrames: 20, label: "right", press: "KeyD", release: true },
  ]);
  assert.deepEqual(receivedSetup, { entities: [{ entity: "player", position: [0, 0.02, 5] }] });
  const manifest = JSON.parse(await readFile(payload.artifacts.manifest, "utf8")) as { scenario: string };
  assert.equal(manifest.scenario, "smoke-movement");
});

test("playtest command should reject invalid scenario files with stable diagnostics", async () => {
  const root = await playtestTempRoot();
  await writeFile(join(root, "bad.playtest.json"), JSON.stringify({ schemaVersion: 1, name: "bad", steps: [{ holdFrames: 0 }] }), "utf8");
  const result = await playtestCommand(["--project", ".", "--scenario", "bad.playtest.json", "--json"], root);
  const payload = JSON.parse(result.stdout) as { code: string; message: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PLAYTEST_SCENARIO_STEP_INVALID");
  assert.match(payload.message, /invalid step/);
});

test("playtest command should run desktop target through native proof harness", async () => {
  const root = await playtestTempRoot();
  await cp(join(import.meta.dirname, "../template-files/structured-source-starter"), root, { recursive: true });
  await writeFile(
    join(root, "desktop-setup.playtest.json"),
    JSON.stringify({
      schemaVersion: 1,
      name: "desktop-setup",
      subject: "player",
      setup: { entities: [{ entity: "player", position: [0, 0.02, 5] }] },
      steps: [{ press: "KeyW", holdFrames: 30, release: true }],
      assert: { movement: { entity: "player", axis: "-z", minDistance: 1 } },
    }),
    "utf8",
  );
  let commandStreamPath: string | undefined;
  let readinessOutPath: string | undefined;
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--scenario", "desktop-setup.playtest.json", "--audit-writes", "--json"],
    root,
    {
      bevyRunner: (invocation) => {
        commandStreamPath = invocation.proofHarness?.commandStreamPath;
        readinessOutPath = invocation.proofHarness?.readinessOutPath;
        const process = new EventEmitter() as ChildProcess;
        process.kill = () => true;
        void (async () => {
          assert.ok(readinessOutPath);
          await mkdir(join(dirname(readinessOutPath), "native-recording"), { recursive: true });
          await writeFile(join(dirname(readinessOutPath), "before.png"), "fake-native-before-png");
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              performance: { elapsed_ms: 0, fps: 62.5, frame_ms: 16 },
              schema: "threenative.native-proof-readiness",
              tick: 0,
              transforms: [{ entity: "player", position: [0, 0, 0] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 35));
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              performance: { elapsed_ms: 16.6667, fps: 60, frame_ms: 16.6667 },
              schema: "threenative.native-proof-readiness",
              tick: 6,
              transforms: [{ entity: "player", position: [0, 0, 0] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 35));
          await writeFile(join(dirname(readinessOutPath), "after.png"), "fake-native-after-png");
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              performance: { elapsed_ms: 33.3334, fps: 30, frame_ms: 33.3334 },
              physicsDebug: {
                artifact: {
                  omittedPrimitives: 0,
                  primitives: [{ category: "joint-load", id: "joint-load:door", kind: "line", value: 12 }],
                  telemetry: { allocatedPieces: 0, bodies: { active: 1, sleeping: 0 }, contacts: 0, fixedDt: 1 / 60, queries: 0, rebuilds: 0, solverIterations: 4, tick: 37, timings: [] },
                  truncated: false,
                },
                schema: "threenative.physics-debug-snapshot",
                summary: { omittedPrimitives: 0, primitives: [], telemetry: { allocatedPieces: 0, bodies: { active: 1, sleeping: 0 }, contacts: 0, fixedDt: 1 / 60, queries: 0, rebuilds: 0, solverIterations: 4, tick: 37, timings: [] }, truncated: false },
                version: "0.1.0",
              },
              schema: "threenative.native-proof-readiness",
              tick: 37,
              transforms: [{ entity: "player", position: [0, 0, -1.1] }],
              version: "0.1.0",
              writeAudit: { diagnostics: [], observations: [], schema: "threenative.runtime-write-audit", version: "0.1.0" },
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 10));
          process.emit("exit", 0, null);
        })();
        return process;
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { nativeFrameSamples: string; observations: string; summary: string; writeAudit: string }; code: string; distance: number; runtime: string; target: string };
  const commandStream = JSON.parse(await readFile(commandStreamPath ?? "", "utf8")) as { commands: Array<{ code?: string; entity?: string; frames?: number; position?: number[]; pressed?: boolean; tick: number; type: string }> };
  const summary = JSON.parse(await readFile(payload.artifacts.summary, "utf8")) as { diagnostics: unknown[]; movementDelta: number[]; nativeRecording: { frames: Array<{ byteSize: number; tick: number }> }; performance: { framesOverBudget: number; measurement: string; note: string; sampleCount: number; scope: string; source: string; worstFrameMs: number }; runtime: string; target: string };
  const nativeFrameSamples = JSON.parse(await readFile(payload.artifacts.nativeFrameSamples, "utf8")) as { samples: Array<{ frameMs: number; tick: number }>; summaries: { all: { sampleCount: number; worstFrameMs: number }; dropFirst: { sampleCount: number; worstFrameMs: number } } };
  const observations = JSON.parse(await readFile(payload.artifacts.observations, "utf8")) as {
    physicsDebug: { artifact: { primitives: Array<{ id: string }> } };
    physicsDebugSeries: Array<{ label: string; snapshot: { artifact: { telemetry: { tick: number } } }; tick: number }>;
    runtimeDiagnostics: { readiness: Array<{ tick: number }> };
  };
  const writeAudit = JSON.parse(await readFile(payload.artifacts.writeAudit, "utf8")) as { diagnostics: unknown[]; observations: unknown[]; schema: string; version: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.runtime, "bevy");
  assert.equal(payload.target, "desktop");
  assert.equal(writeAudit.schema, "threenative.runtime-write-audit");
  assert.equal(writeAudit.version, "0.1.0");
  assert.deepEqual(writeAudit.observations, []);
  assert.equal(payload.distance, 1.1);
  assert.deepEqual(summary.movementDelta, [0, 0, -1.1]);
  assert.deepEqual(summary.diagnostics, []);
  assert.deepEqual(summary.nativeRecording.frames, []);
  assert.equal(summary.performance.source, "native-proof-harness");
  assert.equal(summary.performance.measurement, "native-proof-harness-cadence");
  assert.equal(summary.performance.scope, "steady-state");
  assert.match(summary.performance.note, /not a display\/vsync FPS measurement/u);
  assert.equal(summary.performance.sampleCount, 1);
  assert.equal(summary.performance.framesOverBudget, 1);
  assert.equal(summary.performance.worstFrameMs, 33.3334);
  assert.deepEqual(nativeFrameSamples.samples.map((sample) => ({ frameMs: sample.frameMs, tick: sample.tick })), [
    { frameMs: 16, tick: 0 },
    { frameMs: 16.6667, tick: 6 },
    { frameMs: 33.3334, tick: 37 },
  ]);
  assert.equal(nativeFrameSamples.summaries.all.sampleCount, 3);
  assert.equal(nativeFrameSamples.summaries.dropFirst.sampleCount, 2);
  assert.equal(nativeFrameSamples.summaries.dropFirst.worstFrameMs, 33.3334);
  assert.equal(summary.runtime, "bevy");
  assert.equal(summary.target, "desktop");
  assert.deepEqual(observations.physicsDebug.artifact.primitives.map((primitive) => primitive.id), ["joint-load:door"]);
  assert.deepEqual(observations.physicsDebugSeries.map(({ label, snapshot, tick }) => ({ label, runtimeTick: snapshot.artifact.telemetry.tick, tick })), [
    { label: "step-1", runtimeTick: 37, tick: 37 },
  ]);
  assert.deepEqual(commandStream.commands.map((command) => ({ code: command.code, entity: command.entity, frames: command.frames, position: command.position, pressed: command.pressed, tick: command.tick, type: command.type })), [
    { code: undefined, entity: "player", frames: undefined, position: [0, 0.02, 5], pressed: undefined, tick: 5, type: "setTransform" },
    { code: "KeyW", entity: undefined, frames: undefined, position: undefined, pressed: true, tick: 6, type: "key" },
    { code: "KeyW", entity: undefined, frames: undefined, position: undefined, pressed: false, tick: 36, type: "key" },
    { code: undefined, entity: undefined, frames: undefined, position: undefined, pressed: undefined, tick: 38, type: "exit" },
  ]);
  assert.deepEqual(observations.runtimeDiagnostics.readiness.map((sample) => sample.tick), [0, 6, 37]);
});

test("playtest command should ignore stale native readiness in reused artifact directories", async () => {
  const root = await playtestTempRoot();
  await cp(join(import.meta.dirname, "../template-files/structured-source-starter"), root, { recursive: true });
  const outDir = join(root, "artifacts/reused-native");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "native-readiness.json"),
    `${JSON.stringify({
      diagnostics: [],
      ok: true,
      performance: { elapsed_ms: 9999, fps: 1, frame_ms: 999 },
      schema: "threenative.native-proof-readiness",
      tick: 999,
      transforms: [{ entity: "player", position: [999, 0, 0] }],
      version: "0.1.0",
    })}\n`,
    "utf8",
  );
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--entity", "player", "--press", "KeyW", "--frames", "30", "--expect-moved", "--out", "artifacts/reused-native", "--json"],
    root,
    {
      bevyRunner: (invocation) => {
        const readinessOutPath = invocation.proofHarness?.readinessOutPath;
        const process = new EventEmitter() as ChildProcess;
        process.kill = () => true;
        void (async () => {
          assert.ok(readinessOutPath);
          await mkdir(dirname(readinessOutPath), { recursive: true });
          await new Promise((resolve) => setTimeout(resolve, 35));
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              performance: { elapsed_ms: 0, fps: 62.5, frame_ms: 16 },
              schema: "threenative.native-proof-readiness",
              tick: 0,
              transforms: [{ entity: "player", position: [0, 0, 0] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 35));
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              performance: { elapsed_ms: 33.3334, fps: 30, frame_ms: 33.3334 },
              schema: "threenative.native-proof-readiness",
              tick: 37,
              transforms: [{ entity: "player", position: [0, 0, -1] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          process.emit("exit", 0, null);
        })();
        return process;
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { nativeFrameSamples: string; observations: string }; code: string; distance: number };
  const observations = JSON.parse(await readFile(payload.artifacts.observations, "utf8")) as { runtimeDiagnostics: { readiness: Array<{ tick: number }> } };
  const nativeFrameSamples = JSON.parse(await readFile(payload.artifacts.nativeFrameSamples, "utf8")) as { samples: Array<{ tick: number }> };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.distance, 1);
  assert.deepEqual(observations.runtimeDiagnostics.readiness.map((sample) => sample.tick), [0, 37]);
  assert.deepEqual(nativeFrameSamples.samples.map((sample) => sample.tick), [0, 37]);
});

test("playtest command should step desktop native screenshot proofs without collapsing frame timing", async () => {
  const root = await playtestTempRoot();
  await cp(join(import.meta.dirname, "../template-files/structured-source-starter"), root, { recursive: true });
  let commandStreamPath: string | undefined;
  let readinessOutPath: string | undefined;
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--entity", "player", "--press", "KeyW", "--frames", "30", "--expect-moved", "--native-screenshots", "--json"],
    root,
    {
      bevyRunner: (invocation) => {
        commandStreamPath = invocation.proofHarness?.commandStreamPath;
        readinessOutPath = invocation.proofHarness?.readinessOutPath;
        const process = new EventEmitter() as ChildProcess;
        process.kill = () => true;
        void (async () => {
          assert.ok(readinessOutPath);
          await mkdir(dirname(readinessOutPath), { recursive: true });
          await writeFile(join(dirname(readinessOutPath), "before.png"), "fake-native-before-png");
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              schema: "threenative.native-proof-readiness",
              tick: 0,
              transforms: [{ entity: "player", position: [0, 0, 0] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 35));
          await writeFile(join(dirname(readinessOutPath), "after.png"), "fake-native-after-png");
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              schema: "threenative.native-proof-readiness",
              tick: 37,
              transforms: [{ entity: "player", position: [0, 0, -1] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 10));
          process.emit("exit", 0, null);
        })();
        return process;
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { summary: string }; code: string };
  const commandStream = JSON.parse(await readFile(commandStreamPath ?? "", "utf8")) as { commands: Array<{ code?: string; frames?: number; path?: string; pressed?: boolean; tick: number; type: string }> };
  const summary = JSON.parse(await readFile(payload.artifacts.summary, "utf8")) as { artifact?: string; nativeRecording: { frames: Array<{ byteSize: number; tick: number }> } };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.match(summary.artifact ?? "", /after\.png$/);
  assert.deepEqual(summary.nativeRecording.frames, []);
  assert.deepEqual(commandStream.commands.map((command) => ({ code: command.code, frames: command.frames, pressed: command.pressed, tick: command.tick, type: command.type })), [
    { code: undefined, frames: undefined, pressed: undefined, tick: 5, type: "screenshot" },
    { code: "KeyW", frames: undefined, pressed: true, tick: 6, type: "key" },
    { code: "KeyW", frames: undefined, pressed: false, tick: 36, type: "key" },
    { code: undefined, frames: undefined, pressed: undefined, tick: 37, type: "screenshot" },
    { code: undefined, frames: undefined, pressed: undefined, tick: 38, type: "exit" },
  ]);
});

test("playtest command should report native signal crashes with readiness phase and captured output", async () => {
  const root = await playtestTempRoot();
  await cp(join(import.meta.dirname, "../template-files/structured-source-starter"), root, { recursive: true });
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--entity", "player", "--press", "KeyW", "--frames", "30", "--expect-moved", "--json"],
    root,
    {
      bevyRunner: (invocation) => {
        const process = new EventEmitter() as ChildProcess;
        const stdout = new PassThrough();
        const stderr = new PassThrough();
        Object.assign(process, { kill: () => true, stderr, stdout });
        void (async () => {
          const readinessOutPath = invocation.proofHarness?.readinessOutPath;
          assert.ok(readinessOutPath);
          await mkdir(dirname(readinessOutPath), { recursive: true });
          await writeFile(readinessOutPath, `${JSON.stringify({ phase: "loading-world", tick: 2 })}\n`, "utf8");
          stderr.write("adapter initialized\nGPU process terminated\n");
          await new Promise((resolve) => setTimeout(resolve, 35));
          process.emit("exit", null, "SIGSEGV");
        })();
        return process;
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string; message: string; phase: string };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PLAYTEST_NATIVE_CRASH");
  assert.equal(payload.phase, "loading-world");
  assert.match(payload.message, /signal SIGSEGV during loading-world/);
  assert.match(payload.message, /GPU process terminated/);
  assert.doesNotThrow(() => JSON.parse(result.stdout));
});

test("playtest command should report waived-headless gate as warning", async () => {
  const root = await playtestTempRoot();
  await cp(join(import.meta.dirname, "../template-files/structured-source-starter"), root, { recursive: true });
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--entity", "player", "--press", "KeyW", "--frames", "30", "--expect-moved", "--headless", "--json"],
    root,
    {
      bevyRunner: () => {
        throw new NativeHeadlessUnsupportedError();
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string; gate: string; message: string; severity: string }> };
  const waiver = payload.diagnostics[0];

  assert.equal(result.exitCode, 0);
  assert.equal(waiver?.code, "TN_PLAYTEST_NATIVE_HEADLESS_UNSUPPORTED");
  assert.equal(waiver?.gate, "waived-headless");
  assert.equal(waiver?.severity, "warning");
  assert.doesNotMatch(waiver?.message ?? "", /winit|panic|backtrace/i);
});

test("playtest command should fail desktop native screenshot proofs when screenshots are missing", async () => {
  const root = await playtestTempRoot();
  await cp(join(import.meta.dirname, "../template-files/structured-source-starter"), root, { recursive: true });
  let readinessOutPath: string | undefined;
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--entity", "player", "--press", "KeyW", "--frames", "30", "--expect-moved", "--native-screenshots", "--json"],
    root,
    {
      bevyRunner: (invocation) => {
        readinessOutPath = invocation.proofHarness?.readinessOutPath;
        const process = new EventEmitter() as ChildProcess;
        process.kill = () => true;
        void (async () => {
          assert.ok(readinessOutPath);
          await mkdir(dirname(readinessOutPath), { recursive: true });
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              schema: "threenative.native-proof-readiness",
              tick: 0,
              transforms: [{ entity: "player", position: [0, 0, 0] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 35));
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              schema: "threenative.native-proof-readiness",
              tick: 37,
              transforms: [{ entity: "player", position: [0, 0, -1] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 10));
          process.emit("exit", 0, null);
        })();
        return process;
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { summary: string }; code: string };
  const summary = JSON.parse(await readFile(payload.artifacts.summary, "utf8")) as { diagnostics: Array<{ code: string; severity: string }> };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PLAYTEST_FAILED");
  assert.equal(summary.diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_NATIVE_SCREENSHOT_MISSING" && diagnostic.severity === "error"), true);
});

test("playtest command should opt into desktop native recording screenshots", async () => {
  const root = await playtestTempRoot();
  await cp(join(import.meta.dirname, "../template-files/structured-source-starter"), root, { recursive: true });
  let commandStreamPath: string | undefined;
  let readinessOutPath: string | undefined;
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--entity", "player", "--press", "KeyW", "--frames", "30", "--expect-moved", "--native-recording", "--json"],
    root,
    {
      bevyRunner: (invocation) => {
        commandStreamPath = invocation.proofHarness?.commandStreamPath;
        readinessOutPath = invocation.proofHarness?.readinessOutPath;
        const process = new EventEmitter() as ChildProcess;
        process.kill = () => true;
        void (async () => {
          assert.ok(readinessOutPath);
          await mkdir(join(dirname(readinessOutPath), "native-recording"), { recursive: true });
          await writeFile(join(dirname(readinessOutPath), "before.png"), "fake-native-before-png");
          for (let index = 0; index < 5; index += 1) {
            await writeFile(join(dirname(readinessOutPath), "native-recording", `frame-${String(index).padStart(3, "0")}.png`), `fake-native-recording-${index}`);
          }
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              schema: "threenative.native-proof-readiness",
              tick: 0,
              transforms: [{ entity: "player", position: [0, 0, 0] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 35));
          await writeFile(join(dirname(readinessOutPath), "after.png"), "fake-native-after-png");
          await writeFile(
            readinessOutPath,
            `${JSON.stringify({
              diagnostics: [],
              ok: true,
              schema: "threenative.native-proof-readiness",
              tick: 37,
              transforms: [{ entity: "player", position: [0, 0, -1] }],
              version: "0.1.0",
            })}\n`,
            "utf8",
          );
          await new Promise((resolve) => setTimeout(resolve, 10));
          process.emit("exit", 0, null);
        })();
        return process;
      },
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { summary: string }; code: string };
  const commandStream = JSON.parse(await readFile(commandStreamPath ?? "", "utf8")) as { commands: Array<{ tick: number; type: string }> };
  const summary = JSON.parse(await readFile(payload.artifacts.summary, "utf8")) as { nativeRecording: { frames: Array<{ byteSize: number; tick: number }> } };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.deepEqual(summary.nativeRecording.frames.map((frame) => frame.tick), [6, 13, 21, 29, 36]);
  assert.equal(summary.nativeRecording.frames.every((frame) => frame.byteSize > 0), true);
  assert.deepEqual(commandStream.commands.filter((command) => command.type === "screenshot").map((command) => command.tick), [5, 6, 13, 21, 29, 36, 37]);
});

test("playtest command should discover source-backed candidates", async () => {
  const root = await playtestTempRoot();
  await writeDiscoveryFixture(root);
  const result = await playtestCommand(["--project", ".", "--discover", "--json"], root);
  const payload = JSON.parse(result.stdout) as {
    cameras: Array<{ id: string }>;
    code: string;
    controllableEntities: Array<{ id: string; reasons: string[] }>;
    hud: Array<{ id: string }>;
    inputs: Array<{ id: string }>;
    resources: Array<{ id: string }>;
    scenarioPresets: Array<{ id: string }>;
  };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_DISCOVERY_OK");
  assert.equal(payload.controllableEntities[0]?.id, "player");
  assert.equal(payload.controllableEntities[0]?.reasons.includes("CharacterController"), true);
  assert.equal(payload.inputs.some((input) => input.id === "KeyD"), true);
  assert.equal(payload.cameras.some((camera) => camera.id === "camera.main"), true);
  assert.equal(payload.resources.some((resource) => resource.id === "GameState"), true);
  assert.equal(payload.hud.some((node) => node.id === "hud.status"), true);
  assert.equal(payload.scenarioPresets.some((preset) => preset.id === "smoke-movement"), true);
});

test("playtest command should include discovery suggestions for missing entity and input", async () => {
  const root = await playtestTempRoot();
  await writeDiscoveryFixture(root);
  const missingEntity = await playtestCommand(["--project", ".", "--press", "KeyD", "--json"], root);
  const missingEntityPayload = JSON.parse(missingEntity.stdout) as { code: string; suggestions: Array<{ id: string }> };
  const missingInput = await playtestCommand(["--project", ".", "--entity", "player", "--json"], root);
  const missingInputPayload = JSON.parse(missingInput.stdout) as { code: string; suggestions: Array<{ id: string }> };

  assert.equal(missingEntity.exitCode, 2);
  assert.equal(missingEntityPayload.code, "TN_PLAYTEST_ENTITY_REQUIRED");
  assert.equal(missingEntityPayload.suggestions[0]?.id, "player");
  assert.equal(missingInput.exitCode, 2);
  assert.equal(missingInputPayload.code, "TN_PLAYTEST_INPUT_REQUIRED");
  assert.equal(missingInputPayload.suggestions.some((suggestion) => suggestion.id === "KeyD"), true);
});

test("playtest command should suggest scenario JSON that can be run", async () => {
  const root = await playtestTempRoot();
  await writeDiscoveryFixture(root);
  const suggested = await playtestCommand(["--project", ".", "--suggest-scenario", "smoke-movement", "--json"], root, {
    discoveryDependencies: { loadBundleGrounding: async () => ({ entityIds: new Set(["player", "camera.main", "arena.floor"]), text: "keyboard.KeyD" }) },
  });
  const scenario = JSON.parse(suggested.stdout) as { assert: { movement: { entity: string } }; name: string; steps: Array<{ press: string }>; subject: string };
  await writeFile(join(root, "suggested.playtest.json"), suggested.stdout, "utf8");
  let receivedSubject: string | undefined;
  const run = await playtestCommand(
    ["--project", ".", "--scenario", "suggested.playtest.json", "--json"],
    root,
    {
      runner: async (options) => {
        receivedSubject = options.scenario.subject;
        return {
          after: { frame: 30, position: [1, 0, 0], tick: 30 },
          before: { frame: 0, position: [0, 0, 0], tick: 0 },
          debugColliders: false,
          diagnostics: [],
          distance: 1,
          entity: options.entityId,
          expectMoved: options.expectMoved,
          frames: options.frames,
          input: options.press,
          movementDelta: [1, 0, 0],
          movementThreshold: options.movementThreshold,
          pass: true,
          runtime: "web",
        };
      },
    },
  );

  assert.equal(suggested.exitCode, 0);
  assert.equal(scenario.name, "smoke-movement");
  assert.equal(scenario.subject, "player");
  assert.equal(scenario.assert.movement.entity, "player");
  assert.equal(scenario.steps[0]?.press, "KeyD");
  assert.equal(run.exitCode, 0);
  assert.equal(receivedSubject, "player");
});

test("playtest command should evaluate rich scenario assertions", async () => {
  const root = await playtestTempRoot();
  await writeFile(
    join(root, "rich.playtest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      name: "rich-assertions",
      target: "web",
      viewport: { width: 1280, height: 720 },
      subject: "player",
      steps: [{ press: "KeyW", holdFrames: 60, release: true }],
      assert: {
        movement: { entity: "player", minDistance: 0.5, minVelocity: 0.01, rotationChanged: true },
        resources: [{ id: "game", path: "started", equals: true }],
        hud: [{ id: "hud.status", textIncludes: "Go", changed: true }],
        contacts: [{ entity: "player", with: "pickup.zone", kind: "trigger", minCount: 1 }],
        animation: [{ entity: "player", clip: "Run", entered: true, advancedFrames: 10 }],
        visibility: [{ entity: "player", minProjectedPixels: 1200, maxOffscreenRatio: 0.05 }],
        diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true },
      },
    }, null, 2)}\n`,
    "utf8",
  );
  const result = await playtestCommand(
    ["--project", ".", "--scenario", "rich.playtest.json", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 60, position: [1, 0, 0], tick: 60 },
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 1,
        entity: options.entityId,
        effectLog: {
          entries: [
            { command: "setComponent", component: "Transform", entity: "player", kind: "patch", value: { position: [0, 0, 0], rotation: [0, 0, 0] } },
            { command: "setComponent", component: "Transform", entity: "player", kind: "patch", value: { position: [1, 0, 0], rotation: [0, 0.2, 0] } },
            { entity: "player", kind: "trigger", type: "contact", with: "pickup.zone" },
            { clip: "Run", entity: "player", kind: "animation", state: "advanced" },
          ],
        },
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementDelta: [1, 0, 0],
        movementThreshold: options.movementThreshold,
        observations: {
          console: [],
          effectLog: {},
          hud: { "hud.status": { before: { text: "Ready" }, after: { text: "Go 1" } } },
          network: [],
          resources: { game: { before: { started: false }, after: { started: true } } },
          runtimeDiagnostics: {
            assets: { resourceFailures: [] },
            recentRuntimeErrors: [],
            scene: { renderedEntities: [{ id: "player", projectedBounds: { min: [-0.1, -0.1], max: [0.1, 0.1] } }] },
          },
        },
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { assertions: Array<{ id: string; pass: boolean }>; code: string; diagnostics: Array<{ code: string }> };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.diagnostics.length, 0);
  assert.equal(payload.assertions.some((assertion) => assertion.id === "resource.game.started" && assertion.pass), true);
  assert.equal(payload.assertions.some((assertion) => assertion.id === "hud.hud.status" && assertion.pass), true);
  assert.equal(payload.assertions.some((assertion) => assertion.id === "visibility.player" && assertion.pass), true);
  assert.equal(payload.assertions.some((assertion) => assertion.id === "movement.rotation" && assertion.pass), true);
});

test("playtest command should fail rich assertions with stable diagnostics", async () => {
  const root = await playtestTempRoot();
  await writeFile(
    join(root, "rich-fail.playtest.json"),
    `${JSON.stringify({
      schemaVersion: 1,
      name: "rich-fail",
      target: "web",
      subject: "player",
      steps: [{ press: "KeyW", holdFrames: 20, release: true }],
      assert: {
        movement: { entity: "player", minVelocity: 2, rotationChanged: true },
        resources: [{ id: "score", path: "value", gte: 1 }],
        hud: [{ id: "hud.score", textIncludes: "1" }],
        contacts: [{ entity: "player", with: "pickup.zone", kind: "trigger", minCount: 1 }],
        animation: [{ entity: "player", clip: "Run", entered: true }],
        visibility: [{ entity: "player", minProjectedPixels: 1200 }],
        diagnostics: { noConsoleErrors: true, noNetworkErrors: true, noRuntimeDiagnostics: true },
      },
    }, null, 2)}\n`,
    "utf8",
  );
  const result = await playtestCommand(
    ["--project", ".", "--scenario", "rich-fail.playtest.json", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 20, position: [0.1, 0, 0], tick: 20 },
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [],
        distance: 0.1,
        entity: options.entityId,
        effectLog: {
          entries: [
            { frame: 1, kind: "resource", resource: "score", schedule: "update", system: "collector-system", tick: 1, value: { value: 0 } },
            { frame: 2, kind: "service", payload: { entity: "player", with: "pickup.zone" }, schedule: "update", service: "physics.overlap", system: "contact-system", tick: 2 },
          ],
        },
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementDelta: [0.1, 0, 0],
        movementThreshold: options.movementThreshold,
        observations: {
          console: [{ text: "boom", type: "error" }],
          effectLog: {},
          hud: { "hud.score": { after: { text: "Score 0" }, before: { text: "Score 0" } } },
          network: [{ method: "GET", url: "http://127.0.0.1/missing.glb" }],
          resources: { score: { after: { value: 0 }, before: { value: 0 } } },
          runtimeDiagnostics: {
            assets: { resourceFailures: [] },
            recentRuntimeErrors: [{ code: "TN_WEB_SCRIPT_ERROR", severity: "error" }],
            scene: { renderedEntities: [] },
          },
        },
        pass: true,
        runtime: "web",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ artifactPath?: string; code: string; observedRuntimePath?: string; path?: string; sourcePath?: string; systemId?: string }> };
  const codes = payload.diagnostics.map((diagnostic) => diagnostic.code);
  const resourceDiagnostic = payload.diagnostics.find((diagnostic) => diagnostic.code === "TN_PLAYTEST_RESOURCE_STATE_STAGNATED");
  const contactDiagnostic = payload.diagnostics.find((diagnostic) => diagnostic.code === "TN_PLAYTEST_CONTACT_NOT_OBSERVED");

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PLAYTEST_FAILED");
  assert.equal(codes.includes("TN_PLAYTEST_RESOURCE_STATE_STAGNATED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_HUD_ASSERTION_FAILED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_CONTACT_NOT_OBSERVED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_ANIMATION_NOT_OBSERVED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_VISIBILITY_FAILED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_CONSOLE_ERROR"), true);
  assert.equal(codes.includes("TN_PLAYTEST_NETWORK_ERROR"), true);
  assert.equal(codes.includes("TN_PLAYTEST_RUNTIME_DIAGNOSTIC"), true);
  assert.equal(codes.includes("TN_PLAYTEST_VELOCITY_ASSERTION_FAILED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_ROTATION_ASSERTION_FAILED"), true);
  assert.equal(resourceDiagnostic?.systemId, "collector-system");
  assert.equal(resourceDiagnostic?.sourcePath, "content/systems/collector-system.systems.json");
  assert.match(resourceDiagnostic?.observedRuntimePath ?? "", /effect-log\.json\/entries/);
  assert.match(resourceDiagnostic?.artifactPath ?? "", /effect-log\.json$/);
  assert.equal(contactDiagnostic?.systemId, "contact-system");
  assert.equal(contactDiagnostic?.sourcePath, "content/systems/contact-system.systems.json");
  assert.match(contactDiagnostic?.artifactPath ?? "", /effect-log\.json$/);
});

test("playtest watch should emit stable JSON events and debounce changes", async () => {
  const root = await playtestTempRoot();
  await mkdir(join(root, "playtests"), { recursive: true });
  await writeFile(join(root, "playtests/smoke.playtest.json"), JSON.stringify({ schemaVersion: 1, name: "smoke", subject: "player", steps: [{ press: "KeyD" }] }), "utf8");
  let runs = 0;
  const result = await playtestCommand(
    ["--project", ".", "--scenario", "playtests/smoke.playtest.json", "--watch", "--max-runs", "2", "--json"],
    root,
    {
      runner: async (options) => {
        runs += 1;
        return {
          after: { frame: 30, position: [runs, 0, 0], tick: 30 },
          before: { frame: 0, position: [0, 0, 0], tick: 0 },
          debugColliders: options.debugColliders,
          diagnostics: [],
          distance: runs,
          entity: options.entityId,
          expectMoved: options.expectMoved,
          frames: options.frames,
          input: options.press,
          movementDelta: [runs, 0, 0],
          movementThreshold: options.movementThreshold,
          pass: true,
          runtime: "web",
        };
      },
      watchHooks: { changes: ["src/scripts/player.ts", "src/scripts/player.ts"], debounceMs: 1 },
    },
  );
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line) as { artifact?: string; event: string; report?: { code?: string }; run?: number });

  assert.equal(result.exitCode, 0);
  assert.equal(runs, 2);
  assert.equal(events[0]?.event, "start");
  assert.equal(events.filter((event) => event.event === "change").length, 2);
  assert.deepEqual(events.filter((event) => event.event === "pass").map((event) => event.run), [1, 2]);
  assert.equal(events.some((event) => event.event === "artifact" && event.artifact?.includes("artifacts/playtest/smoke")), true);
  assert.equal(events.some((event) => event.event === "pass" && event.report?.code === "TN_PLAYTEST_OK"), true);
  assert.equal(events.at(-1)?.event, "stop");
});

test("playtest watch should emit diagnostic repair events with stable ids", async () => {
  const root = await playtestTempRoot();
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyD", "--watch", "--max-runs", "1", "--json"],
    root,
    {
      runner: async (options) => ({
        after: { frame: 30, position: [0, 0, 0], tick: 30 },
        before: { frame: 0, position: [0, 0, 0], tick: 0 },
        debugColliders: options.debugColliders,
        diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
        distance: 0,
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
        movementDelta: [0, 0, 0],
        movementThreshold: options.movementThreshold,
        pass: false,
        runtime: "web",
      }),
    },
  );
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line) as { code?: string; event: string; repairCommand?: string });

  assert.equal(result.exitCode, 1);
  assert.equal(events.some((event) => event.event === "diagnostic" && event.code === "TN_PLAYTEST_INPUT_NO_EFFECT" && event.repairCommand?.includes("--entity player") === true), true);
  assert.equal(events.some((event) => event.event === "fail" && event.repairCommand?.startsWith("tn playtest ") === true), true);
});

test("playtest watch should stop after first passing run with pass-once", async () => {
  const root = await playtestTempRoot();
  let runs = 0;
  const result = await playtestCommand(
    ["--project", ".", "--entity", "player", "--press", "KeyD", "--watch", "--max-runs", "3", "--pass-once", "--json"],
    root,
    {
      runner: async (options) => {
        runs += 1;
        return {
          after: { frame: 30, position: [1, 0, 0], tick: 30 },
          before: { frame: 0, position: [0, 0, 0], tick: 0 },
          debugColliders: options.debugColliders,
          diagnostics: [],
          distance: 1,
          entity: options.entityId,
          expectMoved: options.expectMoved,
          frames: options.frames,
          input: options.press,
          movementDelta: [1, 0, 0],
          movementThreshold: options.movementThreshold,
          pass: true,
          runtime: "web",
        };
      },
      watchHooks: { changes: ["src/scripts/player.ts"], debounceMs: 1 },
    },
  );
  const events = result.stdout.trim().split("\n").map((line) => JSON.parse(line) as { event: string; run?: number });

  assert.equal(result.exitCode, 0);
  assert.equal(runs, 1);
  assert.deepEqual(events.filter((event) => event.event === "pass").map((event) => event.run), [1]);
  assert.equal(events.at(-1)?.event, "stop");
});

test("parseAxisExpectation should accept plain and signed axes and reject junk", () => {
  assert.deepEqual(parseAxisExpectation("z"), { axis: "z" });
  assert.deepEqual(parseAxisExpectation("-z"), { axis: "z", sign: -1 });
  assert.deepEqual(parseAxisExpectation("+x"), { axis: "x", sign: 1 });
  assert.equal(parseAxisExpectation("forward"), undefined);
  assert.equal(parseAxisExpectation("--z"), undefined);
  assert.equal(parseAxisExpectation(undefined), undefined);
});

test("evaluateMovementDiagnostics should fail movement in the wrong signed direction", () => {
  const diagnostics = evaluateMovementDiagnostics({
    distance: 3,
    entityId: "player",
    expectAxis: { axis: "z", sign: -1 },
    expectMoved: true,
    movementDelta: [0, 0, 3],
    movementThreshold: 0.01,
    press: "KeyW",
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_AXIS_NO_EFFECT"), true);
});

test("evaluateMovementDiagnostics should pass movement in the correct signed direction", () => {
  const diagnostics = evaluateMovementDiagnostics({
    distance: 3,
    entityId: "player",
    expectAxis: { axis: "z", sign: -1 },
    expectMoved: true,
    movementDelta: [0.2, 0, -3],
    movementThreshold: 0.01,
    press: "KeyW",
  });

  assert.deepEqual(diagnostics, []);
});

test("evaluateMovementDiagnostics should fail a static or runaway follower", () => {
  const staticFollower = evaluateMovementDiagnostics({
    distance: 3,
    entityId: "player",
    expectMoved: true,
    follow: { entity: "camera.main", moved: 0, separation: 6, within: 10 },
    movementDelta: [0, 0, -3],
    movementThreshold: 0.01,
    press: "KeyW",
  });
  const runawayFollower = evaluateMovementDiagnostics({
    distance: 3,
    entityId: "player",
    expectMoved: true,
    follow: { entity: "camera.main", moved: 2.5, separation: 14, within: 10 },
    movementDelta: [0, 0, -3],
    movementThreshold: 0.01,
    press: "KeyW",
  });
  const missingFollower = evaluateMovementDiagnostics({
    distance: 3,
    entityId: "player",
    expectMoved: true,
    follow: { entity: "camera.main", within: 10 },
    movementDelta: [0, 0, -3],
    movementThreshold: 0.01,
    press: "KeyW",
  });

  assert.equal(staticFollower.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_FOLLOW_STATIC"), true);
  assert.equal(runawayFollower.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_FOLLOW_SEPARATION"), true);
  assert.equal(missingFollower.some((diagnostic) => diagnostic.code === "TN_PLAYTEST_FOLLOW_ENTITY_NOT_FOUND"), true);
});

test("evaluateMovementDiagnostics should pass a healthy follower", () => {
  const diagnostics = evaluateMovementDiagnostics({
    distance: 3,
    entityId: "player",
    expectMoved: true,
    follow: { entity: "camera.main", moved: 2.7, separation: 6.1, within: 10 },
    movementDelta: [0, 0, -3],
    movementThreshold: 0.01,
    press: "KeyW",
  });

  assert.deepEqual(diagnostics, []);
});

test("resourceObservationDiagnostics should report declared resources not observed after movement failure", () => {
  const diagnostics = resourceObservationDiagnostics(
    [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
    {
      resources: {
        declared: ["ProjectileVelocity", "GameState"],
        observations: [
          { kind: "load", resource: "ProjectileVelocity", system: "projectile.move" },
          { kind: "read", resource: "GameState", system: "hud.update" },
        ],
      },
    },
  );

  assert.deepEqual(diagnostics.map((diagnostic) => ({ code: diagnostic.code, observedRuntimePath: diagnostic.observedRuntimePath, resourceId: diagnostic.resourceId, sourcePath: diagnostic.sourcePath, systemId: diagnostic.systemId })), [
    { code: "TN_RESOURCE_DECLARED_NOT_OBSERVED", observedRuntimePath: "runtime-trace.json/resources/observations[resource=ProjectileVelocity]", resourceId: "ProjectileVelocity", sourcePath: "content/systems/projectile.move.systems.json", systemId: "projectile.move" },
  ]);
});

test("resourceObservationDiagnostics should ignore observed resources and passing movement", () => {
  assert.deepEqual(
    resourceObservationDiagnostics(
      [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
      { resources: { declared: ["GameState"], observations: [{ kind: "read", resource: "GameState" }] } },
    ),
    [],
  );
  assert.deepEqual(
    resourceObservationDiagnostics(
      [],
      { resources: { declared: ["GameState"], observations: [{ kind: "load", resource: "GameState" }] } },
    ),
    [],
  );
});

test("playtest command should require entity and keyboard input", async () => {
  const result = await playtestCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PLAYTEST_ENTITY_REQUIRED");
});

async function playtestTempRoot(): Promise<string> {
  return mkdtemp(join(tmpdir(), "tn-playtest-"));
}

async function writeDiscoveryFixture(root: string): Promise<void> {
  await mkdir(join(root, "content", "scenes"), { recursive: true });
  await mkdir(join(root, "content", "input"), { recursive: true });
  await writeFile(
    join(root, "content", "scenes", "arena.scene.json"),
    `${JSON.stringify({
      schema: "threenative.scene",
      id: "arena",
      entities: [
        { id: "arena.floor", transform: { position: [0, 0, 0] } },
        { id: "player", components: { characterController: {}, transform: {} }, transform: { position: [0, 0, 0] } },
        { id: "camera.main", components: { camera: { mode: "perspective" } } },
      ],
      resources: [{ id: "GameState", value: { score: 0 } }],
      ui: { nodes: [{ id: "hud.status", type: "text", text: "Ready" }] },
    }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    join(root, "content", "input", "arena.input.json"),
    `${JSON.stringify({
      schema: "threenative.input",
      id: "arena-input",
      actions: [{ id: "move-right", bindings: ["keyboard.KeyD"] }],
    }, null, 2)}\n`,
    "utf8",
  );
}
