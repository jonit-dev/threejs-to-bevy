import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV9Support } from "./verify-v9-support.mjs";

test("should aggregate support phase reports into one verification report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-support-"));
  try {
    const result = await verifyV9Support({
      artifactDir: join(root, "artifacts/v9/support"),
      repoRoot: root,
      steps: [
        () => phase("TN_VERIFY_V9_AUDIO_OK", "artifacts/v9/audio-support/verification-report.json"),
        () => phase("TN_VERIFY_V9_LOCAL_DATA_OK", "artifacts/v9/local-data-support/verification-report.json"),
        () => phase("TN_VERIFY_V9_DIAGNOSTICS_OK", "artifacts/v9/diagnostics-support/verification-report.json"),
        () => phase("TN_VERIFY_V9_EDITOR_OK", "artifacts/v9/editor-support/verification-report.json"),
        () => phase("TN_VERIFY_V9_STRESS_OK", "artifacts/v9/stress-support/verification-report.json"),
        () => phase("TN_VERIFY_CONFORMANCE", "artifacts/conformance/verification-report.json"),
      ],
    });
    const saved = JSON.parse(await readFile(result.reportPath, "utf8"));

    assert.equal(result.ok, true);
    assert.equal(saved.status, "pass");
    assert.equal(saved.phases.length, 6);
    assert.equal(saved.artifacts.phases.TN_VERIFY_V9_AUDIO_OK, "artifacts/v9/audio-support/verification-report.json");
    assert.equal(saved.artifacts.phases.TN_VERIFY_V9_LOCAL_DATA_OK, "artifacts/v9/local-data-support/verification-report.json");
    assert.equal(saved.artifacts.phases.TN_VERIFY_V9_DIAGNOSTICS_OK, "artifacts/v9/diagnostics-support/verification-report.json");
    assert.equal(saved.artifacts.phases.TN_VERIFY_V9_EDITOR_OK, "artifacts/v9/editor-support/verification-report.json");
    assert.equal(saved.artifacts.phases.TN_VERIFY_V9_STRESS_OK, "artifacts/v9/stress-support/verification-report.json");
    assert.equal(saved.artifacts.phases.TN_VERIFY_CONFORMANCE, "artifacts/conformance/verification-report.json");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function phase(code, reportPath) {
  return { artifacts: { artifactDir: reportPath.replace("/verification-report.json", "") }, code, ok: true, reportPath, status: "pass" };
}
