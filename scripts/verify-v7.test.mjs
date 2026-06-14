import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { verifyV7 } from "./verify-v7.mjs";

test("should report failing v7 gate step", async () => {
  const root = await mkdtempRoot();
  try {
    const reportPath = join(root, "artifacts/v7/verification-report.json");
    const result = await verifyV7({
      artifactDir: join(root, "artifacts/v7"),
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
    assert.equal(result.steps[0]?.name, "check v7 docs");
    assert.equal(saved.artifacts.reportPath, reportPath);
    assert.equal(saved.code, "TN_VERIFY_V7_FAILED");
    assert.equal(saved.diagnostics[0]?.code, "TN_VERIFY_V7_STEP_FAILED");
    assert.equal(saved.schema, "threenative.verify.v7");
    assert.equal(saved.version, "0.1.0");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should include aggregate v7 evidence in release report", async () => {
  const root = await mkdtempRoot();
  try {
    const artifactDir = join(root, "artifacts/v7");
    const reportPath = join(artifactDir, "verification-report.json");
    await writeRequiredArtifacts(root);

    const result = await verifyV7({
      artifactDir,
      packagingVerifier: async ({ artifactDir }) => {
        const reportPath = join(artifactDir, "verification-report.json");
        await mkdir(artifactDir, { recursive: true });
        await writeFile(reportPath, "{}\n");
        return { durationMs: 2, ok: true, reportPath };
      },
      performanceVerifier: async ({ artifactDir }) => {
        const comparisonReportPath = join(artifactDir, "comparison.report.json");
        await mkdir(artifactDir, { recursive: true });
        await writeFile(comparisonReportPath, "{}\n");
        return { artifacts: { comparisonReportPath }, ok: true };
      },
      repoRoot: root,
      reportPath,
      run: async ({ name }) => {
        if (name === "create v7 functional template") {
          await mkdir(join(root, "artifacts/v7/template-smoke/v7-functional"), { recursive: true });
        }
        return {
          durationMs: 3,
          exitCode: 0,
          stderr: "",
          stdout: "{}",
        };
      },
    });

    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, true);
    assert.equal(result.status, "pass");
    assert.deepEqual(
      result.steps.map((step) => step.name),
      [
        "check v7 docs",
        "test v7 docs and gate scripts",
        "build cli",
        "test v7 cli flows",
        "test v7 compiler examples",
        "test v7 diagnostics",
        "build v7 functional scene",
        "validate v7 functional bundle",
        "verify v7 functional web visual scene",
        "package v7 functional desktop artifact",
        "create v7 functional template",
        "build v7 functional template",
        "validate v7 functional template",
        "verify conformance gate",
        "test bevy runtime",
        "verify v7 packaging",
        "verify v7 performance budgets",
        "check v7 release artifacts",
      ],
    );
    assert.match(saved.artifacts.bundlePath, /examples\/v7-functional\/dist\/v7-functional\.bundle/);
    assert.match(saved.artifacts.conformanceReportPath, /artifacts\/conformance\/verification-report\.json/);
    assert.match(saved.artifacts.diagnosticsDocPath, /docs\/diagnostics\.md/);
    assert.match(saved.artifacts.docsCheckScriptPath, /scripts\/check-docs-v7\.mjs/);
    assert.match(saved.artifacts.functionalPackageDir, /artifacts\/v7\/functional-package/);
    assert.match(saved.artifacts.functionalWebReportPath, /examples\/v7-functional\/artifacts\/verify\/verification-report\.json/);
    assert.match(saved.artifacts.packagingReportPath, /artifacts\/v7\/packaging\/verification-report\.json/);
    assert.match(saved.artifacts.performanceReportPath, /artifacts\/v7\/performance\/comparison\.report\.json/);
    assert.match(saved.artifacts.rustTestReportPath, /artifacts\/v7\/rust-test-report\.json/);
    assert.match(saved.artifacts.templateProjectPath, /artifacts\/v7\/template-smoke\/v7-functional/);
    assert.equal(saved.code, "TN_VERIFY_V7_OK");
    assert.equal(saved.diagnostics.length, 0);
    assert.equal(saved.schema, "threenative.verify.v7");
    assert.equal(saved.version, "0.1.0");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when required v7 release artifacts are missing", async () => {
  const root = await mkdtempRoot();
  try {
    const artifactDir = join(root, "artifacts/v7");
    const reportPath = join(artifactDir, "verification-report.json");
    const result = await verifyV7({
      artifactDir,
      packagingVerifier: async ({ artifactDir }) => ({
        durationMs: 2,
        ok: true,
        reportPath: join(artifactDir, "verification-report.json"),
      }),
      performanceVerifier: async ({ artifactDir }) => ({
        artifacts: { comparisonReportPath: join(artifactDir, "comparison.report.json") },
        ok: true,
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
    assert.equal(result.ok, false);
    assert.equal(saved.status, "fail");
    assert.equal(saved.steps.at(-1)?.name, "check v7 release artifacts");
    assert.match(saved.steps.at(-1)?.stderr ?? "", /Missing V7 release artifact/);
    assert.equal(saved.diagnostics[0]?.step, "check v7 release artifacts");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function mkdtempRoot() {
  return mkdtemp(join(tmpdir(), "tn-verify-v7-"));
}

async function writeRequiredArtifacts(root) {
  const files = [
    "artifacts/conformance/verification-report.json",
    "artifacts/v7/functional-package/desktop/v7-functional.bundle",
    "artifacts/v7/functional-package/desktop/package.manifest.json",
    "artifacts/v7/functional-package/desktop/runtime.args.json",
    "examples/v7-functional/artifacts/verify/frame-01.png",
    "examples/v7-functional/artifacts/verify/frame-02.png",
    "examples/v7-functional/artifacts/verify/verification-report.json",
    "examples/v7-functional/dist/v7-functional.bundle",
  ];
  for (const file of files) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, "{}\n");
  }
  await mkdir(join(root, "artifacts/v7/template-smoke/v7-functional"), { recursive: true });
}
