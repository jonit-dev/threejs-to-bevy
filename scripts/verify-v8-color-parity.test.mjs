import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV8ColorParity } from "./verify-v8-color-parity.mjs";

test("verify v8 color parity records visual evidence step", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v8-color-parity-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyV8ColorParity({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      colorVisualVerifier: async ({ artifactDir: outputDir }) => ({
        artifacts: { reportPath: join(outputDir, "color-parity-report.json") },
        diagnostics: [],
        status: "pass",
      }),
      lightingVisualVerifier: async ({ artifactDir: outputDir }) => ({
        artifacts: { reportPath: join(outputDir, "lighting-tone-report.json") },
        diagnostics: [],
        status: "pass",
      }),
    });

    assert.equal(report.status, "pass");
    assert.match(report.artifacts.visualReportPath, /color-parity-report\.json$/);
    assert.deepEqual(
      report.steps.map((step) => step.name),
      [
        "build cli",
        "validate color parity fixture bundle",
        "validate lighting tone fixture bundle",
        "verify color parity visual evidence",
        "verify lighting tone visual evidence",
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verify v8 color parity fails when visual evidence fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v8-color-parity-fail-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyV8ColorParity({
      artifactDir,
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      colorVisualVerifier: async ({ artifactDir: outputDir }) => ({
        artifacts: { reportPath: join(outputDir, "color-parity-report.json") },
        diagnostics: [{ code: "TN_V8_COLOR_PARITY_SWATCH_DRIFT", message: "drift", severity: "error" }],
        status: "fail",
      }),
      lightingVisualVerifier: async ({ artifactDir: outputDir }) => ({
        artifacts: { reportPath: join(outputDir, "lighting-tone-report.json") },
        diagnostics: [],
        status: "pass",
      }),
    });

    assert.equal(report.status, "fail");
    assert.equal(report.code, "TN_VERIFY_V8_COLOR_PARITY_FAILED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
