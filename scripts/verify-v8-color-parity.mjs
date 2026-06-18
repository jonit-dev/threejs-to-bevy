import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8ColorParity(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const colorArtifactDir = options.artifactDir ?? resolve(root, "tools/verify/artifacts/color-parity");
  const lightingArtifactDir = options.lightingArtifactDir ?? resolve(root, "tools/verify/artifacts/lighting-tone");
  const reportPath = options.reportPath ?? resolve(colorArtifactDir, "verification-report.json");
  const colorProjectPath = resolve(root, "examples/v8-color-parity");
  const lightingProjectPath = resolve(root, "examples/v8-lighting-tone");
  const colorBundlePath = resolve(colorProjectPath, "dist/v8-color-parity.bundle");
  const lightingBundlePath = resolve(lightingProjectPath, "dist/v8-lighting-tone.bundle");
  const steps = [];
  let colorVisual;
  let lightingVisual;

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir: colorArtifactDir, bundlePath: colorBundlePath, lightingArtifactDir, lightingBundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("build v8 color parity example", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", colorProjectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir: colorArtifactDir, bundlePath: colorBundlePath, lightingArtifactDir, lightingBundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("validate v8 color parity bundle", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", colorProjectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir: colorArtifactDir, bundlePath: colorBundlePath, lightingArtifactDir, lightingBundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("build v8 lighting tone example", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", lightingProjectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir: colorArtifactDir, bundlePath: colorBundlePath, lightingArtifactDir, lightingBundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("validate v8 lighting tone bundle", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", lightingProjectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactDir: colorArtifactDir, bundlePath: colorBundlePath, lightingArtifactDir, lightingBundlePath, ok: false, reportPath, steps });
  }

  const colorVerifier = options.colorVisualVerifier
    ?? (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/colorParityVisual.js")).href)).verifyColorParityVisual;
  colorVisual = await colorVerifier({ artifactDir: colorArtifactDir, bundlePath: colorBundlePath });
  steps.push({
    durationMs: 0,
    exitCode: colorVisual.status === "pass" ? 0 : 1,
    name: "verify color parity visual evidence",
    stderr: colorVisual.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: colorVisual.artifacts.reportPath,
  });

  const lightingVerifier = options.lightingVisualVerifier
    ?? (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/lightingToneParityVisual.js")).href)).verifyLightingToneParityVisual;
  lightingVisual = await lightingVerifier({ artifactDir: lightingArtifactDir, bundlePath: lightingBundlePath });
  steps.push({
    durationMs: 0,
    exitCode: lightingVisual.status === "pass" ? 0 : 1,
    name: "verify lighting tone visual evidence",
    stderr: lightingVisual.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: lightingVisual.artifacts.reportPath,
  });

  const ok = colorVisual.status === "pass" && lightingVisual.status === "pass";
  return writeReport({
    artifactDir: colorArtifactDir,
    bundlePath: colorBundlePath,
    lightingArtifactDir,
    lightingBundlePath,
    lightingVisualReportPath: lightingVisual.artifacts.reportPath,
    ok,
    reportPath,
    steps,
    visualReportPath: colorVisual.artifacts.reportPath,
  });
}

async function writeReport({
  artifactDir,
  bundlePath,
  lightingArtifactDir,
  lightingBundlePath,
  lightingVisualReportPath,
  ok,
  reportPath,
  steps,
  visualReportPath,
}) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      artifactDir,
      bevyScreenshotPath: resolve(artifactDir, "bevy.png"),
      bundlePath,
      contactSheetPath: resolve(artifactDir, "contact-sheet.png"),
      diffPath: resolve(artifactDir, "diff.png"),
      lightingArtifactDir: lightingArtifactDir ?? resolve(artifactDir, "..", "lighting-tone"),
      lightingBundlePath,
      lightingToneReportPath: lightingVisualReportPath ?? resolve(lightingArtifactDir ?? artifactDir, "lighting-tone-report.json"),
      reportPath,
      visualReportPath: visualReportPath ?? resolve(artifactDir, "color-parity-report.json"),
      webScreenshotPath: resolve(artifactDir, "web.png"),
    },
    code: ok ? "TN_VERIFY_V8_COLOR_PARITY_OK" : "TN_VERIFY_V8_COLOR_PARITY_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV8ColorParity();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V8 color parity gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V8 color parity gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
