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
        diagnostics: [],
        distance: 1,
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
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
        diagnostics: [{ code: "TN_PLAYTEST_INPUT_NO_EFFECT", message: "No movement.", severity: "error" }],
        distance: 0,
        entity: options.entityId,
        expectMoved: options.expectMoved,
        frames: options.frames,
        input: options.press,
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

test("playtest command should require entity and keyboard input", async () => {
  const result = await playtestCommand(["--json"]);
  const payload = JSON.parse(result.stdout) as { code: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_PLAYTEST_USAGE");
});
