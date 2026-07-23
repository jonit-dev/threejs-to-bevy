import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { arch, cpus, platform, release } from "node:os";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION } from "@threenative/ir";
import { chromium } from "playwright";
import { createAdvancedPhysicsBenchmarkWorld, createBenchmarkFractureManifest, type IAdvancedPhysicsBenchmarkResult } from "@threenative/runtime-web-three";
import { ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION, advancedPhysicsEvidenceMetadataDiagnostics } from "./advancedPhysicsEvidence.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const artifactDir = resolve(root, "tools/verify/artifacts/advanced-physics/phase-8-major-games");

const cases = [
  { project: "examples/advanced-vehicle-course", scenario: "advanced-vehicle-course-objective", maxMovementDelta: 20, expected: { "resource.CourseState.checkpoint": 3, "resource.CourseState.collisionEntity": "damage-barrier", "resource.CourseState.damage": 25, "resource.CourseState.events": ["retry", "mixed-surface", "jump", "collision-damage", "finish"], "resource.CourseState.jumped": true, "resource.CourseState.mixedSurface": true, "resource.CourseState.retryCount": 1, "resource.CourseState.status": "finished" }, requiredAssertions: ["movement", "resource.CourseState.checkpoint", "resource.CourseState.collisionEntity", "resource.CourseState.damage", "resource.CourseState.events", "resource.CourseState.jumped", "resource.CourseState.mixedSurface", "resource.CourseState.retryCount", "resource.CourseState.status"] },
  { project: "examples/advanced-vehicle-course", scenario: "advanced-vehicle-course-no-throttle", maxMovementDelta: 25, expected: { "resource.CourseState.damage": 0, "resource.CourseState.jumped": false, "resource.CourseState.retryCount": 1 }, negativeControl: true, requiredAssertions: ["movement", "resource.CourseState.damage", "resource.CourseState.jumped", "resource.CourseState.retryCount"] },
  { project: "examples/aerodynamics-flight-course", scenario: "aerodynamics-flight-course-objective", maxMovementDelta: 30, expected: { "resource.FlightState.takeoff": true, "resource.FlightState.stall": true, "resource.FlightState.recovered": true, "resource.FlightState.landed": true, "resource.FlightState.retryCount": 1 }, requiredAssertions: ["movement", "resource.FlightState.takeoff", "resource.FlightState.stall", "resource.FlightState.recovered", "resource.FlightState.landed", "resource.FlightState.retryCount"] },
  { project: "examples/destruction-range", scenario: "destruction-range-projectile-threshold", maxMovementDelta: 4, expected: { "resource.DestructionState.impact": true, "resource.DestructionState.regionalBreak": true, "resource.DestructionState.settled": true }, requiredAssertions: ["movement", "resource.DestructionState.impact", "resource.DestructionState.regionalBreak", "resource.DestructionState.settled"] },
  { project: "examples/destruction-range", scenario: "destruction-range-retry", maxMovementDelta: 0, expected: { "resource.DestructionState.retryCount": 1 }, requiredAssertions: ["resource.DestructionState.retryCount"] },
] as const;

export interface AdvancedPhysicsGateDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error";
  suggestedFix: string;
}

interface PlaytestSummary {
  assertions?: Array<{ details?: { after?: unknown; distance?: number }; id?: string; pass?: boolean }>;
  pass?: boolean;
  proofMetadata?: {
    artifactHashes?: Record<string, string>;
    bundleHash?: string;
    completedAt?: string;
    sourceHash?: string;
    startedAt?: string;
  };
  runtime?: string;
  scenario?: string;
  target?: string;
}

interface AdvancedPhysicsManualReview {
  artifactHashes?: Record<string, string>;
  bundleHashes?: Record<string, string>;
  checklist?: Array<{ id?: string; passed?: boolean }>;
  completedAt?: string;
  sourceHashes?: Record<string, string>;
  status?: string;
}

type AdvancedPhysicsBenchmarkReport = Omit<IAdvancedPhysicsBenchmarkResult, "runtime"> & { runtime: "desktop" | "web" };

export function validateAdvancedPhysicsBenchmark(
  web: AdvancedPhysicsBenchmarkReport,
  desktop: AdvancedPhysicsBenchmarkReport,
): AdvancedPhysicsGateDiagnostic[] {
  const diagnostics: AdvancedPhysicsGateDiagnostic[] = [];
  const expected = { compoundChildren: 256, debrisBodies: 128, projectileBodies: 64, vehicleCount: 16, wheelsPerVehicle: 4 };
  for (const [runtime, report, p95] of [["web", web, 12], ["desktop", desktop, 8]] as const) {
    if (report.schema !== "threenative.advanced-physics-benchmark" || report.version !== "0.2.0" || report.runtime !== runtime) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_BENCHMARK_SCHEMA", `${runtime}/schema`, "Benchmark identity is invalid.");
    }
    if (stableJson(report.workload) !== stableJson(expected) || report.sampleCount !== 3_600 || report.simulatedSeconds !== 60) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_WORKLOAD", `${runtime}/workload`, "The measured workload or 60-second steady-state window was weakened.");
    }
    if (report.p95StepMs > p95 || report.maxStepMs > 16.67) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_PERFORMANCE", `${runtime}/timings`, `Measured p95/max ${report.p95StepMs}/${report.maxStepMs} ms exceed ${p95}/16.67 ms.`);
    }
    if (report.allocatedPieces !== 128 || report.queries !== 230_400 || report.contacts < 1 || report.activeBodies + report.sleepingBodies !== 208) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_TELEMETRY", `${runtime}/telemetry`, "Body, contact, query, or allocation telemetry is incomplete.");
    }
    if (stableJson(report.executedSystems) !== stableJson(["vehicle-controller", "wheel-raycast", "aerodynamics", "destruction", "rapier"])
      || report.allocationTelemetry.heapUsedPeakBytes < report.allocationTelemetry.heapUsedStartBytes) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_EXECUTION", `${runtime}/executedSystems`, "The benchmark did not execute and meter every declared advanced-physics system.");
    }
  }
  return diagnostics;
}

export function validateAdvancedPhysicsPlaytestPair(
  web: PlaytestSummary | undefined,
  desktop: PlaytestSummary | undefined,
  scenario: string,
  requiredAssertions: readonly string[],
  currentSourceHash: string,
  maxMovementDelta = Number.POSITIVE_INFINITY,
  expected: Readonly<Record<string, unknown>> = {},
): AdvancedPhysicsGateDiagnostic[] {
  const diagnostics: AdvancedPhysicsGateDiagnostic[] = [];
  for (const [target, summary] of [["web", web], ["desktop", desktop]] as const) {
    if (summary === undefined) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_EVIDENCE_MISSING", `${scenario}/${target}`, `Missing ${target} evidence.`);
      continue;
    }
    if (summary.pass !== true || summary.scenario !== scenario || summary.target !== target) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_EVIDENCE_FAILED", `${scenario}/${target}`, `${target} evidence failed or identifies the wrong scenario.`);
    }
    const assertions = new Map((summary.assertions ?? []).map((assertion) => [assertion.id, assertion.pass]));
    for (const assertion of requiredAssertions) {
      if (assertions.get(assertion) !== true) push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_ASSERTION_MISSING", `${scenario}/${target}/assertions/${assertion}`, `Required assertion '${assertion}' is missing or failed.`);
    }
    const detailed = new Map((summary.assertions ?? []).map((assertion) => [assertion.id, assertion]));
    for (const [assertion, value] of Object.entries(expected)) {
      if (stableJson(detailed.get(assertion)?.details?.after) !== stableJson(value)) {
        push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_SEMANTIC_STATE", `${scenario}/${target}/assertions/${assertion}`, `Expected '${assertion}' to record ${stableJson(value)}.`);
      }
    }
    if (summary.proofMetadata?.sourceHash !== currentSourceHash) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_EVIDENCE_STALE", `${scenario}/${target}/proofMetadata/sourceHash`, "Evidence does not match current durable source.");
    }
  }
  if (web !== undefined && desktop !== undefined && (
    web.proofMetadata?.sourceHash !== desktop.proofMetadata?.sourceHash
    || web.proofMetadata?.bundleHash !== desktop.proofMetadata?.bundleHash
  )) push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_ADAPTER_PAIR", `${scenario}/proofMetadata`, "Web and desktop evidence do not identify the same source and bundle.");
  if (web !== undefined && desktop !== undefined) {
    const webAssertions = new Map((web.assertions ?? []).map((assertion) => [assertion.id, assertion]));
    const desktopAssertions = new Map((desktop.assertions ?? []).map((assertion) => [assertion.id, assertion]));
    for (const assertion of requiredAssertions.filter((id) => id.startsWith("resource."))) {
      if (stableJson(webAssertions.get(assertion)?.details?.after) !== stableJson(desktopAssertions.get(assertion)?.details?.after)) {
        push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_STATE_DIVERGENCE", `${scenario}/assertions/${assertion}`, `Web and desktop final state differs for '${assertion}'.`);
      }
    }
    const webDistance = webAssertions.get("movement")?.details?.distance;
    const desktopDistance = desktopAssertions.get("movement")?.details?.distance;
    if (requiredAssertions.includes("movement")
      && typeof webDistance === "number"
      && typeof desktopDistance === "number"
      && Math.abs(webDistance - desktopDistance) > maxMovementDelta) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_NUMERIC_DIVERGENCE", `${scenario}/movement`, `Movement delta ${Math.abs(webDistance - desktopDistance)} exceeds ${maxMovementDelta}.`);
    }
  }
  return diagnostics;
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const diagnostics: AdvancedPhysicsGateDiagnostic[] = [];
  const webRun = spawnSync(process.execPath, [resolve(root, "tools/verify/dist/advancedPhysicsWebBenchmark.js")], { encoding: "utf8" });
  let webBenchmark: AdvancedPhysicsBenchmarkReport | undefined;
  if (webRun.status !== 0) {
    push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_WEB_BENCHMARK", "web/benchmark", webRun.stderr || "Web benchmark failed.");
  } else {
    try { webBenchmark = JSON.parse(webRun.stdout) as AdvancedPhysicsBenchmarkReport; }
    catch { push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_WEB_BENCHMARK", "web/benchmark", "Web benchmark emitted invalid JSON."); }
  }
  const benchmarkBundle = await writeBenchmarkBundle();
  const nativeRun = spawnSync(resolve(root, "runtime-bevy/target/release/threenative_advanced_physics_benchmark"), [benchmarkBundle], { encoding: "utf8" });
  let desktopBenchmark: AdvancedPhysicsBenchmarkReport | undefined;
  if (nativeRun.status !== 0) {
    push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_DESKTOP_BENCHMARK", "desktop/benchmark", nativeRun.stderr || "Desktop benchmark failed.");
  } else {
    try { desktopBenchmark = JSON.parse(nativeRun.stdout) as AdvancedPhysicsBenchmarkReport; }
    catch { push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_DESKTOP_BENCHMARK", "desktop/benchmark", "Desktop benchmark emitted invalid JSON."); }
  }
  if (webBenchmark !== undefined) {
    await writeJson(resolve(artifactDir, "web-benchmark.json"), webBenchmark);
  }
  if (desktopBenchmark !== undefined) {
    await writeJson(resolve(artifactDir, "desktop-benchmark.json"), desktopBenchmark);
    if (webBenchmark !== undefined) diagnostics.push(...validateAdvancedPhysicsBenchmark(webBenchmark, desktopBenchmark));
  }

  const playtests: Record<string, { desktop?: string; web?: string }> = {};
  const evidencePairs: Array<{ desktop?: { path: string; summary: PlaytestSummary }; sourceHash: string; web?: { path: string; summary: PlaytestSummary } }> = [];
  for (const item of cases) {
    const projectPath = resolve(root, item.project);
    const sourceHash = await proofSourceHash(projectPath);
    const summaries = (await readSummaries(resolve(projectPath, "artifacts/playtest")))
      .filter(({ summary }) => summary.scenario === item.scenario);
    const web = latestMatching(summaries, "web", sourceHash);
    const desktop = latestMatching(summaries, "desktop", sourceHash);
    diagnostics.push(...validateAdvancedPhysicsPlaytestPair(web?.summary, desktop?.summary, item.scenario, item.requiredAssertions, sourceHash, item.maxMovementDelta, item.expected));
    playtests[item.scenario] = { ...(web === undefined ? {} : { web: repoRelative(web.path) }), ...(desktop === undefined ? {} : { desktop: repoRelative(desktop.path) }) };
    evidencePairs.push({ desktop, sourceHash, web });
  }

  const manualReviewPath = resolve(artifactDir, "manual-review.json");
  const contactSheetPath = resolve(artifactDir, "manual-contact-sheet.png");
  const manualReview = await readManualReview(manualReviewPath);
  diagnostics.push(...await validateManualReview(manualReview, evidencePairs, contactSheetPath));
  const selectedSummaries = evidencePairs.flatMap(({ desktop, web }) => [web, desktop].filter((item): item is { path: string; summary: PlaytestSummary } => item !== undefined));
  const sourceHashes = [...new Set(evidencePairs.map((item) => item.sourceHash))].sort();
  const bundleHashes = [...new Set(selectedSummaries.map((item) => item.summary.proofMetadata?.bundleHash).filter((hash): hash is string => hash !== undefined))].sort();
  const hashedArtifacts = [
    resolve(artifactDir, "web-benchmark.json"),
    resolve(artifactDir, "desktop-benchmark.json"),
    contactSheetPath,
    manualReviewPath,
    ...selectedSummaries.map((item) => item.path),
  ];
  const completedAt = new Date().toISOString();
  const metadata = {
    adapters: await adapterVersions(),
    artifactHashes: await hashArtifacts(hashedArtifacts),
    bundleHash: aggregateHash(bundleHashes),
    command: "pnpm verify:focused verify:advanced-physics-major-games",
    completedAt,
    fixedDelta: 1 / 60,
    platform: `${platform()}-${arch()} ${release()}`,
    scenario: "advanced-physics-major-games",
    schemaVersion: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
    seed: 0,
    sourceHash: aggregateHash(sourceHashes),
    startedAt,
    toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION,
  };
  for (const message of advancedPhysicsEvidenceMetadataDiagnostics(metadata)) {
    push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_METADATA_INVALID", "metadata", message);
  }
  const status = diagnostics.length === 0 ? "PASS" : "FAIL";
  const report = {
    artifacts: {
      desktopBenchmark: repoRelative(resolve(artifactDir, "desktop-benchmark.json")),
      manualContactSheet: repoRelative(contactSheetPath),
      manualReview: repoRelative(manualReviewPath),
      playtests,
      webBenchmark: repoRelative(resolve(artifactDir, "web-benchmark.json")),
    },
    checkpoint: { automated: status, manual: manualReview?.status === "PASS" ? "PASS" : "FAIL" },
    diagnostics,
    environment: {
      cpu: cpus()[0]?.model ?? "unknown",
      cpuCount: cpus().length,
      browser: browserIdentity(),
      node: process.version,
      platform: `${platform()} ${release()}`,
      profile: "release",
      rapierJs: "0.19.3",
      rapierRust: "0.33.0",
    },
    generatedAt: completedAt,
    generatedBy: "tools/verify/src/advancedPhysicsGate.ts",
    metadata,
    phase: 8,
    scenario: "advanced-physics-major-games",
    schema: "threenative.advanced-physics-major-games-gate",
    status,
    version: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
  };
  await writeJson(resolve(artifactDir, "verification-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
  if (diagnostics.length > 0) process.exitCode = 1;
}

export async function writeBenchmarkBundle(): Promise<string> {
  const target = resolve(artifactDir, "benchmark.bundle");
  await cp(resolve(root, "examples/advanced-vehicle-course/dist/advanced-vehicle-course.bundle"), target, { recursive: true });
  await writeJson(resolve(target, "world.ir.json"), createAdvancedPhysicsBenchmarkWorld());
  await writeJson(resolve(target, "benchmark.debris"), createBenchmarkFractureManifest());
  const runtimeConfigPath = resolve(target, "runtime.config.json");
  const runtimeConfig = JSON.parse(await readFile(runtimeConfigPath, "utf8")) as Record<string, unknown> & { physics?: Record<string, unknown> };
  runtimeConfig.physics = { ...(runtimeConfig.physics ?? {}), gravity: [0, 0, 0] };
  await writeJson(runtimeConfigPath, runtimeConfig);
  return target;
}

export async function readSummaries(path: string): Promise<Array<{ path: string; summary: PlaytestSummary }>> {
  let entries;
  try { entries = await readdir(path, { withFileTypes: true }); }
  catch { return []; }
  const summaries = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory()) return readSummaries(resolve(path, entry.name));
    if (entry.name !== "summary.json") return [];
    const summaryPath = resolve(path, entry.name);
    try { return [{ path: summaryPath, summary: JSON.parse(await readFile(summaryPath, "utf8")) as PlaytestSummary }]; }
    catch { return []; }
  }));
  return summaries.flat();
}

async function readManualReview(path: string): Promise<AdvancedPhysicsManualReview | undefined> {
  try { return JSON.parse(await readFile(path, "utf8")) as AdvancedPhysicsManualReview; }
  catch { return undefined; }
}

async function validateManualReview(
  review: AdvancedPhysicsManualReview | undefined,
  evidencePairs: Array<{ desktop?: { path: string; summary: PlaytestSummary }; sourceHash: string; web?: { path: string; summary: PlaytestSummary } }>,
  contactSheetPath: string,
): Promise<AdvancedPhysicsGateDiagnostic[]> {
  const diagnostics: AdvancedPhysicsGateDiagnostic[] = [];
  const requiredChecks = ["vehicle-playability-and-finish", "flight-playability-and-landing", "destruction-playability-and-settling", "desktop-objective-and-retry", "visual-assets-and-feedback", "performance-and-artifact-review"];
  if (review?.status !== "PASS" || requiredChecks.some((id) => !review.checklist?.some((item) => item.id === id && item.passed === true))) {
    push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_MANUAL_REVIEW_MISSING", "manual-review.json/checklist", "The current manual playability, visual, performance, and artifact checklist is incomplete.");
    return diagnostics;
  }
  for (const pair of evidencePairs) {
    const scenario = pair.web?.summary.scenario ?? pair.desktop?.summary.scenario;
    const bundleHash = pair.web?.summary.proofMetadata?.bundleHash ?? pair.desktop?.summary.proofMetadata?.bundleHash;
    if (scenario !== undefined && (review.sourceHashes?.[scenario] !== pair.sourceHash || review.bundleHashes?.[scenario] !== bundleHash)) {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_MANUAL_REVIEW_STALE", `manual-review.json/${scenario}`, "Manual review is not bound to the current source and bundle.");
    }
  }
  const requiredArtifacts = [
    contactSheetPath,
    resolve(root, "examples/advanced-vehicle-course/artifacts/playtest/vehicle-course/web-current/after.png"),
    resolve(root, "examples/aerodynamics-flight-course/artifacts/playtest/flight-course/web-current/after.png"),
    resolve(root, "examples/destruction-range/artifacts/playtest/destruction-threshold/web-current/after.png"),
  ];
  for (const path of requiredArtifacts) {
    try {
      if (review.artifactHashes?.[repoRelative(path)] !== `sha256-${sha256(await readFile(path))}`) {
        push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_MANUAL_ARTIFACT_STALE", repoRelative(path), "Manual review artifact hash does not match the current visual evidence.");
      }
    } catch {
      push(diagnostics, "TN_VERIFY_ADVANCED_PHYSICS_MANUAL_ARTIFACT_MISSING", repoRelative(path), "Manual review visual evidence is missing.");
    }
  }
  return diagnostics;
}

function latestMatching(items: Array<{ path: string; summary: PlaytestSummary }>, target: string, sourceHash: string) {
  return items.filter((item) => item.summary.target === target && item.summary.pass === true && item.summary.proofMetadata?.sourceHash === sourceHash).sort((left, right) => right.path.localeCompare(left.path))[0];
}

async function proofSourceHash(projectPath: string): Promise<string> {
  const config = JSON.parse(await readFile(resolve(projectPath, "threenative.config.json"), "utf8")) as { entry?: string };
  const files = await listFiles(projectPath, ["content", "src/scripts", "playtests", "threenative.config.json", ...(config.entry === undefined ? [] : [config.entry])]);
  const rows = await Promise.all([...new Set(files)].sort().map(async (path) => ({ hash: sha256(await readFile(resolve(projectPath, path))), path })));
  const hash = createHash("sha256");
  for (const row of rows) {
    hash.update(row.path);
    hash.update(row.hash);
  }
  return hash.digest("hex");
}

async function listFiles(rootPath: string, inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    const absolute = resolve(rootPath, input);
    try {
      const entries = await readdir(absolute, { withFileTypes: true });
      for (const entry of entries) {
        const child = relative(rootPath, resolve(absolute, entry.name)).replaceAll("\\", "/");
        if (entry.isDirectory()) files.push(...await listFiles(rootPath, [child]));
        else files.push(child);
      }
    } catch {
      try { await readFile(absolute); files.push(relative(rootPath, absolute).replaceAll("\\", "/")); } catch {}
    }
  }
  return files;
}

function push(diagnostics: AdvancedPhysicsGateDiagnostic[], code: string, path: string, message: string): void {
  diagnostics.push({ code, message, path, severity: "error", suggestedFix: "Regenerate current paired web/desktop evidence from the owning structured source and rerun the exact benchmark." });
}
function sha256(value: Uint8Array): string { return createHash("sha256").update(value).digest("hex"); }
function aggregateHash(values: readonly string[]): string {
  return `sha256-${createHash("sha256").update(values.join("\n")).digest("hex")}`;
}
async function hashArtifacts(paths: readonly string[]): Promise<Record<string, string>> {
  const entries = await Promise.all(paths.map(async (path) => [repoRelative(path), `sha256-${sha256(await readFile(path))}`] as const));
  return Object.fromEntries(entries.sort(([left], [right]) => left.localeCompare(right)));
}
async function adapterVersions(): Promise<unknown[]> {
  const webPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/package.json"), "utf8")) as { name?: string; version?: string };
  const rapier = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/@dimforge/rapier3d-compat/package.json"), "utf8")) as { version?: string };
  const three = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/three/package.json"), "utf8")) as { version?: string };
  const cargo = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "utf8");
  const workspace = await readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8");
  return [
    { adapter: "web", dependencies: { "@dimforge/rapier3d-compat": rapier.version ?? "unknown", three: three.version ?? "unknown" }, runtime: webPackage.name ?? "unknown", runtimeVersion: webPackage.version ?? "unknown" },
    { adapter: "bevy", dependencies: { bevy: cargo.match(/^bevy\s*=\s*\{\s*version\s*=\s*"=?([^"]+)"/m)?.[1] ?? "unknown", rapier3d: cargo.match(/^rapier3d\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" }, runtime: "threenative_runtime", runtimeVersion: workspace.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" },
  ];
}
function browserIdentity(): string {
  const result = spawnSync(chromium.executablePath(), ["--version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "Chromium (version unavailable)";
}
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`; return JSON.stringify(value); }
function repoRelative(path: string): string { return relative(root, path).replaceAll("\\", "/"); }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
