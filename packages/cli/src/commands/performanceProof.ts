import { mkdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildProject, loadProjectConfig, validateBundle } from "@threenative/compiler";
import { loadBundle, startWebPreview, type IWebBundle, type IWebPreviewServer } from "@threenative/runtime-web-three";
import { chromium, type Page } from "playwright";

import { diagnosticResult, type ICommandResult } from "../diagnostics.js";

const PERFORMANCE_PROOF_SCHEMA = "threenative.performance-proof";
const PERFORMANCE_PROOF_VERSION = "0.1.0";

interface IPerformanceProofBudgets {
  activeLodBands: number;
  drawCalls: number;
  drawGroups: number;
  entityCount: number;
  frameTimeMsP95: number;
  frameTimeMsP99: number;
  loadedTextureBytes: number;
  textureVariantBytes: number;
  visibleInstances: number;
}

export interface IRuntimePerformanceSample {
  frameSamplesMs: number[];
  renderer?: {
    drawCalls?: number;
    geometries?: number;
    programs?: number;
    textures?: number;
    triangles?: number;
  };
  runtimeDiagnostics?: unknown;
  summary?: {
    p95FrameMs?: number;
    sampleCount?: number;
    worstFrameMs?: number;
  };
}

export interface IPerformanceProofCollectorResult {
  bundle: IWebBundle;
  runtime: IRuntimePerformanceSample;
  textureBytes: number;
  textureVariantCount: number;
}

export interface IPerformanceProofCommandOptions {
  collector?: (options: { bundlePath: string; frames: number; projectPath: string; url?: string }) => Promise<IPerformanceProofCollectorResult>;
}

export async function performanceProofCommand(
  argv: readonly string[],
  cwd = process.env.INIT_CWD ?? process.cwd(),
  options: IPerformanceProofCommandOptions = {},
): Promise<ICommandResult> {
  const normalizedArgv = argv[0] === "--" ? argv.slice(1) : argv;
  const subcommand = normalizedArgv[0];
  const commandArgv = subcommand === "proof" ? normalizedArgv.slice(1) : normalizedArgv;
  const json = commandArgv.includes("--json");
  if (subcommand !== "proof") {
    return diagnosticResult({
      code: "TN_PERFORMANCE_COMMAND_UNSUPPORTED",
      message: "Usage: tn performance proof [--project <path>] [--url <preview-url>] [--frames <n>] [--target-profile <id>] [--out <file>] [--json]",
    }, { exitCode: 1, json, stderr: true });
  }
  const projectPath = resolve(cwd, readStringFlag(commandArgv, "--project") ?? ".");
  const outPath = resolve(projectPath, readStringFlag(commandArgv, "--out") ?? "artifacts/performance-proof.json");
  const frames = readNumberFlag(commandArgv, "--frames", 120);
  const url = readStringFlag(commandArgv, "--url");
  const targetProfileOverride = readStringFlag(commandArgv, "--target-profile");

  try {
    const config = await loadProjectConfig(projectPath);
    const build = await buildProject(projectPath);
    const bundlePath = resolve(projectPath, config.outDir);
    const validation = await validateBundle(build.bundlePath);
    if (!validation.ok) {
      throw new Error(validation.diagnostics[0]?.message ?? "Bundle validation failed.");
    }
    const collected = await (options.collector ?? collectWebPerformanceProof)({ bundlePath, frames, projectPath, url });
    const budgets = budgetsFromBundle(collected.bundle);
    const frameSamples = collected.runtime.frameSamplesMs.length > 0
      ? collected.runtime.frameSamplesMs
      : fallbackFrameSamples(collected.runtime.summary);
    const frameTime = summarizePercentiles(frameSamples);
    const runtimeScene = runtimeSceneDiagnostics(collected.runtime.runtimeDiagnostics);
    const entityCount = runtimeScene.entityCount ?? collected.bundle.world.entities.length;
    const visibleInstances = runtimeScene.visibleMeshCount ?? entityCount;
    const activeLodBands = activeLodBandsForBundle(collected.bundle);
    const drawCalls = finiteNumber(collected.runtime.renderer?.drawCalls) ?? 0;
    const drawGroups = finiteNumber(collected.runtime.renderer?.programs) ?? drawCalls;
    const metrics: Record<string, { status: "measured"; value: unknown }> = {
      frameTimeMs: { status: "measured", value: frameTime },
      drawCalls: { status: "measured", value: drawCalls },
      drawGroups: { status: "measured", value: drawGroups },
      visibleInstances: { status: "measured", value: visibleInstances },
      activeLodBands: { status: "measured", value: activeLodBands },
      loadedTextureBytes: { status: "measured", value: collected.textureBytes },
      textureVariants: {
        status: "measured",
        value: {
          loadedBytes: collected.textureBytes,
          selectedVariantCount: collected.textureVariantCount,
        },
      },
      entityCount: { status: "measured", value: entityCount },
    };
    const proof = {
      schema: PERFORMANCE_PROOF_SCHEMA,
      version: PERFORMANCE_PROOF_VERSION,
      generatedBy: "tn performance proof",
      targetProfile: targetProfileOverride ?? targetProfileId(collected.bundle),
      runtime: {
        adapter: "web-three",
        target: "web",
      },
      budgets,
      metrics,
      status: "pass",
    };
    const diagnostics = performanceBudgetDiagnostics(proof.metrics, budgets);
    const report = {
      ...proof,
      diagnostics,
      status: diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "fail" : "pass",
    };
    await mkdir(resolve(outPath, ".."), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const payload = {
      artifactPath: outPath,
      code: report.status === "pass" ? "TN_PERFORMANCE_PROOF_OK" : "TN_PERFORMANCE_PROOF_FAILED",
      diagnostics,
      report,
    };
    return {
      exitCode: report.status === "pass" ? 0 : 1,
      stdout: json ? `${JSON.stringify(payload, null, 2)}\n` : `${report.status === "pass" ? "Performance proof passed." : "Performance proof failed."}\nReport: ${outPath}\n`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return diagnosticResult({ code: "TN_PERFORMANCE_PROOF_FAILED", message }, { exitCode: 1, json, stderr: true });
  }
}

async function collectWebPerformanceProof(options: { bundlePath: string; frames: number; projectPath: string; url?: string }): Promise<IPerformanceProofCollectorResult> {
  let server: IWebPreviewServer | undefined;
  const browser = await chromium.launch();
  try {
    const bundle = await loadBundle(options.bundlePath);
    const previewUrl = options.url ?? (server = await startWebPreview({ bundlePath: options.bundlePath, silent: true })).url;
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    await page.goto(previewUrl);
    await waitForRuntime(page);
    await page.evaluate(() => {
      const runtime = (globalThis as { __THREENATIVE_RUNTIME__?: { resetPerformanceTrace?(): void } }).__THREENATIVE_RUNTIME__;
      runtime?.resetPerformanceTrace?.();
    });
    await waitForFrameSamples(page, options.frames);
    const runtime = await page.evaluate(() => ({
      performance: (globalThis as { __THREENATIVE_RUNTIME__?: { performanceSnapshot?(): unknown } }).__THREENATIVE_RUNTIME__?.performanceSnapshot?.() ?? null,
      runtimeDiagnostics: (globalThis as { __THREENATIVE_RUNTIME__?: { runtimeDiagnosticsSnapshot?(): unknown } }).__THREENATIVE_RUNTIME__?.runtimeDiagnosticsSnapshot?.() ?? null,
    }));
    const texture = await textureMeasurements(options.projectPath, bundle);
    return {
      bundle,
      runtime: normalizeRuntimeSample(runtime),
      textureBytes: texture.bytes,
      textureVariantCount: texture.variantCount,
    };
  } finally {
    await browser.close();
    await server?.close();
  }
}

async function waitForRuntime(page: Page): Promise<void> {
  await page.waitForFunction(() => (globalThis as { __THREENATIVE_RUNTIME__?: { performanceSnapshot?: unknown } }).__THREENATIVE_RUNTIME__?.performanceSnapshot !== undefined, undefined, { timeout: 10_000 });
}

async function waitForFrameSamples(page: Page, frames: number): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const snapshot = (globalThis as { __THREENATIVE_RUNTIME__?: { performanceSnapshot?(): unknown } }).__THREENATIVE_RUNTIME__?.performanceSnapshot?.();
      return typeof snapshot === "object"
        && snapshot !== null
        && Array.isArray((snapshot as { frameSamplesMs?: unknown }).frameSamplesMs)
        && (snapshot as { frameSamplesMs: unknown[] }).frameSamplesMs.length >= expected;
    },
    frames,
    { timeout: Math.max(30_000, frames * 500) },
  );
}

function normalizeRuntimeSample(value: unknown): IRuntimePerformanceSample {
  const root = isRecord(value) ? value : {};
  const performance = isRecord(root.performance) ? root.performance : {};
  const renderer = isRecord(performance.renderer) ? performance.renderer : undefined;
  const summary = isRecord(performance.summary) ? performance.summary : undefined;
  return {
    frameSamplesMs: Array.isArray(performance.frameSamplesMs) ? performance.frameSamplesMs.filter(isFiniteNumber) : [],
    ...(renderer === undefined ? {} : {
      renderer: {
        drawCalls: finiteNumber(renderer.drawCalls),
        geometries: finiteNumber(renderer.geometries),
        programs: finiteNumber(renderer.programs),
        textures: finiteNumber(renderer.textures),
        triangles: finiteNumber(renderer.triangles),
      },
    }),
    runtimeDiagnostics: root.runtimeDiagnostics,
    ...(summary === undefined ? {} : {
      summary: {
        p95FrameMs: finiteNumber(summary.p95FrameMs),
        sampleCount: finiteNumber(summary.sampleCount),
        worstFrameMs: finiteNumber(summary.worstFrameMs),
      },
    }),
  };
}

async function textureMeasurements(projectPath: string, bundle: IWebBundle): Promise<{ bytes: number; variantCount: number }> {
  let bytes = 0;
  let variantCount = 0;
  for (const asset of bundle.assets.assets) {
    if (asset.kind !== "texture") {
      continue;
    }
    variantCount += Array.isArray(asset.variants) ? Math.max(1, asset.variants.length) : 1;
    bytes += await optionalByteSize(asset.path === undefined ? undefined : resolve(projectPath, asset.path));
    for (const variant of asset.variants ?? []) {
      bytes += await optionalByteSize(isRecord(variant) && typeof variant.path === "string" ? resolve(projectPath, variant.path) : undefined);
    }
  }
  return { bytes, variantCount };
}

async function optionalByteSize(path: string | undefined): Promise<number> {
  if (path === undefined) {
    return 0;
  }
  try {
    return (await stat(path)).size;
  } catch {
    return 0;
  }
}

function budgetsFromBundle(bundle: IWebBundle): IPerformanceProofBudgets {
  const performance = bundle.targetProfile.performance;
  return {
    activeLodBands: 8,
    drawCalls: performance?.drawCalls.max ?? 300,
    drawGroups: performance?.instancedGroups.max ?? 120,
    entityCount: 5000,
    frameTimeMsP95: performance?.p95FrameMs.max ?? 24,
    frameTimeMsP99: performance?.worstFrameMs.max ?? 33.4,
    loadedTextureBytes: performance?.textureBytes.max ?? 128 * 1024 * 1024,
    textureVariantBytes: performance?.textureBytes.max ?? 128 * 1024 * 1024,
    visibleInstances: performance?.instances.max ?? 2000,
  };
}

function performanceBudgetDiagnostics(metrics: Record<string, { status: "measured"; value: unknown }>, budgets: IPerformanceProofBudgets): Array<{ code: string; message: string; severity: "error"; suggestedFix: string }> {
  const diagnostics: Array<{ code: string; message: string; severity: "error"; suggestedFix: string }> = [];
  const frame = isRecord(metrics.frameTimeMs?.value) ? metrics.frameTimeMs.value : {};
  const checks = [
    ["frame time p95", finiteNumber(frame.p95), budgets.frameTimeMsP95],
    ["frame time p99", finiteNumber(frame.p99), budgets.frameTimeMsP99],
    ["draw calls", finiteNumber(metrics.drawCalls?.value), budgets.drawCalls],
    ["draw groups", finiteNumber(metrics.drawGroups?.value), budgets.drawGroups],
    ["visible instances", finiteNumber(metrics.visibleInstances?.value), budgets.visibleInstances],
    ["active LOD bands", Array.isArray(metrics.activeLodBands?.value) ? metrics.activeLodBands.value.length : undefined, budgets.activeLodBands],
    ["loaded texture bytes", finiteNumber(metrics.loadedTextureBytes?.value), budgets.loadedTextureBytes],
    ["texture variant loaded bytes", isRecord(metrics.textureVariants?.value) ? finiteNumber(metrics.textureVariants.value.loadedBytes) : undefined, budgets.textureVariantBytes],
    ["entity count", finiteNumber(metrics.entityCount?.value), budgets.entityCount],
  ] as const;
  for (const [label, actual, budget] of checks) {
    if (actual !== undefined && actual > budget) {
      diagnostics.push({
        code: "TN_PERFORMANCE_PROOF_BUDGET_EXCEEDED",
        message: `Performance proof ${label} ${actual} exceeds budget ${budget}.`,
        severity: "error",
        suggestedFix: "Reduce scene/runtime cost or update the target profile only with matching release evidence.",
      });
    }
  }
  return diagnostics;
}

function summarizePercentiles(samples: readonly number[]): { p50: number; p95: number; p99: number; sampleCount: number } {
  const sorted = samples.filter(isFiniteNumber).sort((left, right) => left - right);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    sampleCount: sorted.length,
  };
}

function percentile(sorted: readonly number[], fraction: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1)] ?? 0;
}

function fallbackFrameSamples(summary: IRuntimePerformanceSample["summary"]): number[] {
  const p95 = finiteNumber(summary?.p95FrameMs);
  const p99 = finiteNumber(summary?.worstFrameMs);
  if (p95 === undefined && p99 === undefined) {
    return [];
  }
  return [p95 ?? p99 ?? 0, p99 ?? p95 ?? 0];
}

function runtimeSceneDiagnostics(value: unknown): { entityCount?: number; visibleMeshCount?: number } {
  const scene = isRecord(value) && isRecord(value.scene) ? value.scene : undefined;
  return {
    entityCount: finiteNumber(scene?.entityCount),
    visibleMeshCount: finiteNumber(scene?.visibleMeshCount),
  };
}

function activeLodBandsForBundle(bundle: IWebBundle): string[] {
  const bands = new Set<string>();
  for (const asset of bundle.assets.assets) {
    const lod = (asset as { lod?: unknown }).lod;
    if (Array.isArray(lod) && lod.length > 0) {
      bands.add("source-asset-lod");
    }
    if (asset.kind === "texture" && Array.isArray(asset.variants) && asset.variants.length > 0) {
      bands.add("texture-variant");
    }
  }
  if (bands.size === 0 && bundle.world.entities.length > 0) {
    bands.add("default");
  }
  return [...bands].sort();
}

function targetProfileId(bundle: IWebBundle): string {
  const profile = bundle.targetProfile as { id?: unknown };
  return typeof profile.id === "string" && profile.id.trim().length > 0 ? profile.id : "bundle-target-profile";
}

function readStringFlag(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function readNumberFlag(argv: readonly string[], name: string, fallback: number): number {
  const raw = readStringFlag(argv, name);
  if (raw === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function isFiniteNumber(value: unknown): value is number {
  return finiteNumber(value) !== undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
