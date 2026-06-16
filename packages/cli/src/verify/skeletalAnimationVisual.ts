import { createHash } from "node:crypto";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadBundle, startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank, compareFrames, defaultDiffThreshold, defaultNonblankThreshold } from "./imageAnalysis.js";

const execFileAsync = promisify(execFile);

const motionDiffThreshold = defaultDiffThreshold;
const frameDelayMs = 1500;

export interface ISkeletalAnimationVisualReport {
  artifacts: {
    bevyFrame01Path: string;
    bevyFrame02Path: string;
    bundleHash: string;
    contactSheetPath: string;
    reportPath: string;
    webFrame01Path: string;
    webFrame02Path: string;
  };
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  metrics: {
    bevyMotion: { changedPixelRatio: number; ok: boolean };
    webMotion: { changedPixelRatio: number; ok: boolean };
  };
  renderers: {
    bevy: "native-capture";
    threejs: "web-preview";
  };
  status: "fail" | "pass";
}

export type SkeletalAnimationScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}) => Promise<{
  bevyFrame01Path: string;
  bevyFrame02Path: string;
  webFrame01Path: string;
  webFrame02Path: string;
}>;

export async function verifySkeletalAnimationVisual(options: {
  artifactDir: string;
  bundlePath: string;
  screenshotCapturer?: SkeletalAnimationScreenshotCapturer;
}): Promise<ISkeletalAnimationVisualReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const bundle = await loadBundle(options.bundlePath);
  const cameraId = activeCameraId(bundle) ?? "camera.main";
  const modelAsset = bundle.assets.assets.find((asset) => asset.kind === "model" && asset.animations !== undefined && asset.animations.length > 0);
  if (modelAsset === undefined) {
    throw new Error("Skeletal animation visual verification requires a model asset with animation clips.");
  }

  const capture = await (options.screenshotCapturer ?? captureSkeletalAnimationScreenshots)({
    artifactDir: options.artifactDir,
    bundlePath: options.bundlePath,
    cameraId,
  });
  const diagnostics: ISkeletalAnimationVisualReport["diagnostics"] = [];

  const webFrame01 = await readPngFrame(capture.webFrame01Path);
  const webFrame02 = await readPngFrame(capture.webFrame02Path);
  const bevyFrame01 = await readPngFrame(capture.bevyFrame01Path);
  const bevyFrame02 = await readPngFrame(capture.bevyFrame02Path);

  for (const [label, frame, path] of [
    ["web", webFrame01, capture.webFrame01Path],
    ["bevy", bevyFrame01, capture.bevyFrame01Path],
  ] as const) {
    const nonblank = analyzeNonblank(frame, defaultNonblankThreshold);
    if (!nonblank.ok) {
      diagnostics.push({
        code: label === "web" ? "TN_V9_SKELETAL_WEB_BLANK" : "TN_V9_SKELETAL_BEVY_BLANK",
        message: `${label} screenshot is blank or near-blank: ${path}`,
        severity: "error",
      });
    }
  }

  const webMotion = compareFrames(webFrame01, webFrame02, motionDiffThreshold);
  const bevyMotion = compareFrames(bevyFrame01, bevyFrame02, motionDiffThreshold);
  const metrics = {
    bevyMotion: { changedPixelRatio: bevyMotion.changedPixelRatio, ok: bevyMotion.ok },
    webMotion: { changedPixelRatio: webMotion.changedPixelRatio, ok: webMotion.ok },
  };

  if (!webMotion.ok) {
    diagnostics.push({
      code: "TN_V9_SKELETAL_WEB_FROZEN",
      message: `Web skeletal animation did not produce visible frame motion (changedPixelRatio=${webMotion.changedPixelRatio.toFixed(6)}).`,
      severity: "error",
    });
  }
  if (!bevyMotion.ok) {
    diagnostics.push({
      code: "TN_V9_SKELETAL_BEVY_FROZEN",
      message: `Bevy skeletal animation did not produce visible frame motion (changedPixelRatio=${bevyMotion.changedPixelRatio.toFixed(6)}).`,
      severity: "error",
    });
  }

  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  await writeContactSheet(contactSheetPath, capture.webFrame02Path, capture.bevyFrame02Path);

  const reportPath = resolve(options.artifactDir, "skeletal-animation-report.json");
  const report: ISkeletalAnimationVisualReport = {
    artifacts: {
      bevyFrame01Path: capture.bevyFrame01Path,
      bevyFrame02Path: capture.bevyFrame02Path,
      bundleHash: await hashFile(resolve(options.bundlePath, "manifest.json")),
      contactSheetPath,
      reportPath,
      webFrame01Path: capture.webFrame01Path,
      webFrame02Path: capture.webFrame02Path,
    },
    diagnostics,
    metrics,
    renderers: {
      bevy: "native-capture",
      threejs: "web-preview",
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  return report;
}

async function captureSkeletalAnimationScreenshots(options: {
  artifactDir: string;
  bundlePath: string;
  cameraId?: string;
}): Promise<{
  bevyFrame01Path: string;
  bevyFrame02Path: string;
  webFrame01Path: string;
  webFrame02Path: string;
}> {
  const webFrame01Path = resolve(options.artifactDir, "web-frame-01.png");
  const webFrame02Path = resolve(options.artifactDir, "web-frame-02.png");
  const bevyFrame01Path = resolve(options.artifactDir, "bevy-frame-01.png");
  const bevyFrame02Path = resolve(options.artifactDir, "bevy-frame-02.png");
  await captureThreeJsFrames(options.bundlePath, webFrame01Path, webFrame02Path, options.cameraId);
  await captureBevyFrames(options.bundlePath, bevyFrame01Path, bevyFrame02Path, options.cameraId, 60, 150);
  return { bevyFrame01Path, bevyFrame02Path, webFrame01Path, webFrame02Path };
}

async function captureThreeJsFrames(bundlePath: string, frame01Path: string, frame02Path: string, cameraId = "camera.main"): Promise<void> {
  const server = await startWebPreview({ bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(cameraId)}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10_000 });
    await page.screenshot({ path: frame01Path });
    await page.waitForTimeout(frameDelayMs);
    await page.screenshot({ path: frame02Path });
  } finally {
    await browser.close();
    await server.close();
  }
}

async function captureBevyFrames(
  bundlePath: string,
  frame01Path: string,
  frame02Path: string,
  cameraId = "camera.main",
  requestFrame01 = 60,
  requestFrame02 = 150,
): Promise<void> {
  const cargo = process.env.CARGO ?? "cargo";
  await execFileAsync(
    cargo,
    [
      "run",
      "--quiet",
      "-p",
      "threenative_runtime",
      "--bin",
      "threenative_capture",
      "--",
      bundlePath,
      cameraId,
      frame01Path,
      String(requestFrame01),
      frame02Path,
      String(requestFrame02),
    ],
    {
      cwd: resolve(process.cwd(), "runtime-bevy"),
      timeout: 600_000,
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

async function hashFile(path: string): Promise<string> {
  return createHash("sha256").update(await readFile(path)).digest("hex");
}
