import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { verifyV7Packaging } from "./verify-v7-packaging.mjs";
import { verifyV7PerformanceBudgets } from "./verify-performance-budgets.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV7(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/milestones/v7");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const projectPath = resolve(root, "examples/v7-functional");
  const bundlePath = resolve(projectPath, "dist/v7-functional.bundle");
  const functionalWebReportPath = resolve(projectPath, "artifacts/verify/verification-report.json");
  const functionalPackageDir = resolve(artifactDir, "functional-package");
  const templateProjectPath = resolve(artifactDir, "template-smoke/v7-functional");
  const conformanceReportPath = resolve(root, "packages/ir/artifacts/conformance/verification-report.json");
  const rustTestReportPath = resolve(artifactDir, "rust-test-report.json");
  const packagingVerifier = options.packagingVerifier ?? verifyV7Packaging;
  const performanceVerifier = options.performanceVerifier ?? verifyV7PerformanceBudgets;
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v7 docs", process.execPath, [resolve(root, "scripts/check-docs-v7.mjs"), "--json"]))) {
    return writeV7Report({ artifactDir, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("test v7 docs and gate scripts", process.execPath, ["--test", resolve(root, "scripts/check-docs-v7.test.mjs"), resolve(root, "scripts/verify-v7.test.mjs")], { timeoutMs: 120000 }))) {
    return writeV7Report({ artifactDir, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeV7Report({ artifactDir, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("test v7 cli flows", "pnpm", ["--filter", "@threenative/cli", "test", "--", "--run", "v7 functional|package|performanceGate"], { timeoutMs: 120000 }))) {
    return writeV7Report({ artifactDir, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("test v7 compiler examples", "pnpm", ["--filter", "@threenative/compiler", "test", "--", "--run", "v7 functional|examples"], { timeoutMs: 120000 }))) {
    return writeV7Report({ artifactDir, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("test v7 diagnostics", "pnpm", ["--filter", "@threenative/compiler", "test", "--", "--run", "resource writes|undeclared|unsupported|diagnostic|validate should preserve"], { timeoutMs: 120000 }))) {
    return writeV7Report({ artifactDir, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build v7 functional scene", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeV7Report({ artifactDir, bundlePath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("validate v7 functional bundle", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeV7Report({ artifactDir, bundlePath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("verify v7 functional web visual scene", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "verify", "--project", projectPath, "--frames", "2", "--json"], { timeoutMs: 120000 }))) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      functionalWebReportPath,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
    });
  }
  if (
    !(await step(
      "package v7 functional desktop artifact",
      process.execPath,
      [
        resolve(root, "packages/cli/dist/index.js"),
        "package",
        "--bundle",
        bundlePath,
        "--target",
        "desktop",
        "--out",
        functionalPackageDir,
        "--json",
      ],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
    });
  }
  await rm(templateProjectPath, { force: true, recursive: true });
  if (
    !(await step(
      "create v7 functional template",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "create", templateProjectPath, "--template", "v7-functional", "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
      templateProjectPath,
    });
  }
  if (!(await step("build v7 functional template", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", templateProjectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
      templateProjectPath,
    });
  }
  if (!(await step("validate v7 functional template", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", templateProjectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
      templateProjectPath,
    });
  }

  if (!(await step("verify conformance gate", process.execPath, [resolve(root, "scripts/verify-conformance.mjs"), "--json"], { timeoutMs: 180000 }))) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      conformanceReportPath,
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
      templateProjectPath,
    });
  }

  const rustTest = await run({
    args: ["test"],
    command: "cargo",
    cwd: resolve(root, "runtime-bevy"),
    name: "test bevy runtime",
    timeoutMs: 180000,
  });
  const rustStep = { ...summarize(rustTest), name: "test bevy runtime" };
  steps.push(rustStep);
  await writeRustTestReport(rustTestReportPath, rustStep);
  if (rustTest.exitCode !== 0) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      conformanceReportPath,
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      reportPath,
      rustTestReportPath,
      startedAt,
      startedAtMs,
      steps,
      templateProjectPath,
    });
  }

  const packagingReport = await packagingVerifier({
    artifactDir: resolve(artifactDir, "packaging"),
    repoRoot: root,
    run,
  });
  steps.push({
    durationMs: packagingReport.durationMs,
    exitCode: packagingReport.ok ? 0 : 1,
    name: "verify v7 packaging",
    stderr: "",
    stdout: packagingReport.reportPath,
  });
  if (!packagingReport.ok) {
    return writeV7Report({
      artifactDir,
      bundlePath,
      conformanceReportPath,
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      packagingReportPath: packagingReport.reportPath,
      reportPath,
      rustTestReportPath,
      startedAt,
      startedAtMs,
      steps,
      templateProjectPath,
    });
  }

  const performanceReport = await performanceVerifier({
    artifactDir: resolve(artifactDir, "performance"),
    repoRoot: root,
  });
  steps.push({
    durationMs: 0,
    exitCode: performanceReport.ok ? 0 : 1,
    name: "verify v7 performance budgets",
    stderr: "",
    stdout: performanceReport.artifacts.comparisonReportPath,
  });

  const artifactCheck = await checkV7Artifacts({
    bundlePath,
    conformanceReportPath,
    functionalPackageDir,
    functionalWebReportPath,
    packagingReportPath: packagingReport.reportPath,
    performanceReportPath: performanceReport.artifacts.comparisonReportPath,
    reportPath,
    rustTestReportPath,
    templateProjectPath,
  });
  steps.push(artifactCheck);

  return writeV7Report({
    artifactDir,
    bundlePath,
    conformanceReportPath,
    functionalPackageDir,
    functionalWebReportPath,
    ok: performanceReport.ok && artifactCheck.exitCode === 0,
    packagingReportPath: packagingReport.reportPath,
    performanceReportPath: performanceReport.artifacts.comparisonReportPath,
    reportPath,
    rustTestReportPath,
    startedAt,
    startedAtMs,
    steps,
    templateProjectPath,
  });
}

async function writeV7Report({
  artifactDir,
  bundlePath,
  conformanceReportPath,
  functionalPackageDir,
  functionalWebReportPath,
  ok,
  packagingReportPath,
  performanceReportPath,
  reportPath,
  rustTestReportPath,
  startedAt,
  startedAtMs,
  steps,
  templateProjectPath,
}) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const failedStep = steps.find((step) => step.exitCode !== 0);
  const diagnostics =
    failedStep === undefined
      ? []
      : [
          {
            code: "TN_VERIFY_V7_STEP_FAILED",
            message: `V7 verification failed at '${failedStep.name}'.`,
            path: `steps.${steps.indexOf(failedStep)}`,
            severity: "error",
            step: failedStep.name,
          },
        ];
  const report = {
    artifacts: {
      bundlePath: bundlePath ?? resolve(artifactDir, "../../examples/v7-functional/dist/v7-functional.bundle"),
      conformanceReportPath: conformanceReportPath ?? resolve(artifactDir, "../conformance/verification-report.json"),
      diagnosticsDocPath: resolve(artifactDir, "../../docs/diagnostics.md"),
      docsCheckScriptPath: resolve(artifactDir, "../../scripts/check-docs-v7.mjs"),
      functionalPackageDir: functionalPackageDir ?? resolve(artifactDir, "functional-package"),
      functionalWebReportPath: functionalWebReportPath ?? resolve(artifactDir, "../../examples/v7-functional/artifacts/verify/verification-report.json"),
      packagingReportPath: packagingReportPath ?? resolve(artifactDir, "packaging/verification-report.json"),
      performanceReportPath: performanceReportPath ?? resolve(artifactDir, "performance/comparison.report.json"),
      reportPath,
      rustTestReportPath: rustTestReportPath ?? resolve(artifactDir, "rust-test-report.json"),
      templateProjectPath: templateProjectPath ?? resolve(artifactDir, "template-smoke/v7-functional"),
    },
    code: ok ? "TN_VERIFY_V7_OK" : "TN_VERIFY_V7_FAILED",
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    schema: "threenative.verify.v7",
    status: ok ? "pass" : "fail",
    startedAt: startedAt.toISOString(),
    steps,
    version: "0.1.0",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function writeRustTestReport(reportPath, step) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  await writeFile(
    reportPath,
    `${JSON.stringify(
      {
        code: step.exitCode === 0 ? "TN_VERIFY_V7_RUST_OK" : "TN_VERIFY_V7_RUST_FAILED",
        status: step.exitCode === 0 ? "pass" : "fail",
        step,
      },
      null,
      2,
    )}\n`,
  );
}

async function checkV7Artifacts(paths) {
  const startedAtMs = Date.now();
  const required = [
    paths.bundlePath,
    paths.conformanceReportPath,
    paths.functionalWebReportPath,
    resolve(paths.functionalWebReportPath, "../frame-01.png"),
    resolve(paths.functionalWebReportPath, "../frame-02.png"),
    resolve(paths.functionalPackageDir, "desktop/v7-functional.bundle"),
    resolve(paths.functionalPackageDir, "desktop/package.manifest.json"),
    resolve(paths.functionalPackageDir, "desktop/runtime.args.json"),
    paths.packagingReportPath,
    paths.performanceReportPath,
    paths.rustTestReportPath,
    paths.templateProjectPath,
  ];
  const missing = [];
  for (const path of required) {
    try {
      await access(path);
    } catch {
      missing.push(path);
    }
  }
  return {
    durationMs: Date.now() - startedAtMs,
    exitCode: missing.length === 0 ? 0 : 1,
    name: "check v7 release artifacts",
    stderr: missing.length === 0 ? "" : `Missing V7 release artifact(s): ${missing.join(", ")}`,
    stdout: paths.reportPath,
  };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV7();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V7 verification passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V7 verification failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
