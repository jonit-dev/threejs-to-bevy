import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import { loadFixtureCatalog } from "./conformance.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);
const GATE_NAME = "verify:volumetrics";

export interface VolumetricsScreenshotMetrics {
  baseFogLuminance: number;
  fogHeightGradient: number;
  luminanceStdDev: number;
  nonBackgroundFraction: number;
  shadowNeighborLuminance: number;
  shaftContrast: number;
  shaftLuminance: number;
  topFogLuminance: number;
}

export interface VolumetricsEvidence {
  nativeHeightControlMetrics: VolumetricsScreenshotMetrics;
  nativeShaftControlMetrics: VolumetricsScreenshotMetrics;
  fixtureId: string;
  nativeBytes: number;
  nativeMetrics: VolumetricsScreenshotMetrics;
  nativePath: string;
  nativeReport: unknown;
  webBytes: number;
  webHeightControlMetrics: VolumetricsScreenshotMetrics;
  webShaftControlMetrics: VolumetricsScreenshotMetrics;
  webMetrics: VolumetricsScreenshotMetrics;
  webPath: string;
  webReport: unknown;
}

export function validateVolumetricsEvidence(evidence: VolumetricsEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  validateFeatureReports(evidence, diagnostics);
  for (const [runtime, bytes, metrics, path] of [
    ["web", evidence.webBytes, evidence.webMetrics, evidence.webPath],
    ["native", evidence.nativeBytes, evidence.nativeMetrics, evidence.nativePath],
  ] as const) {
    if (bytes <= 0 || metrics.nonBackgroundFraction < 0.05 || metrics.luminanceStdDev < 0.02) {
      diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_SCREENSHOT_CONTENT_MISSING", `${runtime} volumetrics screenshot must be nonblank and contain measurable contrast.`, path));
    }
    if (!(metrics.shaftContrast > 0.008)) {
      diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_SHAFT_NOT_VISIBLE", `${runtime} shaft region must be brighter than its shadowed neighbor.`, path));
    }
  }
  for (const [runtime, enabled, control, path] of [
    ["web", evidence.webMetrics, evidence.webShaftControlMetrics, evidence.webPath],
    ["native", evidence.nativeMetrics, evidence.nativeShaftControlMetrics, evidence.nativePath],
  ] as const) {
    const shaftResponse = enabled.shaftContrast - control.shaftContrast;
    if (!(shaftResponse > 0.005)) {
      diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_SHAFT_CONTROL_FAILED", `${runtime} enabled capture must increase shaft-versus-shadow contrast relative to its disabled control.`, path));
    }
  }
  const webBaseLift = evidence.webMetrics.baseFogLuminance - evidence.webHeightControlMetrics.baseFogLuminance;
  const webTopLift = evidence.webMetrics.topFogLuminance - evidence.webHeightControlMetrics.topFogLuminance;
  if (!(webBaseLift > webTopLift + 0.005)) {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_HEIGHT_CONTROL_FAILED", "web enabled capture must add more fog response at the column base than at the top relative to its height-fog-disabled control.", evidence.webPath));
  }
  const nativeBaseLift = evidence.nativeMetrics.baseFogLuminance - evidence.nativeHeightControlMetrics.baseFogLuminance;
  const nativeTopLift = evidence.nativeMetrics.topFogLuminance - evidence.nativeHeightControlMetrics.topFogLuminance;
  if (!(Math.abs(nativeBaseLift) + Math.abs(nativeTopLift) > 0.01)) {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_HEIGHT_CONTROL_FAILED", "native enabled capture must show a measurable analytic height-fog response relative to its disabled control.", evidence.nativePath));
  }
  if (Math.abs(evidence.webMetrics.shaftContrast - evidence.nativeMetrics.shaftContrast) > 0.6) {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_SHAFT_PARITY_MISMATCH", "Web and native adapter-calibrated shaft contrast must remain inside the bounded 0.6 region envelope.", evidence.nativePath));
  }
  if (Math.abs(evidence.webMetrics.fogHeightGradient - evidence.nativeMetrics.fogHeightGradient) > 0.3) {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_HEIGHT_PARITY_MISMATCH", "Web and native fog height gradients must remain inside the bounded 0.3 region envelope.", evidence.nativePath));
  }
  return diagnostics;
}

export async function runVolumetricsGate(options: { reportPath?: string; root?: string } = {}): Promise<{
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "volumetrics", owner: { kind: "aggregate" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const artifactDir = resolve(reportPath, "..");
  const screenshotsDir = resolve(artifactDir, "screenshots");
  const reportsDir = resolve(artifactDir, "reports");
  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  const catalog = await loadFixtureCatalog(root);
  const fixtures = catalog.fixtures.filter((fixture) => fixture.aggregateGate === GATE_NAME);
  const diagnostics: VerificationDiagnostic[] = [];
  const fixtureResults = [];
  if (fixtures.length === 0) {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_FIXTURE_MISSING", `The fixture catalog must enroll a fixture in '${GATE_NAME}'.`, "packages/ir/fixtures/conformance/fixture-catalog.json"));
  }
  for (const fixture of fixtures) {
    const bundlePath = resolve(root, fixture.bundlePath);
    const webPath = resolve(screenshotsDir, `${fixture.canonicalId}.web.png`);
    const nativePath = resolve(screenshotsDir, `${fixture.canonicalId}.native.png`);
    const webReportPath = resolve(reportsDir, `${fixture.canonicalId}.web.report.json`);
    const nativeReportPath = resolve(reportsDir, `${fixture.canonicalId}.native.report.json`);
    const { nativeReport, webReport } = await writeAdapterReports(root, bundlePath, fixture.canonicalId, webReportPath, nativeReportPath);
    const webHeightControlPath = resolve(screenshotsDir, `${fixture.canonicalId}.height-control.web.png`);
    const nativeHeightControlPath = resolve(screenshotsDir, `${fixture.canonicalId}.height-control.native.png`);
    const webShaftControlPath = resolve(screenshotsDir, `${fixture.canonicalId}.shaft-control.web.png`);
    const nativeShaftControlPath = resolve(screenshotsDir, `${fixture.canonicalId}.shaft-control.native.png`);
    const heightControlBundlePath = await createControlBundle(bundlePath, "heightFog");
    const shaftControlBundlePath = await createControlBundle(bundlePath, "godRays");
    try {
      await captureWeb(root, bundlePath, webPath);
      await captureNative(root, bundlePath, nativePath);
      await captureWeb(root, heightControlBundlePath, webHeightControlPath);
      await captureNative(root, heightControlBundlePath, nativeHeightControlPath);
      await captureWeb(root, shaftControlBundlePath, webShaftControlPath);
      await captureNative(root, shaftControlBundlePath, nativeShaftControlPath);
    } finally {
      await rm(resolve(heightControlBundlePath, ".."), { force: true, recursive: true });
      await rm(resolve(shaftControlBundlePath, ".."), { force: true, recursive: true });
    }
    const evidence: VolumetricsEvidence = {
      fixtureId: fixture.canonicalId,
      nativeBytes: (await stat(nativePath)).size,
      nativeHeightControlMetrics: await analyzeScreenshot(root, nativeHeightControlPath, "native"),
      nativeShaftControlMetrics: await analyzeScreenshot(root, nativeShaftControlPath, "native"),
      nativeMetrics: await analyzeScreenshot(root, nativePath, "native"),
      nativePath,
      nativeReport,
      webBytes: (await stat(webPath)).size,
      webHeightControlMetrics: await analyzeScreenshot(root, webHeightControlPath, "web"),
      webShaftControlMetrics: await analyzeScreenshot(root, webShaftControlPath, "web"),
      webMetrics: await analyzeScreenshot(root, webPath, "web"),
      webPath,
      webReport,
    };
    const fixtureDiagnostics = validateVolumetricsEvidence(evidence);
    diagnostics.push(...fixtureDiagnostics);
    fixtureResults.push({
      artifacts: {
        nativeReportPath: toRepoRelative(root, nativeReportPath),
        nativeHeightControlScreenshotPath: toRepoRelative(root, nativeHeightControlPath),
        nativeShaftControlScreenshotPath: toRepoRelative(root, nativeShaftControlPath),
        nativeScreenshotPath: toRepoRelative(root, nativePath),
        webReportPath: toRepoRelative(root, webReportPath),
        webHeightControlScreenshotPath: toRepoRelative(root, webHeightControlPath),
        webShaftControlScreenshotPath: toRepoRelative(root, webShaftControlPath),
        webScreenshotPath: toRepoRelative(root, webPath),
      },
      fixtureId: fixture.canonicalId,
      nativeMetrics: evidence.nativeMetrics,
      nativeHeightControlMetrics: evidence.nativeHeightControlMetrics,
      nativeShaftControlMetrics: evidence.nativeShaftControlMetrics,
      ok: fixtureDiagnostics.length === 0,
      webMetrics: evidence.webMetrics,
      webHeightControlMetrics: evidence.webHeightControlMetrics,
      webShaftControlMetrics: evidence.webShaftControlMetrics,
    });
  }
  const ok = diagnostics.every((entry) => entry.severity !== "error");
  const contactSheetPath = resolve(artifactDir, "contact-sheet.svg");
  await writeFile(contactSheetPath, renderContactSheet(fixtureResults), "utf8");
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: { ...targets.metadata, contactSheetPath: toRepoRelative(root, contactSheetPath) },
    code: ok ? "TN_VERIFY_VOLUMETRICS_OK" : "TN_VERIFY_VOLUMETRICS_FAILED",
    diagnostics,
    fixtureResults,
    generatedBy: "@threenative/verify-tools volumetricsGate",
    ok,
    schema: "threenative.verify.volumetrics",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

async function createControlBundle(bundlePath: string, feature: "godRays" | "heightFog"): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "tn-volumetrics-control-"));
  const controlBundlePath = resolve(root, "game.bundle");
  await cp(bundlePath, controlBundlePath, { recursive: true });
  const environmentPath = resolve(controlBundlePath, "environment.scene.json");
  const environment = JSON.parse(await readFile(environmentPath, "utf8")) as unknown;
  if (!isRecord(environment) || !isRecord(environment.atmosphere) || !isRecord(environment.atmosphere.volumetrics)) {
    throw new Error("Volumetrics control fixture requires atmosphere.volumetrics.");
  }
  const volumetrics = environment.atmosphere.volumetrics;
  if (isRecord(volumetrics[feature])) volumetrics[feature].enabled = false;
  await writeFile(environmentPath, `${JSON.stringify(environment, null, 2)}\n`, "utf8");
  return controlBundlePath;
}

async function writeAdapterReports(
  root: string,
  bundlePath: string,
  fixtureId: string,
  webReportPath: string,
  nativeReportPath: string,
): Promise<{ nativeReport: unknown; webReport: unknown }> {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as {
    loadBundle(path: string): Promise<unknown>;
    mapWorld(bundle: unknown): unknown;
    reportWebConformance(bundle: unknown, mapped: unknown, fixture: string): unknown;
  };
  const bundle = await runtime.loadBundle(bundlePath);
  const webReport = runtime.reportWebConformance(bundle, runtime.mapWorld(bundle), fixtureId);
  await writeFile(webReportPath, `${JSON.stringify(webReport, null, 2)}\n`, "utf8");
  await execFileAsync("cargo", [
    "run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_conformance", "--",
    bundlePath, fixtureId, nativeReportPath,
  ], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  return { nativeReport: JSON.parse(await readFile(nativeReportPath, "utf8")) as unknown, webReport };
}

function validateFeatureReports(evidence: VolumetricsEvidence, diagnostics: VerificationDiagnostic[]): void {
  const web = volumetricsReport(evidence.webReport);
  const native = volumetricsReport(evidence.nativeReport);
  if (web?.heightFog?.applied !== true || web.heightFog.mode !== "analytic-height-fog-half-resolution") {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_WEB_REPORT_MISSING", "Web conformance must report the applied analytic half-resolution height-fog path.", evidence.webPath));
  }
  if (web?.godRays?.applied !== true || web.godRays.mode !== "directional-shadow-map-raymarch") {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_WEB_REPORT_MISSING", "Web conformance must report the applied directional shadow-map god-ray path.", evidence.webPath));
  }
  if (native?.heightFog?.applied !== true || native.heightFog.mode !== "analytic-height-post-pass" || native.heightFog.reason !== undefined) {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_NATIVE_REPORT_MISSING", "Native conformance must report the applied analytic height-fog post pass without an approximation reason.", evidence.nativePath));
  }
  if (native?.godRays?.applied !== true || native.godRays.mode !== "bevy-volumetric-light") {
    diagnostics.push(diagnostic("TN_VERIFY_VOLUMETRICS_NATIVE_REPORT_MISSING", "Native conformance must report the applied Bevy VolumetricLight path.", evidence.nativePath));
  }
}

function volumetricsReport(value: unknown): { godRays?: { applied?: unknown; mode?: unknown; reason?: unknown }; heightFog?: { applied?: unknown; mode?: unknown; reason?: unknown } } | undefined {
  if (!isRecord(value) || !isRecord(value.environment) || !isRecord(value.environment.volumetrics)) return undefined;
  return value.environment.volumetrics;
}

async function captureWeb(root: string, bundlePath: string, outPath: string): Promise<void> {
  type StartWebPreview = (options: { bundlePath: string; silent: boolean }) => Promise<{ close(): Promise<void> | void; url: string }>;
  type CaptureScreenshot = (options: { outPath: string; settleMs?: number; url: string; waitReady: boolean }) => Promise<{ diagnostics?: Array<{ message?: string; severity?: string }> }>;
  const [{ startWebPreview }, { captureScreenshot }] = await Promise.all([
    import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as Promise<{ startWebPreview: StartWebPreview }>,
    import(pathToFileURL(resolve(root, "packages/cli/dist/commands/visualProof.js")).href) as Promise<{ captureScreenshot: CaptureScreenshot }>,
  ]);
  await rm(outPath, { force: true });
  const server = await startWebPreview({ bundlePath, silent: true });
  try {
    const result = await captureScreenshot({ outPath, settleMs: 500, url: server.url, waitReady: true });
    const failure = result.diagnostics?.find((entry) => entry.severity !== "warning");
    if (failure !== undefined) throw new Error(failure.message ?? "Web volumetrics capture failed.");
  } finally {
    await server.close();
  }
}

async function captureNative(root: string, bundlePath: string, outPath: string): Promise<void> {
  const args = ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, "camera.main", outPath, "300"];
  await rm(outPath, { force: true });
  try {
    await execFileAsync("xvfb-run", ["-a", "cargo", ...args], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      await execFileAsync("cargo", args, { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
      return;
    }
    throw error;
  }
}

async function analyzeScreenshot(root: string, path: string, runtime: "native" | "web"): Promise<VolumetricsScreenshotMetrics> {
  const { readPngFrame } = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/compareImages.js")).href) as {
    readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }>;
  };
  const frame = await readPngFrame(path);
  const background = [Number(frame.data[0] ?? 0), Number(frame.data[1] ?? 0), Number(frame.data[2] ?? 0)] as const;
  const luminances: number[] = [];
  let nonBackground = 0;
  for (let index = 0; index < frame.width * frame.height; index += 1) {
    const offset = index * 4;
    const red = Number(frame.data[offset] ?? 0);
    const green = Number(frame.data[offset + 1] ?? 0);
    const blue = Number(frame.data[offset + 2] ?? 0);
    luminances.push(pixelLuminance(frame.data, offset));
    if (Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]) > 24) nonBackground += 1;
  }
  const shaftRegion = runtime === "native"
    ? { height: 0.08, width: 0.08, x: 0.37, y: 0.05 }
    : { height: 0.15, width: 0.08, x: 0.45, y: 0.55 };
  const shadowRegion = runtime === "native"
    ? { height: 0.08, width: 0.08, x: 0.82, y: 0.05 }
    : { height: 0.15, width: 0.08, x: 0.56, y: 0.55 };
  const shaftLuminance = average(regionLuminances(frame, shaftRegion));
  const shadowNeighborLuminance = average(regionLuminances(frame, shadowRegion));
  const baseFogLuminance = average(regionLuminances(frame, { height: 0.08, width: 0.1, x: 0.45, y: 0.62 }));
  const topFogLuminance = average(regionLuminances(frame, { height: 0.08, width: 0.1, x: 0.45, y: 0.25 }));
  return {
    baseFogLuminance,
    fogHeightGradient: baseFogLuminance - topFogLuminance,
    luminanceStdDev: standardDeviation(luminances),
    nonBackgroundFraction: nonBackground / Math.max(1, frame.width * frame.height),
    shadowNeighborLuminance,
    shaftContrast: shaftLuminance - shadowNeighborLuminance,
    shaftLuminance,
    topFogLuminance,
  };
}

function regionLuminances(frame: { data: ArrayLike<number>; height: number; width: number }, region: { height: number; width: number; x: number; y: number }): number[] {
  const values: number[] = [];
  const left = Math.floor(region.x * frame.width);
  const right = Math.ceil((region.x + region.width) * frame.width);
  const top = Math.floor(region.y * frame.height);
  const bottom = Math.ceil((region.y + region.height) * frame.height);
  for (let y = top; y < bottom; y += 1) for (let x = left; x < right; x += 1) values.push(pixelLuminance(frame.data, (y * frame.width + x) * 4));
  return values;
}

function pixelLuminance(data: ArrayLike<number>, offset: number): number {
  return (0.2126 * Number(data[offset] ?? 0) + 0.7152 * Number(data[offset + 1] ?? 0) + 0.0722 * Number(data[offset + 2] ?? 0)) / 255;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  const mean = average(values);
  return Math.sqrt(average(values.map((value) => (value - mean) ** 2)));
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic {
  return { code, message, path, severity: "error" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function renderContactSheet(results: ReadonlyArray<{ artifacts: { nativeScreenshotPath: string; webScreenshotPath: string }; fixtureId: string; ok: boolean }>): string {
  const rows = results.map((result, index) => `<text x="20" y="${40 + index * 28}" fill="#ddd">${escapeXml(result.fixtureId)}: ${result.ok ? "PASS" : "FAIL"} | web ${escapeXml(result.artifacts.webScreenshotPath)} | native ${escapeXml(result.artifacts.nativeScreenshotPath)}</text>`).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${Math.max(100, 70 + results.length * 28)}"><rect width="100%" height="100%" fill="#171a20"/><text x="20" y="24" fill="#fff">ThreeNative volumetrics evidence</text>${rows}</svg>\n`;
}

function escapeXml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await runVolumetricsGate();
  console.log(JSON.stringify(result));
  if (!result.ok) process.exitCode = 1;
}
