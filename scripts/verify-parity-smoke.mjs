import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyParitySmokeGate(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir =
    options.artifactDir ?? resolve(root, "tools/verify/artifacts/parity-smoke");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check names", "pnpm", ["check:names"], { timeoutMs: 120000 }))) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }

  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 180000 }))) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }

  if (
    !(await step(
      "build bevy capture",
      "cargo",
      ["build", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture"],
      { cwd: resolve(root, "runtime-bevy"), timeoutMs: 600000 },
    ))
  ) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }

  const project = "examples/parity-smoke";
  if (
    !(await step(
      "build parity-smoke",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "build", "--project", project, "--json"],
      { timeoutMs: 300000 },
    ))
  ) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }
  if (
    !(await step(
      "validate parity-smoke",
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", project, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }

  const { PARITY_SMOKE_CHECKPOINT, verifyBaselineVisualCheckpoint } =
    options.visualVerifierModule ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/baselineVisualParity.js")).href));

  const visual = await verifyBaselineVisualCheckpoint({
    artifactDir: resolve(artifactDir, PARITY_SMOKE_CHECKPOINT.id),
    bundlePath: resolve(root, PARITY_SMOKE_CHECKPOINT.bundleRelativePath),
    checkpoint: PARITY_SMOKE_CHECKPOINT,
    screenshotCapturer: options.screenshotCapturer,
  });

  steps.push({
    durationMs: 0,
    exitCode: visual.status === "pass" ? 0 : 1,
    name: "verify parity-smoke web bevy capture",
    stderr: visual.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: JSON.stringify(visual.metrics),
  });

  const ok = visual.status === "pass";
  return writeGateReport({
    artifactDir,
    ok,
    reportPath,
    steps,
    visualReportPath: resolve(artifactDir, "parity-smoke-report.json"),
    visual,
  });
}

async function writeGateReport({ artifactDir, ok, reportPath, steps, visualReportPath, visual }) {
  await mkdir(artifactDir, { recursive: true });
  if (visual !== undefined) {
    await writeFile(
      visualReportPath ?? resolve(artifactDir, "parity-smoke-report.json"),
      `${JSON.stringify({ artifacts: { artifactDir, reportPath: visualReportPath }, checkpoint: visual, status: visual.status }, null, 2)}\n`,
    );
  }
  const report = {
    artifacts: {
      artifactDir,
      reportPath,
      visualReportPath: visualReportPath ?? resolve(artifactDir, "parity-smoke-report.json"),
    },
    code: ok ? "TN_VERIFY_PARITY_SMOKE_OK" : "TN_VERIFY_PARITY_SMOKE_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyParitySmokeGate();
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`,
    );
  } else if (result.ok) {
    process.stdout.write(`Parity smoke gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`Parity smoke gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
