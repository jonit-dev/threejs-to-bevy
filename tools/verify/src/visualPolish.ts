import { execFile } from "node:child_process";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { resolveArtifactTargets } from "./artifacts.js";
import type { VerificationDiagnostic } from "./runner.js";

const execFileAsync = promisify(execFile);
const REQUIRED_CALIBRATION_FIXTURES = ["v10-lighting", "v10-materials", "v10-dense"] as const;
const MATERIAL_ID = "mat.hero";

interface VisualPolishEvidence {
  calibration?: unknown;
  calibrationReportPath: string;
  materialReports: { bevy?: unknown; bevyPath: string; web?: unknown; webPath: string };
  shadowReports: { bevy?: unknown; bevyPath: string; web?: unknown; webPath: string };
  textureVariants?: unknown;
  textureVariantReportPath: string;
}

export interface VisualPolishGateResult {
  diagnostics: VerificationDiagnostic[];
  ok: boolean;
  reportPath: string;
}

export function validateVisualPolishEvidence(evidence: VisualPolishEvidence): VerificationDiagnostic[] {
  const diagnostics: VerificationDiagnostic[] = [];
  validateCalibration(evidence.calibration, evidence.calibrationReportPath, diagnostics);
  validateShadowReports(evidence.shadowReports, diagnostics);
  validateMaterialReports(evidence.materialReports, diagnostics);
  validateTextureVariantProof(evidence.textureVariants, evidence.textureVariantReportPath, diagnostics);
  return diagnostics;
}

export async function runVisualPolishGate(options: { root?: string; reportPath?: string } = {}): Promise<VisualPolishGateResult> {
  const root = resolve(options.root ?? process.cwd());
  const targets = resolveArtifactTargets({ gate: "feature-parity-visual-polish", owner: { kind: "aggregate", name: "feature-parity-visual-polish" }, root });
  const reportPath = options.reportPath ?? targets.reportPath;
  const artifactDir = resolve(reportPath, "..");
  const reportsDir = resolve(artifactDir, "reports");
  const calibrationReportPath = resolve(root, "tools/verify/artifacts/visual-calibration/verification-report.json");
  const shadowBundlePath = resolve(root, "packages/ir/fixtures/conformance/rendering-lights/game.bundle");
  const materialBundlePath = resolve(root, "packages/ir/fixtures/conformance/rendering-residuals/game.bundle");
  const denseBundlePath = resolve(root, "packages/ir/fixtures/conformance/renderer-dense-content/game.bundle");
  const textureVariantReportPath = resolve(reportsDir, "dense-texture-variants.json");
  await mkdir(reportsDir, { recursive: true });

  const shadowReports = await writeAdapterReports(root, shadowBundlePath, "shadow-profile", reportsDir);
  const materialReports = await writeAdapterReports(root, materialBundlePath, "material-polish", reportsDir);
  const evidence: VisualPolishEvidence = {
    calibration: await readJson(calibrationReportPath),
    calibrationReportPath,
    materialReports,
    shadowReports,
    textureVariants: await writeTextureVariantReport(denseBundlePath, textureVariantReportPath),
    textureVariantReportPath,
  };
  const diagnostics = validateVisualPolishEvidence(evidence);
  const ok = diagnostics.every((diagnostic) => diagnostic.severity !== "error");
  const payload = {
    artifacts: {
      calibrationReportPath,
      materialReports: { bevy: materialReports.bevyPath, web: materialReports.webPath },
      reportPath,
      shadowReports: { bevy: shadowReports.bevyPath, web: shadowReports.webPath },
      textureVariantReportPath,
    },
    code: ok ? "TN_VERIFY_VISUAL_POLISH_OK" : "TN_VERIFY_VISUAL_POLISH_FAILED",
    diagnostics,
    generatedBy: "@threenative/verify-tools visualPolish",
    ok,
    schema: "threenative.verify.feature-parity-visual-polish",
    status: ok ? "pass" : "fail",
    version: "0.1.0",
  };
  await mkdir(artifactDir, { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return { diagnostics, ok, reportPath };
}

async function writeAdapterReports(root: string, bundlePath: string, fixture: string, reportsDir: string): Promise<VisualPolishEvidence["shadowReports"]> {
  const webPath = resolve(reportsDir, `${fixture}.web.json`);
  const bevyPath = resolve(reportsDir, `${fixture}.bevy.json`);
  const runtime = await import(pathToFileURL(resolve(root, "packages/runtime-web-three/dist/index.js")).href) as {
    loadBundle(path: string): Promise<unknown>;
    mapWorld(bundle: unknown): unknown;
    reportWebConformance(bundle: unknown, mapped: unknown, fixture: string): unknown;
  };
  const bundle = await runtime.loadBundle(bundlePath);
  const web = runtime.reportWebConformance(bundle, runtime.mapWorld(bundle), fixture);
  await writeFile(webPath, `${JSON.stringify(web, null, 2)}\n`, "utf8");
  await execFileAsync("cargo", [
    "run", "--quiet", "-p", "threenative_runtime", "--bin", "threenative_conformance", "--",
    bundlePath, fixture, bevyPath,
  ], { cwd: resolve(root, "runtime-bevy"), timeout: 180_000 });
  return { bevy: await readJson(bevyPath), bevyPath, web, webPath };
}

async function writeTextureVariantReport(bundlePath: string, reportPath: string): Promise<unknown> {
  const manifest = await readJson(resolve(bundlePath, "assets.manifest.json"));
  const assets = isRecord(manifest) && Array.isArray(manifest.assets) ? manifest.assets : [];
  const textures = [];
  for (const asset of assets) {
    if (!isRecord(asset) || asset.kind !== "texture" || typeof asset.id !== "string" || !Array.isArray(asset.variants)) continue;
    const paths = [asset.path, ...asset.variants.map((variant) => isRecord(variant) ? variant.path : undefined)]
      .filter((path): path is string => typeof path === "string");
    let loadedBytes = 0;
    for (const path of paths) loadedBytes += (await stat(resolve(bundlePath, path))).size;
    textures.push({ id: asset.id, loadedBytes, selectedVariantCount: paths.length });
  }
  const report = {
    loadedBytes: textures.reduce((total, texture) => total + texture.loadedBytes, 0),
    selectedVariantCount: textures.reduce((total, texture) => total + texture.selectedVariantCount, 0),
    status: textures.length > 0 ? "measured" : "missing",
    textures,
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

function validateCalibration(report: unknown, path: string, diagnostics: VerificationDiagnostic[]): void {
  if (!isRecord(report) || report.ok !== true || !Array.isArray(report.fixtureResults)) {
    diagnostics.push(missingDiagnostic("TN_VERIFY_VISUAL_POLISH_CALIBRATION_MISSING", "Passing visual calibration evidence is required.", path));
    return;
  }
  for (const fixtureId of REQUIRED_CALIBRATION_FIXTURES) {
    const fixture = report.fixtureResults.find((entry) => isRecord(entry) && entry.fixtureId === fixtureId);
    if (!isRecord(fixture) || fixture.ok !== true || typeof fixture.artifactDir !== "string") {
      diagnostics.push(missingDiagnostic("TN_VERIFY_VISUAL_POLISH_CALIBRATION_FIXTURE_MISSING", `Passing web/native screenshot evidence is required for '${fixtureId}'.`, path));
    }
  }
}

function validateShadowReports(reports: VisualPolishEvidence["shadowReports"], diagnostics: VerificationDiagnostic[]): void {
  const profiles = [["web", reports.web, reports.webPath], ["bevy", reports.bevy, reports.bevyPath]] as const;
  for (const [runtime, report, path] of profiles) {
    const profile = nestedRecord(report, ["runtimeConfig", "renderer", "renderLook", "shadowProfile"]);
    if (profile?.enabled !== true || profile.quality !== "medium" || profile.mapSize !== 1024 || profile.cascadeCount !== 2 || profile.filter !== "pcf") {
      diagnostics.push(missingDiagnostic("TN_VERIFY_VISUAL_POLISH_SHADOW_PROFILE_MISMATCH", `${runtime} shadow report must prove the bounded medium profile (PCF, 1024, two cascades).`, path));
    }
  }
}

function validateMaterialReports(reports: VisualPolishEvidence["materialReports"], diagnostics: VerificationDiagnostic[]): void {
  for (const [runtime, report, path] of [["web", reports.web, reports.webPath], ["bevy", reports.bevy, reports.bevyPath]] as const) {
    const materials = isRecord(report) && Array.isArray(report.materials) ? report.materials : [];
    const material = materials.find((entry) => isRecord(entry) && entry.id === MATERIAL_ID);
    const textures = isRecord(material) && isRecord(material.textures) ? material.textures : undefined;
    if (!isRecord(material) || material.specularIntensity !== 0.8 || textures?.specular !== "texture.specular") {
      diagnostics.push(missingDiagnostic("TN_VERIFY_VISUAL_POLISH_MATERIAL_ARTIFACT_MISSING", `${runtime} material report must preserve '${MATERIAL_ID}' specular texture and intensity evidence.`, path));
    }
  }
}

function validateTextureVariantProof(report: unknown, path: string, diagnostics: VerificationDiagnostic[]): void {
  if (
    !isRecord(report)
    || report.status !== "measured"
    || typeof report.loadedBytes !== "number"
    || report.loadedBytes <= 0
    || typeof report.selectedVariantCount !== "number"
    || report.selectedVariantCount < 2
  ) {
    diagnostics.push(missingDiagnostic("TN_VERIFY_VISUAL_POLISH_TEXTURE_VARIANT_PROOF_MISSING", "Passing measured dense-scene texture-variant evidence is required.", path));
  }
}

function missingDiagnostic(code: string, message: string, path: string): VerificationDiagnostic {
  return { code, message, path, severity: "error", suggestedFix: "Regenerate the focused visual-polish evidence and inspect the referenced report." };
}

async function readJson(path: string): Promise<unknown | undefined> {
  try {
    await access(path);
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return undefined;
  }
}

function nestedRecord(value: unknown, keys: string[]): Record<string, unknown> | undefined {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return isRecord(current) ? current : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await runVisualPolishGate();
  process.stdout.write(`${JSON.stringify({ diagnostics: result.diagnostics, ok: result.ok, reportPath: result.reportPath }, null, 2)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}
