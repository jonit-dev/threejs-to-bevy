import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { COLOR_PARITY_SWATCHES, COLOR_PARITY_THRESHOLDS } from "./colorParitySwatches.js";
import { cargoCaptureEnv, resolveCargoCommand } from "./captureCargo.js";
import { readPngFrame } from "./compareImages.js";
import {
  absoluteRegion,
  analyzeNonblank,
  averageColor,
  colorDistance,
  compareFramesDetailed,
  cropFrame,
  parseHexColor,
  type IDetailedFrameComparison,
  type IAverageColor,
  type IPixelFrame,
} from "./imageAnalysis.js";

const execFileAsync = promisify(execFile);

export interface IColorParitySwatchMetric {
  bevyAverageColor: IAverageColor;
  comparison: IDetailedFrameComparison;
  expectedColor: IAverageColor;
  id: string;
  ok: boolean;
  thresholds: typeof COLOR_PARITY_THRESHOLDS;
  webAverageColor: IAverageColor;
  webDistanceToExpected: number;
}

export interface IColorParityVisualReport {
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
    maxChannelDelta: number;
    p95ChannelDelta: number;
  };
  renderers: {
    bevy: "native-capture";
    threejs: "web-preview";
  };
  status: "fail" | "pass";
  swatches: IColorParitySwatchMetric[];
  visualComparison: IDetailedFrameComparison;
}

export type ColorParityScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}) => Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }>;

export async function verifyColorParityVisual(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: ColorParityScreenshotCapturer;
}): Promise<IColorParityVisualReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = activeCameraId(bundle) ?? "camera.color";
  const capture = await (options.screenshotCapturer ?? captureColorParityScreenshots)({
    artifactDir: options.artifactDir,
    bundlePath: options.bundlePath,
    cameraId,
  });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: IColorParityVisualReport["diagnostics"] = [];
  const webNonblank = analyzeNonblank(web);
  const bevyNonblank = analyzeNonblank(bevy);
  if (!webNonblank.ok) {
    diagnostics.push({ code: "TN_V8_COLOR_PARITY_WEB_BLANK", message: `Web screenshot is blank or near-blank: ${capture.webScreenshotPath}`, severity: "error" });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({ code: "TN_V8_COLOR_PARITY_BEVY_BLANK", message: `Bevy screenshot is blank or near-blank: ${capture.bevyScreenshotPath}`, severity: "error" });
  }

  const visualComparison = compareFramesDetailed(web, bevy);
  const swatches = analyzeColorParitySwatches(web, bevy);
  for (const swatch of swatches) {
    if (!swatch.ok) {
      diagnostics.push({
        code: "TN_V8_COLOR_PARITY_SWATCH_DRIFT",
        message: `Swatch '${swatch.id}' exceeds thresholds: changed ${swatch.comparison.changedPixelRatio.toFixed(4)}, brightness ${swatch.comparison.averageBrightnessDelta.toFixed(4)}, max channel ${swatch.comparison.maxChannelDelta.toFixed(4)}, p95 ${swatch.comparison.p95ChannelDelta.toFixed(4)}.`,
        severity: "error",
      });
    }
  }
  if (visualComparison.changedPixelRatio > 0.08) {
    diagnostics.push({
      code: "TN_V8_COLOR_PARITY_FRAME_DRIFT",
      message: `Full-frame changed pixel ratio ${visualComparison.changedPixelRatio.toFixed(4)} is above 0.08.`,
      severity: "error",
    });
  }

  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  const diffPath = resolve(options.artifactDir, "diff.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  await writeDiff(diffPath, web, bevy);
  const reportPath = resolve(options.artifactDir, "color-parity-report.json");
  const report: IColorParityVisualReport = {
    artifacts: {
      bevyScreenshotPath: capture.bevyScreenshotPath,
      bundleHash: await hashFile(resolve(options.bundlePath, "manifest.json")),
      contactSheetPath,
      diffPath,
      reportPath,
      webScreenshotPath: capture.webScreenshotPath,
    },
    diagnostics,
    metrics: {
      averageColorDelta: Math.max(
        visualComparison.averageColorDelta.red,
        visualComparison.averageColorDelta.green,
        visualComparison.averageColorDelta.blue,
      ),
      changedPixelRatio: visualComparison.changedPixelRatio,
      maxChannelDelta: visualComparison.maxChannelDelta,
      p95ChannelDelta: visualComparison.p95ChannelDelta,
    },
    renderers: {
      bevy: "native-capture",
      threejs: "web-preview",
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
    swatches,
    visualComparison,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function analyzeColorParitySwatches(web: IPixelFrame, bevy: IPixelFrame): IColorParitySwatchMetric[] {
  return COLOR_PARITY_SWATCHES.map((swatch) => {
    const region = absoluteRegion(web, swatch.region);
    const webRegion = cropFrame(web, region);
    const bevyRegion = cropFrame(bevy, region);
    const comparison = compareFramesDetailed(webRegion, bevyRegion);
    const expectedColor = parseHexColor(swatch.hex);
    const webAverageColor = averageColor(webRegion);
    const bevyAverageColor = averageColor(bevyRegion);
    const maxColorDelta = Math.max(comparison.averageColorDelta.red, comparison.averageColorDelta.green, comparison.averageColorDelta.blue);
    const webDistanceToExpected = colorDistance(webAverageColor, expectedColor);
    const ok =
      comparison.changedPixelRatio <= COLOR_PARITY_THRESHOLDS.changedPixelRatio
      && comparison.averageBrightnessDelta <= COLOR_PARITY_THRESHOLDS.averageBrightnessDelta
      && maxColorDelta <= COLOR_PARITY_THRESHOLDS.averageColorDelta
      && comparison.maxChannelDelta <= COLOR_PARITY_THRESHOLDS.maxChannelDelta
      && comparison.p95ChannelDelta <= COLOR_PARITY_THRESHOLDS.p95ChannelDelta
      && webDistanceToExpected <= COLOR_PARITY_THRESHOLDS.expectedColorDistance;
    return {
      bevyAverageColor,
      comparison,
      expectedColor,
      id: swatch.id,
      ok,
      thresholds: COLOR_PARITY_THRESHOLDS,
      webAverageColor,
      webDistanceToExpected,
    };
  });
}

async function captureColorParityScreenshots(options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  const webScreenshotPath = resolve(options.artifactDir, "web.png");
  const bevyScreenshotPath = resolve(options.artifactDir, "bevy.png");
  await captureThreeJsScreenshot(options.bundlePath, webScreenshotPath, options.cameraId);
  await captureBevyScreenshot(options.bundlePath, bevyScreenshotPath, options.cameraId);
  return { bevyScreenshotPath, webScreenshotPath };
}

async function captureThreeJsScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.color"): Promise<void> {
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

async function captureBevyScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.color"): Promise<void> {
  const absoluteBundlePath = resolve(bundlePath);
  await execFileAsync(
    resolveCargoCommand(),
    ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", absoluteBundlePath, cameraId, outputPath],
    {
      cwd: resolve(process.cwd(), "runtime-bevy"),
      env: cargoCaptureEnv(),
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

async function writeContactSheet(path: string, webPath: string, bevyPath: string): Promise<void> {
  const web = PNG.sync.read(await readFile(webPath));
  const bevy = PNG.sync.read(await readFile(bevyPath));
  const sheet = new PNG({ height: Math.max(web.height, bevy.height), width: web.width + bevy.width });
  fill(sheet, 0, 0, 0, 255);
  copyInto(web, sheet, 0, 0);
  copyInto(bevy, sheet, web.width, 0);
  await writeFile(path, PNG.sync.write(sheet));
}

async function writeDiff(path: string, web: IPixelFrame, bevy: IPixelFrame): Promise<void> {
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
