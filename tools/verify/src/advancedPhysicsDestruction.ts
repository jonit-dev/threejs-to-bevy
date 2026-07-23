import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PHYSICS_DEBUG_LIMITS, PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION, validateBundle, type IPhysicsDebugCore, type IWorldIr } from "@threenative/ir";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const fixtureDir = resolve(root, "packages/ir/fixtures/conformance/advanced-physics-destruction/game.bundle");
const artifactDir = resolve(root, "tools/verify/artifacts/advanced-physics/phase-6-destruction");

export const ADVANCED_PHYSICS_DESTRUCTION_TRACE_SCHEMA = "threenative.advanced-physics-destruction-trace";
export const ADVANCED_PHYSICS_DESTRUCTION_TRACE_VERSION = "0.1.0";

type Runtime = "bevy" | "web";
type Tolerance = { absolute: number; relative: number };
type EventIdentity = { assembly?: string; bond?: string; lifecycle?: string; piece?: string; policy?: string; tick: number; type: string };
type Piece = { handle?: unknown; id: string; lifecycle: string; mass: number; position: number[]; velocity: number[] };
type Physical = { assemblyCollisionActive: boolean; pieces: Piece[] };

export interface AdvancedPhysicsDestructionExpected {
  assemblyMass: number;
  assemblyVelocity: [number, number, number];
  budget: { maximumActivePieces: number; policy: string; requireBudgetExceeded: boolean };
  fixture?: string;
  impact: { activatedPieces: string[]; bond: string; breakTick: number; eventTypes: string[]; subThresholdTick: number };
  massTolerance: Tolerance;
  momentumTolerance: Tolerance;
  regional: { brokenBonds: string[]; inactivePieces: string[] };
  schema: "threenative.advanced-physics-destruction-expected";
  toleranceRegistryVersion: string;
  traceSchema: typeof ADVANCED_PHYSICS_DESTRUCTION_TRACE_SCHEMA;
  traceVersion: typeof ADVANCED_PHYSICS_DESTRUCTION_TRACE_VERSION;
  version: "0.1.0";
}

export interface AdvancedPhysicsDestructionScenarios {
  assembly: string;
  budgetStress: { bonds: string[]; damageTick: number; sceneMaxActivePieces: number };
  fixedDt: number;
  impactReplay: Array<{ tick: number; bond: string }>;
  manifest: string;
  regionalDamage: Array<{ tick: number; bond: string }>;
  schema: "threenative.advanced-physics-destruction-scenarios";
  seed: number;
  version: "0.1.0";
}

export interface AdvancedPhysicsDestructionTrace {
  bundleHash: string;
  fixture: "advanced-physics-destruction";
  fixedDt: number;
  impact: { debug: IPhysicsDebugCore; physical: Physical; ticks: Array<{ events: EventIdentity[]; tick: number }> };
  regional: { brokenBonds: string[]; inactivePieces: string[]; physical: Physical };
  budget: { activePieces: number; eventTypes: string[]; policy: string };
  runtime: Runtime;
  schema: typeof ADVANCED_PHYSICS_DESTRUCTION_TRACE_SCHEMA;
  sourceHash: string;
  version: typeof ADVANCED_PHYSICS_DESTRUCTION_TRACE_VERSION;
}

export interface DestructionEvidenceDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error";
  suggestedFix: string;
}

export function validateAdvancedPhysicsDestructionFixture(
  world: IWorldIr,
  scenarios: AdvancedPhysicsDestructionScenarios,
  expected: AdvancedPhysicsDestructionExpected,
): DestructionEvidenceDiagnostic[] {
  const diagnostics: DestructionEvidenceDiagnostic[] = [];
  if (scenarios.schema !== "threenative.advanced-physics-destruction-scenarios" || scenarios.version !== "0.1.0") push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_SCENARIO_SCHEMA", "destruction.scenarios.json", "Destruction scenario identity is invalid.");
  if (!Number.isInteger(scenarios.seed) || scenarios.seed < 0 || !finitePositive(scenarios.fixedDt)) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_SCENARIO_BOUNDS", "destruction.scenarios.json", "Scenario seed and fixed delta must be bounded.");
  if (expected.schema !== "threenative.advanced-physics-destruction-expected" || expected.version !== "0.1.0" || expected.traceSchema !== ADVANCED_PHYSICS_DESTRUCTION_TRACE_SCHEMA || expected.traceVersion !== ADVANCED_PHYSICS_DESTRUCTION_TRACE_VERSION) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_EXPECTED_SCHEMA", "destruction.expected.json", "Expected trace identity is invalid.");
  if (expected.toleranceRegistryVersion !== PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_TOLERANCE_REGISTRY", "destruction.expected.json/toleranceRegistryVersion", "Expected tolerances do not identify the current physics tolerance registry.");
  if (!finitePositive(expected.assemblyMass) || expected.assemblyVelocity.length !== 3 || expected.assemblyVelocity.some((value) => !Number.isFinite(value)) || !validTolerance(expected.massTolerance) || !validTolerance(expected.momentumTolerance)) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_TOLERANCE", "destruction.expected.json", "Mass, velocity, momentum, and tolerance values must be finite and bounded.");
  const entity = world.entities.find((candidate) => candidate.id === scenarios.assembly);
  if (entity?.components.Destructible?.fractureManifest !== scenarios.manifest || entity.components.RigidBody?.mass !== expected.assemblyMass || stableJson(entity.components.RigidBody.velocity ?? [0, 0, 0]) !== stableJson(expected.assemblyVelocity)) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_ASSEMBLY", "world.ir.json", "Scenario assembly, fracture reference, authored mass, or authored velocity does not match expected evidence.");
  const impactTicks = scenarios.impactReplay.map((impact) => impact.tick);
  if (!impactTicks.includes(expected.impact.subThresholdTick) || !impactTicks.includes(expected.impact.breakTick) || scenarios.impactReplay.some((impact) => impact.bond !== expected.impact.bond)) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_IMPACT_REPLAY", "destruction.scenarios.json/impactReplay", "Impact replay must cross the expected bond threshold in stable tick order.");
  if (scenarios.budgetStress.sceneMaxActivePieces !== expected.budget.maximumActivePieces) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_BUDGET", "destruction.scenarios.json/budgetStress", "Scenario and expected active-piece budgets differ.");
  return diagnostics;
}

export function validateAdvancedPhysicsDestructionEvidence(
  web: AdvancedPhysicsDestructionTrace,
  native: AdvancedPhysicsDestructionTrace,
  expected: AdvancedPhysicsDestructionExpected,
): DestructionEvidenceDiagnostic[] {
  const diagnostics: DestructionEvidenceDiagnostic[] = [];
  validateTrace("web", web, expected, diagnostics);
  validateTrace("bevy", native, expected, diagnostics);
  if (web.sourceHash.length === 0 || web.bundleHash.length === 0 || web.sourceHash !== native.sourceHash || web.bundleHash !== native.bundleHash) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_PROVENANCE", "fixtureHashes", "Paired traces must identify the same non-empty source and bundle hashes.");
  compare(web.fixedDt, native.fixedDt, { absolute: 0.000001, relative: 0.000001 }, "fixedDt", "TN_VERIFY_PHYSICS_DESTRUCTION_FIXED_DELTA", diagnostics);
  exact(eventIdentities(web), eventIdentities(native), "impact/ticks/events", "TN_VERIFY_PHYSICS_DESTRUCTION_EVENT_PARITY", diagnostics);
  exact(web.regional.brokenBonds, native.regional.brokenBonds, "regional/brokenBonds", "TN_VERIFY_PHYSICS_DESTRUCTION_REGIONAL_PARITY", diagnostics);
  exact(web.regional.inactivePieces, native.regional.inactivePieces, "regional/inactivePieces", "TN_VERIFY_PHYSICS_DESTRUCTION_REGIONAL_PARITY", diagnostics);
  comparePhysical(web.impact.physical, native.impact.physical, expected, "impact/physical", diagnostics);
  compareDebug(web.impact.debug, native.impact.debug, diagnostics);
  comparePhysical(web.regional.physical, native.regional.physical, expected, "regional/physical", diagnostics);
  exact(web.budget, native.budget, "budget", "TN_VERIFY_PHYSICS_DESTRUCTION_BUDGET_PARITY", diagnostics);
  return diagnostics;
}

function compareDebug(web: IPhysicsDebugCore, native: IPhysicsDebugCore, diagnostics: DestructionEvidenceDiagnostic[]): void {
  const identity = (core: IPhysicsDebugCore) => core.primitives.map(({ category, id, kind }) => ({ category, id, kind }));
  exact(identity(web), identity(native), "impact/debug/primitives", "TN_VERIFY_PHYSICS_DESTRUCTION_DEBUG_PARITY", diagnostics);
  if (web.primitives.length > PHYSICS_DEBUG_LIMITS.artifactPrimitives || native.primitives.length > PHYSICS_DEBUG_LIMITS.artifactPrimitives || web.telemetry.timings.length > PHYSICS_DEBUG_LIMITS.timings || native.telemetry.timings.length > PHYSICS_DEBUG_LIMITS.timings) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_DEBUG_BUDGET", "impact/debug", "Debug primitives or timings exceed the shared artifact budget.");
  exact({ allocatedPieces: web.telemetry.allocatedPieces, contacts: web.telemetry.contacts, solverIterations: web.telemetry.solverIterations }, { allocatedPieces: native.telemetry.allocatedPieces, contacts: native.telemetry.contacts, solverIterations: native.telemetry.solverIterations }, "impact/debug/telemetry", "TN_VERIFY_PHYSICS_DESTRUCTION_DEBUG_TELEMETRY_PARITY", diagnostics);
}

function validateTrace(runtime: Runtime, trace: AdvancedPhysicsDestructionTrace, expected: AdvancedPhysicsDestructionExpected, diagnostics: DestructionEvidenceDiagnostic[]): void {
  if (trace.schema !== ADVANCED_PHYSICS_DESTRUCTION_TRACE_SCHEMA || trace.version !== ADVANCED_PHYSICS_DESTRUCTION_TRACE_VERSION || trace.fixture !== "advanced-physics-destruction" || trace.runtime !== runtime) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_TRACE_SCHEMA", `${runtime}/trace`, "Trace identity is invalid.");
  const subThreshold = trace.impact.ticks.find((sample) => sample.tick === expected.impact.subThresholdTick)?.events ?? [];
  if (subThreshold.some((event) => event.type === "bondBroken" || event.type === "pieceActivated")) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_SUB_THRESHOLD", `${runtime}/impact/ticks`, "Sub-threshold impact activated fracture state.");
  const breakEvents = trace.impact.ticks.find((sample) => sample.tick === expected.impact.breakTick)?.events ?? [];
  exact(breakEvents.map((event) => event.type), expected.impact.eventTypes, `${runtime}/impact/breakEvents`, "TN_VERIFY_PHYSICS_DESTRUCTION_EVENT_ORDER", diagnostics);
  exact(breakEvents.filter((event) => event.type === "pieceActivated").map((event) => event.piece), expected.impact.activatedPieces, `${runtime}/impact/activatedPieces`, "TN_VERIFY_PHYSICS_DESTRUCTION_PIECE_ORDER", diagnostics);
  exact(trace.regional.brokenBonds, expected.regional.brokenBonds, `${runtime}/regional/brokenBonds`, "TN_VERIFY_PHYSICS_DESTRUCTION_REGIONAL_BONDS", diagnostics);
  exact(trace.regional.inactivePieces, expected.regional.inactivePieces, `${runtime}/regional/inactivePieces`, "TN_VERIFY_PHYSICS_DESTRUCTION_REGIONAL_ISOLATION", diagnostics);
  if (trace.budget.activePieces > expected.budget.maximumActivePieces || trace.budget.policy !== expected.budget.policy || (expected.budget.requireBudgetExceeded && !trace.budget.eventTypes.includes("budgetExceeded"))) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_BUDGET", `${runtime}/budget`, "Budget trace is unbounded or omitted its declared overflow event.");
  validatePhysical(runtime, trace.impact.physical, expected, diagnostics);
}

function validatePhysical(runtime: Runtime, physical: Physical, expected: AdvancedPhysicsDestructionExpected, diagnostics: DestructionEvidenceDiagnostic[]): void {
  if (physical.assemblyCollisionActive || physical.pieces.length === 0 || physical.pieces.some((piece) => piece.handle === undefined || !finitePositive(piece.mass) || piece.position.some((value) => !Number.isFinite(value)) || piece.velocity.some((value) => !Number.isFinite(value)))) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_PHYSICAL_PIECES", `${runtime}/impact/physical`, "Activated fracture pieces must replace intact collision with finite retained bodies and stable handles.");
  compare(physical.pieces.reduce((sum, piece) => sum + piece.mass, 0), expected.assemblyMass, expected.massTolerance, `${runtime}/impact/physical/mass`, "TN_VERIFY_PHYSICS_DESTRUCTION_MASS", diagnostics);
  for (let axis = 0; axis < 3; axis += 1) {
    const observed = physical.pieces.reduce((sum, piece) => sum + piece.mass * piece.velocity[axis]!, 0);
    compare(observed, expected.assemblyMass * expected.assemblyVelocity[axis]!, expected.momentumTolerance, `${runtime}/impact/physical/momentum/${axis}`, "TN_VERIFY_PHYSICS_DESTRUCTION_MOMENTUM", diagnostics);
  }
}

function comparePhysical(left: Physical, right: Physical, expected: AdvancedPhysicsDestructionExpected, path: string, diagnostics: DestructionEvidenceDiagnostic[]): void {
  exact(left.pieces.map(({ id, lifecycle }) => ({ id, lifecycle })), right.pieces.map(({ id, lifecycle }) => ({ id, lifecycle })), `${path}/identity`, "TN_VERIFY_PHYSICS_DESTRUCTION_PIECE_PARITY", diagnostics);
  const rightById = new Map(right.pieces.map((piece) => [piece.id, piece]));
  for (const piece of left.pieces) {
    const other = rightById.get(piece.id);
    if (other === undefined) continue;
    compare(piece.mass, other.mass, expected.massTolerance, `${path}/${piece.id}/mass`, "TN_VERIFY_PHYSICS_DESTRUCTION_MASS_PARITY", diagnostics);
    for (let index = 0; index < 3; index += 1) compare(piece.velocity[index]!, other.velocity[index]!, expected.momentumTolerance, `${path}/${piece.id}/velocity/${index}`, "TN_VERIFY_PHYSICS_DESTRUCTION_MOMENTUM_PARITY", diagnostics);
  }
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(artifactDir, { recursive: true });
  const diagnostics: DestructionEvidenceDiagnostic[] = [];
  const world = JSON.parse(await readFile(resolve(fixtureDir, "world.ir.json"), "utf8")) as IWorldIr;
  const scenarios = JSON.parse(await readFile(resolve(fixtureDir, "destruction.scenarios.json"), "utf8")) as AdvancedPhysicsDestructionScenarios;
  const expected = JSON.parse(await readFile(resolve(fixtureDir, "destruction.expected.json"), "utf8")) as AdvancedPhysicsDestructionExpected;
  diagnostics.push(...validateAdvancedPhysicsDestructionFixture(world, scenarios, expected));
  const validation = await validateBundle(fixtureDir);
  if (!validation.ok) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_FIXTURE_INVALID", "game.bundle", JSON.stringify(validation.diagnostics));
  const sourceHash = sha256(await readFile(resolve(fixtureDir, scenarios.manifest)));
  const bundleHash = await hashDirectory(fixtureDir);
  let web: AdvancedPhysicsDestructionTrace | undefined;
  const runtime = await import("@threenative/runtime-web-three") as Record<string, unknown>;
  const traceWeb = runtime.traceAdvancedPhysicsDestruction;
  if (typeof traceWeb !== "function") push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_WEB_TRACE_UNAVAILABLE", "packages/runtime-web-three", "The web adapter has not exposed the Phase 6 destruction trace entry point.");
  else {
    web = await (traceWeb as (input: unknown) => Promise<AdvancedPhysicsDestructionTrace> | AdvancedPhysicsDestructionTrace)({ fixtureDir });
    await writeJson(resolve(artifactDir, "web-trace.json"), web);
  }
  const nativePath = resolve(artifactDir, "native-trace.json");
  const nativeRun = spawnSync("cargo", ["run", "-q", "-p", "threenative_runtime", "--bin", "threenative_physics_self_verification_trace", "--", fixtureDir, "advanced-physics-destruction", nativePath], { cwd: resolve(root, "runtime-bevy"), encoding: "utf8" });
  let native: AdvancedPhysicsDestructionTrace | undefined;
  if (nativeRun.status !== 0) push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_NATIVE_TRACE_FAILED", "runtime-bevy", nativeRun.stderr || nativeRun.stdout || "Native destruction trace failed.");
  else try { native = JSON.parse(await readFile(nativePath, "utf8")) as AdvancedPhysicsDestructionTrace; } catch { push(diagnostics, "TN_VERIFY_PHYSICS_DESTRUCTION_NATIVE_TRACE_MISSING", "native-trace.json", "Native destruction trace is missing or invalid."); }
  if (web !== undefined && native !== undefined) diagnostics.push(...validateAdvancedPhysicsDestructionEvidence(web, native, expected));
  const webPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/package.json"), "utf8")) as { dependencies?: Record<string, string>; version?: string };
  const nativeCargo = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "utf8");
  const workspaceCargo = await readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8");
  const artifactHashes: Record<string, string> = {};
  for (const path of [resolve(artifactDir, "web-trace.json"), nativePath]) try { artifactHashes[repoRelative(path)] = sha256(await readFile(path)); } catch {}
  const report = {
    artifacts: { nativeTrace: repoRelative(nativePath), webTrace: repoRelative(resolve(artifactDir, "web-trace.json")) }, artifactHashes,
    checkpoint: { automated: diagnostics.length === 0 ? "PASS" : "FAIL" }, diagnosticCount: diagnostics.length, diagnostics,
    generatedBy: "tools/verify/src/advancedPhysicsDestruction.ts",
    metadata: { bundleHash, command: "pnpm verify:focused verify:advanced-physics-destruction", completedAt: new Date().toISOString(), dependencyVersions: { rapierJs: webPackage.dependencies?.["@dimforge/rapier3d-compat"] ?? "unknown", rapierRust: nativeCargo.match(/rapier3d\s*=\s*"([^"]+)"/)?.[1] ?? "unknown" }, fixedDelta: scenarios.fixedDt, platform: `${process.platform}-${process.arch}`, runtimeAdapters: ["web-three", "bevy"], runtimeVersions: { bevy: workspaceCargo.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "unknown", web: webPackage.version ?? "unknown" }, scenario: "advanced-physics-destruction", schemaVersion: ADVANCED_PHYSICS_DESTRUCTION_TRACE_VERSION, seed: scenarios.seed, sourceHash, startedAt, toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION },
    phase: 6, scenario: "advanced-physics-destruction", schema: "threenative.advanced-physics.phase-evidence", status: diagnostics.length === 0 ? "PASS" : "FAIL", version: "0.1.0",
  };
  await writeJson(resolve(artifactDir, "verification-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
  if (diagnostics.length > 0) process.exitCode = 1;
}

function eventIdentities(trace: AdvancedPhysicsDestructionTrace): EventIdentity[] { return trace.impact.ticks.flatMap((sample) => sample.events).map(({ assembly, bond, lifecycle, piece, policy, tick, type }) => ({ assembly, bond, lifecycle, piece, policy, tick, type })); }
function compare(left: number, right: number, tolerance: Tolerance, path: string, code: string, diagnostics: DestructionEvidenceDiagnostic[]): void { if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > Math.max(tolerance.absolute, Math.max(Math.abs(left), Math.abs(right)) * tolerance.relative)) push(diagnostics, code, path, `Numeric values ${left} and ${right} exceed the owned tolerance.`); }
function exact(left: unknown, right: unknown, path: string, code: string, diagnostics: DestructionEvidenceDiagnostic[]): void { if (stableJson(left) !== stableJson(right)) push(diagnostics, code, path, `Expected ${JSON.stringify(right)}, received ${JSON.stringify(left)}.`); }
function validTolerance(value: Tolerance): boolean { return Number.isFinite(value.absolute) && value.absolute >= 0 && Number.isFinite(value.relative) && value.relative >= 0; }
function finitePositive(value: number): boolean { return Number.isFinite(value) && value > 0; }
function stableJson(value: unknown): string { if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`; if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`; return JSON.stringify(value); }
function push(diagnostics: DestructionEvidenceDiagnostic[], code: string, path: string, message: string): void { diagnostics.push({ code, message, path, severity: "error", suggestedFix: "Regenerate both normalized destruction traces from the canonical fixture and fix the owning runtime boundary." }); }
function repoRelative(path: string): string { return relative(root, path).replaceAll("\\", "/"); }
function sha256(value: Uint8Array): string { return `sha256-${createHash("sha256").update(value).digest("hex")}`; }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function hashDirectory(path: string): Promise<string> { const hash = createHash("sha256"); for (const file of await listFiles(path)) { hash.update(relative(path, file)); hash.update(await readFile(file)); } return `sha256-${hash.digest("hex")}`; }
async function listFiles(path: string): Promise<string[]> { const files: string[] = []; for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) files.push(...await listFiles(child)); else files.push(child); } return files.sort(); }

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
