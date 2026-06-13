import assert from "node:assert/strict";
import test from "node:test";

import { verifyV2 } from "./verify-v2.mjs";

test("should include docs and conformance gates", async () => {
  const commands = [];
  const result = await verifyV2({
    repoRoot: process.cwd(),
    run: async ({ args, command, cwd, name }) => {
      commands.push({ args, command, cwd, name });
      return {
        durationMs: 1,
        exitCode: 0,
        stderr: "",
        stdout: "",
      };
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(
    result.steps.map((step) => step.name),
    ["check v2 docs", "verify conformance"],
  );
  assert.equal(commands[0]?.name, "check v2 docs");
  assert.equal(commands[1]?.name, "ir conformance fixtures");
  assert.equal(commands[2]?.name, "web runtime conformance");
  assert.equal(commands[3]?.name, "bevy runtime conformance");
});
