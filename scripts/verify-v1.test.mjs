import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV1 } from "./verify-v1.mjs";

test("should fail when a gate command fails", async () => {
  const tempRoot = await mkdtemp(join(tmpdir(), "tn-v1-gate-test-"));
  try {
    const result = await verifyV1({
      repoRoot: process.cwd(),
      tempRoot,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: name === "build scaffold" ? 1 : 0,
        stderr: name === "build scaffold" ? "build failed" : "",
        stdout: "",
      }),
      runReady: async () => ({
        durationMs: 1,
        exitCode: 0,
        stderr: "",
        stdout: "TN_DEV_DESKTOP_READY",
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.steps.at(-1)?.name, "build scaffold");
    assert.equal(result.steps.at(-1)?.exitCode, 1);
  } finally {
    await rm(tempRoot, { force: true, recursive: true });
  }
});
