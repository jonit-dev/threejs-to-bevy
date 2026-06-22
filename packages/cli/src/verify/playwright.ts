import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright";

import { captureScreenshot, type IVisualProofDiagnostic } from "../commands/visualProof.js";
import { readPngFrame } from "./compareImages.js";
import { analyzeNonblank, analyzeProjectedBounds, compareFrames, defaultDiffThreshold, defaultNonblankThreshold, type IPixelFrame } from "./imageAnalysis.js";
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

  if (options.frames <= 1 && !options.expectedMotion) {
    return verifySingleFrameWithSharedCapture(options);
  }

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
      checks.projectedBounds = analyzeProjectedBounds(firstFrame, defaultNonblankThreshold);
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

async function verifySingleFrameWithSharedCapture(options: IPlaywrightVerifyOptions): Promise<IVerificationReport> {
  const screenshotPath = join(options.artifactDir, "frame-01.png");
  const capture = await captureScreenshot({
    command: ["tn", "verify", "--url", options.previewUrl, "--frames", "1"],
    outPath: screenshotPath,
    url: options.previewUrl,
    waitReady: true,
  });
  const diagnostics = capture.diagnostics?.map(verificationDiagnosticFromScreenshot) ?? [];
  const checks: IVerificationReport["checks"] = {};
  if (capture.checks.canvas !== undefined) {
    checks.canvas = capture.checks.canvas;
  }
  if (capture.checks.nonblank !== undefined) {
    checks.nonblank = capture.checks.nonblank;
    try {
      checks.projectedBounds = analyzeProjectedBounds(await readPngFrame(screenshotPath), defaultNonblankThreshold);
    } catch {
      diagnostics.push(likelyDiagnostic("TN_VERIFY_PIXELS_UNREADABLE", "Could not read canvas pixels for projected bounds analysis.", "runtime-web"));
    }
  }

  return buildReport(
    options,
    diagnostics,
    [screenshotPath],
    {
      browserLogs: capture.page?.browserLogs ?? [],
      pageErrors: capture.page?.errors ?? [],
      requestFailures: capture.page?.requestFailures ?? [],
      runtimeReady: capture.runtimeReady,
    },
    checks,
  );
}

function verificationDiagnosticFromScreenshot(diagnostic: IVisualProofDiagnostic): IVerificationDiagnostic {
  const codeMap: Record<string, string> = {
    TN_SCREENSHOT_BLANK: "TN_VERIFY_SCREENSHOT_BLANK",
    TN_SCREENSHOT_CANVAS_EMPTY: "TN_VERIFY_CANVAS_EMPTY",
    TN_SCREENSHOT_CANVAS_MISSING: "TN_VERIFY_CANVAS_MISSING",
    TN_SCREENSHOT_PIXELS_UNREADABLE: "TN_VERIFY_PIXELS_UNREADABLE",
    TN_SCREENSHOT_RESOURCE_FAILURES: "TN_VERIFY_RESOURCE_FAILURES",
    TN_SCREENSHOT_RUNTIME_ERROR: "TN_VERIFY_RUNTIME_ERROR",
    TN_SCREENSHOT_RUNTIME_READY_MISSING: "TN_VERIFY_PREVIEW_NOT_READY",
    TN_SCREENSHOT_VISIBLE_MESH_MISSING: "TN_VERIFY_VISIBLE_MESH_MISSING",
  };
  const area = diagnostic.code.includes("CANVAS") || diagnostic.code.includes("BLANK") ? "camera/framing" : "runtime-web";
  return likelyDiagnostic(codeMap[diagnostic.code] ?? diagnostic.code.replace("TN_SCREENSHOT_", "TN_VERIFY_"), diagnostic.message, area);
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
