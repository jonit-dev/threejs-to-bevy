import assert from "node:assert/strict";
import test from "node:test";

import { evaluateMovementDiagnostics, parseAxisExpectation, playtestCommand } from "./playtest.js";

test("playtest command should pass when target transform changes after input", async () => {
  const result = await playtestCommand(
    ["--project", "examples/racing-kit-rally", "--entity", "player.car", "--press", "KeyW", "--frames", "60", "--expect-moved", "--json"],
    "/repo",
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
  const payload = JSON.parse(result.stdout) as { code: string; distance: number; entity: string; input: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.code, "TN_PLAYTEST_OK");
  assert.equal(payload.entity, "player.car");
  assert.equal(payload.input, "KeyW");
  assert.equal(payload.distance, 1);
});

test("playtest command should fail when entity does not move after input", async () => {
  const result = await playtestCommand(
    ["--project", "examples/racing-kit-rally", "--entity", "player.car", "--press", "KeyW", "--frames", "60", "--expect-moved", "--json"],
    "/repo",
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
  const result = await playtestCommand(
    ["--project", "examples/lantern-orchard", "--entity", "player", "--press", "KeyD", "--frames", "45", "--expect-moved", "--expect-axis", "x", "--json"],
    "/repo",
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
    ["--project", "examples/lantern-orchard", "--entity", "player", "--press", "KeyD", "--frames", "45", "--expect-axis", "forward", "--json"],
    "/repo",
  );
  const payload = JSON.parse(result.stdout) as { code: string; message: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PLAYTEST_EXPECT_AXIS_INVALID");
  assert.match(payload.message, /x, y, z/);
});

test("playtest command should pass debug collider flag to runner", async () => {
  const result = await playtestCommand(
    ["--project", "examples/bowling-alley", "--entity", "ball", "--press", "Space", "--frames", "20", "--debug", "--json"],
    "/repo",
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
  let received: { expectAxis?: string; follow?: { entityId: string; within: number } } | undefined;
  const result = await playtestCommand(
    ["--project", "examples/humanoid-physics-course", "--entity", "player", "--press", "KeyW", "--frames", "45", "--expect-moved", "--expect-axis", "-z", "--follow", "camera.main", "--follow-within", "7.5", "--json"],
    "/repo",
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
  assert.equal(payload.code, "TN_PLAYTEST_USAGE");
});
