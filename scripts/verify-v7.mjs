import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { verifyV7Packaging } from "./verify-v7-packaging.mjs";
import { verifyV7PerformanceBudgets } from "./verify-v7-performance-budgets.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV7(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v7");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const projectPath = resolve(root, "examples/v7-functional");
  const bundlePath = resolve(projectPath, "dist/v7-functional.bundle");
  const functionalWebReportPath = resolve(projectPath, "artifacts/verify/verification-report.json");
  const functionalPackageDir = resolve(artifactDir, "functional-package");
  const templateProjectPath = resolve(artifactDir, "template-smoke/v7-functional");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v7 docs", process.execPath, [resolve(root, "scripts/check-docs-v7.mjs"), "--json"]))) {
    return writeV7Report({ artifactDir, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
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

  const packagingReport = await verifyV7Packaging({
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
      functionalPackageDir,
      functionalWebReportPath,
      ok: false,
      packagingReportPath: packagingReport.reportPath,
      reportPath,
      startedAt,
      startedAtMs,
      steps,
    });
  }

  const performanceReport = await verifyV7PerformanceBudgets({
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

  return writeV7Report({
    artifactDir,
    bundlePath,
    functionalPackageDir,
    functionalWebReportPath,
    ok: performanceReport.ok,
    packagingReportPath: packagingReport.reportPath,
    performanceReportPath: performanceReport.artifacts.comparisonReportPath,
    reportPath,
    startedAt,
    startedAtMs,
    steps,
  });
}

async function writeV7Report({
  artifactDir,
  bundlePath,
  functionalPackageDir,
  functionalWebReportPath,
  ok,
  packagingReportPath,
  performanceReportPath,
  reportPath,
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
      functionalPackageDir: functionalPackageDir ?? resolve(artifactDir, "functional-package"),
      functionalWebReportPath: functionalWebReportPath ?? resolve(artifactDir, "../../examples/v7-functional/artifacts/verify/verification-report.json"),
      packagingReportPath: packagingReportPath ?? resolve(artifactDir, "packaging/verification-report.json"),
      performanceReportPath: performanceReportPath ?? resolve(artifactDir, "performance/comparison.report.json"),
      reportPath,
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
