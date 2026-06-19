#!/usr/bin/env node
/**
 * Git bisect helper: build v3 bundle, capture Bevy screenshot, compare to reference.
 * Exit 0 = good, 1 = bad, 125 = skip (build/capture failed).
 */
import { createRequire } from "node:module";
import { execFile, spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const require = createRequire(import.meta.url);
const { PNG } = require(resolve(fileURLToPath(new URL("../packages/cli/node_modules/pngjs", import.meta.url))));

const execFileAsync = promisify(execFile);
const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const artifactRoot = resolve(root, "examples/v3-environment/artifacts/bisect-overexposure");
const referencePath = resolve(artifactRoot, "reference-good.png");
const referenceMetricsPath = resolve(artifactRoot, "reference-metrics.json");
const bundlePath = resolve(root, "examples/v3-environment/dist/forest.bundle");
const bookmarkId = "bookmark.entry";
const captureFrames = "180";

async function ensureCliBuildOrder() {
  const packageJsonPath = resolve(root, "packages/cli/package.json");
  const raw = await readFile(packageJsonPath, "utf8");
  if (raw.includes('"build": "node scripts/copy-templates.mjs && tsc -p tsconfig.json"')) {
    return;
  }
  const fixed = raw.replace(
    '"build": "tsc -p tsconfig.json && node scripts/copy-templates.mjs"',
    '"build": "node scripts/copy-templates.mjs && tsc -p tsconfig.json"',
  );
  if (fixed !== raw) {
    await writeFile(packageJsonPath, fixed);
  }
}

async function buildBundle() {
  await execFileAsync("pnpm", ["tn", "--", "build", "--project", "examples/v3-environment"], {
    cwd: root,
    env: { ...process.env, FORCE_COLOR: "0" },
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function captureBevy(outputPath) {
  await mkdir(dirname(outputPath), { recursive: true });
  await new Promise((resolvePromise, reject) => {
    const child = spawn(
      "cargo",
      [
        "run",
        "--quiet",
        "--manifest-path",
        resolve(root, "runtime-bevy/Cargo.toml"),
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_capture",
        "--",
        bundlePath,
        bookmarkId,
        outputPath,
        captureFrames,
      ],
      {
        cwd: root,
        env: { ...process.env, THREENATIVE_REPO_ROOT: root },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise(undefined);
        return;
      }
      reject(new Error(`threenative_capture failed (${code}): ${stderr}`));
    });
  });
}

function analyzeFrame(frame) {
  const totalPixels = frame.width * frame.height;
  let sum = 0;
  let clipped = 0;
  let bright = 0;
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    const alpha = frame.data[index + 3] ?? 0;
    if (alpha === 0) {
      continue;
    }
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    sum += luminance;
    if (red > 245 && green > 245 && blue > 245) {
      clipped += 1;
    }
    if (luminance > 220) {
      bright += 1;
    }
  }
  return {
    brightRatio: bright / totalPixels,
    clippedRatio: clipped / totalPixels,
    meanLuminance: sum / totalPixels,
  };
}

async function readPng(path) {
  const png = PNG.sync.read(await readFile(path));
  return { data: png.data, height: png.height, width: png.width };
}

function isOverexposed(current, reference) {
  const clippedJump = current.clippedRatio - reference.clippedRatio;
  const brightJump = current.brightRatio - reference.brightRatio;
  const luminanceJump = current.meanLuminance - reference.meanLuminance;
  return clippedJump > 0.08 || brightJump > 0.18 || luminanceJump > 35;
}

async function applyCapturePrerequisites() {
  await ensureCliBuildOrder();
  const patchPath = resolve(root, "scripts/patches/v3-capture-prerequisites.patch");
  try {
    await execFileAsync("git", ["apply", "--check", patchPath], { cwd: root });
    await execFileAsync("git", ["apply", patchPath], { cwd: root });
  } catch {
    // Older commits may only need the CLI build-order fix.
  }
}

async function main() {
  const mode = process.argv[2] ?? "test";
  await mkdir(artifactRoot, { recursive: true });
  await applyCapturePrerequisites();

  if (mode === "reference") {
    await buildBundle();
    await captureBevy(referencePath);
    const metrics = analyzeFrame(await readPng(referencePath));
    await writeFile(referenceMetricsPath, `${JSON.stringify(metrics, null, 2)}\n`);
    console.log(`reference saved: ${referencePath}`);
    console.log(JSON.stringify(metrics, null, 2));
    return;
  }

  const reference = JSON.parse(await readFile(referenceMetricsPath, "utf8"));
  const commit = (await execFileAsync("git", ["rev-parse", "--short", "HEAD"], { cwd: root })).stdout.trim();
  const outputPath = resolve(artifactRoot, `capture-${commit}.png`);
  const logPath = resolve(artifactRoot, `metrics-${commit}.json`);

  try {
    await buildBundle();
    await captureBevy(outputPath);
  } catch (error) {
    console.error(`skip ${commit}: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(125);
  }

  const metrics = analyzeFrame(await readPng(outputPath));
  const bad = isOverexposed(metrics, reference);
  await writeFile(logPath, `${JSON.stringify({ bad, commit, metrics, reference }, null, 2)}\n`);
  console.log(`${commit} ${bad ? "BAD" : "GOOD"}`, JSON.stringify(metrics));
  process.exit(bad ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(125);
});
