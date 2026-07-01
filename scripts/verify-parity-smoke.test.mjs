import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyParitySmokeGate } from "./verify-parity-smoke.mjs";

test("verify parity smoke records single-scene visual step", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-parity-smoke-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyParitySmokeGate({
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
        PARITY_SMOKE_CHECKPOINT: {
          id: "structured-stylized-nature-smoke",
          bundleRelativePath: "examples/stylized-nature-component/dist/stylized-nature-component.bundle",
          projectRelativePath: "examples/stylized-nature-component",
        },
        verifyBaselineVisualCheckpoint: async () => ({
          artifacts: {},
          checkpoint: { id: "parity-smoke" },
          diagnostics: [],
          metrics: { signedAverageBrightnessDelta: 0 },
          status: "pass",
          visualComparison: {},
        }),
      },
    });

    assert.equal(report.status, "pass");
    assert.ok(report.steps.some((step) => step.name === "verify parity-smoke web bevy capture"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("verify parity smoke fails when visual capture fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-parity-smoke-fail-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyParitySmokeGate({
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
        PARITY_SMOKE_CHECKPOINT: {
          id: "structured-stylized-nature-smoke",
          bundleRelativePath: "examples/stylized-nature-component/dist/stylized-nature-component.bundle",
          projectRelativePath: "examples/stylized-nature-component",
        },
        verifyBaselineVisualCheckpoint: async () => ({
          artifacts: {},
          checkpoint: { id: "parity-smoke" },
          diagnostics: [{ code: "TN_BASELINE_VISUAL_UNDEREXPOSURE", message: "dark", severity: "error" }],
          metrics: { signedAverageBrightnessDelta: -0.2 },
          status: "fail",
          visualComparison: {},
        }),
      },
    });

    assert.equal(report.status, "fail");
    assert.equal(report.code, "TN_VERIFY_PARITY_SMOKE_FAILED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
