import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);

type RuntimeName = "bevy" | "web";

interface PhotorealFixtureDefinition {
  bundlePath: string;
  captureFrames?: number;
  captureSettleMs?: number;
  expectedPostProcessing?: string;
  id: string;
  reportAssertions: "ambient-occlusion" | "bloom" | "depth-of-field" | "motion-blur" | "screen-space-reflections" | "none";
  sampleRegions: PhotorealSampleRegion[];
}

const fixtures: PhotorealFixtureDefinition[] = [
  {
    bundlePath: "packages/ir/fixtures/conformance/photoreal-lighting-units-probe/game.bundle",
    id: "photoreal-lighting-units-probe",
    reportAssertions: "none",
    sampleRegions: [
      photorealRegion("center-surfaces", 0.42, 0.36, 0.16, 0.18, 0.02),
      photorealRegion("left-wall", 0.16, 0.22, 0.12, 0.2, 0.02),
      photorealRegion("floor", 0.42, 0.72, 0.16, 0.08, 0.02),
    ],
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/photoreal-ao-corner-test/game.bundle",
    expectedPostProcessing: "ambientOcclusion",
    id: "photoreal-ao-corner-test",
    reportAssertions: "ambient-occlusion",
    sampleRegions: [
      photorealRegion("left-wall", 0.16, 0.22, 0.12, 0.2, 0.03),
      photorealRegion("floor", 0.42, 0.72, 0.16, 0.08, 0.03),
      photorealRegion("contact-corner", 0.3, 0.45, 0.14, 0.16, 0.03),
    ],
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/photoreal-bloom-emissive-test/game.bundle",
    expectedPostProcessing: "bloom",
    id: "photoreal-bloom-emissive-test",
    reportAssertions: "bloom",
    sampleRegions: [
      photorealRegion("emissive-center", 0.42, 0.36, 0.16, 0.18, 0.04, 0.02),
      photorealRegion("left-blue-background", 0.03, 0.2, 0.12, 0.22, 0.03),
      photorealRegion("right-blue-background", 0.85, 0.2, 0.12, 0.22, 0.03),
      photorealRegion("bottom-blue-background", 0.42, 0.89, 0.16, 0.08, 0.03),
      photorealRegion("floor-glow", 0.42, 0.72, 0.16, 0.08, 0.03),
    ],
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/photoreal-dof-depth-test/game.bundle",
    expectedPostProcessing: "depthOfField",
    id: "photoreal-dof-depth-test",
    reportAssertions: "depth-of-field",
    sampleRegions: [
      photorealRegion("near-marker", 0.23, 0.45, 0.12, 0.16, 0.03),
      photorealRegion("focus-marker", 0.44, 0.42, 0.12, 0.16, 0.03),
      photorealRegion("far-marker", 0.64, 0.35, 0.13, 0.18, 0.03),
      photorealRegion("background-stripes", 0.36, 0.18, 0.28, 0.2, 0.03),
    ],
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/photoreal-motion-blur-moving-test/game.bundle",
    captureFrames: 120,
    expectedPostProcessing: "motionBlur",
    id: "photoreal-motion-blur-moving-test",
    reportAssertions: "motion-blur",
    sampleRegions: [
      photorealRegion("motion-lane", 0.32, 0.27, 0.36, 0.16, 0.07, 0.01),
      photorealRegion("moving-core", 0.46, 0.28, 0.12, 0.14, 0.075),
      photorealRegion("floor", 0.42, 0.72, 0.16, 0.08, 0.02),
    ],
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/photoreal-reflective-wet-floor/game.bundle",
    expectedPostProcessing: "screenSpaceReflections",
    id: "photoreal-reflective-wet-floor",
    reportAssertions: "screen-space-reflections",
    sampleRegions: [
      photorealRegion("source-strips", 0.36, 0.08, 0.28, 0.18, 0.04),
      photorealRegion("floor-reflection", 0.36, 0.58, 0.28, 0.18, 0.07, 0.01),
      photorealRegion("wet-floor", 0.42, 0.75, 0.18, 0.08, 0.02),
    ],
  },
];

export interface PhotorealSampleRegion {
  id: string;
  region: { height: number; width: number; x: number; y: number };
  threshold: { maxAverageChannelDelta: number; minRuntimeLuminanceStdDev?: number };
}

export interface PhotorealRegionMetric {
  averageChannelDelta: number;
  fixtureId: string;
  id: string;
  maxChannelDelta: number;
  bevyLuminanceStdDev: number;
  effectOk: boolean;
  ok: boolean;
  parityOk: boolean;
  region: { height: number; width: number; x: number; y: number };
  threshold: { maxAverageChannelDelta: number; minRuntimeLuminanceStdDev?: number };
  webLuminanceStdDev: number;
}

function photorealRegion(id: string, x: number, y: number, width: number, height: number, maxAverageChannelDelta: number, minRuntimeLuminanceStdDev?: number): PhotorealSampleRegion {
  return {
    id,
    region: { height, width, x, y },
    threshold: { maxAverageChannelDelta, ...(minRuntimeLuminanceStdDev === undefined ? {} : { minRuntimeLuminanceStdDev }) },
  };
}

export interface PhotorealMetricSample {
  averageLuminance: number;
  luminanceStdDev: number;
  nonblankArea: number;
  screenshotPath: string;
}

export interface PhotorealFixtureMetrics {
  bevy: PhotorealMetricSample;
  fixtureId: string;
  webCaptureDiagnostics?: VerificationDiagnostic[];
  web: PhotorealMetricSample;
}

export interface PhotorealRenderingMetrics {
  fixtures: PhotorealFixtureMetrics[];
}

export interface PhotorealRenderingGateResult {
  artifacts: {
    contactSheetPath: string;
    fixtureReports: Array<{
      bevyReportPath: string;
      bevyScreenshotPath: string;
      fixtureId: string;
      webReportPath: string;
      webScreenshotPath: string;
    }>;
    metricsPath: string;
    regionMetricsPath: string;
    reportPath: string;
  };
  diagnostics: VerificationDiagnostic[];
  evidenceMode: "captured-screenshots" | "screenshot-metrics";
  metrics: PhotorealRenderingMetrics;
  ok: boolean;
}

export async function runPhotorealRenderingGate(options: { metricsPath?: string; root?: string } = {}): Promise<PhotorealRenderingGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "rendering-photoreal", owner: { kind: "aggregate", name: "rendering-photoreal" }, root });
  const artifactDir = targets.absoluteDir;
  const screenshotsDir = resolve(artifactDir, "screenshots");
  const reportsDir = resolve(artifactDir, "reports");
  const contactSheetPath = resolve(artifactDir, "contact-sheet.svg");
  const metricsPath = resolve(artifactDir, "metrics.json");
  const regionMetricsPath = resolve(artifactDir, "region-metrics.json");

  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const evidenceMode = options.metricsPath === undefined ? "captured-screenshots" : "screenshot-metrics";
  const metrics = options.metricsPath === undefined
    ? await capturePhotorealEvidence({ reportsDir, root, screenshotsDir })
    : JSON.parse(await readFile(options.metricsPath, "utf8")) as PhotorealRenderingMetrics;
  const regionMetrics = evidenceMode === "captured-screenshots"
    ? await derivePhotorealRegionMetrics({ metrics, root })
    : [];
  const diagnostics = await analyzePhotorealEvidence({ metrics, regionMetrics, reportsDir, root });
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");

  await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, "utf8");
  await writeFile(regionMetricsPath, `${JSON.stringify({
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      regions: regionMetrics.filter((metric) => metric.fixtureId === fixture.id),
    })),
    schema: "threenative.verify.rendering-photoreal.regions",
    status: regionMetrics.every((metric) => metric.ok) ? "pass" : "fail",
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  await writeFile(contactSheetPath, renderContactSheet(metrics), "utf8");
  const artifacts = {
    contactSheetPath: toRepoRelative(root, contactSheetPath),
    fixtureReports: fixtures.map((fixture) => {
      const sample = metrics.fixtures.find((entry) => entry.fixtureId === fixture.id);
      return {
        bevyReportPath: toRepoRelative(root, reportPath(reportsDir, fixture.id, "bevy")),
        bevyScreenshotPath: sample?.bevy.screenshotPath ?? toRepoRelative(root, screenshotPath(screenshotsDir, fixture.id, "bevy")),
        fixtureId: fixture.id,
        webReportPath: toRepoRelative(root, reportPath(reportsDir, fixture.id, "web")),
        webScreenshotPath: sample?.web.screenshotPath ?? toRepoRelative(root, screenshotPath(screenshotsDir, fixture.id, "web")),
      };
    }),
    metricsPath: toRepoRelative(root, metricsPath),
    regionMetricsPath: toRepoRelative(root, regionMetricsPath),
    reportPath: targets.relativeReportPath,
  };
  await writeFile(
    targets.reportPath,
    `${JSON.stringify({
      artifacts,
      code: ok ? "TN_VERIFY_RENDERING_PHOTOREAL_OK" : "TN_VERIFY_RENDERING_PHOTOREAL_FAILED",
      diagnostics,
      evidenceMode,
      fixtures: fixtures.map((fixture) => ({ bundlePath: fixture.bundlePath, id: fixture.id })),
      generatedBy: "@threenative/verify-tools renderingPhotoreal",
      metrics,
      ok,
      regionMetrics,
      schema: "threenative.verify.rendering-photoreal",
      startedAt: new Date().toISOString(),
      status: ok ? "pass" : "fail",
      thresholds: {
        flatLuminanceStdDevMaximum: 0.01,
        blankNonblankAreaMaximum: 0.05,
        regionAverageChannelDeltaMaximums: fixtures.flatMap((fixture) =>
          fixture.sampleRegions.map((sample) => ({
            fixtureId: fixture.id,
            id: sample.id,
            maxAverageChannelDelta: sample.threshold.maxAverageChannelDelta,
          }))
        ),
      },
      version: "0.1.0",
    }, null, 2)}\n`,
    "utf8",
  );

  return { artifacts, diagnostics, evidenceMode, metrics, ok };
}

async function capturePhotorealEvidence(options: {
  reportsDir: string;
  root: string;
  screenshotsDir: string;
}): Promise<PhotorealRenderingMetrics> {
  type StartWebPreview = (options: { bundlePath: string; silent: boolean }) => Promise<{ close(): Promise<void> | void; url: string }>;
  type CaptureScreenshot = (options: { outPath: string; settleMs?: number; url: string; waitReady: boolean }) => Promise<{ diagnostics?: Array<{ code?: string; message?: string; severity?: string }> }>;
  type ReadPngFrame = (path: string) => Promise<{ data: ArrayLike<number>; height: number; width: number }>;
  const [{ startWebPreview }, { captureScreenshot }, { readPngFrame }, webRuntime] = await Promise.all([
    import("../../../packages/runtime-web-three/dist/index.js") as Promise<{ startWebPreview: StartWebPreview }>,
    import("../../../packages/cli/dist/commands/visualProof.js") as Promise<{ captureScreenshot: CaptureScreenshot }>,
    import("../../../packages/cli/dist/verify/compareImages.js") as unknown as Promise<{ readPngFrame: ReadPngFrame }>,
    import("../../../packages/runtime-web-three/dist/index.js") as Promise<{
      loadBundle(source: string): Promise<unknown>;
      mapWorld(bundle: unknown): unknown;
      reportWebConformance(bundle: unknown, mapped: unknown, fixture: string): unknown;
    }>,
  ]);

  const captured: PhotorealFixtureMetrics[] = [];
  for (const fixture of fixtures) {
    const bundlePath = resolve(options.root, fixture.bundlePath);
    const webReportPath = reportPath(options.reportsDir, fixture.id, "web");
    const bevyReportPath = reportPath(options.reportsDir, fixture.id, "bevy");
    const webScreenshotPath = screenshotPath(options.screenshotsDir, fixture.id, "web");
    const bevyScreenshotPath = screenshotPath(options.screenshotsDir, fixture.id, "bevy");

    const bundle = await webRuntime.loadBundle(bundlePath);
    const webReport = webRuntime.reportWebConformance(bundle, webRuntime.mapWorld(bundle), fixture.id);
    await writeFile(webReportPath, `${JSON.stringify(webReport, null, 2)}\n`, "utf8");

    const server = await startWebPreview({ bundlePath, silent: true });
    let webCaptureDiagnostics: VerificationDiagnostic[] = [];
    try {
      const captureUrl = new URL(server.url);
      if (fixture.captureFrames !== undefined) {
        captureUrl.searchParams.set("captureFrames", fixture.captureFrames.toString());
      }
      const capture = await captureScreenshot({ outPath: webScreenshotPath, settleMs: fixture.captureSettleMs, url: captureUrl.href, waitReady: true });
      webCaptureDiagnostics = (capture.diagnostics ?? []).map((diagnostic) => ({
        code: diagnostic.code ?? "TN_RENDERING_PHOTOREAL_WEB_CAPTURE_DIAGNOSTIC",
        message: diagnostic.message ?? "Web screenshot capture reported a diagnostic.",
        path: toRepoRelative(options.root, webScreenshotPath),
        severity: diagnostic.severity === "warning" ? "warning" : "error",
        suggestedFix: "Fix the web preview runtime before accepting screenshot evidence.",
      }));
    } finally {
      await server.close();
    }

    await execFileAsync(
      "cargo",
      [
        "run",
        "--quiet",
        "-p",
        "threenative_runtime",
        "--bin",
        "threenative_conformance",
        "--",
        bundlePath,
        fixture.id,
        bevyReportPath,
      ],
      { cwd: resolve(options.root, "runtime-bevy"), timeout: 180_000 },
    );
    await captureBevyScreenshot({
      bundlePath,
      fixtureId: fixture.id,
      outPath: bevyScreenshotPath,
      root: options.root,
    });

    captured.push({
      bevy: await deriveScreenshotMetrics({ path: bevyScreenshotPath, readPngFrame, root: options.root }),
      fixtureId: fixture.id,
      ...(webCaptureDiagnostics.length === 0 ? {} : { webCaptureDiagnostics }),
      web: await deriveScreenshotMetrics({ path: webScreenshotPath, readPngFrame, root: options.root }),
    });
  }
  return { fixtures: captured };
}

async function captureBevyScreenshot(options: { bundlePath: string; fixtureId: string; outPath: string; root: string }): Promise<void> {
  let captureError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await runNativeCaptureCommand(options);
      captureError = undefined;
      break;
    } catch (error) {
      captureError = error;
      try {
        const info = await stat(options.outPath);
        if (info.size > 0) {
          return;
        }
      } catch {
        // Retry once when the native window or swapchain fails before writing.
      }
    }
  }
  let info;
  try {
    info = await stat(options.outPath);
  } catch {
    if (captureError !== undefined) {
      throw captureError;
    }
    throw new Error(`Bevy photoreal capture did not write a PNG for ${options.fixtureId}: ${options.outPath}`);
  }
  if (info.size === 0) {
    throw new Error(`Bevy photoreal capture wrote an empty PNG for ${options.fixtureId}: ${options.outPath}`);
  }
}

async function runNativeCaptureCommand(options: { bundlePath: string; outPath: string; root: string }): Promise<void> {
  const args = [
    "run",
    "--quiet",
    "-p",
    "threenative_runtime",
    "--bin",
    "threenative_capture",
    "--",
    options.bundlePath,
    "camera.main",
    options.outPath,
    "120",
  ];
  const cwd = resolve(options.root, "runtime-bevy");
  try {
    await execFileAsync("xvfb-run", ["-a", "cargo", ...args], { cwd, timeout: 180_000 });
    return;
  } catch (error) {
    try {
      const info = await stat(options.outPath);
      if (info.size > 0) {
        return;
      }
    } catch {
      // Fall back to the host display when xvfb is unavailable or failed before writing.
    }
    if (isMissingCommandError(error)) {
      await execFileAsync("cargo", args, { cwd, timeout: 180_000 });
      return;
    }
    throw error;
  }
}

function isMissingCommandError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

async function analyzePhotorealEvidence(options: {
  metrics: PhotorealRenderingMetrics;
  regionMetrics: PhotorealRegionMetric[];
  reportsDir: string;
  root: string;
}): Promise<VerificationDiagnostic[]> {
  const diagnostics: VerificationDiagnostic[] = [];
  for (const fixture of fixtures) {
    const metric = options.metrics.fixtures.find((entry) => entry.fixtureId === fixture.id);
    if (metric === undefined) {
      diagnostics.push({
        code: "TN_RENDERING_PHOTOREAL_METRICS_MISSING",
        message: `${fixture.id} screenshot metrics are missing.`,
        path: toRepoRelative(options.root, resolve(options.reportsDir, "..", "metrics.json")),
        severity: "error",
        suggestedFix: "Regenerate rendering photoreal metrics for every fixture in the focused gate.",
      });
      continue;
    }
    for (const runtime of ["web", "bevy"] as const) {
      const sample = metric[runtime];
      if (sample.nonblankArea < 0.05 && sample.luminanceStdDev < 0.01) {
        diagnostics.push({
          code: "TN_RENDERING_PHOTOREAL_SCREENSHOT_BLANK",
          message: `${runtime} ${fixture.id} screenshot has too little nonblank area.`,
          path: sample.screenshotPath,
          severity: "error",
          suggestedFix: "Fix camera framing, renderer readiness, native capture, or fixture lighting before using visual proof.",
        });
      }
      if (sample.luminanceStdDev < 0.01) {
        diagnostics.push({
          code: "TN_RENDERING_PHOTOREAL_SCREENSHOT_FLAT",
          message: `${runtime} ${fixture.id} screenshot has too little luminance variation.`,
          path: sample.screenshotPath,
          severity: "error",
          suggestedFix: "Fix renderer readiness, camera framing, or fixture lighting; a uniform background is not valid photoreal proof.",
        });
      }
    }
    for (const regionMetric of options.regionMetrics.filter((entry) => entry.fixtureId === fixture.id && !entry.parityOk)) {
      diagnostics.push({
        code: "TN_RENDERING_PHOTOREAL_REGION_DRIFT",
        message: `${fixture.id} sample region '${regionMetric.id}' exceeded the web/native average-channel threshold: ${regionMetric.averageChannelDelta} > ${regionMetric.threshold.maxAverageChannelDelta}.`,
        path: toRepoRelative(options.root, resolve(options.reportsDir, "..", "region-metrics.json")),
        severity: "error",
        suggestedFix: "Fix renderer mapping, color space, lighting, or post-processing until the bounded region matches across web Three.js and native Bevy.",
      });
    }
    for (const regionMetric of options.regionMetrics.filter((entry) => entry.fixtureId === fixture.id && !entry.effectOk)) {
      diagnostics.push({
        code: "TN_RENDERING_PHOTOREAL_EFFECT_WEAK",
        message: `${fixture.id} sample region '${regionMetric.id}' lacks required effect variation: web ${regionMetric.webLuminanceStdDev}, Bevy ${regionMetric.bevyLuminanceStdDev}, minimum ${regionMetric.threshold.minRuntimeLuminanceStdDev}.`,
        path: toRepoRelative(options.root, resolve(options.reportsDir, "..", "region-metrics.json")),
        severity: "error",
        suggestedFix: "Fix the owning post-processing implementation until both runtimes render measurable local effect variation.",
      });
    }
    diagnostics.push(...(metric.webCaptureDiagnostics ?? []));
    await assertReportMatchesFixture({
      diagnostics,
      fixture,
      path: reportPath(options.reportsDir, fixture.id, "web"),
      reportName: "web",
    });
    await assertReportMatchesFixture({
      diagnostics,
      fixture,
      path: reportPath(options.reportsDir, fixture.id, "bevy"),
      reportName: "bevy",
    });
  }
  return diagnostics;
}

async function derivePhotorealRegionMetrics(options: {
  metrics: PhotorealRenderingMetrics;
  root: string;
}): Promise<PhotorealRegionMetric[]> {
  type ReadPngFrame = (path: string) => Promise<{ data: ArrayLike<number>; height: number; width: number }>;
  const { readPngFrame } = await import("../../../packages/cli/dist/verify/compareImages.js") as unknown as { readPngFrame: ReadPngFrame };
  const regionMetrics: PhotorealRegionMetric[] = [];
  for (const fixture of fixtures) {
    const metric = options.metrics.fixtures.find((entry) => entry.fixtureId === fixture.id);
    if (metric === undefined) {
      continue;
    }
    const webFrame = normalizeFrame(await readPngFrame(resolve(options.root, metric.web.screenshotPath)));
    const bevyFrame = normalizeFrame(await readPngFrame(resolve(options.root, metric.bevy.screenshotPath)));
    for (const sample of fixture.sampleRegions) {
      regionMetrics.push(comparePhotorealRegion(fixture.id, webFrame, bevyFrame, sample));
    }
  }
  return regionMetrics;
}

export interface Frame {
  data: Uint8Array;
  height: number;
  width: number;
}

function normalizeFrame(frame: { data: ArrayLike<number>; height: number; width: number }): Frame {
  return {
    data: frame.data instanceof Uint8Array ? frame.data : Uint8Array.from(frame.data),
    height: frame.height,
    width: frame.width,
  };
}

export function comparePhotorealRegion(fixtureId: string, webFrame: Frame, bevyFrame: Frame, sample: PhotorealSampleRegion): PhotorealRegionMetric {
  let total = 0;
  let max = 0;
  let count = 0;
  let pixelCount = 0;
  let webLumaSum = 0;
  let webLumaSquaredSum = 0;
  let bevyLumaSum = 0;
  let bevyLumaSquaredSum = 0;
  const left = regionBounds(webFrame, sample.region);
  const right = regionBounds(bevyFrame, sample.region);
  const width = Math.min(left.width, right.width);
  const height = Math.min(left.height, right.height);
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const webOffset = ((left.y + row) * webFrame.width + left.x + column) * 4;
      const bevyOffset = ((right.y + row) * bevyFrame.width + right.x + column) * 4;
      const webLuma = (0.2126 * (webFrame.data[webOffset] ?? 0) + 0.7152 * (webFrame.data[webOffset + 1] ?? 0) + 0.0722 * (webFrame.data[webOffset + 2] ?? 0)) / 255;
      const bevyLuma = (0.2126 * (bevyFrame.data[bevyOffset] ?? 0) + 0.7152 * (bevyFrame.data[bevyOffset + 1] ?? 0) + 0.0722 * (bevyFrame.data[bevyOffset + 2] ?? 0)) / 255;
      webLumaSum += webLuma;
      webLumaSquaredSum += webLuma * webLuma;
      bevyLumaSum += bevyLuma;
      bevyLumaSquaredSum += bevyLuma * bevyLuma;
      pixelCount += 1;
      for (let channel = 0; channel < 3; channel += 1) {
        const delta = Math.abs((webFrame.data[webOffset + channel] ?? 0) - (bevyFrame.data[bevyOffset + channel] ?? 0)) / 255;
        total += delta;
        max = Math.max(max, delta);
        count += 1;
      }
    }
  }
  const average = count === 0 ? 0 : total / count;
  const webLuminanceStdDev = regionStdDev(webLumaSum, webLumaSquaredSum, pixelCount);
  const bevyLuminanceStdDev = regionStdDev(bevyLumaSum, bevyLumaSquaredSum, pixelCount);
  const parityOk = average <= sample.threshold.maxAverageChannelDelta;
  const effectMinimum = sample.threshold.minRuntimeLuminanceStdDev;
  const effectOk = effectMinimum === undefined || (webLuminanceStdDev >= effectMinimum && bevyLuminanceStdDev >= effectMinimum);
  return {
    averageChannelDelta: Number(average.toFixed(6)),
    bevyLuminanceStdDev: Number(bevyLuminanceStdDev.toFixed(6)),
    effectOk,
    fixtureId,
    id: sample.id,
    maxChannelDelta: Number(max.toFixed(6)),
    ok: parityOk && effectOk,
    parityOk,
    region: sample.region,
    threshold: sample.threshold,
    webLuminanceStdDev: Number(webLuminanceStdDev.toFixed(6)),
  };
}

function regionStdDev(sum: number, squaredSum: number, count: number): number {
  if (count === 0) {
    return 0;
  }
  const average = sum / count;
  return Math.sqrt(Math.max(0, squaredSum / count - average * average));
}

function regionBounds(frame: Frame, region: PhotorealSampleRegion["region"]): { height: number; width: number; x: number; y: number } {
  const x = Math.max(0, Math.min(frame.width - 1, Math.floor(region.x * frame.width)));
  const y = Math.max(0, Math.min(frame.height - 1, Math.floor(region.y * frame.height)));
  const width = Math.max(1, Math.min(frame.width - x, Math.floor(region.width * frame.width)));
  const height = Math.max(1, Math.min(frame.height - y, Math.floor(region.height * frame.height)));
  return { height, width, x, y };
}

async function assertReportMatchesFixture(options: {
  diagnostics: VerificationDiagnostic[];
  fixture: PhotorealFixtureDefinition;
  path: string;
  reportName: RuntimeName;
}): Promise<void> {
  let report: unknown;
  try {
    report = JSON.parse(await readFile(options.path, "utf8")) as unknown;
  } catch {
    return;
  }
  reportCache.set(options.path, report);
  if (options.fixture.reportAssertions === "ambient-occlusion") {
    assertAoReportApplied(options);
  }
  if (options.fixture.reportAssertions === "depth-of-field") {
    assertDepthOfFieldReportApplied(options);
  }
  if (options.fixture.reportAssertions === "motion-blur") {
    assertMotionBlurReportApplied(options);
  }
  if (options.fixture.reportAssertions === "screen-space-reflections") {
    assertScreenSpaceReflectionsReportApplied(options);
  }
  if (options.fixture.expectedPostProcessing !== undefined) {
    assertPostProcessingApplied(options);
  }
}

function assertAoReportApplied(options: {
  diagnostics: VerificationDiagnostic[];
  fixture: PhotorealFixtureDefinition;
  path: string;
  reportName: RuntimeName;
} & { report?: never }): void {
  const report = readReportCache(options.path);
  const featureReports = (((report as { runtimeConfig?: { renderer?: { featureReports?: unknown[] } } })?.runtimeConfig?.renderer?.featureReports) ?? []) as Array<{ appliedMode?: unknown; feature?: unknown; status?: unknown }>;
  const ao = featureReports.find((feature) => feature.feature === "renderer.ambientOcclusion");
  if (ao?.status !== "baseline" || ao.appliedMode !== "screen-space") {
    options.diagnostics.push({
      code: "TN_RENDERING_PHOTOREAL_AO_REPORT_MISMATCH",
      message: `${options.reportName} runtime report must mark renderer.ambientOcclusion as baseline screen-space.`,
      path: options.path,
      severity: "error",
      suggestedFix: "Fix the runtime renderer feature report before using screenshot evidence as AO proof.",
    });
  }
}

function assertDepthOfFieldReportApplied(options: {
  diagnostics: VerificationDiagnostic[];
  fixture: PhotorealFixtureDefinition;
  path: string;
  reportName: RuntimeName;
}): void {
  const report = readReportCache(options.path);
  const featureReports = (((report as { runtimeConfig?: { renderer?: { featureReports?: unknown[] } } })?.runtimeConfig?.renderer?.featureReports) ?? []) as Array<{ appliedMode?: unknown; feature?: unknown; status?: unknown }>;
  const dof = featureReports.find((feature) => feature.feature === "renderer.depthOfField");
  if (dof?.status !== "baseline" || (dof.appliedMode !== "bokeh" && dof.appliedMode !== "gaussian")) {
    options.diagnostics.push({
      code: "TN_RENDERING_PHOTOREAL_DOF_REPORT_MISMATCH",
      message: `${options.reportName} runtime report must mark renderer.depthOfField as baseline bokeh/gaussian.`,
      path: options.path,
      severity: "error",
      suggestedFix: "Fix the runtime renderer feature report before using screenshot evidence as DOF proof.",
    });
  }
}

function assertMotionBlurReportApplied(options: {
  diagnostics: VerificationDiagnostic[];
  fixture: PhotorealFixtureDefinition;
  path: string;
  reportName: RuntimeName;
}): void {
  const report = readReportCache(options.path);
  const featureReports = (((report as { runtimeConfig?: { renderer?: { featureReports?: unknown[] } } })?.runtimeConfig?.renderer?.featureReports) ?? []) as Array<{ appliedMode?: unknown; feature?: unknown; status?: unknown }>;
  const motionBlur = featureReports.find((feature) => feature.feature === "renderer.motionBlur");
  const expectedMode = options.reportName === "web" ? "temporal-accumulation" : "motion-vectors";
  if (motionBlur?.status !== "baseline" || motionBlur.appliedMode !== expectedMode) {
    options.diagnostics.push({
      code: "TN_RENDERING_PHOTOREAL_MOTION_BLUR_REPORT_MISMATCH",
      message: `${options.reportName} runtime report must mark renderer.motionBlur as baseline ${expectedMode}.`,
      path: options.path,
      severity: "error",
      suggestedFix: "Fix the runtime renderer feature report before using screenshot evidence as motion-blur proof.",
    });
  }
}

function assertScreenSpaceReflectionsReportApplied(options: {
  diagnostics: VerificationDiagnostic[];
  fixture: PhotorealFixtureDefinition;
  path: string;
  reportName: RuntimeName;
}): void {
  const report = readReportCache(options.path);
  const featureReports = (((report as { runtimeConfig?: { renderer?: { featureReports?: unknown[] } } })?.runtimeConfig?.renderer?.featureReports) ?? []) as Array<{ appliedMode?: unknown; feature?: unknown; status?: unknown }>;
  const ssr = featureReports.find((feature) => feature.feature === "renderer.screenSpaceReflections");
  const expectedMode = options.reportName === "web" ? "screen-space-planar" : "screen-space";
  if (ssr?.status !== "baseline" || ssr.appliedMode !== expectedMode) {
    options.diagnostics.push({
      code: "TN_RENDERING_PHOTOREAL_SSR_REPORT_MISMATCH",
      message: `${options.reportName} runtime report must mark renderer.screenSpaceReflections as baseline ${expectedMode}.`,
      path: options.path,
      severity: "error",
      suggestedFix: "Fix the runtime renderer feature report before using screenshot evidence as SSR proof.",
    });
  }
}

function assertPostProcessingApplied(options: {
  diagnostics: VerificationDiagnostic[];
  fixture: PhotorealFixtureDefinition;
  path: string;
  reportName: RuntimeName;
}): void {
  const report = readReportCache(options.path);
  const applied = (((report as { runtimeConfig?: { renderer?: { postProcessing?: { applied?: unknown[] } } } })?.runtimeConfig?.renderer?.postProcessing?.applied) ?? []) as unknown[];
  if (!applied.includes(options.fixture.expectedPostProcessing)) {
    options.diagnostics.push({
      code: "TN_RENDERING_PHOTOREAL_POSTPROCESS_REPORT_MISMATCH",
      message: `${options.reportName} runtime report must mark ${options.fixture.expectedPostProcessing} as applied for ${options.fixture.id}.`,
      path: options.path,
      severity: "error",
      suggestedFix: "Fix the runtime renderer post-processing report before using screenshot evidence as photoreal proof.",
    });
  }
}

const reportCache = new Map<string, unknown>();

function readReportCache(path: string): unknown {
  const cached = reportCache.get(path);
  if (cached !== undefined) {
    return cached;
  }
  throw new Error(`Report was not cached before assertion: ${path}`);
}

async function deriveScreenshotMetrics(options: {
  path: string;
  readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }>;
  root: string;
}): Promise<PhotorealMetricSample> {
  const frame = await options.readPngFrame(options.path);
  const total = frame.width * frame.height;
  let lumaSum = 0;
  let lumaSquaredSum = 0;
  let nonblank = 0;
  for (let index = 0; index < total; index += 1) {
    const offset = index * 4;
    const r = (frame.data[offset] ?? 0) / 255;
    const g = (frame.data[offset + 1] ?? 0) / 255;
    const b = (frame.data[offset + 2] ?? 0) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumaSum += luma;
    lumaSquaredSum += luma * luma;
    if (max > 0.05 || max - min > 0.03) {
      nonblank += 1;
    }
  }
  const averageLuminance = lumaSum / total;
  const luminanceVariance = Math.max(0, (lumaSquaredSum / total) - averageLuminance * averageLuminance);
  return {
    averageLuminance: Number(averageLuminance.toFixed(6)),
    luminanceStdDev: Number(Math.sqrt(luminanceVariance).toFixed(6)),
    nonblankArea: Number((nonblank / total).toFixed(6)),
    screenshotPath: toRepoRelative(options.root, options.path),
  };
}

function renderContactSheet(metrics: PhotorealRenderingMetrics): string {
  const rowHeight = 430;
  const height = 72 + metrics.fixtures.length * rowHeight;
  const rows = metrics.fixtures.map((fixture, index) => {
    const y = 72 + index * rowHeight;
    return `  <text x="40" y="${y - 22}" fill="#f4f7fb" font-family="sans-serif" font-size="24">${fixture.fixtureId}</text>
  <image x="40" y="${y}" width="640" height="360" href="screenshots/${fixture.fixtureId}.web.png"/>
  <image x="760" y="${y}" width="640" height="360" href="screenshots/${fixture.fixtureId}.bevy.png"/>
  <text x="40" y="${y + 390}" fill="#f4f7fb" font-family="sans-serif" font-size="16">web nonblank ${fixture.web.nonblankArea.toFixed(3)}, luminance ${fixture.web.averageLuminance.toFixed(3)}, stddev ${fixture.web.luminanceStdDev.toFixed(3)}</text>
  <text x="760" y="${y + 390}" fill="#f4f7fb" font-family="sans-serif" font-size="16">bevy nonblank ${fixture.bevy.nonblankArea.toFixed(3)}, luminance ${fixture.bevy.averageLuminance.toFixed(3)}, stddev ${fixture.bevy.luminanceStdDev.toFixed(3)}</text>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1440" height="${height}" viewBox="0 0 1440 ${height}">
  <rect width="1440" height="${height}" fill="#111318"/>
  <text x="40" y="44" fill="#f4f7fb" font-family="sans-serif" font-size="28">Photoreal Rendering Proof</text>
${rows}
</svg>
`;
}

function reportPath(reportsDir: string, fixtureId: string, runtime: RuntimeName): string {
  return resolve(reportsDir, `${fixtureId}.${runtime}.report.json`);
}

function screenshotPath(screenshotsDir: string, fixtureId: string, runtime: RuntimeName): string {
  return resolve(screenshotsDir, `${fixtureId}.${runtime}.png`);
}
