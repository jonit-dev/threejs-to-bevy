import assert from "node:assert/strict";
import test from "node:test";

import { playtestCommand } from "./playtest.js";

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

test("playtest command should require entity and keyboard input", async () => {
  const result = await playtestCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PLAYTEST_USAGE");
});
