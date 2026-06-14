import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { verifyV7Packaging } from "./verify-v7-packaging.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV7(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v7");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const startedAt = new Date();
  const startedAtMs = Date.now();
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

  return writeV7Report({
    artifactDir,
    ok: packagingReport.ok,
    packagingReportPath: packagingReport.reportPath,
    reportPath,
    startedAt,
    startedAtMs,
    steps,
  });
}

async function writeV7Report({ artifactDir, ok, packagingReportPath, reportPath, startedAt, startedAtMs, steps }) {
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
      packagingReportPath: packagingReportPath ?? resolve(artifactDir, "packaging/verification-report.json"),
      reportPath,
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
