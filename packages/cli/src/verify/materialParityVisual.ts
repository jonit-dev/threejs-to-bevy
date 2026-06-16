import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank } from "./imageAnalysis.js";

const execFileAsync = promisify(execFile);

export interface IMaterialParityVisualReport {
  artifacts: {
    bevyScreenshotPath: string;
    bundleHash: string;
    contactSheetPath: string;
    diffPath: string;
    reportPath: string;
    webScreenshotPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  metrics: {
    averageColorDelta: number;
    changedPixelRatio: number;
    silhouetteOverlap: number;
  };
  promotedFeatures: string[];
  renderers: {
    bevy: "native-capture";
    threejs: "web-preview";
  };
  status: "fail" | "pass";
}

export type MaterialParityScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}) => Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }>;

export async function verifyMaterialParityVisual(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: MaterialParityScreenshotCapturer;
}): Promise<IMaterialParityVisualReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = activeCameraId(bundle) ?? "camera.material";
  const capture = await (options.screenshotCapturer ?? captureMaterialParityScreenshots)({
    artifactDir: options.artifactDir,
    bundlePath: options.bundlePath,
    cameraId,
  });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: IMaterialParityVisualReport["diagnostics"] = [];
  const webNonblank = analyzeNonblank(web);
  const bevyNonblank = analyzeNonblank(bevy);
  if (!webNonblank.ok) {
    diagnostics.push({ code: "TN_V8_MATERIAL_PARITY_WEB_BLANK", message: `Web screenshot is blank or near-blank: ${capture.webScreenshotPath}`, severity: "error" });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({ code: "TN_V8_MATERIAL_PARITY_BEVY_BLANK", message: `Bevy screenshot is blank or near-blank: ${capture.bevyScreenshotPath}`, severity: "error" });
  }
  const metrics = compareMaterialFrames(web, bevy);
  if (metrics.silhouetteOverlap < 0.99) {
    diagnostics.push({ code: "TN_V8_MATERIAL_PARITY_SILHOUETTE_DRIFT", message: `Silhouette overlap ${metrics.silhouetteOverlap.toFixed(4)} is below 0.99.`, severity: "error" });
  }
  if (metrics.changedPixelRatio > 0.03) {
    diagnostics.push({ code: "TN_V8_MATERIAL_PARITY_PIXEL_DRIFT", message: `Changed pixel ratio ${metrics.changedPixelRatio.toFixed(4)} is above 0.03.`, severity: "error" });
  }
  if (metrics.averageColorDelta > 0.02) {
    diagnostics.push({ code: "TN_V8_MATERIAL_PARITY_COLOR_DRIFT", message: `Material color delta ${metrics.averageColorDelta.toFixed(4)} is above 0.02.`, severity: "error" });
  }
  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  const diffPath = resolve(options.artifactDir, "diff.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  await writeDiff(diffPath, web, bevy);
  const reportPath = resolve(options.artifactDir, "material-parity-report.json");
  const promotedFeatures = [
    "transparency-policy",
    "specular-texture-slot",
    "native-texture-repeat-offset",
    "extended-material-preset",
  ];
  const report: IMaterialParityVisualReport = {
    artifacts: {
      bevyScreenshotPath: capture.bevyScreenshotPath,
      bundleHash: await hashFile(resolve(options.bundlePath, "manifest.json")),
      contactSheetPath,
      diffPath,
      reportPath,
      webScreenshotPath: capture.webScreenshotPath,
    },
    diagnostics,
    metrics,
    promotedFeatures,
    renderers: {
      bevy: "native-capture",
      threejs: "web-preview",
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function captureMaterialParityScreenshots(options: { artifactDir: string; bundlePath: string; cameraId?: string }): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  const webScreenshotPath = resolve(options.artifactDir, "web.png");
  const bevyScreenshotPath = resolve(options.artifactDir, "bevy.png");
  await captureThreeJsScreenshot(options.bundlePath, webScreenshotPath, options.cameraId);
  await captureBevyScreenshot(options.bundlePath, bevyScreenshotPath, options.cameraId);
  return { bevyScreenshotPath, webScreenshotPath };
}

async function captureThreeJsScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.material"): Promise<void> {
  const server = await startWebPreview({ bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(cameraId)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10_000 });
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
    await server.close();
  }
}

async function captureBevyScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.material"): Promise<void> {
  await execFileAsync(
    "cargo",
    ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, cameraId, outputPath, "15"],
    {
      cwd: resolve(process.cwd(), "runtime-bevy"),
      timeout: 300_000,
    },
  );
}

function activeCameraId(bundle: Awaited<ReturnType<typeof loadBundle>>): string | undefined {
  const resource = bundle.world.resources?.ActiveCamera as { entity?: string } | undefined;
  if (resource?.entity !== undefined) {
    return resource.entity;
  }
  return bundle.world.entities.find((entity) => entity.components.Camera !== undefined)?.id;
}

function compareMaterialFrames(web: { data: ArrayLike<number>; height: number; width: number }, bevy: { data: ArrayLike<number>; height: number; width: number }): IMaterialParityVisualReport["metrics"] {
  let changed = 0;
  let colorDelta = 0;
  let colorSamples = 0;
  let union = 0;
  let intersection = 0;
  const pixels = web.width * web.height;
  for (let index = 0; index < Math.min(web.data.length, bevy.data.length); index += 4) {
    const webVisible = (web.data[index + 3] ?? 0) > 0 && ((web.data[index] ?? 0) > 24 || (web.data[index + 1] ?? 0) > 24 || (web.data[index + 2] ?? 0) > 24);
    const bevyVisible = (bevy.data[index + 3] ?? 0) > 0 && ((bevy.data[index] ?? 0) > 24 || (bevy.data[index + 1] ?? 0) > 24 || (bevy.data[index + 2] ?? 0) > 24);
    if (webVisible || bevyVisible) {
      union += 1;
    }
    if (webVisible && bevyVisible) {
      intersection += 1;
    }
    const delta = Math.abs((web.data[index] ?? 0) - (bevy.data[index] ?? 0)) + Math.abs((web.data[index + 1] ?? 0) - (bevy.data[index + 1] ?? 0)) + Math.abs((web.data[index + 2] ?? 0) - (bevy.data[index + 2] ?? 0));
    if (delta > 16) {
      changed += 1;
    }
    if (webVisible && bevyVisible) {
      colorDelta += delta / 3 / 255;
      colorSamples += 1;
    }
  }
  return {
    averageColorDelta: colorSamples === 0 ? 1 : colorDelta / colorSamples,
    changedPixelRatio: changed / pixels,
    silhouetteOverlap: union === 0 ? 0 : intersection / union,
  };
}

async function writeContactSheet(path: string, webPath: string, bevyPath: string): Promise<void> {
  const web = PNG.sync.read(await readFile(webPath));
  const bevy = PNG.sync.read(await readFile(bevyPath));
  const sheet = new PNG({ height: Math.max(web.height, bevy.height), width: web.width + bevy.width });
  fill(sheet, 0, 0, 0, 255);
  copyInto(web, sheet, 0, 0);
  copyInto(bevy, sheet, web.width, 0);
  await writeFile(path, PNG.sync.write(sheet));
}

async function writeDiff(path: string, web: { data: ArrayLike<number>; height: number; width: number }, bevy: { data: ArrayLike<number>; height: number; width: number }): Promise<void> {
  const diff = new PNG({ height: web.height, width: web.width });
  for (let index = 0; index < diff.data.length; index += 4) {
    diff.data[index] = Math.abs((web.data[index] ?? 0) - (bevy.data[index] ?? 0));
    diff.data[index + 1] = Math.abs((web.data[index + 1] ?? 0) - (bevy.data[index + 1] ?? 0));
    diff.data[index + 2] = Math.abs((web.data[index + 2] ?? 0) - (bevy.data[index + 2] ?? 0));
    diff.data[index + 3] = 255;
  }
  await writeFile(path, PNG.sync.write(diff));
}

function fill(png: PNG, red: number, green: number, blue: number, alpha: number): void {
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = red;
    png.data[index + 1] = green;
    png.data[index + 2] = blue;
    png.data[index + 3] = alpha;
  }
}

function copyInto(source: PNG, target: PNG, dx: number, dy: number): void {
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

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
