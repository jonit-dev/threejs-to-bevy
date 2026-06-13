import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV3(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v3");
  const environmentVerifier = options.environmentVerifier;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v3-environment");
  const bundlePath = resolve(projectPath, "dist/forest.bundle");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v3 docs", process.execPath, [resolve(root, "scripts/check-docs-v3.mjs"), "--json"]))) {
    return writeV3Report({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeV3Report({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("build v3 environment", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeV3Report({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("validate v3 environment bundle", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeV3Report({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }

  const verifyEnvironment =
    environmentVerifier ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v3Environment.js")).href)).verifyV3Environment;
  const environmentReport = await verifyEnvironment({ artifactDir, bundlePath });
  steps.push({ durationMs: 0, exitCode: environmentReport.status === "pass" ? 0 : 1, stderr: "", stdout: environmentReport.artifacts.reportPath, name: "verify v3 environment performance" });

  return writeV3Report({ artifactDir, bundlePath, ok: environmentReport.status === "pass", reportPath, steps, webReportPath: environmentReport.artifacts.reportPath });
}

async function writeV3Report({ artifactDir, bundlePath, ok, reportPath, steps, webReportPath }) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const report = {
    artifacts: {
      bundlePath,
      reportPath,
      webReportPath: webReportPath ?? resolve(artifactDir, "v3-environment-report.json"),
    },
    code: ok ? "TN_VERIFY_V3_OK" : "TN_VERIFY_V3_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV3();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V3 release gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V3 release gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
