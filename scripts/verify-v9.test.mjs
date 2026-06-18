import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { V9_FOCUSED_GATES, verifyV9 } from "./verify-v9.mjs";
import { writeMinimalV9Repo } from "./check-v9-quality-gates.test.mjs";

test("should pass when all V9 commands and reports pass", async () => {
  const root = await mkdtempRoot();
  try {
    const artifactDir = join(root, "tools/verify/artifacts/release");
    const reportPath = join(artifactDir, "verification-report.json");
    await writePassingArtifacts(root);

    const result = await verifyV9({
      artifactDir,
      focusedGates: [],
      repoRoot: root,
      reportPath,
      run: async ({ name }) => {
        if (name.startsWith("check focused artifact")) {
          return { durationMs: 1, exitCode: 0, stderr: "", stdout: "" };
        }
        return { durationMs: 2, exitCode: 0, stderr: "", stdout: "{}" };
      },
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "pass");
    assert.equal(saved.generatedBy, "scripts/verify-v9.mjs");
    assert.equal(saved.schema, "threenative.verify.v9");
    assert.ok(saved.commands.length > 0);
    assert.ok(saved.promoted.includes("aggregate-v9-gate"));
    assert.equal(saved.artifacts.reportPath, reportPath);
    assert.match(saved.artifacts.sampleScenesReportPath, /artifacts\/sample-scenes\/verification-report\.json/);
    assert.match(saved.artifacts.visualMatrixReportPath, /artifacts\/visual-matrix\/verification-report\.json/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail with artifact diagnostic when a focused report is missing", async () => {
  const root = await mkdtempRoot();
  try {
    await writeMinimalV9Repo(root);
    const artifactDir = join(root, "tools/verify/artifacts/release");
    const reportPath = join(artifactDir, "verification-report.json");
    const gate = V9_FOCUSED_GATES[0];
    const result = await verifyV9({
      artifactDir,
      focusedGates: [gate],
      repoRoot: root,
      reportPath,
      run: async ({ name }) => {
        if (name === gate.name) {
          return { durationMs: 2, exitCode: 0, stderr: "", stdout: "{}" };
        }
        return { durationMs: 1, exitCode: 0, stderr: "", stdout: "{}" };
      },
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(saved.status, "fail");
    assert.equal(saved.diagnostics[0]?.code, "TN_VERIFY_V9_ARTIFACT_MISSING");
    assert.match(saved.diagnostics[0]?.message ?? "", new RegExp(gate.reportPath.replaceAll("/", "\\/")));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should stop at first failing command and write report", async () => {
  const root = await mkdtempRoot();
  try {
    const artifactDir = join(root, "tools/verify/artifacts/release");
    const reportPath = join(artifactDir, "verification-report.json");
    const result = await verifyV9({
      artifactDir,
      focusedGates: [],
      repoRoot: root,
      reportPath,
      run: async ({ name }) => ({
        durationMs: 3,
        exitCode: name === "check v9 quality gates" ? 1 : 0,
        stderr: name === "check v9 quality gates" ? "quality gate failed" : "",
        stdout: "",
      }),
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(saved.steps[0]?.name, "check v9 quality gates");
    assert.equal(saved.steps[0]?.exitCode, 1);
    assert.equal(saved.diagnostics[0]?.code, "TN_VERIFY_V9_STEP_FAILED");
    assert.equal(saved.diagnostics[0]?.step, "check v9 quality gates");
    await access(reportPath);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should include release evidence artifact paths in aggregate report", async () => {
  const root = await mkdtempRoot();
  try {
    const artifactDir = join(root, "tools/verify/artifacts/release");
    const reportPath = join(artifactDir, "verification-report.json");
    await writePassingArtifacts(root);
    const result = await verifyV9({
      artifactDir,
      focusedGates: [],
      repoRoot: root,
      reportPath,
      run: async () => ({ durationMs: 1, exitCode: 0, stderr: "", stdout: "{}" }),
    });
    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, true);
    for (const gate of V9_FOCUSED_GATES) {
      assert.equal(saved.artifacts.focusedReports[gate.script], gate.reportPath);
    }
    assert.match(saved.artifacts.conformanceReportPath, /artifacts\/conformance\/verification-report\.json/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function mkdtempRoot() {
  return mkdtemp(join(tmpdir(), "tn-verify-v9-"));
}

async function writePassingArtifacts(root) {
  await writeMinimalV9Repo(root);
  const files = [
    "packages/ir/artifacts/conformance/verification-report.json",
    "tools/verify/artifacts/sample-scenes/verification-report.json",
    "tools/verify/artifacts/visual-matrix/verification-report.json",
    ...V9_FOCUSED_GATES.map((gate) => gate.reportPath),
  ];
  for (const file of files) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{}\n");
  }
}
