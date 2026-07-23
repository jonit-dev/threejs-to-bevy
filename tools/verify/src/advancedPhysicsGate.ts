import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpus, platform, release } from "node:os";
import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";
import { createAdvancedPhysicsBenchmarkWorld, createBenchmarkFractureManifest, type IAdvancedPhysicsBenchmarkResult } from "@threenative/runtime-web-three";

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
  proofMetadata?: { bundleHash?: string; sourceHash?: string };
  runtime?: string;
  scenario?: string;
  target?: string;
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
  for (const item of cases) {
    const projectPath = resolve(root, item.project);
    const sourceHash = await proofSourceHash(projectPath);
    const summaries = await readSummaries(resolve(projectPath, "artifacts/playtest", item.scenario));
    const web = latestMatching(summaries, "web", sourceHash);
    const desktop = latestMatching(summaries, "desktop", sourceHash);
    diagnostics.push(...validateAdvancedPhysicsPlaytestPair(web?.summary, desktop?.summary, item.scenario, item.requiredAssertions, sourceHash, item.maxMovementDelta, item.expected));
    playtests[item.scenario] = { ...(web === undefined ? {} : { web: repoRelative(web.path) }), ...(desktop === undefined ? {} : { desktop: repoRelative(desktop.path) }) };
  }

  const report = {
    artifacts: {
      desktopBenchmark: repoRelative(resolve(artifactDir, "desktop-benchmark.json")),
      playtests,
      webBenchmark: repoRelative(resolve(artifactDir, "web-benchmark.json")),
    },
    checkpoint: { automated: diagnostics.length === 0 ? "PASS" : "FAIL" },
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
    generatedAt: new Date().toISOString(),
    phase: 8,
    schema: "threenative.advanced-physics-major-games-gate",
    status: diagnostics.length === 0 ? "PASS" : "FAIL",
    version: "0.1.0",
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

async function readSummaries(path: string): Promise<Array<{ path: string; summary: PlaytestSummary }>> {
  const entries = await readdir(path, { withFileTypes: true });
  const summaries = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const summaryPath = resolve(path, entry.name, "summary.json");
    try { return { path: summaryPath, summary: JSON.parse(await readFile(summaryPath, "utf8")) as PlaytestSummary }; }
    catch { return undefined; }
  }));
  return summaries.filter((item): item is NonNullable<typeof item> => item !== undefined);
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
function browserIdentity(): string {
  const result = spawnSync(chromium.executablePath(), ["--version"], { encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "Chromium (version unavailable)";
}
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`; return JSON.stringify(value); }
function repoRelative(path: string): string { return relative(root, path).replaceAll("\\", "/"); }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
