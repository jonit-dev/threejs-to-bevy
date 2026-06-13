import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank, compareFrames, defaultDiffThreshold, defaultNonblankThreshold, type IPixelFrame } from "./imageAnalysis.js";
import { likelyDiagnostic } from "./diagnostics.js";
import { reportStatus, type IVerificationDiagnostic, type IVerificationReport } from "./report.js";

export interface IPlaywrightVerifyOptions {
  artifactDir: string;
  expectedMotion: boolean;
  frames: number;
  previewUrl: string;
}

export async function verifyWebPreview(options: IPlaywrightVerifyOptions): Promise<IVerificationReport> {
  await mkdir(options.artifactDir, { recursive: true });

  const diagnostics: IVerificationDiagnostic[] = [];
  const browserLogs: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  const screenshots: string[] = [];
  const browser = await chromium.launch({ headless: true });

  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    page.on("console", (message) => {
      browserLogs.push(`${message.type()}: ${message.text()}`);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
    page.on("requestfailed", (request) => {
      requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`);
    });
    page.on("response", (response) => {
      if (response.status() >= 400) {
        requestFailures.push(`${response.status()} ${response.url()}`);
      }
    });
    try {
      await page.goto(options.previewUrl, { waitUntil: "domcontentloaded" });
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10000 });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      diagnostics.push(likelyDiagnostic("TN_VERIFY_PREVIEW_NOT_READY", `Preview did not reach runtime readiness: ${message}`, "runtime-web"));
      const screenshotPath = join(options.artifactDir, "failure-page.png");
      try {
        await page.screenshot({ path: screenshotPath });
        screenshots.push(screenshotPath);
      } catch {
        // Keep the original readiness failure as the actionable diagnostic.
      }
      return buildReport(options, diagnostics, screenshots, { browserLogs, pageErrors, requestFailures });
    }

    const runtimeReady = await page.evaluate("globalThis.__THREENATIVE_READY__") as unknown;

    const canvasInfo = await page.evaluate(`(() => {
      const canvas = document.querySelector("canvas");
      if (canvas === null) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return { height: Math.round(rect.height), width: Math.round(rect.width) };
    })()`) as { height: number; width: number } | null;

    if (canvasInfo === null) {
      diagnostics.push(likelyDiagnostic("TN_VERIFY_CANVAS_MISSING", "No canvas element was found in the web preview.", "runtime-web"));
      return buildReport(options, diagnostics, screenshots, { browserLogs, pageErrors, requestFailures, runtimeReady }, undefined);
    }

    const canvasOk = canvasInfo.width > 0 && canvasInfo.height > 0;
    if (!canvasOk) {
      diagnostics.push(
        likelyDiagnostic(
          "TN_VERIFY_CANVAS_EMPTY",
          `Canvas has non-renderable size ${canvasInfo.width}x${canvasInfo.height}.`,
          "camera/framing",
        ),
      );
    }

    const frameCount = Math.max(1, options.frames);
    for (let index = 0; index < frameCount; index += 1) {
      if (index > 0) {
        await page.waitForTimeout(250);
      }

      const screenshotPath = join(options.artifactDir, `frame-${String(index + 1).padStart(2, "0")}.png`);
      await page.screenshot({ path: screenshotPath });
      screenshots.push(screenshotPath);
    }

    const pixelFrames = await Promise.all(screenshots.map((path) => readPngFrame(path)));
    const checks: IVerificationReport["checks"] = {
      canvas: { ...canvasInfo, ok: canvasOk },
    };

    const firstFrame = pixelFrames[0];
    if (firstFrame === undefined) {
      diagnostics.push(likelyDiagnostic("TN_VERIFY_PIXELS_UNREADABLE", "Could not read canvas pixels for visual analysis.", "runtime-web"));
    } else {
      const nonblank = analyzeNonblank(firstFrame, defaultNonblankThreshold);
      checks.nonblank = nonblank;
      if (!nonblank.ok) {
        diagnostics.push(likelyDiagnostic("TN_VERIFY_SCREENSHOT_BLANK", "Rendered canvas appears blank or near-blank.", "camera/framing"));
      }
    }

    const secondFrame = pixelFrames[1];
    if (firstFrame !== undefined && secondFrame !== undefined) {
      const frameDiff = compareFrames(firstFrame, secondFrame, defaultDiffThreshold);
      checks.frameDiff = {
        ...frameDiff,
        expectedMotion: options.expectedMotion,
        ok: options.expectedMotion ? frameDiff.ok : true,
      };
      if (options.expectedMotion && !frameDiff.ok) {
        diagnostics.push(likelyDiagnostic("TN_VERIFY_FRAME_FROZEN", "Expected visual motion, but captured frames did not change.", "runtime-web"));
      }
    }

    const effectLogPath = join(options.artifactDir, "web-effect-log.json");
    const effectLog = await page.evaluate("globalThis.__THREENATIVE_EFFECT_LOG__") as unknown;
    if (effectLog !== undefined && effectLog !== null) {
      await writeFile(effectLogPath, `${JSON.stringify(effectLog, null, 2)}\n`);
    }

    return buildReport(options, diagnostics, screenshots, { browserLogs, pageErrors, requestFailures, runtimeReady }, checks, effectLog === undefined || effectLog === null ? undefined : effectLogPath);
  } finally {
    await browser.close();
  }
}

function buildReport(
  options: IPlaywrightVerifyOptions,
  diagnostics: IVerificationDiagnostic[],
  screenshots: string[],
  debug: IVerificationReport["debug"],
  checks: IVerificationReport["checks"] = {},
  effectLogPath?: string,
): IVerificationReport {
  const reportPath = join(options.artifactDir, "verification-report.json");
  return {
    artifacts: {
      ...(effectLogPath === undefined ? {} : { effectLogPath }),
      reportPath,
      screenshots,
    },
    checks,
    debug,
    diagnostics,
    previewUrl: options.previewUrl,
    status: reportStatus(diagnostics),
    thresholds: {
      diffChangedPixelRatio: defaultDiffThreshold,
      nonblankChangedPixelRatio: defaultNonblankThreshold,
    },
  };
}
