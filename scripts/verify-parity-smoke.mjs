import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import sharp from "sharp";

import { resolveArtifactTargets } from "./artifact-paths.mjs";
import { runCommand } from "./verify-conformance.mjs";
import { summarize } from "./verify-v1.mjs";

const repoRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));

export async function verifyParitySmokeGate(options = {}) {
  const root = options.repoRoot ?? repoRoot;
  const skipSetup = options.skipSetup ?? false;
  const skipNamesCheck = options.skipNamesCheck ?? false;
  const parallelSetup = options.parallelSetup ?? false;
  const run = options.run ?? runCommand;
  const targets = resolveArtifactTargets({
    gate: "parity-smoke",
    owner: { kind: "aggregate", name: "parity-smoke" },
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

  if (!skipNamesCheck) {
    if (!(await step("check names", "pnpm", ["check:names"], { timeoutMs: 120000 }))) {
      return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
    }
  }

  if (!skipSetup) {
    if (parallelSetup) {
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
    } else {
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
    }
  } else {
    const freshness = await checkBevyCaptureFreshness(root);
    steps.push({
      durationMs: 0,
      exitCode: freshness.ok ? 0 : 1,
      name: "check bevy capture freshness",
      stderr: freshness.ok ? "" : freshness.message,
      stdout: freshness.ok ? freshness.message : "",
    });
    if (!freshness.ok) {
      return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
    }
  }

  const { PARITY_SMOKE_CHECKPOINT, verifyBaselineVisualCheckpoint } =
    options.visualVerifierModule ??
    (await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/baselineVisualParity.js")).href));

  const project = PARITY_SMOKE_CHECKPOINT.projectRelativePath;
  const projectLabel = project.split("/").at(-1) ?? project;
  if (
    project === "examples/stylized-nature-component" &&
    !(await step(
      "prepare stylized-nature native assets",
      "pnpm",
      ["assets:bevy-native"],
      { cwd: resolve(root, project), timeoutMs: 120000 },
    ))
  ) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }
  if (
    !(await step(
      `build ${projectLabel}`,
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "build", "--project", project, "--json"],
      { timeoutMs: 300000 },
    ))
  ) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }
  if (
    !(await step(
      `validate ${projectLabel}`,
      process.execPath,
      [resolve(root, "packages/cli/dist/index.js"), "validate", "--project", project, "--json"],
      { timeoutMs: 120000 },
    ))
  ) {
    return writeGateReport({ artifactDir, ok: false, reportPath, steps, visualReportPath: undefined });
  }

  const visual = await verifyBaselineVisualCheckpoint({
    artifactDir: resolve(artifactDir, PARITY_SMOKE_CHECKPOINT.id),
    bundlePath: resolve(root, PARITY_SMOKE_CHECKPOINT.bundleRelativePath),
    checkpoint: PARITY_SMOKE_CHECKPOINT,
    repoRoot: root,
    screenshotCapturer: options.screenshotCapturer,
  });
  const regionMetrics = await compareVisualRegions(visual.artifacts);
  if (regionMetrics !== undefined) {
    visual.regionMetrics = regionMetrics;
  }

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

async function checkBevyCaptureFreshness(root) {
  const binaryPath = resolve(root, "runtime-bevy/target/debug/threenative_capture");
  let binaryMtimeMs = 0;
  try {
    binaryMtimeMs = (await stat(binaryPath)).mtimeMs;
  } catch {
    return {
      ok: false,
      message: `Bevy capture binary is missing at '${binaryPath}'. Run without --no-setup to rebuild it.`,
    };
  }

  const newestSource = await newestMtime([
    resolve(root, "runtime-bevy/Cargo.toml"),
    resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"),
    resolve(root, "runtime-bevy/crates/threenative_runtime/src"),
  ]);
  if (newestSource > binaryMtimeMs) {
    return {
      ok: false,
      message: "Bevy capture binary is older than runtime source. Run without --no-setup to rebuild it.",
    };
  }
  return { ok: true, message: "Bevy capture binary is fresh." };
}

async function newestMtime(paths) {
  let newest = 0;
  for (const path of paths) {
    newest = Math.max(newest, await pathMtime(path));
  }
  return newest;
}

async function pathMtime(path) {
  let entry;
  try {
    entry = await stat(path);
  } catch {
    return 0;
  }
  if (!entry.isDirectory()) {
    return entry.mtimeMs;
  }
  const children = await readdir(path, { withFileTypes: true });
  let newest = entry.mtimeMs;
  for (const child of children) {
    newest = Math.max(newest, await pathMtime(join(path, child.name)));
  }
  return newest;
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

const PARITY_REGION_BOXES = [
  { id: "cleanSkyCenter", label: "Clean sky center", x: 0.25, y: 0.0, width: 0.5, height: 0.22 },
  { id: "upperSkyLeft", label: "Upper sky left", x: 0.0, y: 0.0, width: 0.25, height: 0.25 },
  { id: "upperSkyRight", label: "Upper sky right", x: 0.75, y: 0.0, width: 0.25, height: 0.25 },
  { id: "horizon", label: "Sky horizon", x: 0.0, y: 0.22, width: 1.0, height: 0.18 },
  { id: "midGrass", label: "Middle grass", x: 0.2, y: 0.42, width: 0.6, height: 0.24 },
  { id: "foregroundGrass", label: "Foreground grass", x: 0.0, y: 0.66, width: 1.0, height: 0.34 },
  { id: "path", label: "Path", x: 0.36, y: 0.38, width: 0.28, height: 0.62 },
];

async function compareVisualRegions(artifacts) {
  const webPath = artifacts?.webScreenshotPath;
  const bevyPath = artifacts?.bevyScreenshotPath;
  if (webPath === undefined || bevyPath === undefined) {
    return undefined;
  }
  const [web, bevy] = await Promise.all([loadRgbImage(webPath), loadRgbImage(bevyPath)]);
  if (web.width !== bevy.width || web.height !== bevy.height) {
    return undefined;
  }
  return PARITY_REGION_BOXES.map((region) => compareRegion(web, bevy, region));
}

async function loadRgbImage(path) {
  const image = sharp(path).removeAlpha();
  const metadata = await image.metadata();
  return {
    data: await image.raw().toBuffer(),
    height: metadata.height,
    width: metadata.width,
  };
}

function compareRegion(web, bevy, region) {
  const x0 = Math.max(0, Math.floor(region.x * web.width));
  const y0 = Math.max(0, Math.floor(region.y * web.height));
  const x1 = Math.min(web.width, Math.ceil((region.x + region.width) * web.width));
  const y1 = Math.min(web.height, Math.ceil((region.y + region.height) * web.height));
  const channelDeltas = [];
  let averageBrightnessDelta = 0;
  let changedPixels = 0;
  let red = 0;
  let green = 0;
  let blue = 0;
  let signedRed = 0;
  let signedGreen = 0;
  let signedBlue = 0;
  let pixels = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = (y * web.width + x) * 3;
      const dr = (bevy.data[offset] - web.data[offset]) / 255;
      const dg = (bevy.data[offset + 1] - web.data[offset + 1]) / 255;
      const db = (bevy.data[offset + 2] - web.data[offset + 2]) / 255;
      const absRed = Math.abs(dr);
      const absGreen = Math.abs(dg);
      const absBlue = Math.abs(db);
      const brightnessDelta = (absRed + absGreen + absBlue) / 3;
      averageBrightnessDelta += brightnessDelta;
      red += absRed;
      green += absGreen;
      blue += absBlue;
      signedRed += dr;
      signedGreen += dg;
      signedBlue += db;
      channelDeltas.push(absRed, absGreen, absBlue);
      if (brightnessDelta > 1 / 255) {
        changedPixels += 1;
      }
      pixels += 1;
    }
  }
  channelDeltas.sort((left, right) => left - right);
  const p95Index = Math.min(channelDeltas.length - 1, Math.floor(channelDeltas.length * 0.95));
  return {
    averageBrightnessDelta: averageBrightnessDelta / pixels,
    averageColorDelta: {
      blue: blue / pixels,
      green: green / pixels,
      red: red / pixels,
    },
    bounds: { height: y1 - y0, width: x1 - x0, x: x0, y: y0 },
    changedPixelRatio: changedPixels / pixels,
    id: region.id,
    label: region.label,
    p95ChannelDelta: channelDeltas[p95Index],
    signedAverageColorDelta: {
      blue: signedBlue / pixels,
      green: signedGreen / pixels,
      red: signedRed / pixels,
    },
  };
}

async function main() {
  const json = process.argv.includes("--json");
  const skipSetup = process.argv.includes("--no-setup");
  const result = await verifyParitySmokeGate({ skipSetup });
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
