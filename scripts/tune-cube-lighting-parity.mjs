#!/usr/bin/env node
import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";
import {
  absoluteRegion,
  compareFramesDetailed,
  cropFrame,
} from "../packages/cli/dist/verify/imageAnalysis.js";

const execFileAsync = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mapWorldPath = resolve(root, "runtime-bevy/crates/threenative_runtime/src/map_world.rs");
const webPath = resolve(root, "packages/ir/fixtures/cube-scene/game.bundle");
const webScreenshot = process.env.TN_WEB_CUBE_SCREENSHOT
  ?? resolve(root, "tmp/simple-game/artifacts/verify/frame-01.png");
const bundlePath = process.env.TN_CUBE_BUNDLE
  ?? resolve(root, "tmp/simple-game/dist/game.bundle");
const captureFrame = Number(process.env.TN_CAPTURE_FRAME ?? "120");
const cubeRegion = { x: 0.35, y: 0.55, width: 0.30, height: 0.45 };

async function loadPng(path) {
  return PNG.sync.read(await readFile(path));
}

async function captureBevy(lux, outputPath) {
  await setLuxConstant(lux);
  const env = { ...process.env };
  delete env.RUSTUP_TOOLCHAIN;
  await execFileAsync(
    "cargo",
    [
      "run",
      "--quiet",
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_capture",
      "--",
      bundlePath,
      "camera.main",
      outputPath,
      String(captureFrame),
    ],
    { cwd: resolve(root, "runtime-bevy"), env, timeout: 180_000 },
  );
}

async function setLuxConstant(lux) {
  const source = await readFile(mapWorldPath, "utf8");
  const next = source.replace(
    /const THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY: f32 = [0-9.]+;/,
    `const THREE_COMPAT_DIRECTIONAL_ILLUMINANCE_PER_INTENSITY: f32 = ${lux.toFixed(2)};`,
  ).replace(
    /const THREE_COMPAT_POINT_LUMENS_PER_CANDELA: f32 =\s*\n\s*std::f32::consts::TAU \* 2\.0 \* \([0-9.]+\s*\/\s*1\.7\);/,
    `const THREE_COMPAT_POINT_LUMENS_PER_CANDELA: f32 =\n    std::f32::consts::TAU * 2.0 * (${lux.toFixed(2)} / 1.7);`,
  );
  await writeFile(mapWorldPath, next);
}

function frameFromPng(png) {
  return { data: png.data, width: png.width, height: png.height };
}

function scoreCubeRegion(web, bevy) {
  const webCrop = cropFrame(web, absoluteRegion(web, cubeRegion));
  const bevyCrop = cropFrame(bevy, absoluteRegion(bevy, cubeRegion));
  const metrics = compareFramesDetailed(webCrop, bevyCrop);
  const parity =
    Math.abs(metrics.signedAverageBrightnessDelta)
    + metrics.averageBrightnessDelta
    + metrics.p95ChannelDelta
    + metrics.maxChannelDelta * 0.35
    + metrics.changedPixelRatio * 0.15;
  return { metrics, parity };
}

async function evaluateLux(lux, outputPath) {
  await captureBevy(lux, outputPath);
  const web = frameFromPng(await loadPng(webScreenshot));
  const bevy = frameFromPng(await loadPng(outputPath));
  return scoreCubeRegion(web, bevy);
}

async function search(values) {
  const results = [];
  for (const lux of values) {
    const outputPath = `/tmp/tn-cube-parity-${lux.toFixed(2).replace(".", "_")}.png`;
    process.stderr.write(`evaluating lux=${lux.toFixed(2)}...\n`);
    const { metrics, parity } = await evaluateLux(lux, outputPath);
    results.push({ lux, metrics, parity, outputPath });
    process.stderr.write(
      `  parity=${parity.toFixed(4)} signed=${metrics.signedAverageBrightnessDelta.toFixed(4)} p95=${metrics.p95ChannelDelta.toFixed(4)} max=${metrics.maxChannelDelta.toFixed(4)} changed=${metrics.changedPixelRatio.toFixed(4)}\n`,
    );
  }
  results.sort((left, right) => left.parity - right.parity);
  return results[0];
}

async function main() {
  const coarse = [];
  for (let lux = 40; lux <= 110; lux += 5) {
    coarse.push(lux);
  }
  const bestCoarse = await search(coarse);
  const fine = [];
  for (let lux = bestCoarse.lux - 4; lux <= bestCoarse.lux + 4; lux += 0.5) {
    fine.push(lux);
  }
  const best = await search(fine);
  await setLuxConstant(best.lux);
  console.log(JSON.stringify({
    bestLux: best.lux,
    parityScore: best.parity,
    metrics: best.metrics,
    screenshotPath: best.outputPath,
    webScreenshot,
    bundlePath,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
