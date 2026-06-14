import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV5(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v5");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v5-functional");
  const bundlePath = resolve(projectPath, "dist/v5-functional.bundle");
  const webVisualReportPath = resolve(projectPath, "artifacts/verify/verification-report.json");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v5 docs", process.execPath, [resolve(root, "scripts/check-docs-v5.mjs"), "--json"]))) {
    return writeV5Report({ artifactDir, bundlePath, ok: false, reportPath, steps, webVisualReportPath });
  }
  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeV5Report({ artifactDir, bundlePath, ok: false, reportPath, steps, webVisualReportPath });
  }
  if (
    !(await step(
      "build v5 functional scene",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, ok: false, reportPath, steps, webVisualReportPath });
  }
  if (
    !(await step(
      "validate v5 functional bundle",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, ok: false, reportPath, steps, webVisualReportPath });
  }
  if (
    !(await step(
      "verify v5 web visual scene",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "verify", "--project", projectPath, "--frames", "2", "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV5Report({ artifactDir, bundlePath, ok: false, reportPath, steps, webVisualReportPath });
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

  return writeV5Report({
    artifactDir,
    bundlePath,
    denseContentReportPath: denseContentReport.artifacts.reportPath,
    ok: denseContentReport.status === "pass",
    reportPath,
    steps,
    webVisualReportPath,
  });
}

async function writeV5Report({ artifactDir, bundlePath, denseContentReportPath, ok, reportPath, steps, webVisualReportPath }) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const report = {
    artifacts: {
      bundlePath,
      denseContentReportPath: denseContentReportPath ?? resolve(artifactDir, "dense-content/v3-environment-report.json"),
      reportPath,
      webVisualReportPath,
    },
    code: ok ? "TN_VERIFY_V5_OK" : "TN_VERIFY_V5_FAILED",
    status: ok ? "pass" : "fail",
    steps,
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
