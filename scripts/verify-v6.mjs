import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV6(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v6");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v6-functional");
  const bundlePath = resolve(projectPath, "dist/v6-functional.bundle");
  const conformanceReportPath = options.conformanceReportPath ?? resolve(root, "artifacts/conformance/verification-report.json");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v6 docs", process.execPath, [resolve(root, "scripts/check-docs-v6.mjs"), "--json"]))) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("test v6 docs and gate scripts", process.execPath, ["--test", resolve(root, "scripts/check-docs-v6.test.mjs"), resolve(root, "scripts/verify-v6.test.mjs")]))) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (
    !(await step(
      "build v6 functional scene",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (
    !(await step(
      "validate v6 functional bundle",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  if (!(await step("verify conformance gate", process.execPath, [resolve(root, "scripts/verify-conformance.mjs"), "--json"], { timeoutMs: 180000 }))) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }

  return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: true, reportPath, startedAt, startedAtMs, steps });
}

async function writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok, reportPath, startedAt, startedAtMs, steps }) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const failedStep = steps.find((step) => step.exitCode !== 0);
  const diagnostics =
    failedStep === undefined
      ? []
      : [
          {
            code: "TN_VERIFY_V6_STEP_FAILED",
            message: `V6 release gate failed at '${failedStep.name}'.`,
            path: `steps.${steps.indexOf(failedStep)}`,
            severity: "error",
            step: failedStep.name,
          },
        ];
  const report = {
    artifacts: {
      bundlePath,
      conformanceReportPath: conformanceReportPath ?? resolve(resolve(artifactDir, ".."), "conformance/verification-report.json"),
      reportPath,
    },
    code: ok ? "TN_VERIFY_V6_OK" : "TN_VERIFY_V6_FAILED",
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    schema: "threenative.verify.v6",
    status: ok ? "pass" : "fail",
    startedAt: startedAt.toISOString(),
    steps,
    version: "0.1.0",
    visualEvidenceStatus: "pending",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV6();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V6 gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V6 gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
