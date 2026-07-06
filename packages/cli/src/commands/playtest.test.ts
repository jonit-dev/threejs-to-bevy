import assert from "node:assert/strict";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";

import { evaluateMovementDiagnostics, parseAxisExpectation, playtestCommand } from "./playtest.js";

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
        runtime: "web",
        url: "http://127.0.0.1:5173/",
      }),
    },
  );
  const payload = JSON.parse(result.stdout) as { artifacts: { summary: string }; code: string; distance: number; entity: string; input: string; reproduceCommand: string; scenario: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.entity, "player.car");
  assert.equal(payload.input, "KeyW");
  assert.equal(payload.distance, 1);
  assert.equal(payload.scenario, "player.car-KeyW");
  assert.match(payload.artifacts.summary, /artifacts\/playtest\/player.car-KeyW\/.+\/summary\.json$/);
  assert.match(payload.reproduceCommand, /tn playtest --project \./);
  assert.equal(JSON.parse(await readFile(payload.artifacts.summary, "utf8")).code, "TN_PLAYTEST_OK");
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
      steps: [
        { label: "forward", press: "KeyW", holdFrames: 45, release: true, waitFrames: 5 },
        { label: "right", press: "KeyD", holdFrames: 20, release: true },
      ],
      assert: { movement: { entity: "player", minDistance: 0.25, axis: "-z" }, camera: { entity: "camera.main", follows: "player", within: 8 } },
    }, null, 2)}\n`,
    "utf8",
  );
  let receivedSteps: readonly unknown[] = [];
  const result = await playtestCommand(
    ["--project", ".", "--scenario", "smoke.playtest.json", "--stable-artifacts", "--json"],
    root,
    {
      runner: async (options) => {
        receivedSteps = options.scenario.steps;
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
  let commandStreamPath: string | undefined;
  let readinessOutPath: string | undefined;
  const result = await playtestCommand(
    ["--project", ".", "--target", "desktop", "--entity", "player", "--press", "KeyW", "--frames", "30", "--expect-moved", "--json"],
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
  const payload = JSON.parse(result.stdout) as { artifacts: { observations: string; summary: string }; code: string; distance: number; runtime: string; target: string };
  const commandStream = JSON.parse(await readFile(commandStreamPath ?? "", "utf8")) as { commands: Array<{ code?: string; frames?: number; pressed?: boolean; tick: number; type: string }> };
  const summary = JSON.parse(await readFile(payload.artifacts.summary, "utf8")) as { diagnostics: unknown[]; movementDelta: number[]; nativeRecording: { frames: Array<{ byteSize: number; tick: number }> }; runtime: string; target: string };
  const observations = JSON.parse(await readFile(payload.artifacts.observations, "utf8")) as { runtimeDiagnostics: { readiness: Array<{ tick: number }> } };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.runtime, "bevy");
  assert.equal(payload.target, "desktop");
  assert.equal(payload.distance, 1);
  assert.deepEqual(summary.movementDelta, [0, 0, -1]);
  assert.deepEqual(summary.diagnostics, []);
  assert.deepEqual(summary.nativeRecording.frames, []);
  assert.equal(summary.runtime, "bevy");
  assert.equal(summary.target, "desktop");
  assert.deepEqual(commandStream.commands.map((command) => ({ code: command.code, frames: command.frames, pressed: command.pressed, tick: command.tick, type: command.type })), [
    { code: "KeyW", frames: undefined, pressed: true, tick: 6, type: "key" },
    { code: undefined, frames: 30, pressed: undefined, tick: 6, type: "advance" },
    { code: "KeyW", frames: undefined, pressed: false, tick: 36, type: "key" },
    { code: undefined, frames: undefined, pressed: undefined, tick: 38, type: "exit" },
  ]);
  assert.deepEqual(observations.runtimeDiagnostics.readiness.map((sample) => sample.tick), [0, 37]);
});

test("playtest command should fast-forward desktop native screenshot-only proofs", async () => {
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
    { code: undefined, frames: 30, pressed: undefined, tick: 6, type: "advance" },
    { code: "KeyW", frames: undefined, pressed: false, tick: 36, type: "key" },
    { code: undefined, frames: undefined, pressed: undefined, tick: 37, type: "screenshot" },
    { code: undefined, frames: undefined, pressed: undefined, tick: 38, type: "exit" },
  ]);
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
  const suggested = await playtestCommand(["--project", ".", "--suggest-scenario", "smoke-movement", "--json"], root);
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
        effectLog: { entries: [] },
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
  const payload = JSON.parse(result.stdout) as { code: string; diagnostics: Array<{ code: string }> };
  const codes = payload.diagnostics.map((diagnostic) => diagnostic.code);

  assert.equal(result.exitCode, 1);
  assert.equal(payload.code, "TN_PLAYTEST_FAILED");
  assert.equal(codes.includes("TN_PLAYTEST_RESOURCE_ASSERTION_FAILED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_HUD_ASSERTION_FAILED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_CONTACT_NOT_OBSERVED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_ANIMATION_NOT_OBSERVED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_VISIBILITY_FAILED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_CONSOLE_ERROR"), true);
  assert.equal(codes.includes("TN_PLAYTEST_NETWORK_ERROR"), true);
  assert.equal(codes.includes("TN_PLAYTEST_RUNTIME_DIAGNOSTIC"), true);
  assert.equal(codes.includes("TN_PLAYTEST_VELOCITY_ASSERTION_FAILED"), true);
  assert.equal(codes.includes("TN_PLAYTEST_ROTATION_ASSERTION_FAILED"), true);
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
