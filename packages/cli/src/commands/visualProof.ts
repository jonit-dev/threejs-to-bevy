import { access, copyFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

const execFileAsync = promisify(execFile);
const defaultViewport = { height: 720, width: 1280 };

interface IVisualProofReport {
  byteSize: number;
  capturedAt: string;
  outPath: string;
  runtimeReady: unknown;
  url: string;
  viewport: typeof defaultViewport;
}

export async function screenshotCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const url = flagValue(normalizedArgv, "--url");
  const outArg = flagValue(normalizedArgv, "--out");

  if (url === undefined || outArg === undefined) {
    return diagnosticResult(
      { code: "TN_SCREENSHOT_USAGE", message: "Usage: tn screenshot --url <preview-url> --out <file.png> [--json]" },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const outPath = resolvePath(cwd, outArg);
  if (extname(outPath).toLowerCase() !== ".png") {
    return diagnosticResult(
      { code: "TN_SCREENSHOT_OUT_EXTENSION", message: "Screenshot output must use a .png extension.", out: outPath },
      { exitCode: 1, json, stderr: !json },
    );
  }

  try {
    const report = await captureScreenshot({ outPath, url });
    return {
      exitCode: 0,
      stdout: json
        ? `${JSON.stringify({ code: "TN_SCREENSHOT_OK", ...report }, null, 2)}\n`
        : `Screenshot captured.\nOutput: ${report.outPath}\nBytes: ${report.byteSize}\n`,
    };
  } catch (error) {
    return diagnosticResult({ code: "TN_SCREENSHOT_FAILED", message: errorMessage(error) }, { exitCode: 1, json, stderr: !json });
  }
}

export async function recordCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const url = flagValue(normalizedArgv, "--url");
  const outArg = flagValue(normalizedArgv, "--out");
  const seconds = readNumberFlag(normalizedArgv, "--seconds", 3);

  if (url === undefined || outArg === undefined) {
    return diagnosticResult(
      { code: "TN_RECORD_USAGE", message: "Usage: tn record --url <preview-url> --out <file.webm|file.mp4> [--seconds <n>] [--json]" },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const outPath = resolvePath(cwd, outArg);
  const extension = extname(outPath).toLowerCase();
  if (extension !== ".webm" && extension !== ".mp4") {
    return diagnosticResult(
      { code: "TN_RECORD_OUT_EXTENSION", message: "Recording output must use a .webm or .mp4 extension.", out: outPath },
      { exitCode: 1, json, stderr: !json },
    );
  }

  try {
    const report = await recordPreview({ outPath, seconds, url });
    return {
      exitCode: 0,
      stdout: json
        ? `${JSON.stringify({ code: "TN_RECORD_OK", ...report }, null, 2)}\n`
        : `Recording captured.\nOutput: ${report.outPath}\nFormat: ${report.format}\nSeconds: ${report.seconds}\nBytes: ${report.byteSize}\n`,
    };
  } catch (error) {
    return diagnosticResult({ code: "TN_RECORD_FAILED", message: errorMessage(error) }, { exitCode: 1, json, stderr: !json });
  }
}

export async function captureScreenshot(options: { outPath: string; url: string }): Promise<IVisualProofReport> {
  await mkdir(dirname(options.outPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let runtimeReady: unknown = null;
  try {
    const page = await browser.newPage({ viewport: defaultViewport });
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await waitForVisualReadiness(page);
    runtimeReady = await readRuntimeReady(page);
    await page.screenshot({ fullPage: false, path: options.outPath });
  } finally {
    await browser.close();
  }
  const info = await stat(options.outPath);
  return {
    byteSize: info.size,
    capturedAt: new Date().toISOString(),
    outPath: options.outPath,
    runtimeReady,
    url: options.url,
    viewport: defaultViewport,
  };
}

export async function recordPreview(options: { outPath: string; seconds: number; url: string }): Promise<IVisualProofReport & { format: "mp4" | "webm"; seconds: number }> {
  const seconds = Math.max(1, Math.min(60, Math.round(options.seconds)));
  await mkdir(dirname(options.outPath), { recursive: true });
  const videoDir = resolve(dirname(options.outPath), `.tn-record-${Date.now()}`);
  await mkdir(videoDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  let rawVideoPath: string | undefined;
  let runtimeReady: unknown = null;
  try {
    const context = await browser.newContext({ recordVideo: { dir: videoDir, size: defaultViewport }, viewport: defaultViewport });
    const page = await context.newPage();
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    await waitForVisualReadiness(page);
    runtimeReady = await readRuntimeReady(page);
    await page.waitForTimeout(seconds * 1000);
    rawVideoPath = await page.video()?.path();
    await context.close();
  } finally {
    await browser.close();
  }

  if (rawVideoPath === undefined) {
    throw new Error("Playwright did not produce a browser video artifact.");
  }

  if (extname(options.outPath).toLowerCase() === ".webm") {
    await replaceFile(rawVideoPath, options.outPath);
    await rm(videoDir, { force: true, recursive: true });
    const info = await stat(options.outPath);
    return visualProofReport({ byteSize: info.size, format: "webm", outPath: options.outPath, runtimeReady, seconds, url: options.url });
  }

  if (!(await commandExists("ffmpeg"))) {
    await rm(videoDir, { force: true, recursive: true });
    throw new Error("MP4 output requires ffmpeg on PATH. Use --out <file.webm> or install ffmpeg.");
  }

  await execFileAsync("ffmpeg", ["-y", "-i", rawVideoPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", options.outPath]);
  await rm(videoDir, { force: true, recursive: true });
  const info = await stat(options.outPath);
  return visualProofReport({ byteSize: info.size, format: "mp4", outPath: options.outPath, runtimeReady, seconds, url: options.url });
}

function visualProofReport(options: {
  byteSize: number;
  format: "mp4" | "webm";
  outPath: string;
  runtimeReady: unknown;
  seconds: number;
  url: string;
}): IVisualProofReport & { format: "mp4" | "webm"; seconds: number } {
  return {
    byteSize: options.byteSize,
    capturedAt: new Date().toISOString(),
    format: options.format,
    outPath: options.outPath,
    runtimeReady: options.runtimeReady,
    seconds: options.seconds,
    url: options.url,
    viewport: defaultViewport,
  };
}

async function readRuntimeReady(page: { evaluate: (expression: string) => Promise<unknown> }): Promise<unknown> {
  try {
    return await page.evaluate("globalThis.__THREENATIVE_READY__ ?? null");
  } catch {
    return null;
  }
}

async function waitForVisualReadiness(page: { waitForFunction: (expression: string, arg?: unknown, options?: { timeout?: number }) => Promise<unknown>; waitForTimeout: (milliseconds: number) => Promise<void> }): Promise<void> {
  try {
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__) || document.querySelector('canvas') !== null", undefined, { timeout: 10000 });
  } catch {
    // Plain web pages may not expose the ThreeNative ready flag or a canvas. Capture the loaded page anyway.
  }
  await page.waitForTimeout(250);
}

async function replaceFile(from: string, to: string): Promise<void> {
  try {
    await rm(to, { force: true });
    await rename(from, to);
  } catch {
    await copyFile(from, to);
  }
}

async function commandExists(command: string): Promise<boolean> {
  try {
    await access(`/usr/bin/${command}`);
    return true;
  } catch {
    try {
      await execFileAsync("sh", ["-c", `command -v ${command}`]);
      return true;
    } catch {
      return false;
    }
  }
}

function flagValue(argv: readonly string[], flag: string): string | undefined {
  const index = argv.indexOf(flag);
  return index === -1 ? undefined : argv[index + 1];
}

function readNumberFlag(argv: readonly string[], flag: string, fallback: number): number {
  const raw = flagValue(argv, flag);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
