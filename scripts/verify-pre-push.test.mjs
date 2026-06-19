import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyPrePushGate } from "./verify-pre-push.mjs";

test("verify pre-push builds v1-canonical and records visual capture", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-pre-push-"));
  const artifactDir = join(root, "artifacts");
  try {
    const report = await verifyPrePushGate({
      artifactDir,
      checkpoint: {
        id: "v1-canonical",
        projectRelativePath: "examples/v1-canonical",
        bundleRelativePath: "examples/v1-canonical/dist/game.bundle",
      },
      repoRoot: root,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: 0,
        name,
        stderr: "",
        stdout: "",
      }),
      visualVerifierModule: {
        BASELINE_VISUAL_CHECKPOINTS: [],
        verifyBaselineVisualCheckpoint: async () => ({
          artifacts: {},
          checkpoint: { id: "v1-canonical" },
          diagnostics: [],
          metrics: { signedAverageBrightnessDelta: 0 },
          status: "pass",
          visualComparison: {},
        }),
      },
    });

    assert.equal(report.status, "pass");
    assert.equal(report.code, "TN_VERIFY_PRE_PUSH_OK");
    assert.ok(report.steps.some((step) => step.name === "build cli"));
    assert.ok(report.steps.some((step) => step.name === "build bevy capture"));
    assert.ok(report.steps.some((step) => step.name === "build v1-canonical"));
    assert.ok(report.steps.some((step) => step.name === "verify pre-push web bevy capture"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
