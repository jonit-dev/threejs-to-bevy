import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromium } from "playwright";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import { loadFixtureCatalog } from "./conformance.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);
const GATE_NAME = "verify:ssgi";

export interface SsgiScreenshotMetrics {
  highFrequencyEnergy: number;
  indirectLuminance: number;
  indirectRedChroma: number;
  luminanceStdDev: number;
  nonBackgroundFraction: number;
}

export interface SsgiEvidence {
  fixtureId: string;
  nativeBytes: number;
  nativeDisabledMetrics: SsgiScreenshotMetrics;
  nativeHighMetrics: SsgiScreenshotMetrics;
  nativeMetrics: SsgiScreenshotMetrics;
  nativePath: string;
  nativeReport: unknown;
  webBytes: number;
  webDisabledMetrics: SsgiScreenshotMetrics;
  webHighMetrics: SsgiScreenshotMetrics;
  webMetrics: SsgiScreenshotMetrics;
  webMotionBoilingMae: number;
  webMotionDisplacementMae: number;
  webMotionGhostingMae: number;
  webMotionPath: string;
  webPath: string;
  webReport: unknown;
}

export function validateSsgiEvidence(evidence: SsgiEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  validateReports(evidence, diagnostics);
  for (const [runtime, bytes, metrics, path] of [
    ["web", evidence.webBytes, evidence.webMetrics, evidence.webPath],
    ["native", evidence.nativeBytes, evidence.nativeMetrics, evidence.nativePath],
  ] as const) {
    if (bytes <= 0 || metrics.nonBackgroundFraction < 0.05 || metrics.luminanceStdDev < 0.02) {
      diagnostics.push(diagnostic("TN_VERIFY_SSGI_SCREENSHOT_CONTENT_MISSING", `${runtime} SSGI screenshot must be nonblank and contain measurable contrast.`, path));
    }
  }
  for (const [runtime, disabled, authored, high, path] of [
    ["web", evidence.webDisabledMetrics, evidence.webMetrics, evidence.webHighMetrics, evidence.webPath],
    ["native", evidence.nativeDisabledMetrics, evidence.nativeMetrics, evidence.nativeHighMetrics, evidence.nativePath],
  ] as const) {
    const authoredLift = authored.indirectLuminance - disabled.indirectLuminance;
    const highLift = high.indirectLuminance - disabled.indirectLuminance;
    if (!(authoredLift > 0.003)) {
      diagnostics.push(diagnostic("TN_VERIFY_SSGI_INDIRECT_LIFT_MISSING", `${runtime} indirectly-lit floor region must brighten when authored SSGI is enabled.`, path));
    }
    if (!(highLift > authoredLift + 0.002)) {
      diagnostics.push(diagnostic("TN_VERIFY_SSGI_INTENSITY_NOT_MONOTONE", `${runtime} high-intensity SSGI must lift the indirect region more than the authored intensity.`, path));
    }
  }
  const webHueLift = evidence.webMetrics.indirectRedChroma - evidence.webDisabledMetrics.indirectRedChroma;
  if (!(webHueLift > 0.004)) {
    diagnostics.push(diagnostic("TN_VERIFY_SSGI_WEB_COLOR_BLEED_MISSING", "Web SSGI must add measurable red chroma to the neutral floor beside the red wall.", evidence.webPath));
  }
  const webAddedNoise = evidence.webMetrics.highFrequencyEnergy - evidence.webDisabledMetrics.highFrequencyEnergy;
  const webHighAddedNoise = evidence.webHighMetrics.highFrequencyEnergy - evidence.webDisabledMetrics.highFrequencyEnergy;
  if (webAddedNoise > 0.008 || webHighAddedNoise > 0.01) {
    diagnostics.push(diagnostic("TN_VERIFY_SSGI_WEB_NOISE_EXCESSIVE", "Web SSGI must not add visible high-frequency speckle to the indirectly-lit floor region.", evidence.webPath));
  }
  if (evidence.webMotionGhostingMae > 0.035) {
    diagnostics.push(diagnostic("TN_VERIFY_SSGI_WEB_MOTION_GHOSTING", `Web SSGI moving-camera history must converge without visible trails (MAE ${evidence.webMotionGhostingMae.toFixed(5)} > 0.035).`, evidence.webMotionPath));
  }
  if (evidence.webMotionDisplacementMae < 0.02) {
    diagnostics.push(diagnostic("TN_VERIFY_SSGI_WEB_CAMERA_MOTION_MISSING", "Web SSGI motion proof must visibly displace the camera before evaluating temporal history.", evidence.webMotionPath));
  }
  if (evidence.webMotionBoilingMae > 0.008) {
    diagnostics.push(diagnostic("TN_VERIFY_SSGI_WEB_MOTION_BOILING", `Web SSGI settled consecutive frames must remain stable (MAE ${evidence.webMotionBoilingMae.toFixed(5)} > 0.008).`, evidence.webMotionPath));
  }
  return diagnostics;
}

export async function runSsgiGate(options: { reportPath?: string; root?: string } = {}): Promise<{ diagnostics: VerificationDiagnostic[]; ok: boolean; reportPath: string }> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "ssgi", owner: { kind: "aggregate" }, root });
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
  if (fixtures.length === 0) diagnostics.push(diagnostic("TN_VERIFY_SSGI_FIXTURE_MISSING", `The fixture catalog must enroll a fixture in '${GATE_NAME}'.`, "packages/ir/fixtures/conformance/fixture-catalog.json"));

  for (const fixture of fixtures) {
    const bundlePath = resolve(root, fixture.bundlePath);
    const disabledBundle = await createControlBundle(bundlePath, false, 0);
    const highBundle = await createControlBundle(bundlePath, true, 2);
    const paths = {
      native: resolve(screenshotsDir, `${fixture.canonicalId}.native.png`),
      nativeDisabled: resolve(screenshotsDir, `${fixture.canonicalId}.disabled.native.png`),
      nativeHigh: resolve(screenshotsDir, `${fixture.canonicalId}.high.native.png`),
      web: resolve(screenshotsDir, `${fixture.canonicalId}.web.png`),
      webDisabled: resolve(screenshotsDir, `${fixture.canonicalId}.disabled.web.png`),
      webHigh: resolve(screenshotsDir, `${fixture.canonicalId}.high.web.png`),
      webMotionImmediate: resolve(screenshotsDir, `${fixture.canonicalId}.motion-immediate.web.png`),
      webMotionNext: resolve(screenshotsDir, `${fixture.canonicalId}.motion-next.web.png`),
      webMotionSettled: resolve(screenshotsDir, `${fixture.canonicalId}.motion-settled.web.png`),
    };
    const webReportPath = resolve(reportsDir, `${fixture.canonicalId}.web.report.json`);
    const nativeReportPath = resolve(reportsDir, `${fixture.canonicalId}.native.report.json`);
    const { nativeReport, webReport } = await writeAdapterReports(root, bundlePath, fixture.canonicalId, webReportPath, nativeReportPath);
    try {
      await captureWeb(root, bundlePath, paths.web);
      await captureNative(root, bundlePath, paths.native);
      await captureWeb(root, disabledBundle, paths.webDisabled);
      await captureNative(root, disabledBundle, paths.nativeDisabled);
      await captureWeb(root, highBundle, paths.webHigh);
      await captureNative(root, highBundle, paths.nativeHigh);
      await captureWebMotionSequence(root, bundlePath, paths.webMotionImmediate, paths.webMotionSettled, paths.webMotionNext);
    } finally {
      await rm(resolve(disabledBundle, ".."), { force: true, recursive: true });
      await rm(resolve(highBundle, ".."), { force: true, recursive: true });
    }
    const webMotionGhostingMae = await screenshotMae(root, paths.webMotionImmediate, paths.webMotionSettled);
    const webMotionBoilingMae = await screenshotMae(root, paths.webMotionSettled, paths.webMotionNext);
    const webMotionDisplacementMae = await screenshotMae(root, paths.web, paths.webMotionImmediate);
    const evidence: SsgiEvidence = {
      fixtureId: fixture.canonicalId,
      nativeBytes: (await stat(paths.native)).size,
      nativeDisabledMetrics: await analyzeScreenshot(root, paths.nativeDisabled),
      nativeHighMetrics: await analyzeScreenshot(root, paths.nativeHigh),
      nativeMetrics: await analyzeScreenshot(root, paths.native),
      nativePath: paths.native,
      nativeReport,
      webBytes: (await stat(paths.web)).size,
      webDisabledMetrics: await analyzeScreenshot(root, paths.webDisabled),
      webHighMetrics: await analyzeScreenshot(root, paths.webHigh),
      webMetrics: await analyzeScreenshot(root, paths.web),
      webMotionBoilingMae,
      webMotionDisplacementMae,
      webMotionGhostingMae,
      webMotionPath: paths.webMotionImmediate,
      webPath: paths.web,
      webReport,
    };
    const fixtureDiagnostics = validateSsgiEvidence(evidence);
    diagnostics.push(...fixtureDiagnostics);
    fixtureResults.push({
      artifacts: Object.fromEntries(Object.entries(paths).map(([key, value]) => [`${key}ScreenshotPath`, toRepoRelative(root, value)])),
      fixtureId: fixture.canonicalId,
      nativeDisabledMetrics: evidence.nativeDisabledMetrics,
      nativeHighMetrics: evidence.nativeHighMetrics,
      nativeMetrics: evidence.nativeMetrics,
      ok: fixtureDiagnostics.length === 0,
      webDisabledMetrics: evidence.webDisabledMetrics,
      webHighMetrics: evidence.webHighMetrics,
      webMetrics: evidence.webMetrics,
      webMotionBoilingMae,
      webMotionDisplacementMae,
      webMotionGhostingMae,
    });
  }
  const ok = diagnostics.every((entry) => entry.severity !== "error");
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: targets.metadata,
    code: ok ? "TN_VERIFY_SSGI_OK" : "TN_VERIFY_SSGI_FAILED",
    diagnostics,
    fixtureResults,
    generatedBy: "@threenative/verify-tools ssgiGate",
    ok,
    schema: "threenative.verify.ssgi",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

async function createControlBundle(bundlePath: string, enabled: boolean, intensity: number): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "tn-ssgi-control-"));
  const controlBundlePath = resolve(root, "game.bundle");
  await cp(bundlePath, controlBundlePath, { recursive: true });
  const runtimePath = resolve(controlBundlePath, "runtime.config.json");
  const runtime = JSON.parse(await readFile(runtimePath, "utf8")) as unknown;
  if (!isRecord(runtime) || !isRecord(runtime.renderer) || !isRecord(runtime.renderer.screenSpaceGlobalIllumination)) throw new Error("SSGI control fixture requires renderer.screenSpaceGlobalIllumination.");
  runtime.renderer.screenSpaceGlobalIllumination.enabled = enabled;
  runtime.renderer.screenSpaceGlobalIllumination.intensity = intensity;
  await writeFile(runtimePath, `${JSON.stringify(runtime, null, 2)}\n`, "utf8");
  return controlBundlePath;
}

export async function writeAdapterReports(root: string, bundlePath: string, fixtureId: string, webReportPath: string, nativeReportPath: string): Promise<{ nativeReport: unknown; webReport: unknown }> {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as {
    loadBundle(path: string): Promise<unknown>;
    mapWorld(bundle: unknown): unknown;
    reportWebConformance(bundle: unknown, mapped: unknown, fixture: string): unknown;
  };
  const bundle = await runtime.loadBundle(bundlePath);
  const webReport = runtime.reportWebConformance(bundle, runtime.mapWorld(bundle), fixtureId);
  await writeFile(webReportPath, `${JSON.stringify(webReport, null, 2)}\n`, "utf8");
  await execFileAsync("cargo", ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_conformance", "--", bundlePath, fixtureId, nativeReportPath], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  return { nativeReport: JSON.parse(await readFile(nativeReportPath, "utf8")) as unknown, webReport };
}

function validateReports(evidence: SsgiEvidence, diagnostics: VerificationDiagnostic[]): void {
  const web = featureReport(evidence.webReport);
  const native = featureReport(evidence.nativeReport);
  if (web?.appliedMode !== "screen-space-temporal" || web.status !== "baseline" || web.diagnostic !== undefined) diagnostics.push(diagnostic("TN_VERIFY_SSGI_WEB_REPORT_MISSING", "Web conformance must report baseline screen-space-temporal SSGI without fallback.", evidence.webPath));
  if (native?.appliedMode !== "approximation" || native.status !== "baseline" || native.diagnostic !== undefined) diagnostics.push(diagnostic("TN_VERIFY_SSGI_NATIVE_REPORT_MISSING", "Native conformance must report the bounded SSGI approximation without fallback.", evidence.nativePath));
}

function featureReport(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value) || !isRecord(value.runtimeConfig) || !isRecord(value.runtimeConfig.renderer) || !Array.isArray(value.runtimeConfig.renderer.featureReports)) return undefined;
  return value.runtimeConfig.renderer.featureReports.find((entry) => isRecord(entry) && entry.feature === "renderer.screenSpaceGlobalIllumination") as Record<string, unknown> | undefined;
}

export async function captureWeb(root: string, bundlePath: string, outPath: string): Promise<void> {
  const [{ startWebPreview }, { captureScreenshot }] = await Promise.all([
    import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as Promise<{ startWebPreview(options: { bundlePath: string; silent: boolean }): Promise<{ close(): Promise<void> | void; url: string }> }>,
    import(pathToFileURL(resolve(root, "packages/cli/dist/commands/visualProof.js")).href) as Promise<{ captureScreenshot(options: { outPath: string; settleMs: number; url: string; waitReady: boolean }): Promise<{ diagnostics?: Array<{ message?: string; severity?: string }>; page?: { browserLogs?: string[]; errors?: string[] } }> }>,
  ]);
  await rm(outPath, { force: true });
  const server = await startWebPreview({ bundlePath, silent: true });
  try {
    const result = await captureScreenshot({ outPath, settleMs: 900, url: server.url, waitReady: true });
    const failure = result.diagnostics?.find((entry) => entry.severity !== "warning");
    if (failure !== undefined) throw new Error(failure.message ?? "Web SSGI capture failed.");
    const pageFailure = result.page?.errors?.[0]
      ?? result.page?.browserLogs?.find((entry) => /^(error:)|shader error|webglprogram.*not valid/i.test(entry));
    if (pageFailure !== undefined) throw new Error(`Web SSGI runtime console failure: ${pageFailure}`);
  } finally {
    await server.close();
  }
}

async function captureWebMotionSequence(root: string, bundlePath: string, immediatePath: string, settledPath: string, nextPath: string): Promise<void> {
  const { startWebPreview } = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as { startWebPreview(options: { bundlePath: string; silent: boolean }): Promise<{ close(): Promise<void> | void; url: string }> };
  const server = await startWebPreview({ bundlePath, silent: true });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { height: 720, width: 1280 } });
    const failures: string[] = [];
    page.on("console", (message) => { if (message.type() === "error") failures.push(message.text()); });
    page.on("pageerror", (error) => failures.push(error.message));
    await page.goto(server.url, { waitUntil: "domcontentloaded" });
    await page.waitForFunction("Boolean(globalThis.__THREENATIVE_READY__) && Boolean(globalThis.__THREENATIVE_RUNTIME__?.setEntityTransform)", undefined, { timeout: 10_000 });
    const orbit = [
      { position: [-0.32, 1.35, 4.79], rotation: cameraOrbitQuaternion(-0.104528, -0.067) },
      { position: [0, 1.35, 4.8], rotation: cameraOrbitQuaternion(-0.104528, 0) },
      { position: [0.32, 1.35, 4.79], rotation: cameraOrbitQuaternion(-0.104528, 0.067) },
    ];
    for (const transform of orbit) {
      const applied = await page.evaluate((value) => (globalThis as any).__THREENATIVE_RUNTIME__?.setEntityTransform?.("camera.main", value), transform);
      if (applied !== true) throw new Error("Web SSGI motion proof could not move camera.main.");
      await page.waitForTimeout(50);
    }
    const canvas = page.locator("canvas");
    await canvas.screenshot({ path: immediatePath });
    await page.waitForTimeout(700);
    await canvas.screenshot({ path: settledPath });
    await page.waitForTimeout(34);
    await canvas.screenshot({ path: nextPath });
    if (failures.length > 0) throw new Error(`Web SSGI motion proof console failure: ${failures[0]}`);
  } finally {
    await browser.close();
    await server.close();
  }
}

function cameraOrbitQuaternion(pitch: number, yaw: number): [number, number, number, number] {
  const sx = Math.sin(pitch * 0.5);
  const cx = Math.cos(pitch * 0.5);
  const sy = Math.sin(yaw * 0.5);
  const cy = Math.cos(yaw * 0.5);
  return [cy * sx, sy * cx, -sy * sx, cy * cx];
}

async function screenshotMae(root: string, leftPath: string, rightPath: string): Promise<number> {
  const { readPngFrame } = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/compareImages.js")).href) as { readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }> };
  const [left, right] = await Promise.all([readPngFrame(leftPath), readPngFrame(rightPath)]);
  if (left.width !== right.width || left.height !== right.height) return 1;
  let total = 0;
  let count = 0;
  for (let index = 0; index < left.data.length; index += 4) {
    total += Math.abs(Number(left.data[index] ?? 0) - Number(right.data[index] ?? 0));
    total += Math.abs(Number(left.data[index + 1] ?? 0) - Number(right.data[index + 1] ?? 0));
    total += Math.abs(Number(left.data[index + 2] ?? 0) - Number(right.data[index + 2] ?? 0));
    count += 3;
  }
  return total / Math.max(1, count) / 255;
}

export async function captureNative(root: string, bundlePath: string, outPath: string, requestFrame = 300): Promise<void> {
  const args = ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", bundlePath, "camera.main", outPath, String(requestFrame)];
  await rm(outPath, { force: true });
  try {
    await execFileAsync("xvfb-run", ["-a", "cargo", ...args], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") await execFileAsync("cargo", args, { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
    else throw error;
  }
}

async function analyzeScreenshot(root: string, path: string): Promise<SsgiScreenshotMetrics> {
  const { readPngFrame } = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/compareImages.js")).href) as { readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }> };
  const frame = await readPngFrame(path);
  const background = [Number(frame.data[0] ?? 0), Number(frame.data[1] ?? 0), Number(frame.data[2] ?? 0)] as const;
  const luminances: number[] = [];
  let nonBackground = 0;
  for (let y = 0; y < frame.height; y += 4) for (let x = 0; x < frame.width; x += 4) {
    const rgb = pixel(frame, x, y);
    luminances.push(luminance(rgb));
    if (Math.abs(rgb[0] - background[0]) + Math.abs(rgb[1] - background[1]) + Math.abs(rgb[2] - background[2]) > 18) nonBackground += 1;
  }
  const region = sampleRegion(frame, 0.18, 0.62, 0.38, 0.84);
  const mean = luminances.reduce((sum, value) => sum + value, 0) / Math.max(1, luminances.length);
  const variance = luminances.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, luminances.length);
  return {
    indirectLuminance: region.luminance,
    indirectRedChroma: region.redChroma,
    highFrequencyEnergy: region.highFrequencyEnergy,
    luminanceStdDev: Math.sqrt(variance) / 255,
    nonBackgroundFraction: nonBackground / Math.max(1, luminances.length),
  };
}

function sampleRegion(frame: { data: ArrayLike<number>; height: number; width: number }, x0: number, y0: number, x1: number, y1: number): { highFrequencyEnergy: number; luminance: number; redChroma: number } {
  let highFrequencySum = 0;
  let luminanceSum = 0;
  let redChromaSum = 0;
  let count = 0;
  for (let y = Math.floor(frame.height * y0); y < Math.ceil(frame.height * y1); y += 2) for (let x = Math.floor(frame.width * x0); x < Math.ceil(frame.width * x1); x += 2) {
    const rgb = pixel(frame, x, y);
    const right = pixel(frame, x + 1, y);
    const down = pixel(frame, x, y + 1);
    highFrequencySum += (Math.abs(luminance(rgb) - luminance(right)) + Math.abs(luminance(rgb) - luminance(down))) * 0.5 / 255;
    luminanceSum += luminance(rgb) / 255;
    redChromaSum += (rgb[0] - (rgb[1] + rgb[2]) * 0.5) / 255;
    count += 1;
  }
  return { highFrequencyEnergy: highFrequencySum / Math.max(1, count), luminance: luminanceSum / Math.max(1, count), redChroma: redChromaSum / Math.max(1, count) };
}

function pixel(frame: { data: ArrayLike<number>; height: number; width: number }, x: number, y: number): readonly [number, number, number] {
  const index = (Math.max(0, Math.min(frame.height - 1, y)) * frame.width + Math.max(0, Math.min(frame.width - 1, x))) * 4;
  return [Number(frame.data[index] ?? 0), Number(frame.data[index + 1] ?? 0), Number(frame.data[index + 2] ?? 0)];
}

function luminance(rgb: readonly [number, number, number]): number { return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; }
function diagnostic(code: string, message: string, path: string): VerificationDiagnostic { return { code, message, path, severity: "error", suggestedFix: "Fix the SSGI mapping, shader, approximation calibration, or proof fixture at the owning source." }; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const result = await runSsgiGate();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
