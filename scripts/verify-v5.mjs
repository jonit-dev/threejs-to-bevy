import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV5(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const artifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/milestones/v5");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v5-functional");
  const bundlePath = resolve(projectPath, "dist/v5-functional.bundle");
  const conformanceReportPath = options.conformanceReportPath ?? resolve(root, "packages/ir/artifacts/conformance/verification-report.json");
  const rustTestReportPath = options.rustTestReportPath ?? resolve(artifactDir, "rust-test-report.json");
  const starterProjectPath = resolve(artifactDir, "starter-smoke/v5-game-starter");
  const webVisualReportPath = resolve(projectPath, "artifacts/verify/verification-report.json");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v5 docs", process.execPath, [resolve(root, "scripts/check-docs-v5.mjs"), "--json"]))) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, steps, starterProjectPath, webVisualReportPath });
  }
  if (!(await step("test v5 docs and gate scripts", process.execPath, ["--test", resolve(root, "scripts/check-docs-v5.test.mjs"), resolve(root, "scripts/verify-v5.test.mjs")]))) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, steps, starterProjectPath, webVisualReportPath });
  }
  if (!(await step("test sdk package", "pnpm", ["--filter", "@threenative/sdk", "test"], { timeoutMs: 120000 }))) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, steps, starterProjectPath, webVisualReportPath });
  }
  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, steps, starterProjectPath, webVisualReportPath });
  }
  if (
    !(await step(
      "build v5 functional scene",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, steps, starterProjectPath, webVisualReportPath });
  }
  if (
    !(await step(
      "validate v5 functional bundle",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, steps, starterProjectPath, webVisualReportPath });
  }
  if (
    !(await step(
      "verify v5 web visual scene",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "verify", "--project", projectPath, "--frames", "2", "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, steps, starterProjectPath, webVisualReportPath });
  }

  const verifyDenseContent =
    options.denseContentVerifier ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v3Environment.js")).href)).verifyV3Environment;
  const denseContentReport = await verifyDenseContent({
    artifactDir: resolve(artifactDir, "dense-content"),
    bundlePath,
  });
  steps.push({
    durationMs: 0,
    exitCode: denseContentReport.status === "pass" ? 0 : 1,
    name: "verify v5 dense content budgets",
    stderr: "",
    stdout: denseContentReport.artifacts.reportPath,
  });
  if (denseContentReport.status !== "pass") {
    return writeV5Report({
      artifactDir,
      bundlePath,
      conformanceReportPath,
      denseContentReportPath: denseContentReport.artifacts.reportPath,
      ok: false,
      reportPath,
      rustTestReportPath,
      startedAt,
      startedAtMs,
      starterProjectPath,
      steps,
      webVisualReportPath,
    });
  }

  await rm(starterProjectPath, { force: true, recursive: true });
  if (
    !(await step(
      "create v5 game starter template",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "create", starterProjectPath, "--template", "v5-game-starter", "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, denseContentReportPath: denseContentReport.artifacts.reportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, starterProjectPath, steps, webVisualReportPath });
  }
  if (
    !(await step(
      "build v5 game starter template",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "build", "--project", starterProjectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, denseContentReportPath: denseContentReport.artifacts.reportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, starterProjectPath, steps, webVisualReportPath });
  }
  if (
    !(await step(
      "validate v5 game starter bundle",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", starterProjectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, denseContentReportPath: denseContentReport.artifacts.reportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, starterProjectPath, steps, webVisualReportPath });
  }
  if (!(await step("verify conformance gate", process.execPath, [resolve(root, "scripts/verify-conformance.mjs"), "--json"], { timeoutMs: 180000 }))) {
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, denseContentReportPath: denseContentReport.artifacts.reportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, starterProjectPath, steps, webVisualReportPath });
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
    return writeV5Report({ artifactDir, bundlePath, conformanceReportPath, denseContentReportPath: denseContentReport.artifacts.reportPath, ok: false, reportPath, rustTestReportPath, startedAt, startedAtMs, starterProjectPath, steps, webVisualReportPath });
  }

  return writeV5Report({
    artifactDir,
    bundlePath,
    conformanceReportPath,
    denseContentReportPath: denseContentReport.artifacts.reportPath,
    ok: denseContentReport.status === "pass",
    reportPath,
    rustTestReportPath,
    startedAt,
    startedAtMs,
    starterProjectPath,
    steps,
    webVisualReportPath,
  });
}

async function writeRustTestReport(rustTestReportPath, step) {
  await mkdir(resolve(rustTestReportPath, ".."), { recursive: true });
  await writeFile(
    rustTestReportPath,
    `${JSON.stringify(
      {
        code: step.exitCode === 0 ? "TN_VERIFY_V5_RUST_TEST_OK" : "TN_VERIFY_V5_RUST_TEST_FAILED",
        status: step.exitCode === 0 ? "pass" : "fail",
        step,
      },
      null,
      2,
    )}\n`,
  );
}

async function writeV5Report({ artifactDir, bundlePath, conformanceReportPath, denseContentReportPath, ok, reportPath, rustTestReportPath, startedAt, startedAtMs, starterProjectPath, steps, webVisualReportPath }) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const failedStep = steps.find((step) => step.exitCode !== 0);
  const diagnostics =
    failedStep === undefined
      ? []
      : [
          {
            code: "TN_VERIFY_V5_STEP_FAILED",
            message: `V5 release gate failed at '${failedStep.name}'.`,
            path: `steps.${steps.indexOf(failedStep)}`,
            severity: "error",
            step: failedStep.name,
          },
        ];
  const report = {
    artifacts: {
      bundlePath,
      conformanceReportPath: conformanceReportPath ?? resolve(resolve(artifactDir, ".."), "conformance/verification-report.json"),
      denseContentReportPath: denseContentReportPath ?? resolve(artifactDir, "dense-content/v3-environment-report.json"),
      reportPath,
      rustTestReportPath: rustTestReportPath ?? resolve(artifactDir, "rust-test-report.json"),
      starterProjectPath: starterProjectPath ?? resolve(artifactDir, "starter-smoke/v5-game-starter"),
      webVisualReportPath,
    },
    code: ok ? "TN_VERIFY_V5_OK" : "TN_VERIFY_V5_FAILED",
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    schema: "threenative.verify.v5",
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
  const result = await verifyV5();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V5 visual-quality gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V5 visual-quality gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
