import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadBundle, startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank, analyzeRegionNonblank } from "./imageAnalysis.js";

export interface ICameraViewsVisualReport {
  artifacts: {
    bevyScreenshotPath: string;
    contactSheetPath: string;
    reportPath: string;
    webScreenshotPath: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  regions: {
    main: { nonblankRatio: number; ok: boolean };
    minimap: { nonblankRatio: number; ok: boolean };
    monitor: { nonblankRatio: number; ok: boolean };
    split: { nonblankRatio: number; ok: boolean };
  };
  status: "fail" | "pass";
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

  const regions = {
    main: analyzeRegionNonblank(web, { x: 0, y: 0, width: Math.floor(web.width * 0.7), height: web.height }),
    minimap: analyzeRegionNonblank(web, {
      x: Math.floor(web.width * 0.7),
      y: Math.floor(web.height * 0.65),
      width: Math.floor(web.width * 0.3),
      height: Math.floor(web.height * 0.35),
    }),
    split: analyzeRegionNonblank(web, {
      x: Math.floor(web.width * 0.7),
      y: 0,
      width: Math.floor(web.width * 0.3),
      height: Math.floor(web.height * 0.65),
    }),
    monitor: analyzeRegionNonblank(web, {
      x: Math.floor(web.width * 0.05),
      y: Math.floor(web.height * 0.55),
      width: Math.floor(web.width * 0.2),
      height: Math.floor(web.height * 0.25),
    }),
  };
  for (const [name, region] of Object.entries(regions)) {
    if (!region.ok) {
      diagnostics.push({
        code: "TN_V8_CAMERA_VIEWS_REGION_BLANK",
        message: `Viewport region '${name}' is blank or near-blank in ${capture.webScreenshotPath}.`,
        severity: "error",
      });
    }
  }

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
    regions: {
      main: { nonblankRatio: regions.main.nonblankRatio, ok: regions.main.ok },
      minimap: { nonblankRatio: regions.minimap.nonblankRatio, ok: regions.minimap.ok },
      monitor: { nonblankRatio: regions.monitor.nonblankRatio, ok: regions.monitor.ok },
      split: { nonblankRatio: regions.split.nonblankRatio, ok: regions.split.ok },
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function captureCameraViewScreenshots(options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  const webScreenshotPath = resolve(options.artifactDir, "web.png");
  const bevyScreenshotPath = resolve(options.artifactDir, "bevy.png");
  await captureThreeJsScreenshot(options.bundlePath, webScreenshotPath);
  await captureBevyScreenshot(options.bundlePath, bevyScreenshotPath, options.cameraId);
  return { bevyScreenshotPath, webScreenshotPath };
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
  await execFileAsync(
    "cargo",
    ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, cameraId, outputPath],
    {
      cwd: resolve(process.cwd(), "runtime-bevy"),
      env,
      timeout: 180_000,
    },
  );
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
