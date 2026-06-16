import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8RenderingQuality(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const artifactDir = options.artifactDir ?? resolve(root, "artifacts/v8/rendering-quality");
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const projectPath = resolve(root, "examples/v8-rendering-quality");
  const bundlePath = resolve(projectPath, "dist/v8-rendering-quality.bundle");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("build v8 rendering quality example", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("validate v8 rendering quality bundle", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir, bundlePath, ok: false, reportPath, steps });
  }

  const verifier = options.visualVerifier
    ?? (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/renderingQuality.js")).href)).verifyRenderingQualityVisual;
  const visual = await verifier({ artifactDir, bundlePath });
  steps.push({
    durationMs: 0,
    exitCode: visual.status === "pass" ? 0 : 1,
    name: "verify fog and sky visual parity",
    stderr: visual.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: visual.artifacts.reportPath,
  });

  return writeReport({
    artifactDir,
    bundlePath,
    ok: visual.status === "pass",
    reportPath,
    steps,
    visualReportPath: visual.artifacts.reportPath,
  });
}

async function writeReport({ artifactDir, bundlePath, ok, reportPath, steps, visualReportPath }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      artifactDir,
      bevyScreenshotPath: resolve(artifactDir, "bevy.png"),
      bundlePath,
      contactSheetPath: resolve(artifactDir, "contact-sheet.png"),
      diffPath: resolve(artifactDir, "diff.png"),
      reportPath,
      visualReportPath: visualReportPath ?? resolve(artifactDir, "rendering-quality-report.json"),
      webScreenshotPath: resolve(artifactDir, "web.png"),
    },
    code: ok ? "TN_VERIFY_V8_RENDERING_QUALITY_OK" : "TN_VERIFY_V8_RENDERING_QUALITY_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV8RenderingQuality();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V8 rendering quality gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V8 rendering quality gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
