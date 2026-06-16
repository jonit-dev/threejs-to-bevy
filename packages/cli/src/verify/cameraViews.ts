import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadBundle, startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank, analyzeRegionNonblank, compareFrames, type IFrameComparison, type IPixelFrame } from "./imageAnalysis.js";

export interface ICameraViewsVisualReport {
  artifacts: {
    bevyScreenshotPath: string;
    contactSheetPath: string;
    reportPath: string;
    webScreenshotPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  parity: {
    markers: ICameraViewMarkerParity[];
    ok: boolean;
  };
  regions: {
    main: { nonblankRatio: number; ok: boolean };
    minimap: { nonblankRatio: number; ok: boolean };
    monitor: { nonblankRatio: number; ok: boolean };
    split: { nonblankRatio: number; ok: boolean };
  };
  runtimeRegions: {
    bevy: ICameraViewsVisualReport["regions"];
    web: ICameraViewsVisualReport["regions"];
  };
  status: "fail" | "pass";
  visualComparison: IFrameComparison;
}

export interface ICameraViewMarkerBounds {
  count: number;
  height: number;
  ok: boolean;
  width: number;
  x: number;
  xCenter: number;
  y: number;
  yCenter: number;
}

export interface ICameraViewMarkerParity {
  bevy: ICameraViewMarkerBounds;
  centerDeltaPx: number;
  marker: string;
  maxCenterDeltaPx: number;
  maxSizeDeltaPx: number;
  ok: boolean;
  sizeDeltaPx: { height: number; width: number };
  web: ICameraViewMarkerBounds;
}

export type CameraViewsScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}) => Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }>;

export async function verifyCameraViewsVisual(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: CameraViewsScreenshotCapturer;
}): Promise<ICameraViewsVisualReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = activeCameraId(bundle) ?? "camera.main";
  const capture = await (options.screenshotCapturer ?? captureCameraViewScreenshots)({
    artifactDir: options.artifactDir,
    bundlePath: options.bundlePath,
    cameraId,
  });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: ICameraViewsVisualReport["diagnostics"] = [];
  const webNonblank = analyzeNonblank(web);
  const bevyNonblank = analyzeNonblank(bevy);
  if (!webNonblank.ok) {
    diagnostics.push({
      code: "TN_V8_CAMERA_VIEWS_WEB_BLANK",
      message: `Web screenshot is blank or near-blank: ${capture.webScreenshotPath}`,
      severity: "error",
    });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({
      code: "TN_V8_CAMERA_VIEWS_BEVY_BLANK",
      message: `Bevy screenshot is blank or near-blank: ${capture.bevyScreenshotPath}`,
      severity: "error",
    });
  }

  const webRegions = analyzeCameraViewRegions(web);
  const bevyRegions = analyzeCameraViewRegions(bevy);
  for (const [runtime, regions] of Object.entries({ bevy: bevyRegions, web: webRegions })) {
    for (const [name, region] of Object.entries(regions)) {
      if (!region.ok) {
        diagnostics.push({
          code: "TN_V8_CAMERA_VIEWS_REGION_BLANK",
          message: `${runtime} viewport region '${name}' is blank or near-blank.`,
          severity: "error",
        });
      }
    }
  }

  const parity = analyzeCameraViewParity(web, bevy);
  for (const marker of parity.markers) {
    if (!marker.ok) {
      diagnostics.push({
        code: "TN_V8_CAMERA_VIEWS_PARITY_MISMATCH",
        message: `Marker '${marker.marker}' differs between Web and Bevy: center delta ${marker.centerDeltaPx.toFixed(2)} px, size delta ${marker.sizeDeltaPx.width.toFixed(2)}x${marker.sizeDeltaPx.height.toFixed(2)} px.`,
        severity: "error",
      });
    }
  }

  const visualComparison = compareFrames(web, bevy);
  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  const reportPath = resolve(options.artifactDir, "camera-views-report.json");
  const report: ICameraViewsVisualReport = {
    artifacts: {
      bevyScreenshotPath: capture.bevyScreenshotPath,
      contactSheetPath,
      reportPath,
      webScreenshotPath: capture.webScreenshotPath,
    },
    diagnostics,
    parity,
    regions: webRegions,
    runtimeRegions: {
      bevy: bevyRegions,
      web: webRegions,
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
    visualComparison,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

function analyzeCameraViewRegions(frame: IPixelFrame): ICameraViewsVisualReport["regions"] {
  const regions = {
    main: analyzeRegionNonblank(frame, { x: 0, y: 0, width: Math.floor(frame.width * 0.7), height: frame.height }),
    minimap: analyzeRegionNonblank(frame, {
      x: Math.floor(frame.width * 0.7),
      y: Math.floor(frame.height * 0.65),
      width: Math.floor(frame.width * 0.3),
      height: Math.floor(frame.height * 0.35),
    }),
    split: analyzeRegionNonblank(frame, {
      x: Math.floor(frame.width * 0.7),
      y: 0,
      width: Math.floor(frame.width * 0.3),
      height: Math.floor(frame.height * 0.65),
    }),
    monitor: analyzeRegionNonblank(frame, {
      x: Math.floor(frame.width * 0.05),
      y: Math.floor(frame.height * 0.2),
      width: Math.floor(frame.width * 0.25),
      height: Math.floor(frame.height * 0.35),
    }),
  };
  return {
    main: { nonblankRatio: regions.main.nonblankRatio, ok: regions.main.ok },
    minimap: { nonblankRatio: regions.minimap.nonblankRatio, ok: regions.minimap.ok },
    monitor: { nonblankRatio: regions.monitor.nonblankRatio, ok: regions.monitor.ok },
    split: { nonblankRatio: regions.split.nonblankRatio, ok: regions.split.ok },
  };
}

export function analyzeCameraViewParity(web: IPixelFrame, bevy: IPixelFrame): ICameraViewsVisualReport["parity"] {
  const specs = [
    {
      maxCenterDeltaPx: 8,
      maxSizeDeltaPx: 12,
      minPixels: 5_000,
      name: "main-player",
      pixelMatches: (red: number, green: number, blue: number) => blue > 120 && green > 100 && red < 120,
    },
    {
      maxCenterDeltaPx: 8,
      maxSizeDeltaPx: 12,
      minPixels: 5_000,
      name: "split-marker",
      pixelMatches: (red: number, green: number, blue: number) => red > 130 && green > 50 && green < 180 && blue < 100,
    },
    {
      maxCenterDeltaPx: 8,
      maxSizeDeltaPx: 12,
      minPixels: 5_000,
      name: "minimap-marker",
      pixelMatches: (red: number, green: number, blue: number) => green > 100 && red < 80 && blue < 100,
    },
    {
      maxCenterDeltaPx: 8,
      maxSizeDeltaPx: 12,
      minPixels: 5_000,
      name: "monitor-screen",
      pixelMatches: (red: number, green: number, blue: number) => red > 70 && Math.abs(red - green) < 20 && Math.abs(green - blue) < 20,
    },
  ];

  const markers = specs.map((spec) => {
    const webBounds = findMarkerBounds(web, spec.pixelMatches, spec.minPixels);
    const bevyBounds = findMarkerBounds(bevy, spec.pixelMatches, spec.minPixels);
    const centerDeltaPx = distance(webBounds.xCenter, webBounds.yCenter, bevyBounds.xCenter, bevyBounds.yCenter);
    const sizeDeltaPx = {
      height: Math.abs(webBounds.height - bevyBounds.height),
      width: Math.abs(webBounds.width - bevyBounds.width),
    };
    const ok = webBounds.ok
      && bevyBounds.ok
      && centerDeltaPx <= spec.maxCenterDeltaPx
      && sizeDeltaPx.width <= spec.maxSizeDeltaPx
      && sizeDeltaPx.height <= spec.maxSizeDeltaPx;
    return {
      bevy: bevyBounds,
      centerDeltaPx,
      marker: spec.name,
      maxCenterDeltaPx: spec.maxCenterDeltaPx,
      maxSizeDeltaPx: spec.maxSizeDeltaPx,
      ok,
      sizeDeltaPx,
      web: webBounds,
    };
  });

  return {
    markers,
    ok: markers.every((marker) => marker.ok),
  };
}

function findMarkerBounds(
  frame: IPixelFrame,
  pixelMatches: (red: number, green: number, blue: number) => boolean,
  minPixels: number,
): ICameraViewMarkerBounds {
  let count = 0;
  let maxX = -1;
  let maxY = -1;
  let minX = frame.width;
  let minY = frame.height;
  for (let y = 0; y < frame.height; y += 1) {
    for (let x = 0; x < frame.width; x += 1) {
      const index = (y * frame.width + x) * 4;
      if (pixelMatches(frame.data[index] ?? 0, frame.data[index + 1] ?? 0, frame.data[index + 2] ?? 0)) {
        count += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  const width = maxX >= minX ? maxX - minX + 1 : 0;
  const height = maxY >= minY ? maxY - minY + 1 : 0;
  return {
    count,
    height,
    ok: count >= minPixels && width > 0 && height > 0,
    width,
    x: width === 0 ? 0 : minX,
    xCenter: width === 0 ? 0 : (minX + maxX) / 2,
    y: height === 0 ? 0 : minY,
    yCenter: height === 0 ? 0 : (minY + maxY) / 2,
  };
}

function distance(firstX: number, firstY: number, secondX: number, secondY: number): number {
  return Math.hypot(firstX - secondX, firstY - secondY);
}

async function captureCameraViewScreenshots(options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  const webScreenshotPath = resolve(options.artifactDir, "web.png");
  const bevyScreenshotPath = resolve(options.artifactDir, "bevy.png");
  await captureThreeJsScreenshot(options.bundlePath, webScreenshotPath);
  await assertScreenshotWritten(webScreenshotPath, "Web");
  await captureBevyScreenshot(options.bundlePath, bevyScreenshotPath, options.cameraId);
  await assertScreenshotWritten(bevyScreenshotPath, "Bevy");
  return { bevyScreenshotPath, webScreenshotPath };
}

async function assertScreenshotWritten(path: string, runtime: string): Promise<void> {
  const metadata = await stat(path).catch(() => undefined);
  if (metadata === undefined || metadata.size === 0) {
    throw new Error(`${runtime} screenshot capture did not write a non-empty PNG: ${path}`);
  }
}

async function captureThreeJsScreenshot(bundlePath: string, outputPath: string): Promise<void> {
  const server = await startWebPreview({ bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(`${server.url}?bundle=/bundle`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10_000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
    await server.close();
  }
}

async function captureBevyScreenshot(bundlePath: string, outputPath: string, cameraId = "camera.main"): Promise<void> {
  const { execFile } = await import("node:child_process");
  const { promisify } = await import("node:util");
  const execFileAsync = promisify(execFile);
  const env = { ...process.env };
  delete env.RUSTUP_TOOLCHAIN;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await execFileAsync(
        "cargo",
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

function activeCameraId(bundle: Awaited<ReturnType<typeof loadBundle>>): string | undefined {
  const preferred = bundle.world.entities.find((entity) => entity.id === "camera.main")?.id;
  if (preferred !== undefined) {
    return preferred;
  }
  const activeCameras = bundle.world.resources?.ActiveCameras as { cameras?: Array<{ entity?: string } | string> } | undefined;
  if (activeCameras?.cameras?.[0] !== undefined) {
    const first = activeCameras.cameras[0];
    return typeof first === "string" ? first : first.entity;
  }
  const resource = bundle.world.resources?.ActiveCamera as { entity?: string } | undefined;
  return resource?.entity ?? bundle.world.entities.find((entity) => entity.components.Camera !== undefined)?.id;
}

async function writeContactSheet(path: string, webPath: string, bevyPath: string): Promise<void> {
  const { readFile } = await import("node:fs/promises");
  const web = PNG.sync.read(await readFile(webPath));
  const bevy = PNG.sync.read(await readFile(bevyPath));
  const sheet = new PNG({ height: Math.max(web.height, bevy.height), width: web.width + bevy.width });
  for (let index = 0; index < sheet.data.length; index += 4) {
    sheet.data[index] = 0;
    sheet.data[index + 1] = 0;
    sheet.data[index + 2] = 0;
    sheet.data[index + 3] = 255;
  }
  copyInto(web, sheet, 0, 0);
  copyInto(bevy, sheet, web.width, 0);
  await writeFile(path, PNG.sync.write(sheet));
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
