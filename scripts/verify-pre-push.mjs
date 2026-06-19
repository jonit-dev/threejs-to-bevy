import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { verifyBaselineVisualParityGate } from "./verify-baseline-visual-parity.mjs";
import { resolveArtifactTargets } from "./artifact-paths.mjs";
import { runCommand, verifyConformance } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const runtimeRoot = resolve(repoRoot, "runtime-bevy");
const prePushTestEnv = {
  TN_SKIP_PACKAGE_TEST_BUILD: "1",
};

export async function verifyPrePushGate(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({
    gate: "pre-push",
    owner: { kind: "aggregate", name: "pre-push" },
    root,
  });
  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const steps = [];
  const linkedReports = {};

  async function runParallel(tasks) {
    const results = await Promise.all(
      tasks.map((task) =>
        run({
          args: task.args,
          command: task.command,
          cwd: task.cwd ?? root,
          env: task.env,
          name: task.name,
          timeoutMs: task.timeoutMs,
        }),
      ),
    );
    for (const [index, result] of results.entries()) {
      steps.push({ ...summarize(result), name: tasks[index]?.name ?? result.name ?? "unknown" });
    }
    return results.every((result) => result.exitCode === 0);
  }

  async function runPhase(name, tasks) {
    const ok = await runParallel(tasks);
    if (!ok) {
      return writeGateReport({
        artifactDir,
        failedPhase: name,
        linkedReports,
        ok: false,
        reportPath,
        steps,
      });
    }
    return null;
  }

  const failed = await runPhase("setup", [
    {
      args: ["build"],
      command: "pnpm",
      name: "build workspace",
      timeoutMs: 300000,
    },
    {
      args: ["build", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture"],
      command: "cargo",
      cwd: runtimeRoot,
      name: "build bevy capture",
      timeoutMs: 600000,
    },
  ]);
  if (failed !== null) {
    return failed;
  }

  const failedChecks = await runPhase("static checks", [
    {
      args: ["typecheck"],
      command: "pnpm",
      name: "typecheck",
      timeoutMs: 180000,
    },
  ]);
  if (failedChecks !== null) {
    return failedChecks;
  }

  const failedTests = await runPhase("tests", [
    {
      args: ["-r", "--if-present", "test"],
      command: "pnpm",
      env: prePushTestEnv,
      name: "package tests",
      timeoutMs: 600000,
    },
    {
      args: ["test", "--manifest-path", "runtime-bevy/Cargo.toml"],
      command: "cargo",
      cwd: root,
      name: "rust tests",
      timeoutMs: 600000,
    },
  ]);
  if (failedTests !== null) {
    return failedTests;
  }

  const conformance =
    options.conformanceVerifier ??
    (await verifyConformance({
      repoRoot: root,
      run,
      skipDuplicateRuntimeTests: true,
    }));
  for (const step of conformance.steps) {
    steps.push({ ...step, name: `conformance: ${step.name}` });
  }
  linkedReports.conformanceReportPath = conformance.reportPath;
  if (!conformance.ok) {
    return writeGateReport({
      artifactDir,
      failedPhase: "conformance",
      linkedReports,
      ok: false,
      reportPath,
      steps,
    });
  }

  const parity =
    options.parityVerifier ??
    (await verifyBaselineVisualParityGate({
      repoRoot: root,
      run,
      skipSetup: true,
      visualVerifierModule: options.visualVerifierModule,
    }));
  for (const step of parity.steps) {
    steps.push({ ...step, name: step.name ? `parity: ${step.name}` : "parity: unknown" });
  }
  linkedReports.parityReportPath = parity.reportPath;
  linkedReports.visualReportPath = parity.artifacts?.visualReportPath;
  if (!parity.ok) {
    return writeGateReport({
      artifactDir,
      failedPhase: "baseline visual parity",
      linkedReports,
      ok: false,
      reportPath,
      steps,
    });
  }

  return writeGateReport({
    artifactDir,
    linkedReports,
    ok: true,
    reportPath,
    steps,
  });
}

async function writeGateReport({ artifactDir, failedPhase, linkedReports, ok, reportPath, steps }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      artifactDir,
      reportPath,
      ...linkedReports,
    },
    code: ok ? "TN_VERIFY_PRE_PUSH_OK" : "TN_VERIFY_PRE_PUSH_FAILED",
    failedPhase: ok ? undefined : failedPhase,
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const startedAt = Date.now();
  const result = await verifyPrePushGate();
  const durationMs = Date.now() - startedAt;
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ code: result.code, durationMs, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`,
    );
  } else if (result.ok) {
    process.stdout.write(`Pre-push gate passed in ${(durationMs / 1000).toFixed(1)}s. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(
      `Pre-push gate failed at '${result.failedPhase ?? failed?.name ?? "unknown"}' after ${(durationMs / 1000).toFixed(1)}s. Report: ${result.reportPath}\n`,
    );
  }
  process.exit(result.ok ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
