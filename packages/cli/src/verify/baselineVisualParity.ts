import { execFile, spawn } from "node:child_process";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { startWebPreview } from "@threenative/runtime-web-three";
import { chromium, type Page } from "playwright";
import { PNG } from "pngjs";

import { cargoCaptureEnv, resolveCaptureBinaryPath, resolveCargoCommand } from "./captureCargo.js";
import { readPngFrame } from "./compareImages.js";
import {
  analyzeNonblank,
  absoluteRegion,
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
    id: "structured-stylized-nature",
    projectRelativePath: "examples/stylized-nature-component",
    bundleRelativePath: "examples/stylized-nature-component/dist/stylized-nature-component.bundle",
    cameraId: "camera.main",
    captureFrame: 5,
    // Dense source-backed foliage and PBR differ structurally across web and
    // Bevy. This checkpoint guards against blank frames, missing sky/background,
    // overexposure, and severe luminance drift rather than pixel parity.
    thresholds: {
      maxAverageBrightnessDelta: 0.13,
      maxChangedPixelRatio: 1,
      maxClippedRatioDelta: 0.01,
      maxP95ChannelDelta: 0.42,
      maxSignedAverageBrightnessDelta: 0.04,
      minSignedAverageBrightnessDelta: -0.06,
    },
  },
  {
    id: "humanoid-physics-course",
    projectRelativePath: "examples/humanoid-physics-course",
    bundleRelativePath: "examples/humanoid-physics-course/dist/humanoid-physics-course.bundle",
    cameraId: "camera.main",
    captureFrame: 5,
    // Guard the proof-first humanoid scene at the frame used by the manual
    // side-by-side investigation. Full-scene structural pixels still vary
    // across rasterizers, so the asserted contract is luminance, p95 channel,
    // and exposure drift rather than exact pixel identity.
    thresholds: {
      maxAverageBrightnessDelta: 0.05,
      maxChangedPixelRatio: 1,
      maxClippedRatioDelta: 0.001,
      maxP95ChannelDelta: 0.12,
      maxSignedAverageBrightnessDelta: 0.03,
      minSignedAverageBrightnessDelta: -0.03,
    },
  },
  {
    id: "humanoid-physics-course-checkpoint-emissive",
    projectRelativePath: "examples/humanoid-physics-course",
    bundleRelativePath: "examples/humanoid-physics-course/dist/humanoid-physics-course.bundle",
    cameraId: "camera.main",
    captureFrame: 5,
    region: { x: 0.595, y: 0.455, width: 0.075, height: 0.055 },
    // Focus an unobstructed cyan checkpoint dome region so emissive drift
    // cannot hide inside full-frame averages or humanoid silhouette changes.
    thresholds: {
      maxAverageBrightnessDelta: 0.07,
      maxChangedPixelRatio: 1,
      maxClippedRatioDelta: 0.001,
      maxP95ChannelDelta: 0.18,
      maxSignedAverageBrightnessDelta: 0.05,
      minSignedAverageBrightnessDelta: -0.05,
    },
  },
] as const;

/** Fast single-scene structured-source hook for web↔Bevy smoke parity. */
export const PARITY_SMOKE_CHECKPOINT: IBaselineVisualCheckpoint = {
  id: "structured-stylized-nature-smoke",
  projectRelativePath: "examples/stylized-nature-component",
  bundleRelativePath: "examples/stylized-nature-component/dist/stylized-nature-component.bundle",
  cameraId: "camera.main",
  captureFrame: 5,
  // Fast hook for catastrophic visual regressions in the source-backed
  // stylized scene: blank capture, missing skybox, clipping, or large exposure
  // drift. Full-scene grass/path pixels are not a stable cross-runtime oracle.
  thresholds: {
    maxAverageBrightnessDelta: 0.13,
    maxClippedRatioDelta: 0.01,
    maxP95ChannelDelta: 0.42,
    maxSignedAverageBrightnessDelta: 0.04,
    minSignedAverageBrightnessDelta: -0.06,
  },
};

/** Full web↔Bevy parity set exercised before push (see `pnpm verify:parity:push`). */
export const PARITY_PUSH_CHECKPOINTS: readonly IBaselineVisualCheckpoint[] = BASELINE_VISUAL_CHECKPOINTS;

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

type BaselineVisualCaptureResult = Awaited<ReturnType<BaselineVisualScreenshotCapturer>>;

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
  const captureCache = new Map<string, Promise<BaselineVisualCaptureResult>>();

  for (const checkpoint of checkpoints) {
    const bundlePath = resolve(options.repoRoot, checkpoint.bundleRelativePath);
    const checkpointDir = resolve(options.artifactDir, checkpoint.id);
    try {
      const report = await verifyBaselineVisualCheckpoint({
        artifactDir: checkpointDir,
        bundlePath,
        checkpoint,
        repoRoot: options.repoRoot,
        screenshotCapturer:
          options.screenshotCapturer ??
          cachedBaselineVisualScreenshotCapturer({
            cache: captureCache,
            repoRoot: options.repoRoot,
          }),
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

function cachedBaselineVisualScreenshotCapturer(options: {
  cache: Map<string, Promise<BaselineVisualCaptureResult>>;
  repoRoot: string;
}): BaselineVisualScreenshotCapturer {
  return async ({ artifactDir, bundlePath, checkpoint }) => {
    const output = {
      bevyScreenshotPath: resolve(artifactDir, "bevy.png"),
      webScreenshotPath: resolve(artifactDir, "web.png"),
    };
    const cacheKey = [
      resolve(bundlePath),
      checkpoint.cameraId,
      checkpoint.captureFrame,
      checkpoint.webReadyTimeoutMs ?? 30_000,
    ].join("\u0000");
    let cached = options.cache.get(cacheKey);
    if (cached === undefined) {
      const cacheDir = resolve(artifactDir, ".capture-cache");
      cached = captureBaselineVisualScreenshots({
        artifactDir: cacheDir,
        bundlePath,
        checkpoint,
        repoRoot: options.repoRoot,
      });
      options.cache.set(cacheKey, cached);
    }
    const capture = await cached;
    if (capture.webScreenshotPath !== output.webScreenshotPath) {
      await mkdir(artifactDir, { recursive: true });
      await copyFile(capture.webScreenshotPath, output.webScreenshotPath);
    }
    if (capture.bevyScreenshotPath !== output.bevyScreenshotPath) {
      await mkdir(artifactDir, { recursive: true });
      await copyFile(capture.bevyScreenshotPath, output.bevyScreenshotPath);
    }
    return output;
  };
}

export async function verifyBaselineVisualCheckpoint(options: {
  artifactDir: string;
  bundlePath: string;
  checkpoint: IBaselineVisualCheckpoint;
  repoRoot?: string;
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
        repoRoot: options.repoRoot,
      });
  const web = await readPngFrame(capture.webScreenshotPath);
  const bevy = await readPngFrame(capture.bevyScreenshotPath);
  const diagnostics: IBaselineVisualCheckpointReport["diagnostics"] = [];

  const webRegion = applyRegion(web, options.checkpoint.region);
  const bevyRegion = applyRegion(bevy, options.checkpoint.region);
  const webNonblank = analyzeNonblank(webRegion);
  const bevyNonblank = analyzeNonblank(bevyRegion);
  if (!webNonblank.ok || isFrameTooDark(webRegion)) {
    diagnostics.push({
      code: "TN_BASELINE_VISUAL_WEB_BLANK",
      message: `Web screenshot is blank or near-blank for checkpoint '${options.checkpoint.id}': ${capture.webScreenshotPath}`,
      severity: "error",
    });
  }
  if (!bevyNonblank.ok || isFrameTooDark(bevyRegion)) {
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
  repoRoot?: string;
}): Promise<{ bevyScreenshotPath: string; webScreenshotPath: string }> {
  await mkdir(options.artifactDir, { recursive: true });
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
    options.repoRoot,
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
  await rm(outputPath, { force: true });
  const server = await startWebPreview({ bundlePath });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(`${server.url}?bundle=/bundle&bookmark=${encodeURIComponent(cameraId)}&capture=1`, {
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
      await waitForAnimationFrames(page, settleFrames);
    }
    await captureCanvasPng(page, outputPath);
    await assertScreenshotWritten(outputPath, "Three.js web");
  } finally {
    await browser.close();
    await server.close();
  }
}

async function waitForAnimationFrames(page: Page, frameCount: number): Promise<void> {
  const timeoutMs = Math.max(100, Math.min(2_000, Math.floor(frameCount) * 16));
  await page.waitForTimeout(timeoutMs);
}

async function captureCanvasPng(page: Page, outputPath: string): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      const pngBase64 = await page.evaluate(`(() => {
        const canvas = document.querySelector("canvas");
        if (!(canvas instanceof HTMLCanvasElement)) {
          throw new Error("ThreeNative web preview did not create a canvas.");
        }
        const dataUrl = canvas.toDataURL("image/png");
        return dataUrl.slice(dataUrl.indexOf(",") + 1);
      })()`);
      if (typeof pngBase64 !== "string" || pngBase64.length === 0) {
        throw new Error("ThreeNative web preview returned an invalid canvas PNG.");
      }
      await writeFile(outputPath, Buffer.from(pngBase64, "base64"));
      await assertScreenshotWritten(outputPath, "Three.js web");
      return;
    } catch (error) {
      lastError = error;
      if (attempt < 5) {
        await page.waitForTimeout(500);
      }
    }
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Three.js web screenshot capture failed after 5 attempts: ${message}`);
}

async function captureBevyScreenshot(
  bundlePath: string,
  outputPath: string,
  cameraId: string,
  captureFrame: number,
  repoRoot?: string,
): Promise<void> {
  const runtimeRoot = resolve(repoRoot ?? process.cwd(), "runtime-bevy");
  const captureBinary = resolveCaptureBinaryPath(repoRoot ?? process.cwd());
  const captureArgs = [resolve(bundlePath), cameraId, outputPath, String(captureFrame)];
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await rm(outputPath, { force: true });
      if (captureBinary !== undefined) {
        await captureBevyWithBinary(captureBinary, captureArgs, outputPath, {
          cwd: runtimeRoot,
          env: cargoCaptureEnv(),
          timeout: 300_000,
        });
      } else {
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
            ...captureArgs,
          ],
          {
            cwd: runtimeRoot,
            env: cargoCaptureEnv(),
            timeout: 300_000,
          },
        );
      }
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

async function captureBevyWithBinary(
  captureBinary: string,
  captureArgs: readonly string[],
  outputPath: string,
  options: { cwd: string; env: NodeJS.ProcessEnv; timeout: number },
): Promise<void> {
  await new Promise<void>((resolveCapture, rejectCapture) => {
    const child = spawn(captureBinary, [...captureArgs], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let poll: NodeJS.Timeout | undefined;
    let timeout: NodeJS.Timeout | undefined;
    const startedAt = Date.now();
    const finish = (error?: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      if (poll !== undefined) {
        clearInterval(poll);
      }
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
      if (error !== undefined) {
        rejectCapture(error);
      } else {
        resolveCapture();
      }
    };
    poll = setInterval(() => {
      assertScreenshotWritten(outputPath, "Bevy")
        .then(() => finish())
        .catch(() => {
          if (Date.now() - startedAt > options.timeout) {
            finish(new Error(`Bevy screenshot capture timed out after ${options.timeout}ms.`));
          }
        });
    }, 250);
    timeout = setTimeout(() => {
      finish(new Error(`Bevy screenshot capture timed out after ${options.timeout}ms.`));
    }, options.timeout);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => finish(error));
    child.on("exit", (code, signal) => {
      assertScreenshotWritten(outputPath, "Bevy")
        .then(() => finish())
        .catch((error: unknown) => {
          const message = error instanceof Error ? error.message : String(error);
          finish(
            new Error(
              `Bevy screenshot capture exited before writing a valid PNG (code ${code ?? "null"}, signal ${signal ?? "null"}): ${message}\n${stdout}${stderr}`,
            ),
          );
        });
    });
  });
}

async function assertScreenshotWritten(path: string, runtime: string): Promise<void> {
  const png = PNG.sync.read(await readFile(path));
  if (png.width <= 0 || png.height <= 0) {
    throw new Error(`${runtime} screenshot capture wrote an invalid PNG: ${path}`);
  }
  let peakLuma = 0;
  for (let index = 0; index < png.data.length; index += 4) {
    const red = png.data[index] ?? 0;
    const green = png.data[index + 1] ?? 0;
    const blue = png.data[index + 2] ?? 0;
    peakLuma = Math.max(peakLuma, Math.floor((red + green + blue) / 3));
  }
  if (peakLuma < 35) {
    throw new Error(`${runtime} screenshot capture wrote a blank/dark PNG: ${path}`);
  }
}

function isFrameTooDark(frame: IPixelFrame): boolean {
  let peakLuma = 0;
  for (let index = 0; index < frame.data.length; index += 4) {
    const red = frame.data[index] ?? 0;
    const green = frame.data[index + 1] ?? 0;
    const blue = frame.data[index + 2] ?? 0;
    peakLuma = Math.max(peakLuma, Math.floor((red + green + blue) / 3));
  }
  return peakLuma < 35;
}

function applyRegion(frame: IPixelFrame, region?: INormalizedRegion): IPixelFrame {
  if (region === undefined) {
    return frame;
  }
  return cropFrame(frame, absoluteRegion(frame, region));
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
