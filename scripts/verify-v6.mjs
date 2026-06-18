import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV6(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const startedAt = new Date();
  const startedAtMs = Date.now();
  const artifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/milestones/v6");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v6-functional");
  const bundlePath = resolve(projectPath, "dist/v6-functional.bundle");
  const conformanceReportPath = options.conformanceReportPath ?? resolve(root, "packages/ir/artifacts/conformance/verification-report.json");
  const projectWebVisualReportPath = resolve(projectPath, "artifacts/verify/verification-report.json");
  const webVisualArtifactDir = resolve(artifactDir, "web-visual");
  const steps = [];
  let webVisualEvidence;

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
  if (
    !(await step(
      "verify v6 web visual scene",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "verify", "--project", projectPath, "--frames", "2", "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps });
  }
  webVisualEvidence = await mirrorWebVisualEvidence({
    enabled: options.copyEvidence !== false,
    reportPath: projectWebVisualReportPath,
    targetDir: webVisualArtifactDir,
  });
  if (!(await step("verify conformance gate", process.execPath, [resolve(root, "scripts/verify-conformance.mjs"), "--json"], { timeoutMs: 180000 }))) {
    return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: false, reportPath, startedAt, startedAtMs, steps, webVisualEvidence });
  }

  return writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok: true, reportPath, startedAt, startedAtMs, steps, webVisualEvidence });
}

async function mirrorWebVisualEvidence({ enabled, reportPath, targetDir }) {
  if (!enabled) {
    return {
      effectLogPath: resolve(targetDir, "web-effect-log.json"),
      reportPath: resolve(targetDir, "verification-report.json"),
      screenshots: [resolve(targetDir, "frame-01.png"), resolve(targetDir, "frame-02.png")],
      status: "pass",
    };
  }

  const sourceReport = JSON.parse(await readFile(reportPath, "utf8"));
  await mkdir(targetDir, { recursive: true });
  const screenshots = [];
  for (const screenshot of sourceReport.artifacts?.screenshots ?? []) {
    const targetPath = resolve(targetDir, basename(screenshot));
    await copyFile(screenshot, targetPath);
    screenshots.push(targetPath);
  }

  let effectLogPath;
  if (sourceReport.artifacts?.effectLogPath !== undefined) {
    effectLogPath = resolve(targetDir, basename(sourceReport.artifacts.effectLogPath));
    await copyFile(sourceReport.artifacts.effectLogPath, effectLogPath);
  }

  const mirroredReportPath = resolve(targetDir, "verification-report.json");
  const mirroredReport = {
    ...sourceReport,
    artifacts: {
      ...sourceReport.artifacts,
      ...(effectLogPath === undefined ? {} : { effectLogPath }),
      reportPath: mirroredReportPath,
      screenshots,
    },
  };
  await writeFile(mirroredReportPath, `${JSON.stringify(mirroredReport, null, 2)}\n`);

  return {
    effectLogPath,
    reportPath: mirroredReportPath,
    screenshots,
    status: sourceReport.status,
  };
}

async function writeV6Report({ artifactDir, bundlePath, conformanceReportPath, ok, reportPath, startedAt, startedAtMs, steps, webVisualEvidence }) {
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
      ...(webVisualEvidence === undefined
        ? {}
        : {
            webVisualEffectLogPath: webVisualEvidence.effectLogPath,
            webVisualReportPath: webVisualEvidence.reportPath,
            webVisualScreenshots: webVisualEvidence.screenshots,
          }),
    },
    code: ok ? "TN_VERIFY_V6_OK" : "TN_VERIFY_V6_FAILED",
    diagnostics,
    durationMs: Date.now() - startedAtMs,
    schema: "threenative.verify.v6",
    status: ok ? "pass" : "fail",
    startedAt: startedAt.toISOString(),
    steps,
    version: "0.1.0",
    visualEvidenceStatus: webVisualEvidence?.status === "pass" ? "web-captured" : "pending",
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
