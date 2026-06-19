import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";
import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyBaselineVisualParityGate(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({
    gate: "baseline-visual-parity",
    owner: { kind: "aggregate", name: "baseline-visual-parity" },
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

  const { BASELINE_VISUAL_CHECKPOINTS, verifyBaselineVisualParity } =
    options.visualVerifierModule ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/baselineVisualParity.js")).href));

  const projects = [...new Set(BASELINE_VISUAL_CHECKPOINTS.map((checkpoint) => checkpoint.projectRelativePath))];
  for (const project of projects) {
    const label = project.split("/").at(-1);
    if (
      !(await step(
        `build ${label}`,
        process.execPath,
        [resolve(root, "packages/cli/dist/index.js"), "build", "--project", project, "--json"],
        { timeoutMs: 300000 },
      ))
    ) {
      return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
    }
    if (
      !(await step(
        `validate ${label}`,
        process.execPath,
        [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", project, "--json"],
        { timeoutMs: 120000 },
      ))
    ) {
      return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
    }
  }

  const visual = await verifyBaselineVisualParity({ artifactDir, repoRoot: root });
  steps.push({
    durationMs: 0,
    exitCode: visual.status === "pass" ? 0 : 1,
    name: "verify baseline visual parity checkpoints",
    stderr: visual.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: visual.artifacts.reportPath,
  });

  const ok = visual.status === "pass";
  return writeGateReport({
    artifactDir,
    ok,
    reportPath,
    steps,
    visualReportPath: visual.artifacts.reportPath,
  });
}

async function writeGateReport({ artifactDir, ok, reportPath, steps, visualReportPath }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      artifactDir,
      reportPath,
      visualReportPath: visualReportPath ?? resolve(artifactDir, "baseline-visual-parity-report.json"),
    },
    code: ok ? "TN_VERIFY_BASELINE_VISUAL_PARITY_OK" : "TN_VERIFY_BASELINE_VISUAL_PARITY_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyBaselineVisualParityGate();
  if (json) {
    process.stdout.write(
      `${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`,
    );
  } else if (result.ok) {
    process.stdout.write(`Baseline visual parity gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(
      `Baseline visual parity gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`,
    );
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
