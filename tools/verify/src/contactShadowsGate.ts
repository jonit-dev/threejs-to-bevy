import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import { loadFixtureCatalog } from "./conformance.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);
const GATE_NAME = "verify:contact-shadows";

export interface ContactShadowObservation {
  appliedResolution: number;
  blurStep: number;
  captureCount: number;
  entityId: string;
  height: number;
  invalidated: boolean;
  opacity: number;
  renderCount: number;
  requestedResolution: number;
  size: readonly [number, number];
  softness: number;
  updateMode: "dynamic" | "static";
}

export interface ContactShadowScreenshotMetrics {
  centerGroundLuminance: number;
  highOpacityPoolContrast: number;
  highOpacityPoolLuminance: number;
  highOpacityPoolMeanGradient: number;
  lowOpacityPoolContrast: number;
  lowOpacityPoolLuminance: number;
  luminanceStdDev: number;
  nonBackgroundFraction: number;
  opacityPoolDelta: number;
}

export interface ContactShadowEvidence {
  fixtureId: string;
  nativeBytes: number;
  nativeMetrics: ContactShadowScreenshotMetrics;
  nativePath: string;
  nativeReports?: unknown[];
  nativeReportPath: string;
  nativeStaticCostProof: string;
  webBytes: number;
  webMetrics: ContactShadowScreenshotMetrics;
  webObservations?: ContactShadowObservation[];
  webPath: string;
  webReportPath: string;
}

export interface ContactShadowGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export function validateContactShadowEvidence(evidence: ContactShadowEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  if (evidence.webObservations === undefined || evidence.webObservations.length !== 2) {
    diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_WEB_OBSERVATIONS_MISSING", `Fixture '${evidence.fixtureId}' must expose both web ContactShadows observations.`, evidence.webReportPath));
  } else {
    for (const observation of evidence.webObservations) {
      if (observation.updateMode !== "static" || observation.captureCount !== 1 || observation.renderCount !== 3 || observation.invalidated || observation.appliedResolution !== observation.requestedResolution) {
        diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_WEB_STATIC_COST_FAILED", `Static web contact shadow '${observation.entityId}' must settle after one capture and three bounded render passes without remaining invalidated.`, evidence.webReportPath));
      }
    }
  }
  if (evidence.nativeReports === undefined || evidence.nativeReports.length !== 2) {
    diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_NATIVE_REPORT_MISSING", `Fixture '${evidence.fixtureId}' must expose both native ContactShadows reports.`, evidence.nativeReportPath));
  }
  validatePortableReportParity(evidence, diagnostics);
  if (!evidence.nativeStaticCostProof.includes("--test contact_shadows")) {
    diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_NATIVE_STATIC_COST_PROOF_MISSING", "The focused gate must run the native two-frame static/dynamic capture-cost proof before visual analysis.", evidence.nativeReportPath));
  }
  for (const [runtime, bytes, metrics, path] of [
    ["web", evidence.webBytes, evidence.webMetrics, evidence.webPath],
    ["native", evidence.nativeBytes, evidence.nativeMetrics, evidence.nativePath],
  ] as const) {
    if (bytes <= 0 || metrics.nonBackgroundFraction < 0.05 || metrics.luminanceStdDev < 0.02) {
      diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_SCREENSHOT_CONTENT_MISSING", `${runtime} contact-shadow screenshot must be nonblank and contain measurable scene contrast.`, path));
    }
    if (!(metrics.highOpacityPoolLuminance + 0.01 < metrics.lowOpacityPoolLuminance) || !(metrics.opacityPoolDelta > 0.01)) {
      diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_OPACITY_NOT_MONOTONIC", `${runtime} high-opacity contact pool must be measurably darker than the low-opacity pool.`, path));
    }
    if (!(metrics.lowOpacityPoolContrast > 0.005) || !(metrics.highOpacityPoolContrast > metrics.lowOpacityPoolContrast + 0.01)) {
      diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_POOLS_NOT_LOCALIZED", `${runtime} contact pools must locally darken the surrounding ground with an opacity-ordered effect.`, path));
    }
  }
  if (Math.abs(evidence.webMetrics.centerGroundLuminance - evidence.nativeMetrics.centerGroundLuminance) >= 0.05) {
    diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_GROUND_LUMINANCE_DRIFT", "Web and native center-ground luminance must remain within 0.05 so global rendering calibration drift is caught separately from contact-shadow parity.", evidence.nativePath));
  }
  if (
    Math.abs(normalizedByGround(evidence.webMetrics.lowOpacityPoolContrast, evidence.webMetrics.centerGroundLuminance) - normalizedByGround(evidence.nativeMetrics.lowOpacityPoolContrast, evidence.nativeMetrics.centerGroundLuminance)) > 0.04
    || Math.abs(normalizedByGround(evidence.webMetrics.highOpacityPoolContrast, evidence.webMetrics.centerGroundLuminance) - normalizedByGround(evidence.nativeMetrics.highOpacityPoolContrast, evidence.nativeMetrics.centerGroundLuminance)) > 0.04
    || Math.abs(normalizedByGround(evidence.webMetrics.highOpacityPoolMeanGradient, evidence.webMetrics.centerGroundLuminance) - normalizedByGround(evidence.nativeMetrics.highOpacityPoolMeanGradient, evidence.nativeMetrics.centerGroundLuminance)) > 0.03
  ) {
    diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_VISUAL_PARITY_MISMATCH", "Web and native normalized pool contrast/softness must remain within the calibrated parity envelope.", evidence.nativePath));
  }
  return diagnostics;
}

export async function runContactShadowGate(options: { reportPath?: string; root?: string } = {}): Promise<ContactShadowGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "contact-shadows", owner: { kind: "aggregate" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const artifactDir = resolve(reportPath, "..");
  const reportsDir = resolve(artifactDir, "reports");
  const screenshotsDir = resolve(artifactDir, "screenshots");
  await mkdir(reportsDir, { recursive: true });
  await mkdir(screenshotsDir, { recursive: true });
  const catalog = await loadFixtureCatalog(root);
  const fixtures = catalog.fixtures.filter((entry) => entry.aggregateGate === GATE_NAME);
  const diagnostics: VerificationDiagnostic[] = [];
  const fixtureResults = [];
  if (fixtures.length === 0) diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_FIXTURE_MISSING", `The fixture catalog must enroll at least one fixture in '${GATE_NAME}'.`, "packages/ir/fixtures/conformance/fixture-catalog.json"));

  for (const fixture of fixtures) {
    const bundlePath = resolve(root, fixture.bundlePath);
    const webReportPath = resolve(reportsDir, `${fixture.canonicalId}.web.report.json`);
    const nativeReportPath = resolve(reportsDir, `${fixture.canonicalId}.native.report.json`);
    const webPath = resolve(screenshotsDir, `${fixture.canonicalId}.web.png`);
    const nativePath = resolve(screenshotsDir, `${fixture.canonicalId}.native.png`);
    const webCapture = await captureWebEvidence(root, bundlePath, webPath);
    await captureNativeScreenshot({ bundlePath, nativePath, root });
    const nativeReport = await writeNativeReport(root, bundlePath, fixture.canonicalId, nativeReportPath);
    const nativeReports = contactShadowReports(nativeReport);
    const nativeMetrics = await analyzeScreenshot(root, nativePath);
    await writeFile(webReportPath, `${JSON.stringify({ contactShadows: webCapture.observations, fixture: fixture.canonicalId, runtimeReady: webCapture.runtimeReady }, null, 2)}\n`, "utf8");
    const nativeStaticCostProof = fixture.focusedGate?.commands
      .map((command) => command.join(" "))
      .find((command) => command.includes("--test contact_shadows")) ?? "";
    const evidence: ContactShadowEvidence = {
      fixtureId: fixture.canonicalId,
      nativeBytes: (await stat(nativePath)).size,
      nativeMetrics,
      nativePath,
      nativeReports,
      nativeReportPath,
      nativeStaticCostProof,
      webBytes: (await stat(webPath)).size,
      webMetrics: webCapture.metrics,
      webObservations: webCapture.observations,
      webPath,
      webReportPath,
    };
    const fixtureDiagnostics = validateContactShadowEvidence(evidence);
    diagnostics.push(...fixtureDiagnostics);
    fixtureResults.push({
      artifacts: {
        nativeReportPath: toRepoRelative(root, nativeReportPath), nativeScreenshotPath: toRepoRelative(root, nativePath),
        webReportPath: toRepoRelative(root, webReportPath), webScreenshotPath: toRepoRelative(root, webPath),
      },
      fixtureId: fixture.canonicalId,
      nativeMetrics,
      nativeReports,
      nativeStaticCostProof: evidence.nativeStaticCostProof,
      ok: fixtureDiagnostics.length === 0,
      webMetrics: webCapture.metrics,
      webObservations: webCapture.observations,
    });
  }
  const ok = diagnostics.every((entry) => entry.severity !== "error");
  const contactSheetPath = resolve(artifactDir, "contact-sheet.svg");
  await writeFile(contactSheetPath, renderContactSheet(fixtureResults), "utf8");
  await writeFile(reportPath, `${JSON.stringify({
    artifacts: { ...targets.metadata, contactSheetPath: toRepoRelative(root, contactSheetPath) },
    code: ok ? "TN_VERIFY_CONTACT_SHADOWS_OK" : "TN_VERIFY_CONTACT_SHADOWS_FAILED",
    diagnostics, fixtureResults, generatedBy: "@threenative/verify-tools contactShadowsGate", ok,
    schema: "threenative.verify.contact-shadows", status: ok ? "pass" : "fail", version: "0.1.0",
  }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

async function captureWebEvidence(root: string, bundlePath: string, webPath: string): Promise<{ metrics: ContactShadowScreenshotMetrics; observations?: ContactShadowObservation[]; runtimeReady: unknown }> {
  type StartWebPreview = (options: { bundlePath: string; silent: boolean }) => Promise<{ close(): Promise<void> | void; url: string }>;
  type CaptureScreenshot = (options: { outPath: string; settleMs?: number; url: string; waitReady: boolean }) => Promise<{ diagnostics?: Array<{ code?: string; message?: string; severity?: string }>; runtimeReady: unknown }>;
  const [{ startWebPreview }, { captureScreenshot }] = await Promise.all([
    import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as Promise<{ startWebPreview: StartWebPreview }>,
    import(pathToFileURL(resolve(root, "packages/cli/dist/commands/visualProof.js")).href) as Promise<{ captureScreenshot: CaptureScreenshot }>,
  ]);
  const server = await startWebPreview({ bundlePath, silent: true });
  try {
    const capture = await captureScreenshot({ outPath: webPath, settleMs: 300, url: server.url, waitReady: true });
    const failure = capture.diagnostics?.find((entry) => entry.severity !== "warning");
    if (failure !== undefined) throw new Error(failure.message ?? failure.code ?? "Web contact-shadow screenshot capture failed.");
    return { metrics: await analyzeScreenshot(root, webPath), observations: contactShadowObservations(capture.runtimeReady), runtimeReady: capture.runtimeReady };
  } finally {
    await server.close();
  }
}

async function captureNativeScreenshot(options: { bundlePath: string; nativePath: string; root: string }): Promise<void> {
  const args = ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--", options.bundlePath, "camera.main", options.nativePath, "300"];
  const cwd = resolve(options.root, "runtime-bevy");
  await rm(options.nativePath, { force: true });
  try {
    await execFileAsync("xvfb-run", ["-a", "cargo", ...args], { cwd, timeout: 180_000 });
  } catch (error) {
    if (isRecord(error) && error.code === "ENOENT") {
      await execFileAsync("cargo", args, { cwd, timeout: 180_000 });
      return;
    }
    throw error;
  }
}

async function writeNativeReport(root: string, bundlePath: string, fixtureId: string, path: string): Promise<unknown> {
  await execFileAsync("cargo", ["run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_conformance", "--", bundlePath, fixtureId, path], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

async function analyzeScreenshot(root: string, path: string): Promise<ContactShadowScreenshotMetrics> {
  const { readPngFrame } = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/compareImages.js")).href) as { readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }> };
  const frame = await readPngFrame(path);
  const background = [Number(frame.data[0] ?? 0), Number(frame.data[1] ?? 0), Number(frame.data[2] ?? 0)] as const;
  const luminances: number[] = [];
  let nonBackground = 0;
  for (let index = 0; index < frame.width * frame.height; index += 1) {
    const offset = index * 4;
    const red = Number(frame.data[offset] ?? 0); const green = Number(frame.data[offset + 1] ?? 0); const blue = Number(frame.data[offset + 2] ?? 0);
    luminances.push(pixelLuminance(frame.data, offset));
    if (Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]) > 24) nonBackground += 1;
  }
  const lowRegion = { height: 0.055, width: 0.11, x: 0.305, y: 0.585 };
  const highRegion = { height: 0.055, width: 0.11, x: 0.585, y: 0.585 };
  const lowOpacityPoolLuminance = average(regionLuminances(frame, lowRegion));
  const highOpacityPoolLuminance = average(regionLuminances(frame, highRegion));
  const centerGroundLuminance = average(regionLuminances(frame, { height: 0.055, width: 0.08, x: 0.46, y: 0.585 }));
  return {
    centerGroundLuminance,
    highOpacityPoolContrast: centerGroundLuminance - highOpacityPoolLuminance,
    highOpacityPoolLuminance,
    highOpacityPoolMeanGradient: meanHorizontalGradient(frame, highRegion),
    lowOpacityPoolContrast: centerGroundLuminance - lowOpacityPoolLuminance,
    lowOpacityPoolLuminance,
    luminanceStdDev: standardDeviation(luminances),
    nonBackgroundFraction: nonBackground / Math.max(1, frame.width * frame.height),
    opacityPoolDelta: lowOpacityPoolLuminance - highOpacityPoolLuminance,
  };
}

function validatePortableReportParity(evidence: ContactShadowEvidence, diagnostics: VerificationDiagnostic[]): void {
  if (evidence.webObservations === undefined || evidence.nativeReports === undefined) return;
  const nativeById = new Map(evidence.nativeReports.filter(isRecord).map((report) => [report.entityId, report]));
  for (const web of evidence.webObservations) {
    const native = nativeById.get(web.entityId);
    if (
      native === undefined
      || native.requestedResolution !== web.requestedResolution
      || native.appliedResolution !== web.appliedResolution
      || native.updateMode !== web.updateMode
      || native.height !== web.height
      || native.opacity !== web.opacity
      || native.softness !== web.softness
      || !sameNumberPair(native.size, web.size)
      || native.blurStep !== web.blurStep
    ) {
      diagnostics.push(diagnostic("TN_VERIFY_CONTACT_SHADOW_PORTABLE_REPORT_MISMATCH", `Web and native must report identical applied ContactShadows fields for '${web.entityId}'.`, evidence.nativeReportPath));
    }
  }
}

function sameNumberPair(value: unknown, expected: readonly [number, number]): boolean {
  return Array.isArray(value) && value.length === 2 && value[0] === expected[0] && value[1] === expected[1];
}

function contactShadowObservations(value: unknown): ContactShadowObservation[] | undefined {
  return isRecord(value) && Array.isArray(value.contactShadows) ? value.contactShadows as ContactShadowObservation[] : undefined;
}

function contactShadowReports(value: unknown): unknown[] | undefined {
  return isRecord(value) && Array.isArray(value.contactShadows) ? value.contactShadows : undefined;
}

function regionLuminances(frame: { data: ArrayLike<number>; height: number; width: number }, region: { height: number; width: number; x: number; y: number }): number[] {
  const values: number[] = [];
  const xStart = Math.floor(frame.width * region.x); const xEnd = Math.floor(frame.width * (region.x + region.width));
  const yStart = Math.floor(frame.height * region.y); const yEnd = Math.floor(frame.height * (region.y + region.height));
  for (let y = yStart; y < yEnd; y += 1) for (let x = xStart; x < xEnd; x += 1) values.push(pixelLuminance(frame.data, (y * frame.width + x) * 4));
  return values;
}

function meanHorizontalGradient(frame: { data: ArrayLike<number>; height: number; width: number }, region: { height: number; width: number; x: number; y: number }): number {
  let sum = 0;
  let count = 0;
  const xStart = Math.floor(frame.width * region.x); const xEnd = Math.floor(frame.width * (region.x + region.width));
  const yStart = Math.floor(frame.height * region.y); const yEnd = Math.floor(frame.height * (region.y + region.height));
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x + 1 < xEnd; x += 1) {
      sum += Math.abs(pixelLuminance(frame.data, (y * frame.width + x) * 4) - pixelLuminance(frame.data, (y * frame.width + x + 1) * 4));
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

function pixelLuminance(data: ArrayLike<number>, offset: number): number {
  return (0.2126 * Number(data[offset] ?? 0) + 0.7152 * Number(data[offset + 1] ?? 0) + 0.0722 * Number(data[offset + 2] ?? 0)) / 255;
}

function average(values: readonly number[]): number { return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length; }
function normalizedByGround(value: number, centerGroundLuminance: number): number { return centerGroundLuminance > 0 ? value / centerGroundLuminance : Number.POSITIVE_INFINITY; }
function standardDeviation(values: readonly number[]): number { const mean = average(values); return values.length === 0 ? 0 : Math.sqrt(average(values.map((value) => (value - mean) ** 2))); }

function renderContactSheet(results: Array<{ artifacts: { nativeScreenshotPath: string; webScreenshotPath: string }; fixtureId: string }>): string {
  const rows = results.map((result, index) => {
    const y = 50 + index * 410; const web = result.artifacts.webScreenshotPath.split("/").at(-1) ?? ""; const native = result.artifacts.nativeScreenshotPath.split("/").at(-1) ?? "";
    return `<text x="40" y="${y - 15}" fill="#ffffff">${result.fixtureId}: low opacity / high opacity, web / native</text>\n<image x="40" y="${y}" width="640" height="360" href="screenshots/${web}"/>\n<image x="720" y="${y}" width="640" height="360" href="screenshots/${native}"/>`;
  }).join("\n");
  const height = Math.max(430, 70 + results.length * 410);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}" viewBox="0 0 1400 ${height}">\n<rect width="100%" height="100%" fill="#111318"/>\n${rows}\n</svg>\n`;
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic {
  return { code, message, path, severity: "error", suggestedFix: `Regenerate '${GATE_NAME}' and inspect the paired contact-pool screenshots and adapter observations.` };
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runContactShadowGate();
  process.stdout.write(`${JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok, reportPath: result.reportPath }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
