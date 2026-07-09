import { access, copyFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";
import { buildProofArtifactMetadata, type IProofArtifactMetadata } from "../game/proofManifest.js";
import { readPngFrame } from "../verify/compareImages.js";
import { analyzeNonblank, defaultNonblankThreshold } from "../verify/imageAnalysis.js";

const execFileAsync = promisify(execFile);
const defaultViewport = { height: 720, width: 1280 };
const mobileViewport = { height: 844, width: 390 };
const defaultRecordSeconds = 10;
const maxRecordSeconds = 59;
type VisualViewport = typeof defaultViewport;

export interface IVisualProofDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
}

export interface IVisualProofReport {
  byteSize: number;
  capturedAt: string;
  command?: readonly string[];
  diagnostics?: IVisualProofDiagnostic[];
  page?: {
    browserLogs: string[];
    errors: string[];
    requestFailures: string[];
  };
  outPath: string;
  proofMetadata?: IProofArtifactMetadata;
  runtimeReady: unknown;
  url: string;
  viewport: VisualViewport;
}

export interface IScreenshotProofReport extends IVisualProofReport {
  checks: {
    canvas?: { height: number; ok: boolean; width: number };
    nonblank?: ReturnType<typeof analyzeNonblank>;
    resourceFailures?: unknown[];
    visibleMeshCount?: number;
  };
  dimensions?: { height: number; width: number };
}

type RecordPreviewReport = Awaited<ReturnType<typeof recordPreview>>;

export interface IRecordCommandOptions {
  recorder?: (options: { inputScript?: IRecordInputScript; outPath: string; seconds: number; url: string }) => Promise<RecordPreviewReport>;
}

export async function screenshotCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd()): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const url = flagValue(normalizedArgv, "--url");
  const outArg = flagValue(normalizedArgv, "--out");
  const waitReady = normalizedArgv.includes("--wait-ready");
  const project = flagValue(normalizedArgv, "--project");
  const viewportArg = flagValue(normalizedArgv, "--viewport");
  const baseCwd = project === undefined ? cwd : resolvePath(cwd, project);

  if (url === undefined || outArg === undefined) {
    return diagnosticResult(
      { code: "TN_SCREENSHOT_USAGE", message: "Usage: tn screenshot [--project <path>] --url <preview-url> --out <file.png> [--wait-ready] [--viewport desktop|mobile|<width>x<height>] [--json]" },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const viewport = parseViewportFlag(viewportArg);
  if ("diagnostic" in viewport) {
    return diagnosticResult(viewport.diagnostic, { exitCode: 1, json, stderr: !json });
  }

  const outPath = resolvePath(baseCwd, outArg);
  if (extname(outPath).toLowerCase() !== ".png") {
    return diagnosticResult(
      { code: "TN_SCREENSHOT_OUT_EXTENSION", message: "Screenshot output must use a .png extension.", out: outPath },
      { exitCode: 1, json, stderr: !json },
    );
  }

  try {
    const report = await captureScreenshot({ command: normalizedArgv, outPath, url, viewport: viewport.value, waitReady });
    const reportWithMetadata = {
      ...report,
      proofMetadata: await buildProofArtifactMetadata({
        commandParameters: { command: "tn screenshot", out: outArg, url, viewport: viewportArg ?? "desktop", waitReady },
        projectPath: baseCwd,
      }),
    };
    const hasErrors = report.diagnostics?.some((diagnostic) => diagnostic.severity === "error") ?? false;
    return {
      exitCode: hasErrors ? 1 : 0,
      stdout: json
        ? `${JSON.stringify({ code: hasErrors ? "TN_SCREENSHOT_FAILED" : "TN_SCREENSHOT_OK", ...reportWithMetadata }, null, 2)}\n`
        : `Screenshot captured.\nOutput: ${reportWithMetadata.outPath}\nBytes: ${reportWithMetadata.byteSize}\n`,
    };
  } catch (error) {
    return diagnosticResult({ code: "TN_SCREENSHOT_FAILED", message: errorMessage(error) }, { exitCode: 1, json, stderr: !json });
  }
}

export async function recordCommand(argv: readonly string[], cwd = process.env.INIT_CWD ?? process.cwd(), options: IRecordCommandOptions = {}): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const url = flagValue(normalizedArgv, "--url");
  const outArg = flagValue(normalizedArgv, "--out");
  const seconds = readDurationFlag(normalizedArgv, defaultRecordSeconds);
  const inputScriptArg = flagValue(normalizedArgv, "--input-script");
  const project = flagValue(normalizedArgv, "--project");
  const baseCwd = project === undefined ? cwd : resolvePath(cwd, project);

  if (url === undefined || outArg === undefined) {
    return diagnosticResult(
      { code: "TN_RECORD_USAGE", message: "Usage: tn record [--project <path>] --url <preview-url> --out <file.webm|file.mp4> [--duration <seconds>|--seconds <seconds>] [--input-script <path|default|none>] [--json]" },
      { exitCode: 1, json, stderr: !json },
    );
  }

  const outPath = resolvePath(baseCwd, outArg);
  const extension = extname(outPath).toLowerCase();
  if (extension !== ".webm" && extension !== ".mp4") {
    return diagnosticResult(
      { code: "TN_RECORD_OUT_EXTENSION", message: "Recording output must use a .webm or .mp4 extension.", out: outPath },
      { exitCode: 1, json, stderr: !json },
    );
  }

  try {
    const inputScript = await resolveRecordInputScript(inputScriptArg, baseCwd);
    const recorder = options.recorder ?? recordPreview;
    const report = await recorder({ inputScript, outPath, seconds, url });
    const reportWithMetadata = {
      ...report,
      proofMetadata: await buildProofArtifactMetadata({
        commandParameters: { command: "tn record", durationSeconds: seconds, inputScript: report.inputScript, out: outArg, url },
        projectPath: baseCwd,
      }),
    };
    return {
      exitCode: 0,
      stdout: json
        ? `${JSON.stringify({ code: "TN_RECORD_OK", ...reportWithMetadata }, null, 2)}\n`
        : `Recording captured.\nOutput: ${reportWithMetadata.outPath}\nFormat: ${reportWithMetadata.format}\nSeconds: ${reportWithMetadata.seconds}\nFPS: ${reportWithMetadata.fps}\nBytes: ${reportWithMetadata.byteSize}\n`,
    };
  } catch (error) {
    return diagnosticResult({ code: "TN_RECORD_UNAVAILABLE", message: errorMessage(error) }, { exitCode: 1, json, stderr: !json });
  }
}

export async function captureScreenshot(options: { command?: readonly string[]; outPath: string; settleMs?: number; url: string; viewport?: VisualViewport; waitReady?: boolean }): Promise<IScreenshotProofReport> {
  await mkdir(dirname(options.outPath), { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const viewport = options.viewport ?? defaultViewport;
  let runtimeReady: unknown = null;
  const diagnostics: IVisualProofDiagnostic[] = [];
  const browserLogs: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];
  let canvasInfo: { height: number; width: number } | null = null;
  try {
    const page = await browser.newPage({ viewport });
    page.on("console", (message) => browserLogs.push(`${message.type()}: ${message.text()}`));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    page.on("requestfailed", (request) => requestFailures.push(`${request.method()} ${request.url()} ${request.failure()?.errorText ?? "failed"}`));
    page.on("response", (response) => {
      if (response.status() >= 400) {
        requestFailures.push(`${response.status()} ${response.url()}`);
      }
    });
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    if (options.waitReady === true) {
      try {
        await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__)", undefined, { timeout: 10000 });
      } catch (error) {
        diagnostics.push({ code: "TN_SCREENSHOT_RUNTIME_READY_MISSING", message: `Runtime readiness was not exposed: ${errorMessage(error)}.`, severity: "error" });
      }
    } else {
      await waitForVisualReadiness(page);
    }
    runtimeReady = await readRuntimeReady(page);
    collectRuntimeReadyDiagnostics(runtimeReady, diagnostics);
    canvasInfo = await readCanvasInfo(page);
    if (canvasInfo === null) {
      diagnostics.push({ code: "TN_SCREENSHOT_CANVAS_MISSING", message: "No canvas element was found in the preview page.", severity: "error" });
    } else if (canvasInfo.width <= 0 || canvasInfo.height <= 0) {
      diagnostics.push({ code: "TN_SCREENSHOT_CANVAS_EMPTY", message: `Canvas has non-renderable size ${canvasInfo.width}x${canvasInfo.height}.`, severity: "error" });
    }
    if (options.settleMs !== undefined && options.settleMs > 0) {
      await page.waitForTimeout(options.settleMs);
    }
    await page.screenshot({ fullPage: false, path: options.outPath });
  } finally {
    await browser.close();
  }
  const info = await stat(options.outPath);
  const checks: IScreenshotProofReport["checks"] = {};
  if (canvasInfo !== null) {
    checks.canvas = { ...canvasInfo, ok: canvasInfo.width > 0 && canvasInfo.height > 0 };
  }
  try {
    const frame = await readPngFrame(options.outPath);
    const nonblank = analyzeNonblank(frame, defaultNonblankThreshold);
    checks.nonblank = nonblank;
    if (!nonblank.ok) {
      diagnostics.push({ code: "TN_SCREENSHOT_BLANK", message: "Captured screenshot appears blank or near-blank.", severity: "error" });
    }
  } catch (error) {
    diagnostics.push({ code: "TN_SCREENSHOT_PIXELS_UNREADABLE", message: `Could not inspect captured screenshot pixels: ${errorMessage(error)}.`, severity: "warning" });
  }
  const runtimeDiagnostics = runtimeReadyDiagnostics(runtimeReady);
  if (runtimeDiagnostics.visibleMeshCount !== undefined) {
    checks.visibleMeshCount = runtimeDiagnostics.visibleMeshCount;
  }
  if (runtimeDiagnostics.resourceFailures.length > 0) {
    checks.resourceFailures = runtimeDiagnostics.resourceFailures;
  }
  return {
    byteSize: info.size,
    capturedAt: new Date().toISOString(),
    command: options.command,
    checks,
    diagnostics,
    dimensions: canvasInfo ?? viewport,
    outPath: options.outPath,
    page: { browserLogs, errors: pageErrors, requestFailures },
    runtimeReady,
    url: options.url,
    viewport,
  };
}

export interface IRecordInputScript {
  kind: "default" | "file" | "none";
  path?: string;
  source?: string;
}

export async function recordPreview(options: { inputScript?: IRecordInputScript; outPath: string; seconds: number; url: string }): Promise<IVisualProofReport & { format: "mp4" | "webm"; fps: number; inputScript: { kind: IRecordInputScript["kind"]; path?: string }; seconds: number }> {
  const seconds = clampRecordSeconds(options.seconds);
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
    await applyRecordInputScript(page, options.inputScript ?? { kind: "default" }, seconds);
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
    return visualProofReport({ byteSize: info.size, format: "webm", inputScript: options.inputScript ?? { kind: "default" }, outPath: options.outPath, runtimeReady, seconds, url: options.url });
  }

  if (!(await commandExists("ffmpeg"))) {
    await rm(videoDir, { force: true, recursive: true });
    throw new Error("MP4 output requires ffmpeg on PATH. Use --out <file.webm> or install ffmpeg.");
  }

  await execFileAsync("ffmpeg", ["-y", "-i", rawVideoPath, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart", options.outPath]);
  await rm(videoDir, { force: true, recursive: true });
  const info = await stat(options.outPath);
  return visualProofReport({ byteSize: info.size, format: "mp4", inputScript: options.inputScript ?? { kind: "default" }, outPath: options.outPath, runtimeReady, seconds, url: options.url });
}

function visualProofReport(options: {
  byteSize: number;
  format: "mp4" | "webm";
  inputScript: IRecordInputScript;
  outPath: string;
  runtimeReady: unknown;
  seconds: number;
  url: string;
}): IVisualProofReport & { format: "mp4" | "webm"; fps: number; inputScript: { kind: IRecordInputScript["kind"]; path?: string }; seconds: number } {
  return {
    byteSize: options.byteSize,
    capturedAt: new Date().toISOString(),
    command: ["tn", "record", "--url", options.url, "--out", options.outPath, "--duration", String(options.seconds)],
    fps: 30,
    format: options.format,
    inputScript: { kind: options.inputScript.kind, ...(options.inputScript.path === undefined ? {} : { path: options.inputScript.path }) },
    outPath: options.outPath,
    runtimeReady: options.runtimeReady,
    seconds: options.seconds,
    url: options.url,
    viewport: defaultViewport,
  };
}

function parseViewportFlag(value: string | undefined): { value: VisualViewport } | { diagnostic: { code: string; message: string; viewport?: string } } {
  if (value === undefined || value === "desktop") {
    return { value: defaultViewport };
  }
  if (value === "mobile") {
    return { value: mobileViewport };
  }
  const match = /^(\d{2,5})x(\d{2,5})$/i.exec(value);
  if (match === null) {
    return {
      diagnostic: {
        code: "TN_SCREENSHOT_VIEWPORT_INVALID",
        message: "--viewport must be 'desktop', 'mobile', or '<width>x<height>' such as 390x844.",
        viewport: value,
      },
    };
  }
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 100 || height < 100 || width > 8192 || height > 8192) {
    return {
      diagnostic: {
        code: "TN_SCREENSHOT_VIEWPORT_INVALID",
        message: "--viewport width and height must be integers between 100 and 8192.",
        viewport: value,
      },
    };
  }
  return { value: { height, width } };
}

async function readRuntimeReady(page: { evaluate: (expression: string) => Promise<unknown> }): Promise<unknown> {
  try {
    return await page.evaluate("globalThis.__THREENATIVE_READY__ ?? null");
  } catch {
    return null;
  }
}

async function readCanvasInfo(page: { evaluate: (expression: string) => Promise<unknown> }): Promise<{ height: number; width: number } | null> {
  return await page.evaluate(`(() => {
    const canvas = document.querySelector("canvas");
    if (canvas === null) return null;
    const rect = canvas.getBoundingClientRect();
    return { height: Math.round(rect.height), width: Math.round(rect.width) };
  })()`) as { height: number; width: number } | null;
}

function collectRuntimeReadyDiagnostics(runtimeReady: unknown, diagnostics: IVisualProofDiagnostic[]): void {
  const ready = isRecord(runtimeReady) ? runtimeReady : {};
  if (ready.ok === false) {
    diagnostics.push({ code: "TN_SCREENSHOT_RUNTIME_ERROR", message: "Runtime readiness payload reports ok=false.", severity: "error" });
  }
  const embeddedDiagnostics = Array.isArray(ready.diagnostics) ? ready.diagnostics : [];
  for (const diagnostic of embeddedDiagnostics) {
    if (isRecord(diagnostic) && diagnostic.severity === "error") {
      diagnostics.push({ code: "TN_SCREENSHOT_RUNTIME_ERROR", message: String(diagnostic.message ?? diagnostic.code ?? "Runtime diagnostic reported an error."), severity: "error" });
    }
  }
  const runtime = runtimeReadyDiagnostics(runtimeReady);
  if (runtime.resourceFailures.length > 0) {
    diagnostics.push({ code: "TN_SCREENSHOT_RESOURCE_FAILURES", message: `Runtime reported ${runtime.resourceFailures.length} failed resources.`, severity: "error" });
  }
  if (runtime.visibleMeshCount !== undefined && runtime.visibleMeshCount <= 0) {
    diagnostics.push({ code: "TN_SCREENSHOT_VISIBLE_MESH_MISSING", message: "Runtime reports zero visible meshes.", severity: "error" });
  }
}

function runtimeReadyDiagnostics(runtimeReady: unknown): { resourceFailures: unknown[]; visibleMeshCount?: number } {
  const ready = isRecord(runtimeReady) ? runtimeReady : {};
  const runtimeDiagnostics = isRecord(ready.runtimeDiagnostics) ? ready.runtimeDiagnostics : undefined;
  const assets = isRecord(runtimeDiagnostics?.assets) ? runtimeDiagnostics.assets : undefined;
  const scene = isRecord(runtimeDiagnostics?.scene) ? runtimeDiagnostics.scene : undefined;
  const resourceFailures = Array.isArray(assets?.resourceFailures) ? assets.resourceFailures : [];
  const visibleMeshCount = typeof scene?.visibleMeshCount === "number" ? scene.visibleMeshCount : undefined;
  return { resourceFailures, visibleMeshCount };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function resolveRecordInputScript(inputScriptArg: string | undefined, cwd: string): Promise<IRecordInputScript> {
  if (inputScriptArg === undefined || inputScriptArg === "default") {
    return { kind: "default" };
  }
  if (inputScriptArg === "none") {
    return { kind: "none" };
  }
  const path = resolvePath(cwd, inputScriptArg);
  return { kind: "file", path, source: await readFile(path, "utf8") };
}

async function applyRecordInputScript(
  page: {
    evaluate: (expression: string, arg?: unknown) => Promise<unknown>;
    keyboard: {
      down: (key: string) => Promise<void>;
      press: (key: string) => Promise<void>;
      up: (key: string) => Promise<void>;
    };
    waitForTimeout: (milliseconds: number) => Promise<void>;
  },
  inputScript: IRecordInputScript,
  seconds: number,
): Promise<void> {
  if (inputScript.kind === "none") {
    return;
  }
  if (inputScript.kind === "file") {
    await page.evaluate("(source) => { const fn = new Function(source); fn(); }", inputScript.source ?? "");
    return;
  }

  const firstLegMs = Math.max(250, Math.min(1500, Math.floor(seconds * 250)));
  await page.keyboard.down("w");
  await page.waitForTimeout(firstLegMs);
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(150);
  await page.keyboard.up("ArrowLeft");
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(150);
  await page.keyboard.up("ArrowRight");
  await page.keyboard.press("Space");
  await page.keyboard.up("w");
}

async function waitForVisualReadiness(page: { waitForFunction: (expression: string, arg?: unknown, options?: { timeout?: number }) => Promise<unknown>; waitForTimeout: (milliseconds: number) => Promise<void> }): Promise<void> {
  try {
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__) || document.querySelector('canvas') !== null", undefined, { timeout: 2000 });
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

function readDurationFlag(argv: readonly string[], fallback: number): number {
  const raw = flagValue(argv, "--duration") ?? flagValue(argv, "--seconds");
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? clampRecordSeconds(parsed) : fallback;
}

function clampRecordSeconds(seconds: number): number {
  return Math.max(1, Math.min(maxRecordSeconds, Math.round(seconds)));
}

function resolvePath(cwd: string, path: string): string {
  return isAbsolute(path) ? path : resolve(cwd, path);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
