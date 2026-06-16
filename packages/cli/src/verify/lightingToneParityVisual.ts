import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { cargoCaptureEnv, resolveCargoCommand } from "./captureCargo.js";
import { readPngFrame } from "./compareImages.js";
import {
  absoluteRegion,
  analyzeNonblank,
  averageColor,
  compareFramesDetailed,
  cropFrame,
  type IDetailedFrameComparison,
  type IAverageColor,
  type IPixelFrame,
} from "./imageAnalysis.js";
import {
  LIGHTING_TONE_FRAME_THRESHOLDS,
  LIGHTING_TONE_SAMPLES,
  LIGHTING_TONE_THRESHOLDS,
} from "./lightingToneSamples.js";

const execFileAsync = promisify(execFile);

export interface ILightingToneSampleMetric {
  bevyAverageColor: IAverageColor;
  comparison: IDetailedFrameComparison;
  id: string;
  ok: boolean;
  thresholds: typeof LIGHTING_TONE_THRESHOLDS;
  webAverageColor: IAverageColor;
}

export interface ILightingToneParityVisualReport {
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
  samples: ILightingToneSampleMetric[];
  status: "fail" | "pass";
  visualComparison: IDetailedFrameComparison;
}

export type LightingToneScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}) => Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }>;

export async function verifyLightingToneParityVisual(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: LightingToneScreenshotCapturer;
}): Promise<ILightingToneParityVisualReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = activeCameraId(bundle) ?? "camera.lighting";
  const capture = await (options.screenshotCapturer ?? captureLightingToneScreenshots)({
    artifactDir: options.artifactDir,
    bundlePath: options.bundlePath,
    cameraId,
  });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: ILightingToneParityVisualReport["diagnostics"] = [];
  const webNonblank = analyzeNonblank(web);
  const bevyNonblank = analyzeNonblank(bevy);
  if (!webNonblank.ok) {
    diagnostics.push({ code: "TN_V8_LIGHTING_TONE_WEB_BLANK", message: `Web screenshot is blank or near-blank: ${capture.webScreenshotPath}`, severity: "error" });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({ code: "TN_V8_LIGHTING_TONE_BEVY_BLANK", message: `Bevy screenshot is blank or near-blank: ${capture.bevyScreenshotPath}`, severity: "error" });
  }

  const visualComparison = compareFramesDetailed(web, bevy);
  const samples = analyzeLightingToneSamples(web, bevy);
  for (const sample of samples) {
    if (!sample.ok) {
      diagnostics.push({
        code: "TN_V8_LIGHTING_TONE_SAMPLE_DRIFT",
        message: `Lighting sample '${sample.id}' exceeds thresholds: brightness ${sample.comparison.averageBrightnessDelta.toFixed(4)}, color ${Math.max(sample.comparison.averageColorDelta.red, sample.comparison.averageColorDelta.green, sample.comparison.averageColorDelta.blue).toFixed(4)}, p95 ${sample.comparison.p95ChannelDelta.toFixed(4)}.`,
        severity: "error",
      });
    }
  }
  if (visualComparison.changedPixelRatio > LIGHTING_TONE_FRAME_THRESHOLDS.changedPixelRatio) {
    diagnostics.push({
      code: "TN_V8_LIGHTING_TONE_FRAME_DRIFT",
      message: `Full-frame changed pixel ratio ${visualComparison.changedPixelRatio.toFixed(4)} is above ${LIGHTING_TONE_FRAME_THRESHOLDS.changedPixelRatio}.`,
      severity: "error",
    });
  }
  const frameAverageColorDelta = Math.max(
    visualComparison.averageColorDelta.red,
    visualComparison.averageColorDelta.green,
    visualComparison.averageColorDelta.blue,
  );
  if (frameAverageColorDelta > LIGHTING_TONE_FRAME_THRESHOLDS.averageColorDelta) {
    diagnostics.push({
      code: "TN_V8_LIGHTING_TONE_FRAME_COLOR",
      message: `Full-frame average color delta ${frameAverageColorDelta.toFixed(4)} is above ${LIGHTING_TONE_FRAME_THRESHOLDS.averageColorDelta}.`,
      severity: "error",
    });
  }
  if (visualComparison.averageBrightnessDelta > LIGHTING_TONE_FRAME_THRESHOLDS.averageBrightnessDelta) {
    diagnostics.push({
      code: "TN_V8_LIGHTING_TONE_FRAME_BRIGHTNESS",
      message: `Full-frame average brightness delta ${visualComparison.averageBrightnessDelta.toFixed(4)} is above ${LIGHTING_TONE_FRAME_THRESHOLDS.averageBrightnessDelta}.`,
      severity: "error",
    });
  }
  if (visualComparison.p95ChannelDelta > LIGHTING_TONE_FRAME_THRESHOLDS.p95ChannelDelta) {
    diagnostics.push({
      code: "TN_V8_LIGHTING_TONE_FRAME_P95",
      message: `Full-frame p95 channel delta ${visualComparison.p95ChannelDelta.toFixed(4)} is above ${LIGHTING_TONE_FRAME_THRESHOLDS.p95ChannelDelta}.`,
      severity: "error",
    });
  }

  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  const diffPath = resolve(options.artifactDir, "diff.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  await writeDiff(diffPath, web, bevy);
  const reportPath = resolve(options.artifactDir, "lighting-tone-report.json");
  const report: ILightingToneParityVisualReport = {
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
    samples,
    status: diagnostics.length === 0 ? "pass" : "fail",
    visualComparison,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function analyzeLightingToneSamples(web: IPixelFrame, bevy: IPixelFrame): ILightingToneSampleMetric[] {
  return LIGHTING_TONE_SAMPLES.map((sample) => {
    const region = absoluteRegion(web, sample.region);
    const webRegion = cropFrame(web, region);
    const bevyRegion = cropFrame(bevy, region);
    const comparison = compareFramesDetailed(webRegion, bevyRegion);
    const maxColorDelta = Math.max(comparison.averageColorDelta.red, comparison.averageColorDelta.green, comparison.averageColorDelta.blue);
    const ok =
      comparison.averageBrightnessDelta <= LIGHTING_TONE_THRESHOLDS.averageBrightnessDelta
      && maxColorDelta <= LIGHTING_TONE_THRESHOLDS.averageColorDelta
      && comparison.p95ChannelDelta <= LIGHTING_TONE_THRESHOLDS.p95ChannelDelta;
    return {
      bevyAverageColor: averageColor(bevyRegion),
      comparison,
      id: sample.id,
      ok,
      thresholds: LIGHTING_TONE_THRESHOLDS,
      webAverageColor: averageColor(webRegion),
    };
  });
}

async function captureLightingToneScreenshots(options: {
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

async function captureThreeJsScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.lighting"): Promise<void> {
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

async function captureBevyScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.lighting"): Promise<void> {
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
