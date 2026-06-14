import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV5 } from "./verify-v5.mjs";

test("should report failing v5 visual-quality step", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v5-"));
  try {
    const reportPath = join(root, "artifacts/v5/verification-report.json");
    const result = await verifyV5({
      artifactDir: join(root, "artifacts/v5"),
      repoRoot: root,
      reportPath,
      run: async () => ({
        durationMs: 3,
        exitCode: 1,
        stderr: "visual failed",
        stdout: "",
      }),
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(result.status, "fail");
    assert.equal(result.steps[0]?.name, "check v5 docs");
    assert.equal(result.steps[0]?.exitCode, 1);
    assert.equal(saved.artifacts.reportPath, reportPath);
    assert.equal(saved.code, "TN_VERIFY_V5_FAILED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should write v5 visual-quality report when scene and dense checks pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v5-"));
  try {
    const reportPath = join(root, "artifacts/v5/verification-report.json");
    const denseReportPath = join(root, "artifacts/v5/dense-content/v3-environment-report.json");
    const result = await verifyV5({
      artifactDir: join(root, "artifacts/v5"),
      denseContentVerifier: async () => ({
        artifacts: {
          metricsPath: join(root, "artifacts/v5/dense-content/v3-performance-summary.json"),
          rawSamplesPath: join(root, "artifacts/v5/dense-content/v3-performance-samples.json"),
          reportPath: denseReportPath,
        },
        diagnostics: [],
        instancing: { groups: 1, instances: 10, uninstancedRepeatedProps: 0 },
        metrics: {},
        status: "pass",
      }),
      repoRoot: root,
      reportPath,
      run: async () => ({
        durationMs: 3,
        exitCode: 0,
        stderr: "",
        stdout: "{}",
      }),
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "pass");
    assert.equal(result.steps.at(-1)?.name, "verify v5 dense content budgets");
    assert.equal(saved.artifacts.denseContentReportPath, denseReportPath);
    assert.equal(saved.code, "TN_VERIFY_V5_OK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
