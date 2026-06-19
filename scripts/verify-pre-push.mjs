import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";
import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyPrePushGate(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const skipSetup = options.skipSetup ?? false;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({
    gate: "pre-push",
    owner: { kind: "aggregate", name: "pre-push" },
    root,
  });
  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!skipSetup) {
    const [cliResult, captureResult] = await Promise.all([
      run({
        args: ["--filter", "@threenative/cli", "build"],
        command: "pnpm",
        cwd: root,
        name: "build cli",
        timeoutMs: 180000,
      }),
      run({
        args: ["build", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture"],
        command: "cargo",
        cwd: resolve(root, "runtime-bevy"),
        name: "build bevy capture",
        timeoutMs: 600000,
      }),
    ]);
    steps.push({ ...summarize(cliResult), name: "build cli" });
    steps.push({ ...summarize(captureResult), name: "build bevy capture" });
    if (cliResult.exitCode !== 0 || captureResult.exitCode !== 0) {
      return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
    }
  }

  const visualVerifierModule =
    options.visualVerifierModule ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/baselineVisualParity.js")).href));
  const { BASELINE_VISUAL_CHECKPOINTS, verifyBaselineVisualCheckpoint } = visualVerifierModule;
  const checkpoint = options.checkpoint ?? BASELINE_VISUAL_CHECKPOINTS.find((entry) => entry.id === "v1-canonical");
  if (checkpoint === undefined) {
    throw new Error("Pre-push checkpoint 'v1-canonical' is not configured.");
  }

  const project = checkpoint.projectRelativePath;
  const cliPath = resolve(root, "packages/cli/dist/index.js");
  if (!(await step("build v1-canonical", process.execPath, [cliPath, "build", "--project", project, "--json"], { timeoutMs: 300000 }))) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }
  if (!(await step("validate v1-canonical", process.execPath, [cliPath, "validate", "--project", project, "--json"], { timeoutMs: 120000 }))) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }

  const visual = await verifyBaselineVisualCheckpoint({
    artifactDir: resolve(artifactDir, checkpoint.id),
    bundlePath: resolve(root, checkpoint.bundleRelativePath),
    checkpoint,
    repoRoot: root,
    screenshotCapturer: options.screenshotCapturer,
  });

  steps.push({
    durationMs: 0,
    exitCode: visual.status === "pass" ? 0 : 1,
    name: "verify pre-push web bevy capture",
    stderr: visual.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: JSON.stringify(visual.metrics),
  });

  const ok = visual.status === "pass";
  return writeGateReport({
    artifactDir,
    ok,
    reportPath,
    steps,
    visual,
    visualReportPath: resolve(artifactDir, `${checkpoint.id}-report.json`),
  });
}

async function writeGateReport({ artifactDir, ok, reportPath, steps, visualReportPath, visual }) {
  await mkdir(artifactDir, { recursive: true });
  if (visual !== undefined) {
    await writeFile(
      visualReportPath ?? resolve(artifactDir, "pre-push-visual-report.json"),
      `${JSON.stringify({ artifacts: { artifactDir, reportPath: visualReportPath }, checkpoint: visual, status: visual.status }, null, 2)}\n`,
    );
  }
  const report = {
    artifacts: {
      artifactDir,
      reportPath,
      visualReportPath: visualReportPath ?? resolve(artifactDir, "pre-push-visual-report.json"),
    },
    code: ok ? "TN_VERIFY_PRE_PUSH_OK" : "TN_VERIFY_PRE_PUSH_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const skipSetup = process.argv.includes("--no-setup");
  const result = await verifyPrePushGate({ skipSetup });
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`,
    );
  } else if (result.ok) {
    process.stdout.write(`Pre-push gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`Pre-push gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
