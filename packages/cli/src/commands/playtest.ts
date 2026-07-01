import { mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { startWebPreview, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { chromium } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

declare global {
  // Browser preview global exposed by @threenative/runtime-web-three.
  // The CLI reads it through Playwright to verify gameplay effects.
  var __THREENATIVE_EFFECT_LOG__: unknown;
}

type Vec3 = [number, number, number];

interface IPlaytestDiagnostic {
  code: string;
  message: string;
  severity: "error" | "warning";
  suggestion?: string;
}

interface ITransformSample {
  frame: number;
  position: Vec3;
  tick: number;
}

export interface IPlaytestReport {
  after?: ITransformSample;
  artifact?: string;
  before?: ITransformSample;
  diagnostics: IPlaytestDiagnostic[];
  distance: number;
  entity: string;
  expectMoved: boolean;
  frames: number;
  input: string;
  movementThreshold: number;
  pass: boolean;
  runtime: "web";
  url?: string;
}

export interface IPlaytestCommandOptions {
  runner?: (options: { entityId: string; expectMoved: boolean; frames: number; movementThreshold: number; press: string; projectPath: string }) => Promise<IPlaytestReport>;
}

export async function playtestCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IPlaytestCommandOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const json = normalizedArgv.includes("--json");
  const projectPath = resolvePath(cwd, readFlag(normalizedArgv, "--project") ?? ".");
  const entityId = readFlag(normalizedArgv, "--entity");
  const press = readFlag(normalizedArgv, "--press") ?? readFlag(normalizedArgv, "--input");
  const frames = readPositiveInteger(readFlag(normalizedArgv, "--frames"), 60);
  const movementThreshold = readPositiveNumber(readFlag(normalizedArgv, "--movement-threshold"), 0.01);
  const expectMoved = normalizedArgv.includes("--expect-moved");

  if (entityId === undefined || press === undefined) {
    return diagnosticResult(
      {
        code: "TN_PLAYTEST_USAGE",
        message: "Usage: tn playtest --project <path> --entity <id> --press <KeyboardEvent.code> --frames <n> [--expect-moved] [--json]",
      },
      { exitCode: 2, json, stderr: !json },
    );
  }

  try {
    const runner = options.runner ?? runWebPlaytest;
    const report = await runner({ entityId, expectMoved, frames, movementThreshold, press, projectPath });
    const code = report.pass ? "TN_PLAYTEST_OK" : "TN_PLAYTEST_FAILED";
    return {
      exitCode: report.pass ? 0 : 1,
      stdout: json
        ? `${JSON.stringify({ code, ...report }, null, 2)}\n`
        : `${report.pass ? "Playtest passed" : "Playtest failed"}: ${report.entity} moved ${report.distance.toFixed(4)} units.\n`,
    };
  } catch (error) {
    return diagnosticResult(
      {
        code: error instanceof BrowserUnavailableError ? "TN_PLAYTEST_BROWSER_UNAVAILABLE" : "TN_PLAYTEST_FAILED",
        message: error instanceof Error ? error.message : String(error),
      },
      { exitCode: 1, json, stderr: !json },
    );
  }
}

async function runWebPlaytest(options: { entityId: string; expectMoved: boolean; frames: number; movementThreshold: number; press: string; projectPath: string }): Promise<IPlaytestReport> {
  const bundlePath = await ensureProjectBundle(options.projectPath);
  let server: IWebPreviewServer | undefined;
  try {
    server = await startWebPreview({ bundlePath });
    return await probePreview({ ...options, url: server.url });
  } finally {
    await server?.close();
  }
}

async function probePreview(options: { entityId: string; expectMoved: boolean; frames: number; movementThreshold: number; press: string; projectPath: string; url: string }): Promise<IPlaytestReport> {
  const diagnostics: IPlaytestDiagnostic[] = [];
  const artifact = resolve(options.projectPath, "artifacts", "playtest", `${safeFilePart(options.entityId)}-${safeFilePart(options.press)}.png`);
  await mkdir(dirname(artifact), { recursive: true });
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    throw new BrowserUnavailableError(error instanceof Error ? error.message : String(error));
  }
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(options.url, { waitUntil: "domcontentloaded" });
    try {
      await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__?.ok)", undefined, { timeout: 10000 });
    } catch {
      diagnostics.push({
        code: "TN_PLAYTEST_RUNTIME_NOT_READY",
        message: "Web runtime did not expose a ready state before playtest input.",
        severity: "error",
        suggestion: "Run tn verify --json or inspect preview runtime diagnostics before playtesting.",
      });
    }
    await page.waitForTimeout(120);
    const before = latestTransformSample(await readEffectLog(page), options.entityId);
    await page.keyboard.down(options.press);
    await page.waitForTimeout(Math.max(1, options.frames) * (1000 / 60));
    await page.keyboard.up(options.press);
    await page.waitForTimeout(1100);
    const after = latestTransformSample(await readEffectLog(page), options.entityId);
    await page.screenshot({ path: artifact });
    const artifactSize = await stat(artifact);
    if (artifactSize.size === 0) {
      diagnostics.push({ code: "TN_PLAYTEST_SCREENSHOT_EMPTY", message: "Playtest screenshot artifact is empty.", severity: "warning" });
    }
    if (before === undefined || after === undefined) {
      diagnostics.push({
        code: "TN_PLAYTEST_ENTITY_NOT_FOUND",
        message: `No Transform patch evidence was found for entity '${options.entityId}'.`,
        severity: "error",
        suggestion: "Check the entity id and ensure an update/fixedUpdate system writes its Transform during the playtest.",
      });
    }
    const distance = before === undefined || after === undefined ? 0 : distance3(before.position, after.position);
    if (options.expectMoved && distance <= options.movementThreshold) {
      diagnostics.push({
        code: "TN_PLAYTEST_INPUT_NO_EFFECT",
        message: `Entity '${options.entityId}' moved ${distance.toFixed(6)} units after '${options.press}', below threshold ${options.movementThreshold}.`,
        severity: "error",
        suggestion: "Check input bindings, script action names, and fixed/update schedule wiring.",
      });
    }
    const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
    return {
      ...(after === undefined ? {} : { after }),
      artifact,
      ...(before === undefined ? {} : { before }),
      diagnostics,
      distance,
      entity: options.entityId,
      expectMoved: options.expectMoved,
      frames: options.frames,
      input: options.press,
      movementThreshold: options.movementThreshold,
      pass: !hasErrors,
      runtime: "web",
      url: options.url,
    };
  } finally {
    await browser.close();
  }
}

async function ensureProjectBundle(projectPath: string): Promise<string> {
  const config = await loadProjectConfig(projectPath);
  const bundlePath = resolve(projectPath, config.outDir);
  await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  if (!report.ok) {
    throw new Error(report.diagnostics[0]?.message ?? "Bundle validation failed.");
  }
  return bundlePath;
}

async function readEffectLog(page: { evaluate<T>(fn: () => T): Promise<T> }): Promise<unknown> {
  return page.evaluate(() => globalThis.__THREENATIVE_EFFECT_LOG__);
}

function latestTransformSample(effectLog: unknown, entityId: string): ITransformSample | undefined {
  if (!isRecord(effectLog) || !Array.isArray(effectLog.entries)) {
    return undefined;
  }
  const entries = effectLog.entries
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .filter((entry) => entry.kind === "patch" && entry.command === "setComponent" && entry.component === "Transform" && entry.entity === entityId)
    .map((entry) => ({ entry, position: readPosition(entry.value) }))
    .filter((item): item is { entry: Record<string, unknown>; position: Vec3 } => item.position !== undefined)
    .sort((left, right) => numberValue(right.entry.frame) - numberValue(left.entry.frame) || numberValue(right.entry.tick) - numberValue(left.entry.tick));
  const latest = entries[0];
  if (latest === undefined) {
    return undefined;
  }
  return {
    frame: numberValue(latest.entry.frame),
    position: latest.position,
    tick: numberValue(latest.entry.tick),
  };
}

function readPosition(value: unknown): Vec3 | undefined {
  if (!isRecord(value) || !Array.isArray(value.position) || value.position.length < 3) {
    return undefined;
  }
  const position = value.position.slice(0, 3).map((item) => (typeof item === "number" && Number.isFinite(item) ? item : Number.NaN));
  return position.every(Number.isFinite) ? position as Vec3 : undefined;
}

function distance3(left: Vec3, right: Vec3): number {
  const dx = right[0] - left[0];
  const dy = right[1] - left[1];
  const dz = right[2] - left[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function readFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function readPositiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolvePath(cwd: string, path: string): string {
  return resolve(cwd, path);
}

function safeFilePart(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-");
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class BrowserUnavailableError extends Error {}
