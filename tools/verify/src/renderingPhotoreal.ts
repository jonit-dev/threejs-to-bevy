import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);

const legacyAoScreenshotNames = [
  "ao-composer-noao.web.png",
  "ao-current-ao.web.png",
  "ao-current-noao.web.png",
  "ao-sweep-disabled.bevy.png",
  "ao-sweep-disabled.web.png",
  "ao-sweep-r01-i01.web.png",
  "ao-sweep-r075-i05.web.png",
  "manual-ao-xvfb.bevy.png",
] as const;

type RuntimeName = "bevy" | "web";

interface PhotorealFixtureDefinition {
  bundlePath: string;
  captureFrames?: number;
  captureSettleMs?: number;
  expectedPostProcessing?: string;
  id: string;
  reportAssertions: "ambient-occlusion" | "bloom" | "depth-of-field" | "motion-blur" | "screen-space-reflections" | "none";
  sampleRegions: PhotorealSampleRegion[];
  transformTraceEntityId?: string;
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
    bundlePath: "packages/ir/fixtures/conformance/photoreal-ao-sweep-low/game.bundle",
    expectedPostProcessing: "ambientOcclusion",
    id: "photoreal-ao-sweep-low",
    reportAssertions: "ambient-occlusion",
    sampleRegions: [
      photorealRegion("left-wall", 0.16, 0.22, 0.12, 0.2, 0.04),
      photorealRegion("floor", 0.42, 0.72, 0.16, 0.08, 0.04),
      photorealRegion("contact-corner", 0.3, 0.45, 0.14, 0.16, 0.04),
    ],
  },
  {
    bundlePath: "packages/ir/fixtures/conformance/photoreal-ao-sweep-high/game.bundle",
    expectedPostProcessing: "ambientOcclusion",
    id: "photoreal-ao-sweep-high",
    reportAssertions: "ambient-occlusion",
    sampleRegions: [
      photorealRegion("left-wall", 0.16, 0.22, 0.12, 0.2, 0.05),
      photorealRegion("floor", 0.42, 0.72, 0.16, 0.08, 0.05),
      photorealRegion("contact-corner", 0.3, 0.45, 0.14, 0.16, 0.05),
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
      photorealRegion("pedestal-top", 0.43, 0.42, 0.14, 0.06, 0.04, 0.005, 0.005),
      photorealRegion("wall-gradient-midpoint", 0.46, 0.35, 0.08, 0.08, 0.04, 0.005),
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
      photorealRegion("near-sphere-highlight", 0.25, 0.51, 0.05, 0.07, 0.035),
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
      photorealRegion("motion-trail", 0.43, 0.27, 0.06, 0.14, 0.075, 0.005),
      photorealRegion("trailing-exterior", 0.453, 0.274, 0.02, 0.081, 0.075),
      photorealRegion("leading-exterior", 0.522, 0.274, 0.02, 0.081, 0.075),
      photorealRegion("back-wall", 0.35, 0.1, 0.3, 0.14, 0.04),
      photorealRegion("floor", 0.42, 0.72, 0.16, 0.08, 0.02),
    ],
    transformTraceEntityId: "motion.marker",
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
      photorealRegion("cyan-bar-floor-reflection", 0.38, 0.49, 0.13, 0.08, 0.07, 0.01),
      photorealRegion("cube-front-face", 0.55, 0.27, 0.08, 0.18, 0.05),
      photorealRegion("bare-floor", 0.13, 0.62, 0.16, 0.08, 0.03),
    ],
  },
];

export interface PhotorealSampleRegion {
  id: string;
  region: { height: number; width: number; x: number; y: number };
  threshold: { maxAverageChannelDelta: number; minRuntimeAverageLuminance?: number; minRuntimeLuminanceStdDev?: number };
}

export interface PhotorealRegionMetric {
  averageChannelDelta: number;
  bevyAverageLuminance: number;
  fixtureId: string;
  id: string;
  maxChannelDelta: number;
  bevyLuminanceStdDev: number;
  effectOk: boolean;
  ok: boolean;
  parityOk: boolean;
  region: { height: number; width: number; x: number; y: number };
  threshold: { maxAverageChannelDelta: number; minRuntimeAverageLuminance?: number; minRuntimeLuminanceStdDev?: number };
  webAverageLuminance: number;
  webLuminanceStdDev: number;
}

function photorealRegion(id: string, x: number, y: number, width: number, height: number, maxAverageChannelDelta: number, minRuntimeLuminanceStdDev?: number, minRuntimeAverageLuminance?: number): PhotorealSampleRegion {
  return {
    id,
    region: { height, width, x, y },
    threshold: {
      maxAverageChannelDelta,
      ...(minRuntimeAverageLuminance === undefined ? {} : { minRuntimeAverageLuminance }),
      ...(minRuntimeLuminanceStdDev === undefined ? {} : { minRuntimeLuminanceStdDev }),
    },
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
      bevyTransformTracePath?: string;
      webTransformTracePath?: string;
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
  await Promise.all(legacyAoScreenshotNames.map((name) => rm(resolve(screenshotsDir, name), { force: true })));

  const evidenceMode = options.metricsPath === undefined ? "captured-screenshots" : "screenshot-metrics";
  const metrics = options.metricsPath === undefined
    ? await capturePhotorealEvidence({ reportsDir, root, screenshotsDir })
    : JSON.parse(await readFile(options.metricsPath, "utf8")) as PhotorealRenderingMetrics;
  const regionMetrics = evidenceMode === "captured-screenshots"
    ? await derivePhotorealRegionMetrics({ metrics, root })
    : [];
  const diagnostics = await analyzePhotorealEvidence({ metrics, regionMetrics, reportsDir, requireCaptureTraces: evidenceMode === "captured-screenshots", root });
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
      const tracePaths = fixture.transformTraceEntityId === undefined ? {} : {
        bevyTransformTracePath: toRepoRelative(root, transformTracePath(reportsDir, fixture.id, "bevy")),
        webTransformTracePath: toRepoRelative(root, transformTracePath(reportsDir, fixture.id, "web")),
      };
      return {
        bevyReportPath: toRepoRelative(root, reportPath(reportsDir, fixture.id, "bevy")),
        bevyScreenshotPath: sample?.bevy.screenshotPath ?? toRepoRelative(root, screenshotPath(screenshotsDir, fixture.id, "bevy")),
        fixtureId: fixture.id,
        ...tracePaths,
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
  type CaptureScreenshot = (options: { outPath: string; settleMs?: number; url: string; waitReady: boolean }) => Promise<{ diagnostics?: Array<{ code?: string; message?: string; severity?: string }>; runtimeReady?: unknown }>;
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
    if (fixture.transformTraceEntityId !== undefined) {
      await Promise.all([
        rm(transformTracePath(options.reportsDir, fixture.id, "web"), { force: true }),
        rm(transformTracePath(options.reportsDir, fixture.id, "bevy"), { force: true }),
      ]);
    }

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
      if (fixture.transformTraceEntityId !== undefined) {
        captureUrl.searchParams.set("captureTraceEntity", fixture.transformTraceEntityId);
      }
      const capture = await captureScreenshot({ outPath: webScreenshotPath, settleMs: fixture.captureSettleMs, url: captureUrl.href, waitReady: true });
      if (fixture.transformTraceEntityId !== undefined) {
        const trace = (capture.runtimeReady as { captureTransformTrace?: unknown } | undefined)?.captureTransformTrace;
        if (trace !== undefined) {
          await writeFile(transformTracePath(options.reportsDir, fixture.id, "web"), `${JSON.stringify(trace, null, 2)}\n`, "utf8");
        }
      }
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
      transformTraceEntityId: fixture.transformTraceEntityId,
      transformTracePath: fixture.transformTraceEntityId === undefined ? undefined : transformTracePath(options.reportsDir, fixture.id, "bevy"),
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

async function captureBevyScreenshot(options: { bundlePath: string; fixtureId: string; outPath: string; root: string; transformTraceEntityId?: string; transformTracePath?: string }): Promise<void> {
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

async function runNativeCaptureCommand(options: { bundlePath: string; outPath: string; root: string; transformTraceEntityId?: string; transformTracePath?: string }): Promise<void> {
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
  if (options.transformTraceEntityId !== undefined && options.transformTracePath !== undefined) {
    args.push("--transform-trace", options.transformTraceEntityId, options.transformTracePath);
  }
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
  requireCaptureTraces: boolean;
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
        message: `${fixture.id} sample region '${regionMetric.id}' lacks required effect strength: web mean/stddev ${regionMetric.webAverageLuminance}/${regionMetric.webLuminanceStdDev}, Bevy ${regionMetric.bevyAverageLuminance}/${regionMetric.bevyLuminanceStdDev}, minimum mean/stddev ${regionMetric.threshold.minRuntimeAverageLuminance ?? "n/a"}/${regionMetric.threshold.minRuntimeLuminanceStdDev ?? "n/a"}.`,
        path: toRepoRelative(options.root, resolve(options.reportsDir, "..", "region-metrics.json")),
        severity: "error",
        suggestedFix: "Fix the owning post-processing implementation until both runtimes render the required local effect strength and variation.",
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
    if (options.requireCaptureTraces && fixture.transformTraceEntityId !== undefined) {
      diagnostics.push(...await captureTransformTraceDiagnostics({
        bevyPath: transformTracePath(options.reportsDir, fixture.id, "bevy"),
        entityId: fixture.transformTraceEntityId,
        fixtureId: fixture.id,
        root: options.root,
        webPath: transformTracePath(options.reportsDir, fixture.id, "web"),
      }));
    }
  }
  diagnostics.push(...aoSweepMonotonicityDiagnostics(options.regionMetrics, options.root, options.reportsDir));
  diagnostics.push(...motionTrailDiagnostics(options.regionMetrics, options.root, options.reportsDir));
  return diagnostics;
}

interface CaptureTransformTraceSample {
  elapsedSeconds: number;
  enginePreviousWorldPosition?: [number, number, number] | null;
  frame: number;
  previousWorldPosition: [number, number, number] | null;
  sourcePosition: [number, number, number];
  worldDelta: [number, number, number] | null;
  worldDeltaMagnitude: number | null;
  worldPosition: [number, number, number];
}

interface CaptureTransformTrace {
  captureRequest: { assetsReady: boolean; issuedHostFrame: number; requestedFrame: number; runtimeFrame: number } | null;
  entityId: string;
  fixedDeltaSeconds: number;
  historySource: "capture-harness-prior-rendered-sample";
  runtime: RuntimeName;
  samples: CaptureTransformTraceSample[];
  schema: string;
  version: string;
}

async function captureTransformTraceDiagnostics(options: {
  bevyPath: string;
  entityId: string;
  fixtureId: string;
  root: string;
  webPath: string;
}): Promise<VerificationDiagnostic[]> {
  let web: unknown;
  let bevy: unknown;
  try {
    [web, bevy] = await Promise.all([
      readFile(options.webPath, "utf8").then((source) => JSON.parse(source) as unknown),
      readFile(options.bevyPath, "utf8").then((source) => JSON.parse(source) as unknown),
    ]);
  } catch {
    return [{
      code: "TN_RENDERING_PHOTOREAL_MOTION_TRACE_MISSING",
      message: `${options.fixtureId} must capture durable web and Bevy transform traces.`,
      path: toRepoRelative(options.root, options.bevyPath),
      severity: "error",
      suggestedFix: "Capture both runtimes with the transform-trace option and keep the structured trace artifacts with the screenshots.",
    }];
  }
  return analyzeCaptureTransformTraces(web, bevy, {
    entityId: options.entityId,
    fixtureId: options.fixtureId,
    path: toRepoRelative(options.root, options.bevyPath),
    requestedFrame: 120,
  });
}

export function analyzeCaptureTransformTraces(
  webValue: unknown,
  bevyValue: unknown,
  options: { entityId: string; fixtureId: string; path: string; requestedFrame: number },
): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  const web = parseCaptureTransformTrace(webValue, "web");
  const bevy = parseCaptureTransformTrace(bevyValue, "bevy");
  if (web === undefined || bevy === undefined || web.entityId !== options.entityId || bevy.entityId !== options.entityId) {
    return [motionTraceDiagnostic(
      "TN_RENDERING_PHOTOREAL_MOTION_TRACE_INVALID",
      `${options.fixtureId} transform traces must use the capture trace schema and entity '${options.entityId}'.`,
      options.path,
    )];
  }
  const expectedFrames = [options.requestedFrame - 2, options.requestedFrame - 1, options.requestedFrame];
  for (const trace of [web, bevy]) {
    const request = trace.captureRequest;
    if (request === null
      || request.requestedFrame !== options.requestedFrame
      || request.issuedHostFrame !== options.requestedFrame
      || request.runtimeFrame !== options.requestedFrame
      || !request.assetsReady
      || trace.samples.length !== expectedFrames.length
      || trace.samples.some((sample, index) => sample.frame !== expectedFrames[index])) {
      diagnostics.push(motionTraceDiagnostic(
        "TN_RENDERING_PHOTOREAL_MOTION_CAPTURE_PHASE_MISMATCH",
        `${trace.runtime} ${options.fixtureId} must capture runtime frames ${expectedFrames.join(", ")} with the screenshot requested at ready frame ${options.requestedFrame}.`,
        options.path,
      ));
      continue;
    }
    for (let index = 0; index < trace.samples.length; index += 1) {
      const sample = trace.samples[index]!;
      if (Math.abs(sample.elapsedSeconds - sample.frame * trace.fixedDeltaSeconds) > 0.00001) {
        diagnostics.push(motionTraceDiagnostic(
          "TN_RENDERING_PHOTOREAL_MOTION_CAPTURE_CLOCK_MISMATCH",
          `${trace.runtime} frame ${sample.frame} elapsed time is not aligned to the deterministic fixed delta.`,
          options.path,
        ));
        break;
      }
      if (sample.previousWorldPosition === null || sample.worldDelta === null || sample.worldDeltaMagnitude === null
        || vectorMaximumDelta(subtractVector(sample.worldPosition, sample.previousWorldPosition), sample.worldDelta) > 0.001
        || Math.abs(Math.hypot(...sample.worldDelta) - sample.worldDeltaMagnitude) > 0.001
        || vectorMaximumDelta(sample.sourcePosition, sample.worldPosition) > 0.001
        || (index > 0 && vectorMaximumDelta(sample.previousWorldPosition, trace.samples[index - 1]!.worldPosition) > 0.001)) {
        diagnostics.push(motionTraceDiagnostic(
          "TN_RENDERING_PHOTOREAL_MOTION_FRAME_DELTA_CHAIN_MISMATCH",
          `${trace.runtime} frame ${sample.frame} does not preserve a coherent prior/current capture-harness transform chain.`,
          options.path,
        ));
        break;
      }
    }
  }
  if (diagnostics.some((diagnostic) => diagnostic.code === "TN_RENDERING_PHOTOREAL_MOTION_CAPTURE_PHASE_MISMATCH")) {
    return diagnostics;
  }
  for (let index = 0; index < expectedFrames.length; index += 1) {
    const webSample = web.samples[index]!;
    const bevySample = bevy.samples[index]!;
    if (Math.abs(webSample.elapsedSeconds - bevySample.elapsedSeconds) > 0.00001
      || vectorMaximumDelta(webSample.worldPosition, bevySample.worldPosition) > 0.002
      || webSample.worldDelta === null
      || bevySample.worldDelta === null
      || vectorMaximumDelta(webSample.worldDelta, bevySample.worldDelta) > 0.002) {
      diagnostics.push(motionTraceDiagnostic(
        "TN_RENDERING_PHOTOREAL_MOTION_RUNTIME_PHASE_MISMATCH",
        `${options.fixtureId} web and Bevy transforms diverge at frame ${expectedFrames[index]}.`,
        options.path,
      ));
      break;
    }
  }
  const webCapture = web.samples.at(-1);
  const bevyCapture = bevy.samples.at(-1);
  if (webCapture === undefined || bevyCapture === undefined
    || webCapture.worldDelta === null || bevyCapture.worldDelta === null
    || webCapture.worldDeltaMagnitude === null || bevyCapture.worldDeltaMagnitude === null
    || Math.hypot(...webCapture.worldDelta) < 0.05 || Math.hypot(...bevyCapture.worldDelta) < 0.05
    || webCapture.worldDelta[0] <= 0 || bevyCapture.worldDelta[0] <= 0) {
    diagnostics.push(motionTraceDiagnostic(
      "TN_RENDERING_PHOTOREAL_MOTION_CAPTURE_VELOCITY_ZERO",
      `${options.fixtureId} must have a positive, nonzero rendered transform delta at capture frame ${options.requestedFrame}.`,
      options.path,
    ));
  }
  return diagnostics;
}

function parseCaptureTransformTrace(value: unknown, runtime: RuntimeName): CaptureTransformTrace | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  const trace = value as Partial<CaptureTransformTrace>;
  if (trace.schema !== "threenative.capture-transform-trace" || trace.version !== "0.1.0" || trace.runtime !== runtime
    || typeof trace.entityId !== "string" || typeof trace.fixedDeltaSeconds !== "number"
    || trace.historySource !== "capture-harness-prior-rendered-sample" || !Array.isArray(trace.samples)) {
    return undefined;
  }
  return trace as CaptureTransformTrace;
}

function subtractVector(current: [number, number, number], previous: [number, number, number]): [number, number, number] {
  return [current[0] - previous[0], current[1] - previous[1], current[2] - previous[2]];
}

function vectorMaximumDelta(left: [number, number, number], right: [number, number, number]): number {
  return Math.max(Math.abs(left[0] - right[0]), Math.abs(left[1] - right[1]), Math.abs(left[2] - right[2]));
}

function motionTraceDiagnostic(code: string, message: string, path: string): VerificationDiagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
    suggestedFix: "Align deterministic capture clocks and preserve the capture harness's prior/current rendered transform pair before accepting temporal motion-blur evidence.",
  };
}

function aoSweepMonotonicityDiagnostics(
  regionMetrics: readonly PhotorealRegionMetric[],
  root: string,
  reportsDir: string,
): VerificationDiagnostic[] {
  const low = regionMetrics.find((metric) => metric.fixtureId === "photoreal-ao-sweep-low" && metric.id === "contact-corner");
  const high = regionMetrics.find((metric) => metric.fixtureId === "photoreal-ao-sweep-high" && metric.id === "contact-corner");
  if (low === undefined || high === undefined) {
    return [];
  }
  return (["web", "bevy"] as const).flatMap((runtime) => {
    const lowLuminance = runtime === "web" ? low.webAverageLuminance : low.bevyAverageLuminance;
    const highLuminance = runtime === "web" ? high.webAverageLuminance : high.bevyAverageLuminance;
    if (aoSweepDarkeningIsMonotonic(lowLuminance, highLuminance)) {
      return [];
    }
    return [{
      code: "TN_RENDERING_PHOTOREAL_AO_SWEEP_NON_MONOTONIC",
      message: `${runtime} AO contact-corner luminance did not darken as intensity increased: low ${lowLuminance}, high ${highLuminance}.`,
      path: toRepoRelative(root, resolve(reportsDir, "..", "region-metrics.json")),
      severity: "error" as const,
      suggestedFix: "Fix the adapter AO intensity approximation so stronger authored AO produces a darker contact corner.",
    }];
  });
}

export function aoSweepDarkeningIsMonotonic(lowLuminance: number, highLuminance: number): boolean {
  return highLuminance <= lowLuminance + 0.001;
}

function motionTrailDiagnostics(
  regionMetrics: readonly PhotorealRegionMetric[],
  root: string,
  reportsDir: string,
): VerificationDiagnostic[] {
  const trailing = regionMetrics.find((metric) => metric.fixtureId === "photoreal-motion-blur-moving-test" && metric.id === "trailing-exterior");
  const leading = regionMetrics.find((metric) => metric.fixtureId === "photoreal-motion-blur-moving-test" && metric.id === "leading-exterior");
  if (trailing === undefined || leading === undefined) {
    return [];
  }
  return (["web", "bevy"] as const).flatMap((runtime) => {
    const trailingLuminance = runtime === "web" ? trailing.webAverageLuminance : trailing.bevyAverageLuminance;
    const leadingLuminance = runtime === "web" ? leading.webAverageLuminance : leading.bevyAverageLuminance;
    if (motionTrailAsymmetryIsVisible(trailingLuminance, leadingLuminance)) {
      return [];
    }
    return [{
      code: "TN_RENDERING_PHOTOREAL_MOTION_TRAIL_MISSING",
      message: `${runtime} motion-blur evidence has no exterior trail: trailing luminance ${trailingLuminance}, leading luminance ${leadingLuminance}.`,
      path: toRepoRelative(root, resolve(reportsDir, "..", "region-metrics.json")),
      severity: "error" as const,
      suggestedFix: "Restore temporal frame history so the trailing exterior strip is visibly brighter than the matching leading strip.",
    }];
  });
}

export function motionTrailAsymmetryIsVisible(trailingLuminance: number, leadingLuminance: number): boolean {
  return trailingLuminance - leadingLuminance >= 0.01;
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
  const luminanceMinimum = sample.threshold.minRuntimeAverageLuminance;
  const webAverageLuminance = pixelCount === 0 ? 0 : webLumaSum / pixelCount;
  const bevyAverageLuminance = pixelCount === 0 ? 0 : bevyLumaSum / pixelCount;
  const effectOk = (effectMinimum === undefined || (webLuminanceStdDev >= effectMinimum && bevyLuminanceStdDev >= effectMinimum))
    && (luminanceMinimum === undefined || (webAverageLuminance >= luminanceMinimum && bevyAverageLuminance >= luminanceMinimum));
  return {
    averageChannelDelta: Number(average.toFixed(6)),
    bevyAverageLuminance: Number(bevyAverageLuminance.toFixed(6)),
    bevyLuminanceStdDev: Number(bevyLuminanceStdDev.toFixed(6)),
    effectOk,
    fixtureId,
    id: sample.id,
    maxChannelDelta: Number(max.toFixed(6)),
    ok: parityOk && effectOk,
    parityOk,
    region: sample.region,
    threshold: sample.threshold,
    webAverageLuminance: Number(webAverageLuminance.toFixed(6)),
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
  const expectedMode = "temporal-accumulation";
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

function transformTracePath(reportsDir: string, fixtureId: string, runtime: RuntimeName): string {
  return resolve(reportsDir, `${fixtureId}.${runtime}.transform-trace.json`);
}

function screenshotPath(screenshotsDir: string, fixtureId: string, runtime: RuntimeName): string {
  return resolve(screenshotsDir, `${fixtureId}.${runtime}.png`);
}
