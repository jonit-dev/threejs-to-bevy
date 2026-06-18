import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV4(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({ gate: "milestones/v4", owner: { kind: "aggregate", name: "milestones/v4" }, root });

  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v4-scripting");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("check v4 docs", process.execPath, [resolve(root, "scripts/check-docs-v4.mjs"), "--json"]))) {
    return writeV4Report({ artifactDir, ok: false, reportPath, steps });
  }

  const verifyScripting =
    options.scriptingVerifier ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/v4Scripting.js")).href)).verifyV4Scripting;
  const scriptingReport = await verifyScripting({ artifactDir, projectPath });
  steps.push({
    durationMs: 0,
    exitCode: scriptingReport.status === "pass" ? 0 : 1,
    name: "verify v4 scripting cross-runtime effects",
    stderr: "",
    stdout: scriptingReport.artifacts.reportPath,
  });

  return writeV4Report({
    artifactDir,
    diffPath: scriptingReport.artifacts.diffPath,
    nativeEffectsPath: scriptingReport.artifacts.nativeEffectsPath,
    ok: scriptingReport.status === "pass",
    reportPath,
    scriptingReportPath: scriptingReport.artifacts.reportPath,
    steps,
    webEffectsPath: scriptingReport.artifacts.webEffectsPath,
    webVisualReportPath: scriptingReport.artifacts.webReportPath,
  });
}

async function writeV4Report({
  artifactDir,
  diffPath,
  nativeEffectsPath,
  ok,
  reportPath,
  scriptingReportPath,
  steps,
  webEffectsPath,
  webVisualReportPath,
}) {
  await mkdir(resolve(reportPath, ".."), { recursive: true });
  const report = {
    artifacts: {
      diffPath: diffPath ?? resolve(artifactDir, "effects-diff.json"),
      nativeEffectsPath: nativeEffectsPath ?? resolve(artifactDir, "native-effects.json"),
      reportPath,
      scriptingReportPath: scriptingReportPath ?? resolve(artifactDir, "v4-scripting-report.json"),
      webEffectsPath: webEffectsPath ?? resolve(artifactDir, "web-effects.json"),
      webVisualReportPath: webVisualReportPath ?? resolve(artifactDir, "verification-report.json"),
    },
    code: ok ? "TN_VERIFY_V4_OK" : "TN_VERIFY_V4_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV4();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V4 release gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V4 release gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
