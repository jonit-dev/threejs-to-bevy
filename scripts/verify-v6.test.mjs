import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV6 } from "./verify-v6.mjs";

test("should report failing v6 gate step", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v6-"));
  try {
    const reportPath = join(root, "tools/verify/artifacts/milestones/v6/verification-report.json");
    const result = await verifyV6({
      artifactDir: join(root, "tools/verify/artifacts/milestones/v6"),
      copyEvidence: false,
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
    assert.equal(result.steps[0]?.name, "check v6 docs");
    assert.equal(saved.artifacts.reportPath, reportPath);
    assert.equal(saved.code, "TN_VERIFY_V6_FAILED");
    assert.equal(saved.diagnostics[0]?.code, "TN_VERIFY_V6_STEP_FAILED");
    assert.equal(saved.schema, "threenative.verify.v6");
    assert.equal(saved.version, "0.1.0");
    assert.equal(saved.visualEvidenceStatus, "pending");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should include functional scene and conformance artifacts in v6 gate", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v6-"));
  try {
    const reportPath = join(root, "tools/verify/artifacts/milestones/v6/verification-report.json");
    const result = await verifyV6({
      artifactDir: join(root, "tools/verify/artifacts/milestones/v6"),
      copyEvidence: false,
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
    assert.deepEqual(
      result.steps.map((step) => step.name),
      [
        "check v6 docs",
        "test v6 docs and gate scripts",
        "build cli",
        "build v6 functional scene",
        "validate v6 functional bundle",
        "verify v6 web visual scene",
        "verify conformance gate",
      ],
    );
    assert.match(saved.artifacts.bundlePath, /examples\/v6-functional\/dist\/v6-functional\.bundle/);
    assert.match(saved.artifacts.conformanceReportPath, /packages\/ir\/artifacts\/conformance\/verification-report\.json/);
    assert.match(saved.artifacts.webVisualReportPath, /tools\/verify\/artifacts\/milestones\/v6\/web-visual\/verification-report\.json/);
    assert.deepEqual(saved.artifacts.webVisualScreenshots.map((path) => path.endsWith(".png")), [true, true]);
    assert.equal(saved.code, "TN_VERIFY_V6_OK");
    assert.equal(saved.diagnostics.length, 0);
    assert.equal(saved.schema, "threenative.verify.v6");
    assert.equal(saved.version, "0.1.0");
    assert.equal(saved.visualEvidenceStatus, "web-captured");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
