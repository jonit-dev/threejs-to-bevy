import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank, compareFrames, type IFrameComparison, type IPixelFrame } from "./imageAnalysis.js";
import { namedRegionMetricBundle } from "./visualMetricBundles.js";

const execFileAsync = promisify(execFile);

export interface IRenderingQualityRegionMetric {
  averageColor: { blue: number; green: number; red: number };
  comparison: IFrameComparison;
  name: string;
  ok: boolean;
  thresholds: {
    averageBrightnessDelta: number;
    averageColorDelta: number;
    changedPixelRatio?: number;
  };
}

export interface IRenderingQualityVisualReport {
  artifacts: {
    bevyScreenshotPath: string;
    bundleHash: string;
    contactSheetPath: string;
    diffPath: string;
    reportPath: string;
    webScreenshotPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  fogEvidence: {
    bevy: IRuntimeFogEvidence;
    web: IRuntimeFogEvidence;
  };
  regions: IRenderingQualityRegionMetric[];
  renderers: {
    bevy: "native-capture";
    threejs: "web-preview";
  };
  status: "fail" | "pass";
  visualComparison: IFrameComparison;
}

export interface IRuntimeFogEvidence {
  farDistanceToFogColor: number;
  foregroundDistanceToFogColor: number;
  ok: boolean;
}

export interface IV9RenderingLightsVisualReport {
  artifacts: {
    bevyScreenshotPath: string;
    bundleHash: string;
    contactSheetPath: string;
    diffPath: string;
    reportPath: string;
    webScreenshotPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  evidence: {
    bevyNonblank: ReturnType<typeof analyzeNonblank>;
    requiredRegions: string[];
    webNonblank: ReturnType<typeof analyzeNonblank>;
  };
  regions: IRenderingQualityRegionMetric[];
  renderers: {
    bevy: "native-capture";
    threejs: "web-preview";
  };
  status: "fail" | "pass";
  visualComparison: IFrameComparison;
}

export type RenderingQualityScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}) => Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }>;

export async function verifyRenderingQualityVisual(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: RenderingQualityScreenshotCapturer;
}): Promise<IRenderingQualityVisualReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = activeCameraId(bundle) ?? "camera.main";
  const capture = await (options.screenshotCapturer ?? captureRenderingQualityScreenshots)({
    artifactDir: options.artifactDir,
    bundlePath: options.bundlePath,
    cameraId,
  });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: IRenderingQualityVisualReport["diagnostics"] = [];
  const webNonblank = analyzeNonblank(web);
  const bevyNonblank = analyzeNonblank(bevy);
  if (!webNonblank.ok) {
    diagnostics.push({ code: "TN_V8_RENDERING_QUALITY_WEB_BLANK", message: `Web screenshot is blank or near-blank: ${capture.webScreenshotPath}`, severity: "error" });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({ code: "TN_V8_RENDERING_QUALITY_BEVY_BLANK", message: `Bevy screenshot is blank or near-blank: ${capture.bevyScreenshotPath}`, severity: "error" });
  }

  const metrics = analyzeRenderingQualityParity(web, bevy);
  for (const region of metrics.regions) {
    if (!region.ok) {
      diagnostics.push({
        code: "TN_V8_RENDERING_QUALITY_REGION_DRIFT",
        message: `Region '${region.name}' exceeds thresholds: changed ${region.comparison.changedPixelRatio.toFixed(4)}, brightness ${region.comparison.averageBrightnessDelta.toFixed(4)}, RGB ${region.comparison.averageColorDelta.red.toFixed(4)}/${region.comparison.averageColorDelta.green.toFixed(4)}/${region.comparison.averageColorDelta.blue.toFixed(4)}.`,
        severity: "error",
      });
    }
  }
  for (const [runtime, evidence] of Object.entries(metrics.fogEvidence)) {
    if (!evidence.ok) {
      diagnostics.push({
        code: "TN_V8_RENDERING_QUALITY_FOG_NOT_VISIBLE",
        message: `${runtime} far fog region is not measurably closer to the fog color than the foreground region.`,
        severity: "error",
      });
    }
  }

  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  const diffPath = resolve(options.artifactDir, "diff.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  await writeDiff(diffPath, web, bevy);
  const reportPath = resolve(options.artifactDir, "rendering-quality-report.json");
  const report: IRenderingQualityVisualReport = {
    artifacts: {
      bevyScreenshotPath: capture.bevyScreenshotPath,
      bundleHash: await hashFile(resolve(options.bundlePath, "manifest.json")),
      contactSheetPath,
      diffPath,
      reportPath,
      webScreenshotPath: capture.webScreenshotPath,
    },
    diagnostics,
    fogEvidence: metrics.fogEvidence,
    regions: metrics.regions,
    renderers: {
      bevy: "native-capture",
      threejs: "web-preview",
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
    visualComparison: compareFrames(web, bevy),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export async function verifyV9RenderingLightsVisual(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: RenderingQualityScreenshotCapturer;
}): Promise<IV9RenderingLightsVisualReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = activeCameraId(bundle) ?? "camera.main";
  const capture = await (options.screenshotCapturer ?? captureRenderingQualityScreenshots)({
    artifactDir: options.artifactDir,
    bundlePath: options.bundlePath,
    cameraId,
  });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: IV9RenderingLightsVisualReport["diagnostics"] = [];
  const webNonblank = analyzeNonblank(web);
  const bevyNonblank = analyzeNonblank(bevy);
  if (!webNonblank.ok) {
    diagnostics.push({ code: "TN_V9_RENDERING_LIGHTS_WEB_BLANK", message: `Web screenshot is blank or near-blank: ${capture.webScreenshotPath}`, severity: "error" });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({ code: "TN_V9_RENDERING_LIGHTS_BEVY_BLANK", message: `Bevy screenshot is blank or near-blank: ${capture.bevyScreenshotPath}`, severity: "error" });
  }

  const regions = analyzeV9RenderingLightsParity(web, bevy).regions;
  const requiredRegions = ["skybox", "reflection-probe", "point-shadow-pcf", "dense-hlod", "debug-gizmo"];
  for (const name of requiredRegions) {
    if (!regions.some((region) => region.name === name)) {
      diagnostics.push({
        code: "TN_V9_RENDERING_LIGHTS_REGION_MISSING",
        message: `Required V9 visual evidence region '${name}' was not sampled.`,
        severity: "error",
      });
    }
  }
  for (const region of regions) {
    if (!region.ok) {
      diagnostics.push({
        code: "TN_V9_RENDERING_LIGHTS_REGION_DRIFT",
        message: `Region '${region.name}' exceeds thresholds: changed ${region.comparison.changedPixelRatio.toFixed(4)}, brightness ${region.comparison.averageBrightnessDelta.toFixed(4)}, RGB ${region.comparison.averageColorDelta.red.toFixed(4)}/${region.comparison.averageColorDelta.green.toFixed(4)}/${region.comparison.averageColorDelta.blue.toFixed(4)}.`,
        severity: "error",
      });
    }
  }

  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  const diffPath = resolve(options.artifactDir, "diff.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  await writeDiff(diffPath, web, bevy);
  const reportPath = resolve(options.artifactDir, "rendering-lights-visual-report.json");
  const report: IV9RenderingLightsVisualReport = {
    artifacts: {
      bevyScreenshotPath: capture.bevyScreenshotPath,
      bundleHash: await hashFile(resolve(options.bundlePath, "manifest.json")),
      contactSheetPath,
      diffPath,
      reportPath,
      webScreenshotPath: capture.webScreenshotPath,
    },
    diagnostics,
    evidence: {
      bevyNonblank,
      requiredRegions,
      webNonblank,
    },
    regions,
    renderers: {
      bevy: "native-capture",
      threejs: "web-preview",
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
    visualComparison: compareFrames(web, bevy),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

export function analyzeRenderingQualityParity(
  web: IPixelFrame,
  bevy: IPixelFrame,
): Pick<IRenderingQualityVisualReport, "fogEvidence" | "regions"> {
  const fogColor = { red: 201 / 255, green: 214 / 255, blue: 199 / 255 };
  const bundle = namedRegionMetricBundle("rendering-quality", web, bevy, [
    { name: "sky", region: { x: 0.18, y: 0.03, width: 0.64, height: 0.16 }, thresholds: { maxAverageBrightnessDelta: 0.08, maxAverageColorDelta: 0.08, maxChangedPixelRatio: 0.35 } },
    { name: "foreground", region: { x: 0.24, y: 0.43, width: 0.2, height: 0.24 }, thresholds: { maxAverageBrightnessDelta: 0.16, maxAverageColorDelta: 0.16, maxChangedPixelRatio: 0.92 } },
    { name: "fog-depth", region: { x: 0.58, y: 0.42, width: 0.24, height: 0.24 }, thresholds: { maxAverageBrightnessDelta: 0.18, maxAverageColorDelta: 0.18, maxChangedPixelRatio: 0.85 } },
  ]);
  const regions = (bundle.regions ?? []).map((region): IRenderingQualityRegionMetric => ({
    averageColor: averageColor(cropFrame(web, absoluteRegion(web, regionRegion(region.name)))),
    comparison: region.comparison,
    name: region.name,
    ok: region.ok,
    thresholds: {
      averageBrightnessDelta: region.thresholds.maxAverageBrightnessDelta,
      averageColorDelta: region.thresholds.maxAverageColorDelta,
      ...(region.thresholds.maxChangedPixelRatio === undefined ? {} : { changedPixelRatio: region.thresholds.maxChangedPixelRatio }),
    },
  }));
  return {
    fogEvidence: {
      bevy: fogEvidence(bevy, fogColor),
      web: fogEvidence(web, fogColor),
    },
    regions,
  };
}

export function analyzeV9RenderingLightsParity(web: IPixelFrame, bevy: IPixelFrame): Pick<IV9RenderingLightsVisualReport, "regions"> {
  const bundle = namedRegionMetricBundle("rendering-lights", web, bevy, [
    { name: "skybox", region: { x: 0.18, y: 0.03, width: 0.64, height: 0.18 }, thresholds: { maxAverageBrightnessDelta: 0.24, maxAverageColorDelta: 0.24, maxChangedPixelRatio: 0.96 } },
    { name: "reflection-probe", region: { x: 0.4, y: 0.36, width: 0.2, height: 0.24 }, thresholds: { maxAverageBrightnessDelta: 0.34, maxAverageColorDelta: 0.34, maxChangedPixelRatio: 1 } },
    { name: "point-shadow-pcf", region: { x: 0.33, y: 0.58, width: 0.34, height: 0.18 }, thresholds: { maxAverageBrightnessDelta: 0.42, maxAverageColorDelta: 0.42, maxChangedPixelRatio: 1 } },
    { name: "dense-hlod", region: { x: 0.08, y: 0.36, width: 0.22, height: 0.32 }, thresholds: { maxAverageBrightnessDelta: 0.45, maxAverageColorDelta: 0.45, maxChangedPixelRatio: 1 } },
    { name: "debug-gizmo", region: { x: 0.7, y: 0.2, width: 0.22, height: 0.32 }, thresholds: { maxAverageBrightnessDelta: 0.5, maxAverageColorDelta: 0.5, maxChangedPixelRatio: 1 } },
  ]);
  return {
    regions: (bundle.regions ?? []).map((region): IRenderingQualityRegionMetric => ({
      averageColor: averageColor(cropFrame(web, absoluteRegion(web, regionRegion(region.name)))),
      comparison: region.comparison,
      name: region.name,
      ok: region.ok,
      thresholds: {
        averageBrightnessDelta: region.thresholds.maxAverageBrightnessDelta,
        averageColorDelta: region.thresholds.maxAverageColorDelta,
        ...(region.thresholds.maxChangedPixelRatio === undefined ? {} : { changedPixelRatio: region.thresholds.maxChangedPixelRatio }),
      },
    })),
  };
}

function regionRegion(name: string): { height: number; width: number; x: number; y: number } {
  const regions: Record<string, { height: number; width: number; x: number; y: number }> = {
    "debug-gizmo": { x: 0.7, y: 0.2, width: 0.22, height: 0.32 },
    "dense-hlod": { x: 0.08, y: 0.36, width: 0.22, height: 0.32 },
    "fog-depth": { x: 0.58, y: 0.42, width: 0.24, height: 0.24 },
    foreground: { x: 0.24, y: 0.43, width: 0.2, height: 0.24 },
    "point-shadow-pcf": { x: 0.33, y: 0.58, width: 0.34, height: 0.18 },
    "reflection-probe": { x: 0.4, y: 0.36, width: 0.2, height: 0.24 },
    sky: { x: 0.18, y: 0.03, width: 0.64, height: 0.16 },
    skybox: { x: 0.18, y: 0.03, width: 0.64, height: 0.18 },
  };
  return regions[name] ?? { x: 0, y: 0, width: 1, height: 1 };
}

function regionMetric(
  name: string,
  web: IPixelFrame,
  bevy: IPixelFrame,
  normalizedRegion: { height: number; width: number; x: number; y: number },
  thresholds: IRenderingQualityRegionMetric["thresholds"],
): IRenderingQualityRegionMetric {
  const region = absoluteRegion(web, normalizedRegion);
  const webRegion = cropFrame(web, region);
  const bevyRegion = cropFrame(bevy, region);
  const comparison = compareFrames(webRegion, bevyRegion);
  const maxColorDelta = Math.max(comparison.averageColorDelta.red, comparison.averageColorDelta.green, comparison.averageColorDelta.blue);
  return {
    averageColor: averageColor(webRegion),
    comparison,
    name,
    ok:
      comparison.averageBrightnessDelta <= thresholds.averageBrightnessDelta
      && maxColorDelta <= thresholds.averageColorDelta
      && (thresholds.changedPixelRatio === undefined || comparison.changedPixelRatio <= thresholds.changedPixelRatio),
    thresholds,
  };
}

function fogEvidence(frame: IPixelFrame, fogColor: { blue: number; green: number; red: number }): IRuntimeFogEvidence {
  const foreground = averageColor(cropFrame(frame, absoluteRegion(frame, { x: 0.24, y: 0.43, width: 0.2, height: 0.24 })));
  const far = averageColor(cropFrame(frame, absoluteRegion(frame, { x: 0.58, y: 0.42, width: 0.24, height: 0.24 })));
  const foregroundDistanceToFogColor = colorDistance(foreground, fogColor);
  const farDistanceToFogColor = colorDistance(far, fogColor);
  return {
    farDistanceToFogColor,
    foregroundDistanceToFogColor,
    ok: farDistanceToFogColor + 0.03 < foregroundDistanceToFogColor,
  };
}

function absoluteRegion(frame: IPixelFrame, region: { height: number; width: number; x: number; y: number }): { height: number; width: number; x: number; y: number } {
  return {
    height: Math.max(1, Math.floor(frame.height * region.height)),
    width: Math.max(1, Math.floor(frame.width * region.width)),
    x: Math.floor(frame.width * region.x),
    y: Math.floor(frame.height * region.y),
  };
}

function cropFrame(frame: IPixelFrame, region: { height: number; width: number; x: number; y: number }): IPixelFrame {
  const width = Math.min(region.width, frame.width - region.x);
  const height = Math.min(region.height, frame.height - region.y);
  const data = new Uint8ClampedArray(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const from = ((row + region.y) * frame.width + column + region.x) * 4;
      const to = (row * width + column) * 4;
      data[to] = frame.data[from] ?? 0;
      data[to + 1] = frame.data[from + 1] ?? 0;
      data[to + 2] = frame.data[from + 2] ?? 0;
      data[to + 3] = frame.data[from + 3] ?? 255;
    }
  }
  return { data, height, width };
}

function averageColor(frame: IPixelFrame): { blue: number; green: number; red: number } {
  let red = 0;
  let green = 0;
  let blue = 0;
  const total = frame.width * frame.height;
  for (let index = 0; index < frame.data.length; index += 4) {
    red += frame.data[index] ?? 0;
    green += frame.data[index + 1] ?? 0;
    blue += frame.data[index + 2] ?? 0;
  }
  return { blue: blue / total / 255, green: green / total / 255, red: red / total / 255 };
}

function colorDistance(first: { blue: number; green: number; red: number }, second: { blue: number; green: number; red: number }): number {
  return Math.hypot(first.red - second.red, first.green - second.green, first.blue - second.blue);
}

export async function captureRenderingQualityScreenshots(options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  const webScreenshotPath = resolve(options.artifactDir, "web.png");
  const bevyScreenshotPath = resolve(options.artifactDir, "bevy.png");
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = options.cameraId ?? activeCameraId(bundle) ?? "camera.main";
  await captureThreeJsScreenshot(options.bundlePath, webScreenshotPath, cameraId);
  await assertScreenshotWritten(webScreenshotPath, "Web");
  await captureBevyScreenshot(options.bundlePath, bevyScreenshotPath, cameraId);
  await assertScreenshotWritten(bevyScreenshotPath, "Bevy");
  return { bevyScreenshotPath, webScreenshotPath };
}

async function captureThreeJsScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.main"): Promise<void> {
  const server = await startWebPreview({ bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(cameraId)}`, { waitUntil: "networkidle" });
    try {
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 30_000 });
    } catch (error) {
      const url = page.url();
      const title = await page.title().catch(() => "unknown");
      throw new Error(`Timed out waiting for ThreeNative web preview readiness at ${url} (${title}): ${String(error)}`);
    }
    await page.waitForTimeout(500);
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
    await server.close();
  }
}

async function captureBevyScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.main"): Promise<void> {
  const env = { ...process.env };
  delete env.RUSTUP_TOOLCHAIN;
  const cargo = process.env.CARGO ?? "cargo";
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await execFileAsync(
        cargo,
        ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, cameraId, outputPath],
        {
          cwd: resolve(process.cwd(), "runtime-bevy"),
          env,
          timeout: 180_000,
        },
      );
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveRetry) => setTimeout(resolveRetry, 1_000));
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Bevy screenshot capture failed after 3 attempts: ${message}`);
}

async function assertScreenshotWritten(path: string, runtime: string): Promise<void> {
  const metadata = await stat(path).catch(() => undefined);
  if (metadata === undefined || metadata.size === 0) {
    throw new Error(`${runtime} screenshot capture did not write a non-empty PNG: ${path}`);
  }
}

export async function writeContactSheet(path: string, webPath: string, bevyPath: string): Promise<void> {
  const web = PNG.sync.read(await readFile(webPath));
  const bevy = PNG.sync.read(await readFile(bevyPath));
  const sheet = new PNG({ height: Math.max(web.height, bevy.height), width: web.width + bevy.width });
  fill(sheet, 0, 0, 0, 255);
  copyInto(web, sheet, 0, 0);
  copyInto(bevy, sheet, web.width, 0);
  await writeFile(path, PNG.sync.write(sheet));
}

export async function writeDiff(path: string, web: IPixelFrame, bevy: IPixelFrame): Promise<void> {
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

function activeCameraId(bundle: Awaited<ReturnType<typeof loadBundle>>): string | undefined {
  const resource = bundle.world.resources?.ActiveCamera as { entity?: string } | undefined;
  return resource?.entity ?? bundle.world.entities.find((entity) => entity.components.Camera !== undefined)?.id;
}

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
