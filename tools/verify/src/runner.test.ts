import assert from "node:assert/strict";
import test from "node:test";

import { runCommand, stepFailureDiagnostic, summarize } from "./runner.js";

test("should return a stable diagnostic when a command fails", async () => {
  const result = await runCommand({
    args: ["-e", "process.stderr.write('boom'); process.exit(7);"],
    command: process.execPath,
    cwd: process.cwd(),
    timeoutMs: 5000,
  });
  const summary = { ...summarize(result), name: "failing command" };
  const diagnostic = stepFailureDiagnostic(summary, "TN_TEST");

  assert.equal(result.exitCode, 7);
  assert.match(result.stderr, /boom/);
  assert.equal(diagnostic.code, "TN_TEST_STEP_FAILED");
  assert.match(diagnostic.message, /failing command/);
  assert.match(diagnostic.suggestedFix ?? "", /boom/);
});
