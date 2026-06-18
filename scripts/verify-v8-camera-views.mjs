import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveArtifactTargets } from "./artifact-paths.mjs";
import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyV8CameraViews(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({
    gate: "camera-views",
    owner: { kind: "example", exampleName: "v8-camera-views" },
    root,
  });
  const artifactDir = options.artifactDir ?? targets.absoluteDir;
  const reportPath = options.reportPath ?? resolve(artifactDir, "verification-report.json");
  const fixtureBundlePath = resolve(root, "packages/ir/fixtures/conformance/camera-multi-view/game.bundle");
  const projectPath = resolve(root, "examples/v8-camera-views");
  const exampleBundlePath = resolve(projectPath, "dist/v8-camera-views.bundle");
  const steps = [];

  async function step(name, command, args, commandOptions = {}) {
    const result = await run({ args, command, cwd: commandOptions.cwd ?? root, name, timeoutMs: commandOptions.timeoutMs });
    steps.push({ ...summarize(result), name });
    return result.exitCode === 0;
  }

  if (!(await step("build cli", "pnpm", ["--filter", "@threenative/cli", "build"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactMetadata: targets.metadata, artifactDir, bundlePath: exampleBundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("build v8 camera views example", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "build", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactMetadata: targets.metadata, artifactDir, bundlePath: exampleBundlePath, ok: false, reportPath, steps });
  }
  if (!(await step("validate v8 camera views example", process.execPath, [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", projectPath, "--json"], { timeoutMs: 120000 }))) {
    return writeReport({ artifactMetadata: targets.metadata, artifactDir, bundlePath: exampleBundlePath, ok: false, reportPath, steps });
  }

  const verifier = options.visualVerifier
    ?? (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/cameraViews.js")).href)).verifyCameraViewsVisual;
  const visual = await verifier({ artifactDir, bundlePath: exampleBundlePath });
  steps.push({
    durationMs: 0,
    exitCode: visual.status === "pass" ? 0 : 1,
    name: "verify camera views visual parity",
    stderr: visual.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
    stdout: visual.artifacts.reportPath,
  });

  return writeReport({
    artifactDir,
    artifactMetadata: targets.metadata,
    bundlePath: exampleBundlePath,
    conformanceBundlePath: fixtureBundlePath,
    ok: visual.status === "pass",
    reportPath,
    steps,
    visualReportPath: visual.artifacts.reportPath,
  });
}

async function writeReport({ artifactDir, artifactMetadata, bundlePath, conformanceBundlePath, ok, reportPath, steps, visualReportPath }) {
  await mkdir(artifactDir, { recursive: true });
  const report = {
    artifacts: {
      ...artifactMetadata,
      artifactDir,
      bevyScreenshotPath: resolve(artifactDir, "bevy.png"),
      bundlePath,
      conformanceBundlePath,
      contactSheetPath: resolve(artifactDir, "contact-sheet.png"),
      reportPath,
      visualReportPath: visualReportPath ?? resolve(artifactDir, "camera-views-report.json"),
      webScreenshotPath: resolve(artifactDir, "web.png"),
    },
    code: ok ? "TN_VERIFY_V8_CAMERA_VIEWS_OK" : "TN_VERIFY_V8_CAMERA_VIEWS_FAILED",
    status: ok ? "pass" : "fail",
    steps,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return { ...report, ok, reportPath };
}

async function main() {
  const json = process.argv.includes("--json");
  const result = await verifyV8CameraViews();
  if (json) {
    process.stdout.write(`${JSON.stringify({ code: result.code, reportPath: result.reportPath, status: result.status, steps: result.steps }, null, 2)}\n`);
  } else if (result.ok) {
    process.stdout.write(`V8 camera views gate passed. Report: ${result.reportPath}\n`);
  } else {
    const failed = result.steps.find((step) => step.exitCode !== 0);
    process.stderr.write(`V8 camera views gate failed at '${failed?.name ?? "unknown"}'. Report: ${result.reportPath}\n`);
  }
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
