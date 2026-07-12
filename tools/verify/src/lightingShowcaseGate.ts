import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import type { VerificationDiagnostic } from "./runner.js";
import { captureNative, writeAdapterReports } from "./ssgiGate.js";

const GATE_NAME = "lighting-showcase";
const EXAMPLE_ID = "lumen-lite-showcase";
const CROSS_RUNTIME_LUMINANCE_RATIO_MIN = 0.8;
const CROSS_RUNTIME_LUMINANCE_RATIO_MAX = 1.25;
const CROSS_RUNTIME_HAZE_DELTA_MAX = 1.35;
const CROSS_RUNTIME_DETAIL_RATIO_MIN = 0.3;
const CROSS_RUNTIME_DETAIL_RATIO_MAX = 2;
const CROSS_RUNTIME_CEILING_RATIO_MIN = 0.75;
const CROSS_RUNTIME_CEILING_RATIO_MAX = 1.35;
const CROSS_RUNTIME_RIGHT_ROOM_RATIO_MIN = 0.65;
const CROSS_RUNTIME_RIGHT_ROOM_RATIO_MAX = 1.45;

export interface LightingShowcaseMetrics {
  bloomHaloLuminance: number;
  ceilingAirLuminance: number;
  contrast: number;
  floorHazeLuminance: number;
  hazeGradientRatio: number;
  highlightFraction: number;
  meanLuminance: number;
  nonBlackFraction: number;
  overexposedFraction: number;
  rightRoomLuminance: number;
  shadowFraction: number;
  shaftLuminance: number;
  shaftNeighborLuminance: number;
  shaftRatio: number;
  surfaceDetailEnergy: number;
  warmChroma: number;
}

export function validateLightingShowcaseEvidence(evidence: {
  native: LightingShowcaseMetrics;
  nativePath: string;
  nativeReport: unknown;
  web: LightingShowcaseMetrics;
  webPath: string;
  webReport: unknown;
}): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  for (const [runtime, metrics, path, report] of [
    ["web", evidence.web, evidence.webPath, evidence.webReport],
    ["native", evidence.native, evidence.nativePath, evidence.nativeReport],
  ] as const) {
    if (metrics.nonBlackFraction < 0.3 || metrics.contrast < 0.09) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_CONTENT_MISSING", `${runtime} hero interior must contain a readable, high-contrast enclosed room.`, path));
    }
    if (metrics.highlightFraction < 0.002) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_WINDOWS_MISSING", `${runtime} hero interior must contain blown window highlights.`, path));
    }
    if (metrics.overexposedFraction > 0.14) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_CLIPPING", `${runtime} hero interior must retain room detail outside bounded window highlights.`, path));
    }
    if (metrics.shadowFraction < 0.12 || metrics.shadowFraction > 0.82) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_SHADOW_RANGE", `${runtime} hero interior must preserve deep but readable shadow falloff.`, path));
    }
    if (metrics.warmChroma < 0.008) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_WARM_MIDS_MISSING", `${runtime} hero interior must retain warm amber indirect mids.`, path));
    }
    if (metrics.shaftRatio < 1.15) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_SHAFT_NOT_VISIBLE", `${runtime} shaft luminance ratio ${metrics.shaftRatio.toFixed(3)} must be at least 1.15 versus adjacent shadowed air.`, path));
    }
    if (metrics.hazeGradientRatio < 2) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_HAZE_GRADIENT_MISSING", `${runtime} floor-adjacent/ceiling air luminance ratio ${metrics.hazeGradientRatio.toFixed(3)} must be at least 2.0 to prove visible height falloff.`, path));
    }
    if (metrics.bloomHaloLuminance < 0.08) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_BLOOM_HALO_MISSING", `${runtime} window halo luminance ${metrics.bloomHaloLuminance.toFixed(3)} must remain visibly above the dark room.`, path));
    }
    if (metrics.surfaceDetailEnergy < 0.0015) {
      diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_SURFACE_DETAIL_MISSING", `${runtime} ceiling/wall surface response must retain measurable indirect/reflection detail.`, path));
    }
    validateFeatureReport(runtime, report, path, diagnostics);
  }
  const luminanceRatio = evidence.native.meanLuminance / Math.max(0.001, evidence.web.meanLuminance);
  if (luminanceRatio < CROSS_RUNTIME_LUMINANCE_RATIO_MIN || luminanceRatio > CROSS_RUNTIME_LUMINANCE_RATIO_MAX) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_EXPOSURE_PARITY", `Native/web mean luminance ratio ${luminanceRatio.toFixed(3)} must remain within ${CROSS_RUNTIME_LUMINANCE_RATIO_MIN.toFixed(2)}..${CROSS_RUNTIME_LUMINANCE_RATIO_MAX.toFixed(2)}.`, evidence.nativePath));
  }
  const contrastRatio = evidence.native.contrast / Math.max(0.001, evidence.web.contrast);
  if (contrastRatio < 0.6 || contrastRatio > 1.6) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_CONTRAST_PARITY", `Native/web contrast ratio ${contrastRatio.toFixed(3)} must preserve comparable tonal separation.`, evidence.nativePath));
  }
  if (Math.abs(evidence.native.shaftRatio - evidence.web.shaftRatio) > 0.35) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_SHAFT_PARITY", "Web/native shaft contrast ratios must remain within 0.35.", evidence.nativePath));
  }
  if (Math.abs(evidence.native.hazeGradientRatio - evidence.web.hazeGradientRatio) > CROSS_RUNTIME_HAZE_DELTA_MAX) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_HAZE_PARITY", `Web/native height-haze gradient ratios must remain within ${CROSS_RUNTIME_HAZE_DELTA_MAX.toFixed(2)}.`, evidence.nativePath));
  }
  if (Math.abs(evidence.native.bloomHaloLuminance - evidence.web.bloomHaloLuminance) > 0.12) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_BLOOM_PARITY", "Web/native window halo luminance must remain within 0.12.", evidence.nativePath));
  }
  if (Math.abs(evidence.native.shaftLuminance - evidence.web.shaftLuminance) > 0.1
    || Math.abs(evidence.native.shaftNeighborLuminance - evidence.web.shaftNeighborLuminance) > 0.05) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_SHAFT_LUMINANCE_PARITY", "Web/native shaft and neighboring-air mean luminance must remain inside the shared 0.10/0.05 region bands.", evidence.nativePath));
  }
  if (Math.abs(evidence.native.floorHazeLuminance - evidence.web.floorHazeLuminance) > 0.05) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_HAZE_LUMINANCE_PARITY", "Web/native floor-adjacent haze mean luminance must remain within 0.05.", evidence.nativePath));
  }
  const ceilingRatio = evidence.native.ceilingAirLuminance / Math.max(0.001, evidence.web.ceilingAirLuminance);
  if (Math.abs(evidence.native.ceilingAirLuminance - evidence.web.ceilingAirLuminance) > 0.02
    && (ceilingRatio < CROSS_RUNTIME_CEILING_RATIO_MIN || ceilingRatio > CROSS_RUNTIME_CEILING_RATIO_MAX)) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_CEILING_PARITY", `Native/web ceiling-air luminance ratio ${ceilingRatio.toFixed(3)} must remain within ${CROSS_RUNTIME_CEILING_RATIO_MIN.toFixed(2)}..${CROSS_RUNTIME_CEILING_RATIO_MAX.toFixed(2)}.`, evidence.nativePath));
  }
  const rightRoomRatio = evidence.native.rightRoomLuminance / Math.max(0.001, evidence.web.rightRoomLuminance);
  if (Math.abs(evidence.native.rightRoomLuminance - evidence.web.rightRoomLuminance) > 0.02
    && (rightRoomRatio < CROSS_RUNTIME_RIGHT_ROOM_RATIO_MIN || rightRoomRatio > CROSS_RUNTIME_RIGHT_ROOM_RATIO_MAX)) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_RIGHT_ROOM_PARITY", `Native/web right-room luminance ratio ${rightRoomRatio.toFixed(3)} must remain within ${CROSS_RUNTIME_RIGHT_ROOM_RATIO_MIN.toFixed(2)}..${CROSS_RUNTIME_RIGHT_ROOM_RATIO_MAX.toFixed(2)}.`, evidence.nativePath));
  }
  if (Math.abs(evidence.native.warmChroma - evidence.web.warmChroma) > 0.06) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_CHROMA_PARITY", "Web/native whole-frame warm chroma must remain within 0.06.", evidence.nativePath));
  }
  const detailRatio = evidence.native.surfaceDetailEnergy / Math.max(0.0001, evidence.web.surfaceDetailEnergy);
  if (detailRatio < CROSS_RUNTIME_DETAIL_RATIO_MIN || detailRatio > CROSS_RUNTIME_DETAIL_RATIO_MAX) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_SURFACE_DETAIL_PARITY", `Web/native surface-detail energy ratio ${detailRatio.toFixed(3)} must remain within ${CROSS_RUNTIME_DETAIL_RATIO_MIN.toFixed(1)}..${CROSS_RUNTIME_DETAIL_RATIO_MAX.toFixed(1)} without requiring native high-frequency noise.`, evidence.nativePath));
  }
  return diagnostics;
}

export async function runLightingShowcaseGate(options: { root?: string } = {}): Promise<{ diagnostics: VerificationDiagnostic[]; ok: boolean; reportPath: string }> {
  const root = resolve(options.root ?? process.cwd());
  const bundlePath = lightingShowcaseBundlePath(root);
  const targets = resolveArtifactTargets({ gate: GATE_NAME, owner: { kind: "aggregate" }, root });
  const reportPath = targets.reportPath;
  const artifactDir = resolve(reportPath, "..");
  const screenshotsDir = resolve(artifactDir, "screenshots");
  const reportsDir = resolve(artifactDir, "reports");
  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  const paths = {
    contactSheet: resolve(artifactDir, "contact-sheet.svg"),
    native: resolve(screenshotsDir, `${EXAMPLE_ID}.native.png`),
    web: resolve(screenshotsDir, `${EXAMPLE_ID}.web.png`),
  };
  const webReportPath = resolve(reportsDir, `${EXAMPLE_ID}.web.report.json`);
  const nativeReportPath = resolve(reportsDir, `${EXAMPLE_ID}.native.report.json`);
  const reports = await writeAdapterReports(
    root,
    bundlePath,
    EXAMPLE_ID,
    webReportPath,
    nativeReportPath,
  );
  const runtimeReady = await captureWebShowcase(root, bundlePath, paths.web);
  const webReport = isRecord(reports.webReport)
    ? { ...reports.webReport, contactShadows: contactShadowObservations(runtimeReady) }
    : reports.webReport;
  await writeFile(webReportPath, `${JSON.stringify(webReport, null, 2)}\n`, "utf8");
  await captureNative(root, bundlePath, paths.native, 120);
  const [web, native] = await Promise.all([analyzeScreenshot(root, paths.web), analyzeScreenshot(root, paths.native)]);
  const diagnostics = validateLightingShowcaseEvidence({
    native,
    nativePath: paths.native,
    nativeReport: reports.nativeReport,
    web,
    webPath: paths.web,
    webReport,
  });
  await writeContactSheet(paths.contactSheet);
  const ok = diagnostics.every((entry) => entry.severity !== "error");
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: {
      ...targets.metadata,
      contactSheetPath: toRepoRelative(root, paths.contactSheet),
      nativeScreenshotPath: toRepoRelative(root, paths.native),
      webScreenshotPath: toRepoRelative(root, paths.web),
    },
    code: ok ? "TN_VERIFY_LIGHTING_SHOWCASE_OK" : "TN_VERIFY_LIGHTING_SHOWCASE_FAILED",
    diagnostics,
    exampleId: EXAMPLE_ID,
    generatedBy: "@threenative/verify-tools lightingShowcaseGate",
    metrics: { native, web },
    ok,
    schema: "threenative.verify.lighting-showcase",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

export function lightingShowcaseBundlePath(root: string): string {
  // The focused descriptor builds this project immediately before capture.
  // Its older conformance copy can contain generated adapter-proof meshes
  // which are not part of the authored scene.
  return resolve(root, "examples/lumen-lite-showcase/dist/lumen-lite-showcase.bundle");
}

async function captureWebShowcase(root: string, bundlePath: string, outPath: string): Promise<unknown> {
  const [{ startWebPreview }, { captureScreenshot }] = await Promise.all([
    import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as Promise<{
      startWebPreview(options: { bundlePath: string; silent: boolean }): Promise<{ close(): Promise<void> | void; url: string }>;
    }>,
    import(pathToFileURL(resolve(root, "packages/cli/dist/commands/visualProof.js")).href) as Promise<{
      captureScreenshot(options: { outPath: string; settleMs: number; url: string; waitReady: boolean }): Promise<{
        diagnostics?: Array<{ message?: string; severity?: string }>;
        page?: { browserLogs?: string[]; errors?: string[] };
        runtimeReady?: unknown;
      }>;
    }>,
  ]);
  const server = await startWebPreview({ bundlePath, silent: true });
  try {
    const result = await captureScreenshot({ outPath, settleMs: 900, url: server.url, waitReady: true });
    const failure = result.diagnostics?.find((entry) => entry.severity !== "warning");
    if (failure !== undefined) throw new Error(failure.message ?? "Web lighting-showcase capture failed.");
    const pageFailure = result.page?.errors?.[0] ?? result.page?.browserLogs?.find((entry) => /^(error:)|shader error|webglprogram.*not valid/i.test(entry));
    if (pageFailure !== undefined) throw new Error(`Web lighting-showcase runtime console failure: ${pageFailure}`);
    return result.runtimeReady;
  } finally {
    await server.close();
  }
}

function contactShadowObservations(runtimeReady: unknown): unknown[] {
  return isRecord(runtimeReady) && Array.isArray(runtimeReady.contactShadows) ? runtimeReady.contactShadows : [];
}

async function analyzeScreenshot(root: string, path: string): Promise<LightingShowcaseMetrics> {
  if ((await stat(path)).size <= 0) return emptyMetrics();
  const { readPngFrame } = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/compareImages.js")).href) as {
    readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }>;
  };
  const frame = await readPngFrame(path);
  let highlights = 0;
  let nonBlack = 0;
  let overexposed = 0;
  let shadows = 0;
  let sum = 0;
  let sumSquared = 0;
  let warm = 0;
  let count = 0;
  for (let y = 0; y < frame.height; y += 3) for (let x = 0; x < frame.width; x += 3) {
    const index = (y * frame.width + x) * 4;
    const red = Number(frame.data[index] ?? 0) / 255;
    const green = Number(frame.data[index + 1] ?? 0) / 255;
    const blue = Number(frame.data[index + 2] ?? 0) / 255;
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    if (luminance > 0.025) nonBlack += 1;
    if (luminance < 0.08) shadows += 1;
    if (luminance > 0.82) highlights += 1;
    if (red > 0.98 && green > 0.98 && blue > 0.98) overexposed += 1;
    warm += red - blue;
    sum += luminance;
    sumSquared += luminance * luminance;
    count += 1;
  }
  const meanLuminance = sum / Math.max(1, count);
  const shaftLuminance = regionMeanLuminance(frame, [64 / 1280, 324 / 720, 256 / 1280, 110 / 720]);
  const shaftNeighborLuminance = regionMeanLuminance(frame, [590 / 1280, 345 / 720, 180 / 1280, 90 / 720]);
  const floorHazeLuminance = regionMeanLuminance(frame, [26 / 1280, 540 / 720, 290 / 1280, 120 / 720]);
  const ceilingAirLuminance = regionMeanLuminance(frame, [384 / 1280, 14 / 720, 384 / 1280, 72 / 720]);
  const rightRoomLuminance = regionMeanLuminance(frame, [800 / 1280, 180 / 720, 480 / 1280, 360 / 720]);
  return {
    bloomHaloLuminance: regionMeanLuminance(frame, [224 / 1280, 180 / 720, 192 / 1280, 140 / 720]),
    ceilingAirLuminance,
    contrast: Math.sqrt(Math.max(0, sumSquared / Math.max(1, count) - meanLuminance * meanLuminance)),
    floorHazeLuminance,
    hazeGradientRatio: floorHazeLuminance / Math.max(0.001, ceilingAirLuminance),
    highlightFraction: highlights / Math.max(1, count),
    meanLuminance,
    nonBlackFraction: nonBlack / Math.max(1, count),
    overexposedFraction: overexposed / Math.max(1, count),
    rightRoomLuminance,
    shadowFraction: shadows / Math.max(1, count),
    shaftLuminance,
    shaftNeighborLuminance,
    shaftRatio: shaftLuminance / Math.max(0.001, shaftNeighborLuminance),
    surfaceDetailEnergy: regionDetailEnergy(frame, [20 / 1280, 70 / 720, 650 / 1280, 100 / 720]),
    warmChroma: warm / Math.max(1, count),
  };
}

function regionDetailEnergy(
  frame: { data: ArrayLike<number>; height: number; width: number },
  region: readonly [number, number, number, number],
): number {
  const [left, top, width, height] = region;
  const x0 = Math.max(0, Math.floor(left * frame.width));
  const y0 = Math.max(0, Math.floor(top * frame.height));
  const x1 = Math.min(frame.width - 1, Math.ceil((left + width) * frame.width));
  const y1 = Math.min(frame.height - 1, Math.ceil((top + height) * frame.height));
  const luminance = (x: number, y: number): number => {
    const index = (y * frame.width + x) * 4;
    return (0.2126 * Number(frame.data[index] ?? 0) + 0.7152 * Number(frame.data[index + 1] ?? 0) + 0.0722 * Number(frame.data[index + 2] ?? 0)) / 255;
  };
  let energy = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const center = luminance(x, y);
    energy += (Math.abs(center - luminance(x + 1, y)) + Math.abs(center - luminance(x, y + 1))) * 0.5;
    count += 1;
  }
  return energy / Math.max(1, count);
}

function regionMeanLuminance(
  frame: { data: ArrayLike<number>; height: number; width: number },
  region: readonly [number, number, number, number],
): number {
  const [left, top, width, height] = region;
  const x0 = Math.max(0, Math.floor(left * frame.width));
  const y0 = Math.max(0, Math.floor(top * frame.height));
  const x1 = Math.min(frame.width, Math.ceil((left + width) * frame.width));
  const y1 = Math.min(frame.height, Math.ceil((top + height) * frame.height));
  let sum = 0;
  let count = 0;
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const index = (y * frame.width + x) * 4;
    sum += 0.2126 * Number(frame.data[index] ?? 0) / 255
      + 0.7152 * Number(frame.data[index + 1] ?? 0) / 255
      + 0.0722 * Number(frame.data[index + 2] ?? 0) / 255;
    count += 1;
  }
  return sum / Math.max(1, count);
}

function validateFeatureReport(runtime: "native" | "web", report: unknown, path: string, diagnostics: VerificationDiagnostic[]): void {
  if (!isRecord(report)) {
    diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_REPORT_MISSING", `${runtime} showcase conformance report is missing.`, path));
    return;
  }
  const environment = isRecord(report.environment) ? report.environment : undefined;
  const volumetrics = environment && isRecord(environment.volumetrics) ? environment.volumetrics : undefined;
  const baked = environment && isRecord(environment.bakedGiProbes) ? environment.bakedGiProbes : undefined;
  const renderer = isRecord(report.runtimeConfig) && isRecord(report.runtimeConfig.renderer) ? report.runtimeConfig.renderer : undefined;
  const post = renderer && isRecord(renderer.postProcessing) ? renderer.postProcessing : undefined;
  const appliedPost = post && Array.isArray(post.applied) ? post.applied : [];
  const contactShadows = Array.isArray(report.contactShadows) ? report.contactShadows : [];
  const missing = [
    !isApplied(volumetrics, "godRays") && "god-rays",
    !isApplied(volumetrics, "heightFog") && "height-fog",
    !(baked?.applied === true) && "baked-gi",
    !appliedPost.includes("bloom") && "bloom",
    contactShadows.length === 0 && "contact-shadows",
  ].filter((value): value is string => typeof value === "string");
  if (missing.length > 0) diagnostics.push(diagnostic("TN_VERIFY_LIGHTING_SHOWCASE_FEATURE_REPORT", `${runtime} showcase report must confirm the composed lighting stack; missing: ${missing.join(", ")}.`, path));
}

function isApplied(volumetrics: Record<string, unknown> | undefined, key: string): boolean {
  return volumetrics !== undefined && isRecord(volumetrics[key]) && volumetrics[key].applied === true;
}

async function writeContactSheet(path: string): Promise<void> {
  await writeFile(path, `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="770" viewBox="0 0 1280 770"><rect width="1280" height="770" fill="#11151a"/><text x="16" y="28" fill="white" font-family="sans-serif" font-size="18">Web</text><text x="656" y="28" fill="white" font-family="sans-serif" font-size="18">Native</text><image href="screenshots/${EXAMPLE_ID}.web.png" x="0" y="40" width="640" height="360"/><image href="screenshots/${EXAMPLE_ID}.native.png" x="640" y="40" width="640" height="360"/><image href="../../../../image.png" x="320" y="410" width="640" height="360" preserveAspectRatio="xMidYMid meet"/></svg>\n`, "utf8");
}

function emptyMetrics(): LightingShowcaseMetrics {
  return { bloomHaloLuminance: 0, ceilingAirLuminance: 0, contrast: 0, floorHazeLuminance: 0, hazeGradientRatio: 0, highlightFraction: 0, meanLuminance: 0, nonBlackFraction: 0, overexposedFraction: 0, rightRoomLuminance: 0, shadowFraction: 1, shaftLuminance: 0, shaftNeighborLuminance: 0, shaftRatio: 0, surfaceDetailEnergy: 0, warmChroma: 0 };
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic { return { code, message, path, severity: "error" }; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }

if (process.argv[1] === new URL(import.meta.url).pathname) void runLightingShowcaseGate().then((result) => {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}).catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
