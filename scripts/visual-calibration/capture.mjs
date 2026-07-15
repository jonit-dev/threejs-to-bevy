import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { PNG } from "../../packages/cli/node_modules/pngjs/lib/png.js";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const repoRootFromModule = resolve(moduleDir, "../..");
const requireFromCli = createRequire(resolve(repoRootFromModule, "packages/cli/package.json"));

const execFileAsync = promisify(execFile);

/**
 * @param {string} root
 */
async function loadCliModules(root) {
  const base = resolve(root, "packages/cli/dist/verify");
  const [compareImages, captureCargo] = await Promise.all([
    import(pathToFileURL(resolve(base, "compareImages.js")).href),
    import(pathToFileURL(resolve(base, "captureCargo.js")).href),
  ]);
  return {
    cargoCaptureEnv: captureCargo.cargoCaptureEnv,
    readPngFrame: compareImages.readPngFrame,
    resolveCargoCommand: captureCargo.resolveCargoCommand,
  };
}

/**
 * @param {object} options
 * @param {string} options.bundlePath
 * @param {string} options.outputPath
 * @param {string} [options.cameraId]
 * @param {{ width: number; height: number }} [options.viewport]
 * @param {{ nodeId: string; state: "focus" | "hover" }} [options.uiState]
 */
export async function captureWebScreenshot(options) {
  const root = options.repoRoot ?? repoRootFromModule;
  const { chromium } = requireFromCli("playwright");
  const { startWebPreview } = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href);
  const viewport = options.viewport ?? { height: 720, width: 1280 };
  const server = await startWebPreview({ bundlePath: options.bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport });
    const bookmark = encodeURIComponent(options.cameraId ?? "camera.calibration");
    await page.goto(`${server.url}?bundle=/bundle&bookmark=${bookmark}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 15_000 });
    if (options.uiState !== undefined) {
      const selector = `[data-threenative-ui-id=${JSON.stringify(options.uiState.nodeId)}]`;
      if (options.uiState.state === "hover") await page.hover(selector);
      else await page.focus(selector);
      await page.waitForTimeout(50);
    }
    await page.screenshot({ path: options.outputPath });
  } finally {
    await browser.close();
    await server.close();
  }
}

/**
 * @param {object} options
 * @param {string} options.bundlePath
 * @param {string} options.outputPath
 * @param {string} options.repoRoot
 * @param {string} [options.cameraId]
 * @param {{ width: number; height: number }} [options.viewport]
 * @param {{ nodeId: string; state: "focus" | "hover" | "selected" }} [options.uiState]
 */
export async function captureBevyScreenshot(options) {
  const { cargoCaptureEnv, resolveCargoCommand } = await loadCliModules(options.repoRoot);
  const viewportArgs = options.viewport === undefined ? [] : ["--viewport", String(options.viewport.width), String(options.viewport.height)];
  const uiStateArgs = options.uiState === undefined ? [] : ["--ui-state", options.uiState.nodeId, options.uiState.state];
  await execFileAsync(
    resolveCargoCommand(),
    [
      "run",
      "--quiet",
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_capture",
      "--",
      resolve(options.bundlePath),
      options.cameraId ?? "camera.calibration",
      resolve(options.outputPath),
      ...viewportArgs,
      ...uiStateArgs,
    ],
    {
      cwd: resolve(options.repoRoot, "runtime-bevy"),
      env: cargoCaptureEnv(),
      timeout: 300_000,
    },
  );
}

/**
 * @param {object} options
 * @param {string} options.artifactDir
 * @param {string} options.bundlePath
 * @param {string} options.repoRoot
 * @param {string} [options.cameraId]
 * @param {{ width: number; height: number }} [options.capture]
 */
export async function captureCalibrationScreenshots(options) {
  await mkdir(options.artifactDir, { recursive: true });
  const webScreenshotPath = resolve(options.artifactDir, "web.png");
  const bevyScreenshotPath = resolve(options.artifactDir, "bevy.png");
  await captureWebScreenshot({
    bundlePath: options.bundlePath,
    cameraId: options.cameraId,
    outputPath: webScreenshotPath,
    repoRoot: options.repoRoot,
    viewport: options.capture,
  });
  await captureBevyScreenshot({
    bundlePath: options.bundlePath,
    cameraId: options.cameraId,
    outputPath: bevyScreenshotPath,
    repoRoot: options.repoRoot,
    viewport: options.capture,
  });
  return { bevyScreenshotPath, webScreenshotPath };
}

/**
 * @param {import("pngjs").PNG} source
 * @param {import("pngjs").PNG} target
 * @param {number} dx
 * @param {number} dy
 */
function copyInto(source, target, dx, dy) {
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const from = (y * source.width + x) * 4;
      const to = ((y + dy) * target.width + x + dx) * 4;
      target.data[to] = source.data[from] ?? 0;
      target.data[to + 1] = source.data[from + 1] ?? 0;
      target.data[to + 2] = source.data[from + 2] ?? 0;
      target.data[to + 3] = source.data[from + 3] ?? 255;
    }
  }
}

/**
 * @param {import("pngjs").PNG} png
 */
function fillBlack(png) {
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = 0;
    png.data[index + 1] = 0;
    png.data[index + 2] = 0;
    png.data[index + 3] = 255;
  }
}

/**
 * @param {object} options
 * @param {string} options.artifactDir
 * @param {string} options.webScreenshotPath
 * @param {string} options.bevyScreenshotPath
 */
export async function writeCalibrationDiffArtifacts(options) {
  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  const diffPath = resolve(options.artifactDir, "diff.png");
  const web = PNG.sync.read(await readFile(options.webScreenshotPath));
  const bevy = PNG.sync.read(await readFile(options.bevyScreenshotPath));
  const sheet = new PNG({ height: Math.max(web.height, bevy.height), width: web.width + bevy.width });
  fillBlack(sheet);
  copyInto(web, sheet, 0, 0);
  copyInto(bevy, sheet, web.width, 0);

  const diff = new PNG({ height: web.height, width: web.width });
  for (let index = 0; index < diff.data.length; index += 4) {
    const red = Math.abs((web.data[index] ?? 0) - (bevy.data[index] ?? 0));
    const green = Math.abs((web.data[index + 1] ?? 0) - (bevy.data[index + 1] ?? 0));
    const blue = Math.abs((web.data[index + 2] ?? 0) - (bevy.data[index + 2] ?? 0));
    const amplified = Math.min(255, Math.max(red, green, blue) * 3);
    diff.data[index] = amplified;
    diff.data[index + 1] = amplified;
    diff.data[index + 2] = amplified;
    diff.data[index + 3] = 255;
  }

  await writeFile(contactSheetPath, PNG.sync.write(sheet));
  await writeFile(diffPath, PNG.sync.write(diff));
  return { contactSheetPath, diffPath };
}

/**
 * @param {object} options
 * @param {string} options.artifactDir
 * @param {string} options.bundlePath
 * @param {string} options.repoRoot
 * @param {string} [options.cameraId]
 * @param {{ width: number; height: number }} [options.capture]
 */
export async function captureCalibrationArtifacts(options) {
  const screenshots = await captureCalibrationScreenshots(options);
  const artifacts = await writeCalibrationDiffArtifacts({
    artifactDir: options.artifactDir,
    bevyScreenshotPath: screenshots.bevyScreenshotPath,
    webScreenshotPath: screenshots.webScreenshotPath,
  });
  return { ...screenshots, ...artifacts };
}

/**
 * @param {string} root
 * @param {string} path
 */
export async function readCalibrationFrame(root, path) {
  const { readPngFrame } = await loadCliModules(root);
  return readPngFrame(path);
}
