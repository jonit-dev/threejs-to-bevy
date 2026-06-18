import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV10 } from "./verify-v10.mjs";

test("should report pass when all focused V10 gates pass", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v10-pass-"));
  try {
    await mkdir(join(root, "tools/verify/artifacts/final-gap-planning/focused"), { recursive: true });
    await writeFile(join(root, "tools/verify/artifacts/final-gap-planning/focused/report.json"), "{}\n");
    const result = await verifyV10({
      artifactDir: join(root, "tools/verify/artifacts/final-gap-planning"),
      boundaryValidator: passBoundaryValidator,
      focusedGates: [{ name: "verify v10 focused test", reportPath: "tools/verify/artifacts/final-gap-planning/focused/report.json" }],
      repoRoot: root,
      run: passRun,
      skipIrBuild: true,
    });
    assert.equal(result.ok, true);
    assert.equal(result.status, "pass");
    assert.equal(JSON.parse(await readFile(result.reportPath, "utf8")).status, "pass");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when a focused report is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v10-missing-"));
  try {
    const result = await verifyV10({
      artifactDir: join(root, "tools/verify/artifacts/final-gap-planning"),
      boundaryValidator: passBoundaryValidator,
      focusedGates: [{ name: "verify v10 focused test", reportPath: "tools/verify/artifacts/final-gap-planning/focused/missing.json" }],
      repoRoot: root,
      run: passRun,
      skipIrBuild: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_V10_ARTIFACT_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should write boundary diagnostics into the aggregate report", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-v10-boundary-"));
  try {
    const result = await verifyV10({
      artifactDir: join(root, "tools/verify/artifacts/final-gap-planning"),
      boundaryValidator: failBoundaryValidator,
      repoRoot: root,
      run: passRun,
      skipIrBuild: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_V10_BOUNDARY_DIAGNOSTIC_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function passRun() {
  return { durationMs: 1, exitCode: 0, stderr: "", stdout: "ok" };
}

async function passBoundaryValidator(_root, reportPath) {
  await mkdir(join(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, "{}\n");
  return {
    command: { command: "validateBundle", durationMs: 1, exitCode: 0, name: "verify v10 boundary fixtures", stderr: "", stdout: reportPath },
    diagnostics: [],
    ok: true,
    step: { durationMs: 1, exitCode: 0, name: "verify v10 boundary fixtures", stderr: "", stdout: reportPath },
  };
}

async function failBoundaryValidator(_root, reportPath) {
  await mkdir(join(reportPath, ".."), { recursive: true });
  await writeFile(reportPath, "{}\n");
  return {
    command: { command: "validateBundle", durationMs: 1, exitCode: 1, name: "verify v10 boundary fixtures", stderr: "missing", stdout: reportPath },
    diagnostics: [{ code: "TN_VERIFY_V10_BOUNDARY_DIAGNOSTIC_MISSING", message: "missing", path: reportPath, severity: "error" }],
    ok: false,
    step: { durationMs: 1, exitCode: 1, name: "verify v10 boundary fixtures", stderr: "missing", stdout: reportPath },
  };
}
