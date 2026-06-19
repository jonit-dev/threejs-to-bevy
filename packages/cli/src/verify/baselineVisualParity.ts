import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { startWebPreview } from "@threenative/runtime-web-three";
import { chromium } from "playwright";
import { PNG } from "pngjs";

import { cargoCaptureEnv, resolveCargoCommand } from "./captureCargo.js";
import { readPngFrame } from "./compareImages.js";
import {
  analyzeNonblank,
  compareFramesDetailed,
  cropFrame,
  type IDetailedFrameComparison,
  type INormalizedRegion,
  type IPixelFrame,
} from "./imageAnalysis.js";

const execFileAsync = promisify(execFile);

export interface IBaselineVisualThresholds {
  maxAverageBrightnessDelta: number;
  maxChangedPixelRatio?: number;
  maxClippedRatioDelta: number;
  maxP95ChannelDelta?: number;
  maxSignedAverageBrightnessDelta: number;
  minSignedAverageBrightnessDelta: number;
}

export interface IBaselineVisualCheckpoint {
  bundleRelativePath: string;
  cameraId: string;
  captureFrame: number;
  id: string;
  projectRelativePath: string;
  region?: INormalizedRegion;
  thresholds: IBaselineVisualThresholds;
  webReadyTimeoutMs?: number;
}

export const BASELINE_VISUAL_CHECKPOINTS: readonly IBaselineVisualCheckpoint[] = [
  {
    id: "v1-canonical",
    projectRelativePath: "examples/v1-canonical",
    bundleRelativePath: "examples/v1-canonical/dist/game.bundle",
    cameraId: "camera.main",
    captureFrame: 15,
    thresholds: {
      maxAverageBrightnessDelta: 0.026,
      maxChangedPixelRatio: 0.22,
      maxClippedRatioDelta: 0.01,
      maxSignedAverageBrightnessDelta: 0.012,
      minSignedAverageBrightnessDelta: -0.012,
    },
  },
  {
    id: "crystal-runner-static",
    projectRelativePath: "examples/crystal-runner-static",
    bundleRelativePath: "examples/crystal-runner-static/dist/crystal-runner-static.bundle",
    cameraId: "camera.main",
    captureFrame: 60,
    region: { height: 400, width: 640, x: 320, y: 200 },
    thresholds: {
      maxAverageBrightnessDelta: 0.02,
      maxChangedPixelRatio: 0.85,
      maxClippedRatioDelta: 0.01,
      maxP95ChannelDelta: 0.24,
      maxSignedAverageBrightnessDelta: 0.015,
      minSignedAverageBrightnessDelta: -0.015,
    },
  },
  {
    id: "v3-environment",
    projectRelativePath: "examples/v3-environment",
    bundleRelativePath: "examples/v3-environment/dist/forest.bundle",
    cameraId: "bookmark.entry",
    captureFrame: 180,
    webReadyTimeoutMs: 120_000,
    region: { height: 360, width: 520, x: 380, y: 280 },
    thresholds: {
      maxAverageBrightnessDelta: 0.08,
      maxClippedRatioDelta: 0.02,
      maxP95ChannelDelta: 0.22,
      maxSignedAverageBrightnessDelta: 0.05,
      minSignedAverageBrightnessDelta: -0.025,
    },
  },
  {
    id: "v8-color-parity",
    projectRelativePath: "examples/v8-color-parity",
    bundleRelativePath: "examples/v8-color-parity/dist/v8-color-parity.bundle",
    cameraId: "camera.color",
    captureFrame: 60,
    thresholds: {
      maxAverageBrightnessDelta: 0.03,
      maxChangedPixelRatio: 0.05,
      maxClippedRatioDelta: 0.01,
      maxP95ChannelDelta: 0.02,
      maxSignedAverageBrightnessDelta: 0.012,
      minSignedAverageBrightnessDelta: -0.012,
    },
  },
  {
    id: "v8-lighting-tone",
    projectRelativePath: "examples/v8-lighting-tone",
    bundleRelativePath: "examples/v8-lighting-tone/dist/v8-lighting-tone.bundle",
    cameraId: "camera.lighting",
    captureFrame: 60,
    thresholds: {
      maxAverageBrightnessDelta: 0.03,
      maxChangedPixelRatio: 0.15,
      maxClippedRatioDelta: 0.01,
      maxP95ChannelDelta: 0.12,
      maxSignedAverageBrightnessDelta: 0.015,
      minSignedAverageBrightnessDelta: -0.015,
    },
  },
  {
    id: "physics-character",
    projectRelativePath: "examples/physics-character",
    bundleRelativePath: "examples/physics-character/dist/physics-character.bundle",
    cameraId: "camera.main",
    captureFrame: 90,
    thresholds: {
      maxAverageBrightnessDelta: 0.04,
      maxChangedPixelRatio: 0.2,
      maxClippedRatioDelta: 0.01,
      maxP95ChannelDelta: 0.2,
      maxSignedAverageBrightnessDelta: 0.015,
      minSignedAverageBrightnessDelta: -0.015,
    },
  },
  {
    id: "v10-visual-calibration-lighting",
    projectRelativePath: "examples/v10-visual-calibration-lighting",
    bundleRelativePath: "examples/v10-visual-calibration-lighting/dist/v10-visual-calibration-lighting.bundle",
    cameraId: "camera.calibration",
    captureFrame: 60,
    thresholds: {
      maxAverageBrightnessDelta: 0.03,
      maxChangedPixelRatio: 0.25,
      maxClippedRatioDelta: 0.01,
      maxP95ChannelDelta: 0.15,
      maxSignedAverageBrightnessDelta: 0.02,
      minSignedAverageBrightnessDelta: -0.02,
    },
  },
] as const;

export interface IBaselineVisualCheckpointReport {
  artifacts: {
    bevyScreenshotPath: string;
    contactSheetPath: string;
    diffPath: string;
    webScreenshotPath: string;
  };
  checkpoint: IBaselineVisualCheckpoint;
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  metrics: Record<string, number>;
  status: "fail" | "pass";
  visualComparison: IDetailedFrameComparison;
}

export interface IBaselineVisualParityReport {
  artifacts: {
    artifactDir: string;
    reportPath: string;
  };
  checkpoints: IBaselineVisualCheckpointReport[];
  diagnostics: Array<{ code: string; message: string; severity: "error" }>;
  status: "fail" | "pass";
}

export type BaselineVisualScreenshotCapturer = (options: {
  artifactDir: string;
  bundlePath: string;
  checkpoint: IBaselineVisualCheckpoint;
}) => Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }>;

export async function verifyBaselineVisualParity(options: {
  artifactDir: string;
  checkpoints?: readonly IBaselineVisualCheckpoint[];
  repoRoot: string;
  screenshotCapturer?: BaselineVisualScreenshotCapturer;
}): Promise<IBaselineVisualParityReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const checkpoints = options.checkpoints ?? BASELINE_VISUAL_CHECKPOINTS;
  const reports: IBaselineVisualCheckpointReport[] = [];
  const diagnostics: IBaselineVisualParityReport["diagnostics"] = [];

  for (const checkpoint of checkpoints) {
    const bundlePath = resolve(options.repoRoot, checkpoint.bundleRelativePath);
    const checkpointDir = resolve(options.artifactDir, checkpoint.id);
    try {
      const report = await verifyBaselineVisualCheckpoint({
        artifactDir: checkpointDir,
        bundlePath,
        checkpoint,
        screenshotCapturer: options.screenshotCapturer,
      });
      reports.push(report);
      diagnostics.push(...report.diagnostics);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push({
        code: "TN_BASELINE_VISUAL_CAPTURE_FAILED",
        message: `Checkpoint '${checkpoint.id}' capture failed: ${message}`,
        severity: "error",
      });
      reports.push({
        artifacts: {
          bevyScreenshotPath: resolve(checkpointDir, "bevy.png"),
          contactSheetPath: resolve(checkpointDir, "contact-sheet.png"),
          diffPath: resolve(checkpointDir, "diff.png"),
          webScreenshotPath: resolve(checkpointDir, "web.png"),
        },
        checkpoint,
        diagnostics: [
          {
            code: "TN_BASELINE_VISUAL_CAPTURE_FAILED",
            message: `Checkpoint '${checkpoint.id}' capture failed: ${message}`,
            severity: "error",
          },
        ],
        metrics: {},
        status: "fail",
        visualComparison: emptyComparison(),
      });
    }
  }

  const reportPath = resolve(options.artifactDir, "baseline-visual-parity-report.json");
  const result: IBaselineVisualParityReport = {
    artifacts: {
      artifactDir: options.artifactDir,
      reportPath,
    },
    checkpoints: reports,
    diagnostics,
    status: diagnostics.length === 0 ? "pass" : "fail",
  };
  await writeFile(reportPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export async function verifyBaselineVisualCheckpoint(options: {
  artifactDir: string;
  bundlePath: string;
  checkpoint: IBaselineVisualCheckpoint;
  screenshotCapturer?: BaselineVisualScreenshotCapturer;
}): Promise<IBaselineVisualCheckpointReport> {
  await mkdir(options.artifactDir, { recursive: true });
  const capture = options.screenshotCapturer
    ? await options.screenshotCapturer({
        artifactDir: options.artifactDir,
        bundlePath: options.bundlePath,
        checkpoint: options.checkpoint,
      })
    : await captureBaselineVisualScreenshots({
        artifactDir: options.artifactDir,
        bundlePath: options.bundlePath,
        checkpoint: options.checkpoint,
      });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: IBaselineVisualCheckpointReport["diagnostics"] = [];

  const webRegion = applyRegion(web, options.checkpoint.region);
  const bevyRegion = applyRegion(bevy, options.checkpoint.region);
  const webNonblank = analyzeNonblank(webRegion);
  const bevyNonblank = analyzeNonblank(bevyRegion);
  if (!webNonblank.ok) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_WEB_BLANK",
      message: `Web screenshot is blank or near-blank for checkpoint '${options.checkpoint.id}': ${capture.webScreenshotPath}`,
      severity: "error",
    });
  }
  if (!bevyNonblank.ok) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_BEVY_BLANK",
      message: `Bevy screenshot is blank or near-blank for checkpoint '${options.checkpoint.id}': ${capture.bevyScreenshotPath}`,
      severity: "error",
    });
  }

  const visualComparison = compareFramesDetailed(webRegion, bevyRegion);
  const webClippedRatio = analyzeClippedRatio(webRegion);
  const bevyClippedRatio = analyzeClippedRatio(bevyRegion);
  const clippedRatioDelta = bevyClippedRatio - webClippedRatio;
  const averageBrightnessDelta = visualComparison.averageBrightnessDelta;
  const signedAverageBrightnessDelta = visualComparison.signedAverageBrightnessDelta;
  const { thresholds } = options.checkpoint;

  if (
    thresholds.maxChangedPixelRatio !== undefined
    && visualComparison.changedPixelRatio > thresholds.maxChangedPixelRatio
  ) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_FRAME_DRIFT",
      message: `Checkpoint '${options.checkpoint.id}' changed pixel ratio ${visualComparison.changedPixelRatio.toFixed(4)} exceeds ${thresholds.maxChangedPixelRatio}.`,
      severity: "error",
    });
  }
  if (
    thresholds.maxP95ChannelDelta !== undefined
    && visualComparison.p95ChannelDelta > thresholds.maxP95ChannelDelta
  ) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_FRAME_DRIFT",
      message: `Checkpoint '${options.checkpoint.id}' p95 channel delta ${visualComparison.p95ChannelDelta.toFixed(4)} exceeds ${thresholds.maxP95ChannelDelta}.`,
      severity: "error",
    });
  }
  if (averageBrightnessDelta > thresholds.maxAverageBrightnessDelta) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_LUMINANCE_DRIFT",
      message: `Checkpoint '${options.checkpoint.id}' average brightness delta ${averageBrightnessDelta.toFixed(4)} exceeds ${thresholds.maxAverageBrightnessDelta}.`,
      severity: "error",
    });
  }
  if (clippedRatioDelta > thresholds.maxClippedRatioDelta) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_OVEREXPOSURE",
      message: `Checkpoint '${options.checkpoint.id}' clipped highlight ratio delta ${clippedRatioDelta.toFixed(4)} exceeds ${thresholds.maxClippedRatioDelta} (web=${webClippedRatio.toFixed(4)}, bevy=${bevyClippedRatio.toFixed(4)}).`,
      severity: "error",
    });
  }
  if (signedAverageBrightnessDelta < thresholds.minSignedAverageBrightnessDelta) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_UNDEREXPOSURE",
      message: `Checkpoint '${options.checkpoint.id}' signed average brightness delta ${signedAverageBrightnessDelta.toFixed(4)} is below ${thresholds.minSignedAverageBrightnessDelta} (Bevy is darker than web).`,
      severity: "error",
    });
  }
  if (signedAverageBrightnessDelta > thresholds.maxSignedAverageBrightnessDelta) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_OVEREXPOSURE",
      message: `Checkpoint '${options.checkpoint.id}' signed average brightness delta ${signedAverageBrightnessDelta.toFixed(4)} is above ${thresholds.maxSignedAverageBrightnessDelta} (Bevy is brighter than web).`,
      severity: "error",
    });
  }

  const contactSheetPath = resolve(options.artifactDir, "contact-sheet.png");
  const diffPath = resolve(options.artifactDir, "diff.png");
  await writeContactSheet(contactSheetPath, capture.webScreenshotPath, capture.bevyScreenshotPath);
  await writeDiff(diffPath, webRegion, bevyRegion);

  return {
    artifacts: {
      bevyScreenshotPath: capture.bevyScreenshotPath,
      contactSheetPath,
      diffPath,
      webScreenshotPath: capture.webScreenshotPath,
    },
    checkpoint: options.checkpoint,
    diagnostics,
    metrics: {
      averageBrightnessDelta,
      bevyClippedRatio,
      changedPixelRatio: visualComparison.changedPixelRatio,
      clippedRatioDelta,
      p95ChannelDelta: visualComparison.p95ChannelDelta,
      signedAverageBrightnessDelta,
      webClippedRatio,
    },
    status: diagnostics.length === 0 ? "pass" : "fail",
    visualComparison,
  };
}

async function captureBaselineVisualScreenshots(options: {
  artifactDir: string;
  bundlePath: string;
  checkpoint: IBaselineVisualCheckpoint;
}): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  const webScreenshotPath = resolve(options.artifactDir, "web.png");
  const bevyScreenshotPath = resolve(options.artifactDir, "bevy.png");
  await captureThreeJsScreenshot(
    options.bundlePath,
    webScreenshotPath,
    options.checkpoint.cameraId,
    options.checkpoint.captureFrame,
    options.checkpoint.webReadyTimeoutMs,
  );
  await captureBevyScreenshot(
    options.bundlePath,
    bevyScreenshotPath,
    options.checkpoint.cameraId,
    options.checkpoint.captureFrame,
  );
  return { bevyScreenshotPath, webScreenshotPath };
}

async function captureThreeJsScreenshot(
  bundlePath: string,
  outputPath: string,
  cameraId: string,
  settleFrames: number,
  readyTimeoutMs = 30_000,
): Promise<void> {
  const server = await startWebPreview({ bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(cameraId)}`, {
      waitUntil: "domcontentloaded",
    });
    try {
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: readyTimeoutMs });
    } catch (error) {
      const url = page.url();
      const title = await page.title().catch(() => "unknown");
      throw new Error(`Timed out waiting for ThreeNative web preview readiness at ${url} (${title}): ${String(error)}`);
    }
    if (settleFrames > 0) {
      await page.waitForTimeout(Math.max(500, settleFrames * 16));
    }
    await page.screenshot({ path: outputPath });
  } finally {
    await browser.close();
    await server.close();
  }
}

async function captureBevyScreenshot(
  bundlePath: string,
  outputPath: string,
  cameraId: string,
  captureFrame: number,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
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
          resolve(bundlePath),
          cameraId,
          outputPath,
          String(captureFrame),
        ],
        {
          cwd: resolve(process.cwd(), "runtime-bevy"),
          env: cargoCaptureEnv(),
          timeout: 300_000,
        },
      );
      await assertScreenshotWritten(outputPath, "Bevy");
      return;
    } catch (error) {
      lastError = error;
      try {
        await assertScreenshotWritten(outputPath, "Bevy");
        return;
      } catch {
        if (attempt < 3) {
          await new Promise((resolveRetry) => setTimeout(resolveRetry, 1_000));
        }
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Bevy screenshot capture failed after 3 attempts: ${message}`);
}

async function assertScreenshotWritten(path: string, runtime: string): Promise<void> {
  const fileStats = await stat(path);
  if (fileStats.size <= 32_000) {
    throw new Error(`${runtime} screenshot capture did not write a rendered PNG: ${path}`);
  }
}

function applyRegion(frame: IPixelFrame, region?: INormalizedRegion): IPixelFrame {
  if (region === undefined) {
    return frame;
  }
  return cropFrame(frame, region);
}

function analyzeClippedRatio(frame: IPixelFrame): number {
  let clipped = 0;
  const total = frame.width * frame.height;
  if (total <= 0) {
    return 0;
  }
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    if (red > 245 && green > 245 && blue > 245) {
      clipped += 1;
    }
  }
  return clipped / total;
}

function emptyComparison(): IDetailedFrameComparison {
  return {
    averageBrightnessDelta: 0,
    averageColorDelta: { blue: 0, green: 0, red: 0 },
    changedPixelRatio: 0,
    maxChannelDelta: 0,
    ok: false,
    p95ChannelDelta: 0,
    signedAverageBrightnessDelta: 0,
    signedAverageColorDelta: { blue: 0, green: 0, red: 0 },
    threshold: 0,
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
