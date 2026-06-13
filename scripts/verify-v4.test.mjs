import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV4 } from "./verify-v4.mjs";

test("should report failing step", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v4-"));
  try {
    const reportPath = join(root, "artifacts/v4/verification-report.json");
    const result = await verifyV4({
      artifactDir: join(root, "artifacts/v4"),
      repoRoot: root,
      reportPath,
      run: async () => ({
        durationMs: 3,
        exitCode: 1,
        stderr: "docs failed",
        stdout: "",
      }),
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(result.status, "fail");
    assert.equal(result.steps[0]?.name, "check v4 docs");
    assert.equal(result.steps[0]?.exitCode, 1);
    assert.equal(saved.artifacts.reportPath, reportPath);
    assert.equal(saved.code, "TN_VERIFY_V4_FAILED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
