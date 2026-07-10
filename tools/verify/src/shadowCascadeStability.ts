import { execFile } from "node:child_process";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual, promisify } from "node:util";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import { loadFixtureCatalog } from "./conformance.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);
const GATE_NAME = "verify:shadow-cascade-stability";

type Vec3 = readonly [number, number, number];

export interface ResolvedCascadeProfile {
  cascadeBlendFraction: number;
  cascadeCount: number;
  maxDistance: number;
  splitLambda: number;
  splitScheme: "logarithmic" | "practical" | "uniform";
  stabilized: boolean;
}

export interface CascadeProfileReport {
  applied: ResolvedCascadeProfile;
  mode: "exact" | "first-split-exponential-approximation";
  reason?: string;
  requested: ResolvedCascadeProfile;
}

export interface TexelStabilityEvidence {
  cameraMotion: Vec3;
  cameraMotionTexels: number;
  lightMatrixAfter: readonly number[];
  lightMatrixBefore: readonly number[];
  stable: boolean;
  texelSize: number;
  wholeTexelControlChanged: boolean;
  wholeTexelControlMatrix: readonly number[];
  wholeTexelControlMotionTexels: number;
}

export interface ShadowCascadeEvidence {
  expectedProfile: ResolvedCascadeProfile;
  fixtureId: string;
  nativeProfile?: CascadeProfileReport;
  nativeReportPath: string;
  screenshots?: {
    nativeBytes: number;
    nativeMetrics: ScreenshotMetrics;
    nativePath: string;
    webBytes: number;
    webMetrics: ScreenshotMetrics;
    webPath: string;
  };
  texelStability?: TexelStabilityEvidence;
  webProfile?: CascadeProfileReport;
  webReportPath: string;
}

export interface ScreenshotMetrics {
  cascadeBoundaryLuminanceDelta: number;
  luminanceStdDev: number;
  nearShadowEdgeMeanGradient: number;
  nonBackgroundFraction: number;
  receiverShadowContrast: number;
}

export interface ShadowCascadeStabilityGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export function validateShadowCascadeEvidence(evidence: ShadowCascadeEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  validateRuntimeProfile("WEB", evidence.webProfile, evidence.expectedProfile, evidence.webReportPath, diagnostics);
  validateRuntimeProfile("NATIVE", evidence.nativeProfile, evidence.expectedProfile, evidence.nativeReportPath, diagnostics);

  if (evidence.webProfile !== undefined && evidence.nativeProfile !== undefined && !isDeepStrictEqual(evidence.webProfile, evidence.nativeProfile)) {
    diagnostics.push(diagnostic(
      "TN_VERIFY_SHADOW_CASCADE_PROFILE_PARITY_MISMATCH",
      `Fixture '${evidence.fixtureId}' must resolve an identical shared cascade profile in web and native reports.`,
      evidence.nativeReportPath,
    ));
  }

  const stability = evidence.texelStability;
  if (stability === undefined) {
    diagnostics.push(diagnostic(
      "TN_VERIFY_SHADOW_CASCADE_TEXEL_EVIDENCE_MISSING",
      `Fixture '${evidence.fixtureId}' requires objective texel-stability evidence from the web cascade math.`,
      evidence.webReportPath,
    ));
  } else if (
    !(stability.texelSize > 0)
    || !(stability.cameraMotionTexels > 0 && stability.cameraMotionTexels < 1)
    || stability.cameraMotion.every((component) => component === 0)
  ) {
    diagnostics.push(diagnostic(
      "TN_VERIFY_SHADOW_CASCADE_TEXEL_MOTION_MISSING",
      `Fixture '${evidence.fixtureId}' stability proof must move the camera by a non-zero sub-texel distance.`,
      evidence.webReportPath,
    ));
  } else if (!stability.stable || !isDeepStrictEqual(stability.lightMatrixBefore, stability.lightMatrixAfter)) {
    diagnostics.push(diagnostic(
      "TN_VERIFY_SHADOW_CASCADE_TEXEL_STABILITY_FAILED",
      `Fixture '${evidence.fixtureId}' changed its snapped light matrix under sub-texel camera motion.`,
      evidence.webReportPath,
    ));
  } else if (
    !(stability.wholeTexelControlMotionTexels >= 1)
    || !stability.wholeTexelControlChanged
    || isDeepStrictEqual(stability.lightMatrixBefore, stability.wholeTexelControlMatrix)
  ) {
    diagnostics.push(diagnostic(
      "TN_VERIFY_SHADOW_CASCADE_TEXEL_CONTROL_FAILED",
      `Fixture '${evidence.fixtureId}' whole-texel control must change a real controller light matrix.`,
      evidence.webReportPath,
    ));
  }
  if (evidence.screenshots === undefined || evidence.screenshots.webBytes <= 0 || evidence.screenshots.nativeBytes <= 0) {
    diagnostics.push(diagnostic(
      "TN_VERIFY_SHADOW_CASCADE_SCREENSHOTS_MISSING",
      `Fixture '${evidence.fixtureId}' requires non-empty rendered web and native screenshots.`,
      evidence.webReportPath,
    ));
  } else {
    for (const [runtime, metrics, path] of [
      ["web", evidence.screenshots.webMetrics, evidence.screenshots.webPath],
      ["native", evidence.screenshots.nativeMetrics, evidence.screenshots.nativePath],
    ] as const) {
      if (
        metrics.nonBackgroundFraction < 0.05
        || metrics.luminanceStdDev < 0.02
        || metrics.receiverShadowContrast < 0.05
        || metrics.nearShadowEdgeMeanGradient < 0.002
        || metrics.cascadeBoundaryLuminanceDelta > 0.05
      ) {
        diagnostics.push(diagnostic(
          "TN_VERIFY_SHADOW_CASCADE_SCREENSHOT_CONTENT_MISSING",
          `${runtime} screenshot must contain a nonblank scene, localized lit/shadow receiver contrast, a measurable shadow-edge gradient, and continuous luminance across the cascade boundary.`,
          path,
        ));
      }
    }
    if (Math.abs(evidence.screenshots.webMetrics.receiverShadowContrast - evidence.screenshots.nativeMetrics.receiverShadowContrast) > 0.35) {
      diagnostics.push(diagnostic(
        "TN_VERIFY_SHADOW_CASCADE_SCREENSHOT_PARITY_MISMATCH",
        `Fixture '${evidence.fixtureId}' web/native receiver shadow contrast differs beyond the bounded parity threshold.`,
        evidence.screenshots.nativePath,
      ));
    }
    if (Math.abs(evidence.screenshots.webMetrics.nearShadowEdgeMeanGradient - evidence.screenshots.nativeMetrics.nearShadowEdgeMeanGradient) > 0.15) {
      diagnostics.push(diagnostic(
        "TN_VERIFY_SHADOW_CASCADE_EDGE_SOFTNESS_PARITY_MISMATCH",
        `Fixture '${evidence.fixtureId}' web/native localized shadow-edge gradients differ beyond the bounded softness threshold.`,
        evidence.screenshots.nativePath,
      ));
    }
  }
  return diagnostics;
}

export async function runShadowCascadeStabilityGate(
  options: { reportPath?: string; root?: string } = {},
): Promise<ShadowCascadeStabilityGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "shadow-cascade-stability", owner: { kind: "aggregate" }, root });
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
  if (fixtures.length === 0) {
    diagnostics.push(diagnostic(
      "TN_VERIFY_SHADOW_CASCADE_FIXTURE_MISSING",
      `The fixture catalog must enroll at least one fixture in '${GATE_NAME}'.`,
      "packages/ir/fixtures/conformance/fixture-catalog.json",
    ));
  }

  for (const fixture of fixtures) {
    const bundlePath = resolve(root, fixture.bundlePath);
    const webReportPath = resolve(reportsDir, `${fixture.canonicalId}.web.report.json`);
    const nativeReportPath = resolve(reportsDir, `${fixture.canonicalId}.native.report.json`);
    const expected = await readExpectedProfile(bundlePath);
    const expectedProfile = expected.profile;
    const { bundle, mapped, nativeReport, webReport } = await writeAdapterReports(root, bundlePath, fixture.canonicalId, webReportPath, nativeReportPath);
    const texelStability = await measureControllerTexelStability(root, bundle, mapped, expected.mapSize);
    const screenshots = await captureFixtureScreenshots(root, bundlePath, fixture.canonicalId, screenshotsDir);
    const evidence: ShadowCascadeEvidence = {
      expectedProfile,
      fixtureId: fixture.canonicalId,
      nativeProfile: readCascadeProfile(nativeReport),
      nativeReportPath,
      screenshots,
      texelStability,
      webProfile: readCascadeProfile(webReport),
      webReportPath,
    };
    const fixtureDiagnostics = validateShadowCascadeEvidence(evidence);
    diagnostics.push(...fixtureDiagnostics);
    fixtureResults.push({
      artifacts: {
        nativeReportPath: toRepoRelative(root, nativeReportPath),
        nativeScreenshotPath: toRepoRelative(root, screenshots.nativePath),
        webScreenshotPath: toRepoRelative(root, screenshots.webPath),
        webReportPath: toRepoRelative(root, webReportPath),
      },
      expectedProfile,
      fixtureId: fixture.canonicalId,
      nativeProfile: evidence.nativeProfile,
      ok: fixtureDiagnostics.length === 0,
      screenshots,
      texelStability,
      webProfile: evidence.webProfile,
    });
  }

  const ok = diagnostics.every((entry) => entry.severity !== "error");
  const contactSheetPath = resolve(artifactDir, "contact-sheet.svg");
  await writeFile(contactSheetPath, renderContactSheet(fixtureResults), "utf8");
  const payload = {
    artifacts: { ...targets.metadata, contactSheetPath: toRepoRelative(root, contactSheetPath) },
    code: ok ? "TN_VERIFY_SHADOW_CASCADE_STABILITY_OK" : "TN_VERIFY_SHADOW_CASCADE_STABILITY_FAILED",
    diagnostics,
    fixtureResults,
    generatedBy: "@threenative/verify-tools shadowCascadeStability",
    ok,
    schema: "threenative.verify.shadow-cascade-stability",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

async function captureFixtureScreenshots(
  root: string,
  bundlePath: string,
  fixtureId: string,
  screenshotsDir: string,
): Promise<{ nativeBytes: number; nativeMetrics: ScreenshotMetrics; nativePath: string; webBytes: number; webMetrics: ScreenshotMetrics; webPath: string }> {
  type StartWebPreview = (options: { bundlePath: string; silent: boolean }) => Promise<{ close(): Promise<void> | void; url: string }>;
  type CaptureScreenshot = (options: { outPath: string; settleMs?: number; url: string; waitReady: boolean }) => Promise<{
    diagnostics?: Array<{ code?: string; message?: string; severity?: string }>;
  }>;
  const [{ startWebPreview }, { captureScreenshot }] = await Promise.all([
    import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as Promise<{ startWebPreview: StartWebPreview }>,
    import(pathToFileURL(resolve(root, "packages/cli/dist/commands/visualProof.js")).href) as Promise<{ captureScreenshot: CaptureScreenshot }>,
  ]);
  const webPath = resolve(screenshotsDir, `${fixtureId}.web.png`);
  const nativePath = resolve(screenshotsDir, `${fixtureId}.native.png`);
  const server = await startWebPreview({ bundlePath, silent: true });
  try {
    const capture = await captureScreenshot({ outPath: webPath, settleMs: 250, url: server.url, waitReady: true });
    const failure = capture.diagnostics?.find((entry) => entry.severity !== "warning");
    if (failure !== undefined) throw new Error(failure.message ?? failure.code ?? "Web shadow screenshot capture failed.");
  } finally {
    await server.close();
  }
  await captureNativeScreenshot({ bundlePath, nativePath, root });
  const [webMetrics, nativeMetrics] = await Promise.all([
    analyzeScreenshot(root, webPath),
    analyzeScreenshot(root, nativePath),
  ]);
  return {
    nativeBytes: (await stat(nativePath)).size,
    nativeMetrics,
    nativePath,
    webBytes: (await stat(webPath)).size,
    webMetrics,
    webPath,
  };
}

async function analyzeScreenshot(root: string, path: string): Promise<ScreenshotMetrics> {
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
    luminances.push((0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255);
    if (Math.abs(red - background[0]) + Math.abs(green - background[1]) + Math.abs(blue - background[2]) > 24) nonBackground += 1;
  }
  const nearShadow = average(regionLuminances(frame, { height: 0.035, width: 0.025, x: 0.275, y: 0.59 }));
  const nearLitReceiver = average(regionLuminances(frame, { height: 0.035, width: 0.035, x: 0.51, y: 0.59 }));
  const receiverShadowContrast = Math.abs(nearLitReceiver - nearShadow);
  const nearShadowEdgeMeanGradient = meanHorizontalGradient(frame, { height: 0.09, width: 0.12, x: 0.26, y: 0.56 });
  const boundaryAbove = average([
    ...regionLuminances(frame, { height: 0.018, width: 0.18, x: 0.05, y: 0.505 }),
    ...regionLuminances(frame, { height: 0.018, width: 0.18, x: 0.77, y: 0.505 }),
  ]);
  const boundaryBelow = average([
    ...regionLuminances(frame, { height: 0.018, width: 0.18, x: 0.05, y: 0.56 }),
    ...regionLuminances(frame, { height: 0.018, width: 0.18, x: 0.77, y: 0.56 }),
  ]);
  return {
    cascadeBoundaryLuminanceDelta: Math.abs(boundaryAbove - boundaryBelow),
    luminanceStdDev: standardDeviation(luminances),
    nearShadowEdgeMeanGradient,
    nonBackgroundFraction: nonBackground / Math.max(1, frame.width * frame.height),
    receiverShadowContrast,
  };
}

function meanHorizontalGradient(
  frame: { data: ArrayLike<number>; height: number; width: number },
  region: { height: number; width: number; x: number; y: number },
): number {
  let sum = 0;
  let count = 0;
  const xStart = Math.floor(frame.width * region.x);
  const xEnd = Math.floor(frame.width * (region.x + region.width));
  const yStart = Math.floor(frame.height * region.y);
  const yEnd = Math.floor(frame.height * (region.y + region.height));
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x + 1 < xEnd; x += 1) {
      sum += Math.abs(pixelLuminance(frame.data, (y * frame.width + x) * 4) - pixelLuminance(frame.data, (y * frame.width + x + 1) * 4));
      count += 1;
    }
  }
  return sum / Math.max(1, count);
}

function regionLuminances(
  frame: { data: ArrayLike<number>; height: number; width: number },
  region: { height: number; width: number; x: number; y: number },
): number[] {
  const values: number[] = [];
  const xStart = Math.floor(frame.width * region.x);
  const xEnd = Math.floor(frame.width * (region.x + region.width));
  const yStart = Math.floor(frame.height * region.y);
  const yEnd = Math.floor(frame.height * (region.y + region.height));
  for (let y = yStart; y < yEnd; y += 1) {
    for (let x = xStart; x < xEnd; x += 1) values.push(pixelLuminance(frame.data, (y * frame.width + x) * 4));
  }
  return values;
}

function pixelLuminance(data: ArrayLike<number>, offset: number): number {
  return (0.2126 * Number(data[offset] ?? 0) + 0.7152 * Number(data[offset + 1] ?? 0) + 0.0722 * Number(data[offset + 2] ?? 0)) / 255;
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length);
}

async function captureNativeScreenshot(options: { bundlePath: string; nativePath: string; root: string }): Promise<void> {
  const args = [
    "run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_capture", "--",
    options.bundlePath, "camera.main", options.nativePath, "120",
  ];
  const cwd = resolve(options.root, "runtime-bevy");
  try {
    await execFileAsync("xvfb-run", ["-a", "cargo", ...args], { cwd, timeout: 180_000 });
  } catch (error) {
    if (isMissingCommandError(error)) {
      await execFileAsync("cargo", args, { cwd, timeout: 180_000 });
      return;
    }
    try {
      if ((await stat(options.nativePath)).size > 0) return;
    } catch {
      // Preserve the capture command failure when no screenshot was written.
    }
    throw error;
  }
}

function renderContactSheet(results: Array<{ artifacts: { nativeScreenshotPath: string; webScreenshotPath: string }; fixtureId: string }>): string {
  const rows = results.map((result, index) => {
    const y = 50 + index * 410;
    const web = result.artifacts.webScreenshotPath.split("/").at(-1) ?? "";
    const native = result.artifacts.nativeScreenshotPath.split("/").at(-1) ?? "";
    return `<text x="40" y="${y - 15}" fill="#ffffff">${result.fixtureId}: web / native</text>\n<image x="40" y="${y}" width="640" height="360" href="screenshots/${web}"/>\n<image x="720" y="${y}" width="640" height="360" href="screenshots/${native}"/>`;
  }).join("\n");
  const height = Math.max(430, 70 + results.length * 410);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1400" height="${height}" viewBox="0 0 1400 ${height}">\n<rect width="100%" height="100%" fill="#111318"/>\n${rows}\n</svg>\n`;
}

function isMissingCommandError(error: unknown): boolean {
  return isRecord(error) && error.code === "ENOENT";
}

function validateRuntimeProfile(
  runtime: "NATIVE" | "WEB",
  profile: CascadeProfileReport | undefined,
  expected: ResolvedCascadeProfile,
  path: string,
  diagnostics: VerificationDiagnostic[],
): void {
  if (
    profile === undefined
    || profile.mode !== "exact"
    || !isDeepStrictEqual(profile.requested, expected)
    || !isDeepStrictEqual(profile.applied, expected)
  ) {
    diagnostics.push(diagnostic(
      `TN_VERIFY_SHADOW_CASCADE_${runtime}_PROFILE_MISMATCH`,
      `${runtime.toLowerCase()} cascade report must resolve the catalog fixture's requested profile exactly.`,
      path,
    ));
  }
}

async function measureControllerTexelStability(root: string, bundle: unknown, mapped: unknown, mapSize: number): Promise<TexelStabilityEvidence> {
  type Snapshot = { cascades: Array<{ lightMatrix: number[]; right: number }> };
  type CameraLike = { position: { set(x: number, y: number, z: number): void; x: number; y: number; z: number } };
  const module = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/rendering/directionalShadowController.js")).href) as {
    DirectionalShadowController: new (options: { atmosphere: unknown; camera: CameraLike; scene: unknown }) => {
      dispose(): void;
      snapshot(): Snapshot;
      update(camera: CameraLike): void;
    };
  };
  const bundleRecord = asRecord(bundle, "Loaded fixture bundle");
  const environmentScene = asRecord(bundleRecord.environmentScene, "Fixture environment scene");
  const atmosphere = asRecord(environmentScene.atmosphere, "Fixture atmosphere");
  const sun = asRecord(atmosphere.sun, "Fixture atmosphere sun");
  const direction = requiredVec3(sun.direction, "atmosphere.sun.direction");
  const mappedRecord = asRecord(mapped, "Mapped fixture world");
  const camera = mappedRecord.camera as CameraLike;
  if (camera?.position === undefined) throw new Error("Mapped shadow fixture must expose its active camera position.");
  const controller = new module.DirectionalShadowController({ atmosphere, camera, scene: mappedRecord.scene });
  const origin: Vec3 = [camera.position.x, camera.position.y, camera.position.z];
  try {
    const before = controller.snapshot();
    const texelSize = ((before.cascades[0]?.right ?? 0) * 2) / mapSize;
    if (!(texelSize > 0)) throw new Error("DirectionalShadowController must expose positive first-cascade bounds.");
    const motionAxis = perpendicularUnit(direction);
    const cameraMotionTexels = 0.25;
    const subTexelDistance = texelSize * cameraMotionTexels;
    let chosenSign = 0;
    let after: Snapshot | undefined;
    for (const sign of [1, -1] as const) {
      setCameraOffset(camera, origin, motionAxis, subTexelDistance * sign);
      controller.update(camera);
      const candidate = controller.snapshot();
      if (isDeepStrictEqual(flattenMatrices(before), flattenMatrices(candidate))) {
        chosenSign = sign;
        after = candidate;
        break;
      }
    }
    if (after === undefined || chosenSign === 0) {
      setCameraOffset(camera, origin, motionAxis, subTexelDistance);
      controller.update(camera);
      after = controller.snapshot();
      chosenSign = 1;
    }
    const controlMotionTexels = 1.25;
    setCameraOffset(camera, origin, motionAxis, texelSize * controlMotionTexels * chosenSign);
    controller.update(camera);
    const control = controller.snapshot();
    const lightMatrixBefore = flattenMatrices(before);
    const lightMatrixAfter = flattenMatrices(after);
    const wholeTexelControlMatrix = flattenMatrices(control);
    return {
      cameraMotion: scaleVec3(motionAxis, subTexelDistance * chosenSign),
      cameraMotionTexels,
      lightMatrixAfter,
      lightMatrixBefore,
      stable: isDeepStrictEqual(lightMatrixBefore, lightMatrixAfter),
      texelSize,
      wholeTexelControlChanged: !isDeepStrictEqual(lightMatrixBefore, wholeTexelControlMatrix),
      wholeTexelControlMatrix,
      wholeTexelControlMotionTexels: controlMotionTexels,
    };
  } finally {
    camera.position.set(...origin);
    controller.dispose();
  }
}

async function writeAdapterReports(
  root: string,
  bundlePath: string,
  fixtureId: string,
  webReportPath: string,
  nativeReportPath: string,
): Promise<{ bundle: unknown; mapped: unknown; nativeReport: unknown; webReport: unknown }> {
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as {
    loadBundle(path: string): Promise<unknown>;
    mapWorld(bundle: unknown): unknown;
    reportWebConformance(bundle: unknown, mapped: unknown, fixture: string): unknown;
  };
  const bundle = await runtime.loadBundle(bundlePath);
  const mapped = runtime.mapWorld(bundle);
  const webReport = runtime.reportWebConformance(bundle, mapped, fixtureId);
  await writeFile(webReportPath, `${JSON.stringify(webReport, null, 2)}\n`, "utf8");
  await execFileAsync("cargo", [
    "run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_conformance", "--",
    bundlePath, fixtureId, nativeReportPath,
  ], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  return { bundle, mapped, nativeReport: JSON.parse(await readFile(nativeReportPath, "utf8")) as unknown, webReport };
}

async function readExpectedProfile(bundlePath: string): Promise<{ mapSize: number; profile: ResolvedCascadeProfile }> {
  const environment = JSON.parse(await readFile(resolve(bundlePath, "environment.scene.json"), "utf8")) as unknown;
  if (!isRecord(environment) || !isRecord(environment.atmosphere) || !isRecord(environment.atmosphere.shadows)) {
    throw new Error(`Shadow cascade fixture '${bundlePath}' must author atmosphere.shadows.`);
  }
  const shadows = environment.atmosphere.shadows;
  return {
    mapSize: requiredNumber(shadows, "mapSize"),
    profile: {
      cascadeBlendFraction: requiredNumber(shadows, "cascadeBlendFraction"),
      cascadeCount: requiredNumber(shadows, "cascadeCount"),
      maxDistance: requiredNumber(shadows, "maxDistance"),
      splitLambda: requiredNumber(shadows, "splitLambda"),
      splitScheme: requiredSplitScheme(shadows.splitScheme),
      stabilized: shadows.stabilized === true,
    },
  };
}

function readCascadeProfile(report: unknown): CascadeProfileReport | undefined {
  const profile = nestedRecord(report, ["runtimeConfig", "renderer", "renderLook", "shadowProfile", "cascadeProfile"]);
  if (!isRecord(profile) || !isRecord(profile.requested) || !isRecord(profile.applied)) return undefined;
  return profile as unknown as CascadeProfileReport;
}

function flattenMatrices(snapshot: { cascades: Array<{ lightMatrix: number[] }> }): number[] {
  return snapshot.cascades.flatMap((cascade) => cascade.lightMatrix);
}

function perpendicularUnit([x, _y, z]: Vec3): Vec3 {
  const length = Math.hypot(x, z);
  return length > 1e-12 ? [-z / length, 0, x / length] : [1, 0, 0];
}

function scaleVec3([x, y, z]: Vec3, scale: number): Vec3 {
  return [x * scale, y * scale, z * scale];
}

function setCameraOffset(camera: { position: { set(x: number, y: number, z: number): void } }, origin: Vec3, axis: Vec3, distance: number): void {
  camera.position.set(origin[0] + axis[0] * distance, origin[1] + axis[1] * distance, origin[2] + axis[2] * distance);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function requiredVec3(value: unknown, label: string): Vec3 {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((entry) => typeof entry === "number" && Number.isFinite(entry))) {
    throw new Error(`${label} must contain three finite numbers.`);
  }
  return [value[0] as number, value[1] as number, value[2] as number];
}

function nestedRecord(value: unknown, keys: readonly string[]): Record<string, unknown> | undefined {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return isRecord(current) ? current : undefined;
}

function requiredNumber(value: Record<string, unknown>, key: string): number {
  if (typeof value[key] !== "number" || !Number.isFinite(value[key])) throw new Error(`Expected finite atmosphere.shadows.${key}.`);
  return value[key];
}

function requiredSplitScheme(value: unknown): ResolvedCascadeProfile["splitScheme"] {
  if (value !== "uniform" && value !== "logarithmic" && value !== "practical") throw new Error("Expected atmosphere.shadows.splitScheme.");
  return value;
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic {
  return {
    code,
    message,
    path,
    severity: "error",
    suggestedFix: `Regenerate '${GATE_NAME}' and inspect the paired cascade reports and texel-stability measurement.`,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runShadowCascadeStabilityGate();
  process.stdout.write(`${JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok, reportPath: result.reportPath }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
