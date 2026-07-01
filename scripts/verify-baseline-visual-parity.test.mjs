import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyBaselineVisualParityGate } from "./verify-baseline-visual-parity.mjs";

test("verify baseline visual parity records checkpoint evidence step", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-baseline-visual-parity-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyBaselineVisualParityGate({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      visualVerifierModule: {
        BASELINE_VISUAL_CHECKPOINTS: [{ projectRelativePath: "examples/stylized-nature-component" }],
        verifyBaselineVisualParity: async ({ artifactDir: outputDir }) => ({
          artifacts: { artifactDir: outputDir, reportPath: join(outputDir, "baseline-visual-parity-report.json") },
          checkpoints: [],
          diagnostics: [],
          status: "pass",
        }),
      },
    });

    assert.equal(report.status, "pass");
    assert.equal(report.steps[0]?.name, "build cli");
    assert.equal(report.steps[1]?.name, "build bevy capture");
    assert.ok(report.steps.some((step) => step.name === "verify baseline visual parity checkpoints"));
    assert.ok(report.steps.filter((step) => step.name.startsWith("build ")).length >= 2);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verify baseline visual parity skips setup when requested", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-baseline-visual-parity-skip-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyBaselineVisualParityGate({
      artifactDir,
      repoRoot: root,
      skipSetup: true,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      visualVerifierModule: {
        BASELINE_VISUAL_CHECKPOINTS: [{ projectRelativePath: "examples/stylized-nature-component" }],
        verifyBaselineVisualParity: async ({ artifactDir: outputDir }) => ({
          artifacts: { artifactDir: outputDir, reportPath: join(outputDir, "baseline-visual-parity-report.json") },
          checkpoints: [],
          diagnostics: [],
          status: "pass",
        }),
      },
    });

    assert.equal(report.status, "pass");
    assert.equal(report.steps.some((step) => step.name === "build cli"), false);
    assert.equal(report.steps.some((step) => step.name === "build bevy capture"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verify baseline visual parity fails when checkpoint evidence fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-baseline-visual-parity-fail-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyBaselineVisualParityGate({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      visualVerifierModule: {
        BASELINE_VISUAL_CHECKPOINTS: [{ projectRelativePath: "examples/stylized-nature-component" }],
        verifyBaselineVisualParity: async ({ artifactDir: outputDir }) => ({
          artifacts: { artifactDir: outputDir, reportPath: join(outputDir, "baseline-visual-parity-report.json") },
          checkpoints: [],
          diagnostics: [
            {
              code: "TN_BASELINE_VISUAL_FRAME_DRIFT",
              message: "drift",
              severity: "error",
            },
          ],
          status: "fail",
        }),
      },
    });

    assert.equal(report.status, "fail");
    assert.equal(report.code, "TN_VERIFY_BASELINE_VISUAL_PARITY_FAILED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
