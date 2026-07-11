import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { resolveArtifactTargets, toRepoRelative } from "./artifacts.js";
import { loadFixtureCatalog } from "./conformance.js";
import type { VerificationDiagnostic } from "./runner.js";
import { captureNative, captureWeb, writeAdapterReports } from "./ssgiGate.js";

const GATE_NAME = "verify:baked-gi";

interface IProbeMetrics {
  luminance: number;
  nonBackgroundFraction: number;
  overexposedFraction: number;
  redChroma: number;
}

export async function runBakedGiGate(options: { reportPath?: string; root?: string } = {}): Promise<{ diagnostics: VerificationDiagnostic[]; ok: boolean; reportPath: string }> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "baked-gi", owner: { kind: "aggregate" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const artifactDir = resolve(reportPath, "..");
  const screenshotsDir = resolve(artifactDir, "screenshots");
  const reportsDir = resolve(artifactDir, "reports");
  await mkdir(screenshotsDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });
  const fixture = (await loadFixtureCatalog(root)).fixtures.find((candidate) => candidate.aggregateGate === GATE_NAME);
  const diagnostics: VerificationDiagnostic[] = [];
  const fixtureResults: unknown[] = [];
  if (fixture === undefined) diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_FIXTURE_MISSING", `The fixture catalog must enroll a fixture in '${GATE_NAME}'.`, "packages/ir/fixtures/conformance/fixture-catalog.json"));

  if (fixture !== undefined) {
    const bundlePath = resolve(root, fixture.bundlePath);
    const controlBundle = await createDisabledBundle(bundlePath);
    const paths = {
      native: resolve(screenshotsDir, `${fixture.canonicalId}.native.png`),
      nativeDisabled: resolve(screenshotsDir, `${fixture.canonicalId}.disabled.native.png`),
      web: resolve(screenshotsDir, `${fixture.canonicalId}.web.png`),
      webDisabled: resolve(screenshotsDir, `${fixture.canonicalId}.disabled.web.png`),
    };
    const webReportPath = resolve(reportsDir, `${fixture.canonicalId}.web.report.json`);
    const nativeReportPath = resolve(reportsDir, `${fixture.canonicalId}.native.report.json`);
    try {
      const reports = await writeAdapterReports(root, bundlePath, fixture.canonicalId, webReportPath, nativeReportPath);
      await captureWeb(root, bundlePath, paths.web);
      await captureNative(root, bundlePath, paths.native, 120);
      await captureWeb(root, controlBundle, paths.webDisabled);
      await captureNative(root, controlBundle, paths.nativeDisabled, 120);
      const [web, webDisabled, native, nativeDisabled] = await Promise.all([
        analyzeScreenshot(root, paths.web), analyzeScreenshot(root, paths.webDisabled),
        analyzeScreenshot(root, paths.native), analyzeScreenshot(root, paths.nativeDisabled),
      ]);
      diagnostics.push(...validateVisualEvidence({ native, nativeDisabled, nativePath: paths.native, nativeReport: reports.nativeReport, web, webDisabled, webPath: paths.web, webReport: reports.webReport }));
      diagnostics.push(...await validateStaleDiagnostic(root, bundlePath));
      fixtureResults.push({
        artifacts: Object.fromEntries(Object.entries(paths).map(([key, value]) => [`${key}ScreenshotPath`, toRepoRelative(root, value)])),
        fixtureId: fixture.canonicalId,
        native,
        nativeDisabled,
        web,
        webDisabled,
      });
    } finally {
      await rm(resolve(controlBundle, ".."), { force: true, recursive: true });
    }
  }
  const ok = diagnostics.every((entry) => entry.severity !== "error");
  await writeFile(reportPath, `${JSON.stringify({ artifacts: targets.metadata, code: ok ? "TN_VERIFY_BAKED_GI_OK" : "TN_VERIFY_BAKED_GI_FAILED", diagnostics, fixtureResults, generatedBy: "@threenative/verify-tools bakedGiGate", ok, schema: "threenative.verify.baked-gi", status: ok ? "pass" : "fail", version: "0.1.0" }, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

function validateVisualEvidence(evidence: { native: IProbeMetrics; nativeDisabled: IProbeMetrics; nativePath: string; nativeReport: unknown; web: IProbeMetrics; webDisabled: IProbeMetrics; webPath: string; webReport: unknown }): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  for (const [runtime, authored, disabled, path] of [["web", evidence.web, evidence.webDisabled, evidence.webPath], ["native", evidence.native, evidence.nativeDisabled, evidence.nativePath]] as const) {
    if (authored.nonBackgroundFraction < 0.04) diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_SCREENSHOT_CONTENT_MISSING", `${runtime} baked-GI screenshot must contain measurable scene content.`, path));
    if (authored.luminance - disabled.luminance <= 0.008) diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_INDIRECT_LIFT_MISSING", `${runtime} alcove subject region must brighten with baked probes.`, path));
    const minimumWarmLift = runtime === "native" ? 0.003 : 0.006;
    if (authored.redChroma - disabled.redChroma <= minimumWarmLift) diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_WARM_BOUNCE_MISSING", `${runtime} alcove subject region must receive measurable warm bounce.`, path));
    if (authored.overexposedFraction > 0.02) diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_CLIPPING", `${runtime} baked-GI subject region must retain highlight detail instead of clipping to white.`, path));
  }
  const webLift = evidence.web.luminance - evidence.webDisabled.luminance;
  const nativeLift = evidence.native.luminance - evidence.nativeDisabled.luminance;
  if (nativeLift > webLift * 4 + 0.015) diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_NATIVE_LIFT_EXCESSIVE", "Native baked-GI lift must remain in the same visual range as web instead of flooding the scene.", evidence.nativePath));
  const webMode = bakedGiMode(evidence.webReport);
  const nativeMode = bakedGiMode(evidence.nativeReport);
  if (webMode !== "camera-weighted-sh2") diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_WEB_REPORT_MISSING", "Web conformance must report camera-weighted-sh2 baked probes.", evidence.webPath));
  if (nativeMode !== "global-ambient-sh-l0-approximation") diagnostics.push(diagnostic("TN_VERIFY_BAKED_GI_NATIVE_REPORT_MISSING", "Native conformance must report its SH L0 ambient approximation.", evidence.nativePath));
  return diagnostics;
}

async function validateStaleDiagnostic(root: string, bundlePath: string): Promise<VerificationDiagnostic[]> {
  const compiler = await import(pathToFileURL(resolve(root, "packages/compiler/dist/bake/bakedProbeContent.js")).href) as { applyBakedProbeContent(projectPath: string, world: unknown, materials: unknown, environment: unknown, assets: unknown): Promise<{ diagnostics: Array<{ code: string }> }> };
  const project = await mkdtemp(resolve(tmpdir(), "tn-baked-gi-stale-"));
  try {
    await mkdir(resolve(project, "content/lighting"), { recursive: true });
    const [world, materials, environment, assets] = await Promise.all(["world.ir.json", "materials.ir.json", "environment.scene.json", "assets.manifest.json"].map(async (file) => JSON.parse(await readFile(resolve(bundlePath, file), "utf8")) as unknown));
    await writeFile(resolve(project, "content/lighting/alcove.probes.json"), `${JSON.stringify({ probes: [{ id: "probe.alcove", source: { bakeVersion: 1, coefficients: Array(27).fill(0), format: "sh2", sceneContentHash: `sha256:${"b".repeat(64)}` } }], sceneContentHash: `sha256:${"b".repeat(64)}`, sceneId: "alcove", schema: "threenative.baked-probes", version: "0.1.0" })}\n`, "utf8");
    const result = await compiler.applyBakedProbeContent(project, world, materials, environment, assets);
    return result.diagnostics.some((entry) => entry.code === "TN_IR_LIGHT_PROBE_BAKE_STALE") ? [] : [diagnostic("TN_VERIFY_BAKED_GI_STALE_DIAGNOSTIC_MISSING", "A mismatched scene hash must emit TN_IR_LIGHT_PROBE_BAKE_STALE.", "content/lighting/alcove.probes.json")];
  } finally {
    await rm(project, { force: true, recursive: true });
  }
}

async function createDisabledBundle(bundlePath: string): Promise<string> {
  const root = await mkdtemp(resolve(tmpdir(), "tn-baked-gi-control-"));
  const control = resolve(root, "game.bundle");
  await cp(bundlePath, control, { recursive: true });
  const path = resolve(control, "environment.scene.json");
  const environment = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
  environment.lightProbes = [];
  await writeFile(path, `${JSON.stringify(environment, null, 2)}\n`, "utf8");
  return control;
}

async function analyzeScreenshot(root: string, path: string): Promise<IProbeMetrics> {
  if ((await stat(path)).size <= 0) return { luminance: 0, nonBackgroundFraction: 0, overexposedFraction: 0, redChroma: 0 };
  const { readPngFrame } = await import(pathToFileURL(resolve(root, "packages/cli/dist/verify/compareImages.js")).href) as { readPngFrame(path: string): Promise<{ data: ArrayLike<number>; height: number; width: number }> };
  const frame = await readPngFrame(path);
  const background = pixel(frame, 0, 0);
  let content = 0;
  let regionCount = 0;
  let luminance = 0;
  let overexposed = 0;
  let redChroma = 0;
  let samples = 0;
  for (let y = 0; y < frame.height; y += 4) for (let x = 0; x < frame.width; x += 4) {
    const rgb = pixel(frame, x, y);
    if (Math.abs(rgb[0] - background[0]) + Math.abs(rgb[1] - background[1]) + Math.abs(rgb[2] - background[2]) > 18) content += 1;
    samples += 1;
    if (x >= frame.width * 0.4 && x <= frame.width * 0.6 && y >= frame.height * 0.42 && y <= frame.height * 0.72) {
      luminance += (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
      redChroma += (rgb[0] - (rgb[1] + rgb[2]) * 0.5) / 255;
      if (rgb[0] >= 250 && rgb[1] >= 250 && rgb[2] >= 250) overexposed += 1;
      regionCount += 1;
    }
  }
  return { luminance: luminance / Math.max(1, regionCount), nonBackgroundFraction: content / Math.max(1, samples), overexposedFraction: overexposed / Math.max(1, regionCount), redChroma: redChroma / Math.max(1, regionCount) };
}

function bakedGiMode(report: unknown): string | undefined {
  return isRecord(report) && isRecord(report.environment) && isRecord(report.environment.bakedGiProbes) && typeof report.environment.bakedGiProbes.mode === "string" ? report.environment.bakedGiProbes.mode : undefined;
}

function pixel(frame: { data: ArrayLike<number>; width: number }, x: number, y: number): [number, number, number] {
  const index = (Math.floor(y) * frame.width + Math.floor(x)) * 4;
  return [Number(frame.data[index] ?? 0), Number(frame.data[index + 1] ?? 0), Number(frame.data[index + 2] ?? 0)];
}

function diagnostic(code: string, message: string, path: string): VerificationDiagnostic { return { code, message, path, severity: "error" }; }
function isRecord(value: unknown): value is Record<string, any> { return typeof value === "object" && value !== null && !Array.isArray(value); }

async function main(): Promise<void> {
  const result = await runBakedGiGate();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

if (process.argv[1] === new URL(import.meta.url).pathname) void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
