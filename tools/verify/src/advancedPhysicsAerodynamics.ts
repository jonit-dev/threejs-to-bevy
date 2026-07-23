import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { IAerodynamicObservation, IWorldIr, Vec3 } from "@threenative/ir";
import { PHYSICS_OBSERVATION_TOLERANCES, PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION } from "@threenative/ir";
import { disposePhysicsAerodynamics, disposePhysicsRuntime, initializePhysicsRuntime, preparePhysicsRuntime, setPhysicsAerodynamicInputs, stepPhysics, stepPhysicsAerodynamics } from "@threenative/runtime-web-three";
import { advancedPhysicsEvidenceMetadataDiagnostics } from "./advancedPhysicsEvidence.js";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
const fixtureDir = resolve(root, "packages/ir/fixtures/conformance/advanced-physics-aerodynamics/game.bundle");
const artifactDir = resolve(root, "tools/verify/artifacts/advanced-physics/phase-4-aerodynamics");
const playtestDir = resolve(root, "examples/advanced-physics-aerodynamics/artifacts/playtest/advanced-physics-aerodynamics-flight-course");
export const AERODYNAMICS_TRACE_SCHEMA = "threenative.advanced-physics-aerodynamics-trace";
export const AERODYNAMICS_TRACE_VERSION = "0.1.0";

interface TraceInput { inputs?: { surfaces?: Record<string, number>; thrusters?: Record<string, number> }; position: Vec3; velocity: Vec3 }
interface ScenarioSample extends TraceInput { label: string }
export interface ManeuverBounds { groundedAltitude: [number, number]; minimumAirborneAltitudeAfterGroundContact: number; recoveryTick: [number, number]; stallTick: [number, number]; windTick: [number, number] }
interface ManeuverSegment { inputs: NonNullable<TraceInput["inputs"]>; label: string; steps: number }
export interface ManeuverParity { eventTickMaxDelta: number; finalPositionMaxDelta: number }
interface ManeuverManifest { bounds: ManeuverBounds; checkpoints: number[]; parity: ManeuverParity; segments: ManeuverSegment[] }
interface ScenarioManifest { entity: string; fixedDt: number; maneuver: ManeuverManifest; samples: ScenarioSample[]; schema: string; version: string }
interface TraceSample { input: TraceInput; label: string; observation: IAerodynamicObservation; tick: number }
interface ManeuverCheckpoint { position: Vec3; stalled: boolean; tick: number; velocity: Vec3; windVelocity: Vec3 }
interface ManeuverTrace { checkpoints: ManeuverCheckpoint[]; finalPosition: Vec3; finalVelocity: Vec3; groundContactTick?: number; landingTick?: number; maximumAirborneAltitude: number; recoveryTick?: number; stallTick?: number; takeoffTick?: number; windEntryTick?: number; windExitTick?: number }
interface PlaytestSummary { finalPoses?: Array<{ entity?: string; position?: Vec3 }>; pass?: boolean; proofMetadata?: { bundleHash?: string; sourceHash?: string }; runtime?: string; scenario?: string; target?: string }
export interface AerodynamicsTrace { bundleHash: string; fixedDt: number; fixture: string; maneuver: ManeuverTrace; maneuverBounds: ManeuverBounds; maneuverParity: ManeuverParity; observations: TraceSample[]; runtime: "bevy" | "web"; schema: string; sourceHash: string; version: string }
export interface AerodynamicsDiagnostic { code: string; message: string; path: string; severity: "error"; suggestedFix: string }

export function validateAdvancedPhysicsAerodynamicsEvidence(web: AerodynamicsTrace, native: AerodynamicsTrace): AerodynamicsDiagnostic[] {
  const diagnostics: AerodynamicsDiagnostic[] = [];
  validateTrace(web, diagnostics);
  validateTrace(native, diagnostics);
  if (JSON.stringify(web.maneuverBounds) !== JSON.stringify(native.maneuverBounds)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_BOUNDS_DRIFT", "paired/maneuverBounds", "Web and native traces do not carry the same manifest-owned maneuver bounds.");
  if (JSON.stringify(web.maneuverParity) !== JSON.stringify(native.maneuverParity)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_PARITY_DRIFT", "paired/maneuverParity", "Web and native traces do not carry the same manifest-owned maneuver parity limits.");
  if (web.observations.length !== native.observations.length) push(diagnostics, "TN_VERIFY_AERODYNAMICS_SAMPLE_COUNT", "paired/observations", "Web and native trace sample counts differ.");
  for (let index = 0; index < Math.min(web.observations.length, native.observations.length); index += 1) compareValue(web.observations[index], native.observations[index], `paired/observations/${index}`, diagnostics);
  const eventTickTolerance = web.maneuverParity.eventTickMaxDelta;
  if (Math.abs((web.maneuver.stallTick ?? -1000) - (native.maneuver.stallTick ?? 1000)) > eventTickTolerance || Math.abs((web.maneuver.recoveryTick ?? -1000) - (native.maneuver.recoveryTick ?? 1000)) > eventTickTolerance) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_EVENT_PARITY", "paired/maneuver", `Web/native stall or recovery events differ by more than the manifest-owned ${eventTickTolerance}-tick window.`);
  const finalPositionTolerance = web.maneuverParity.finalPositionMaxDelta;
  if (distance(web.maneuver.finalPosition, native.maneuver.finalPosition) > finalPositionTolerance) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_OUTCOME_PARITY", "paired/maneuver/finalPosition", `Web/native integrated landing positions differ by more than the manifest-derived ${finalPositionTolerance}-meter bound.`);
  return diagnostics;
}

function validateTrace(trace: AerodynamicsTrace, diagnostics: AerodynamicsDiagnostic[]): void {
  const prefix = trace.runtime;
  if (trace.schema !== AERODYNAMICS_TRACE_SCHEMA || trace.version !== AERODYNAMICS_TRACE_VERSION || trace.fixture !== "advanced-physics-aerodynamics") push(diagnostics, "TN_VERIFY_AERODYNAMICS_SCHEMA", prefix, "Trace identity is invalid.");
  const samples = new Map(trace.observations.map((sample) => [sample.label, sample]));
  const required = ["zero-air-outside-wind", "quadratic-drag-slow", "quadratic-drag-fast", "elevator-positive", "elevator-negative", "stall-entry", "stall-recovery", "wind-outside-boundary"];
  for (const label of required) if (!samples.has(label)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_SAMPLE_MISSING", `${prefix}/${label}`, "The canonical recorded sample is missing.");
  if (required.some((label) => !samples.has(label))) return;
  const zero = samples.get(required[0]!)!;
  const zeroForces = zero.observation.surfaces.flatMap((surface) => [...surface.lift, ...surface.drag]);
  if (zeroForces.some((value) => value !== 0 || !Number.isFinite(value)) || length(zero.observation.relativeAirVelocity) !== 0) push(diagnostics, "TN_VERIFY_AERODYNAMICS_ZERO_AIR", `${prefix}/zero-air-outside-wind`, "Zero relative airspeed must produce finite zero lift and drag.");
  const slow = dragMagnitude(samples.get("quadratic-drag-slow")!.observation);
  const fast = dragMagnitude(samples.get("quadratic-drag-fast")!.observation);
  if (!near(fast / slow, 4, { absolute: 0.001, relative: 0.001 })) push(diagnostics, "TN_VERIFY_AERODYNAMICS_QUADRATIC_DRAG", `${prefix}/quadratic-drag`, "Doubling airspeed must produce four-times aerodynamic surface drag.");
  const positive = samples.get("elevator-positive")!;
  const negative = samples.get("elevator-negative")!;
  if (!(elevatorTorqueX(positive) * elevatorTorqueX(negative) < 0)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_CONTROL_TORQUE", `${prefix}/elevator`, "Reversing elevator input must reverse pitch torque.");
  const stalled = samples.get("stall-entry")!.observation.surfaces.some((surface) => surface.stalled);
  const recovered = samples.get("stall-recovery")!.observation.surfaces.every((surface) => !surface.stalled);
  if (!stalled || !recovered) push(diagnostics, "TN_VERIFY_AERODYNAMICS_STALL_ORDER", `${prefix}/stall`, "The recorded maneuver must enter stall before recovering.");
  const gust = samples.get("stall-entry")!.observation;
  const outside = samples.get("wind-outside-boundary")!.observation;
  if (length(gust.windVelocity) === 0 || gust.airDensity !== 1.1 || length(outside.windVelocity) !== 0 || outside.airDensity !== 1.225) push(diagnostics, "TN_VERIFY_AERODYNAMICS_WIND_BOUNDARY", `${prefix}/wind`, "Wind and density overrides must apply only inside the authored volume.");
  const thruster = gust.thrusters.find((item) => item.id === "main-engine");
  if (thruster === undefined || length(thruster.force) === 0 || thruster.fuelHook !== "fuel.avgas" || thruster.throttle !== 1) push(diagnostics, "TN_VERIFY_AERODYNAMICS_THRUST", `${prefix}/main-engine`, "Recorded throttle must produce bounded thrust and preserve the fuel hook.");
  if (trace.observations.some((sample) => sample.observation.diagnostics.length > 0)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_RUNTIME_DIAGNOSTIC", `${prefix}/diagnostics`, "Canonical bounded inputs emitted runtime aerodynamic diagnostics.");
  validateManeuver(trace.maneuver, trace.maneuverBounds, prefix, diagnostics);
}

function validateManeuver(maneuver: ManeuverTrace, bounds: ManeuverBounds, prefix: string, diagnostics: AerodynamicsDiagnostic[]): void {
  const requiredTicks = [maneuver.groundContactTick, maneuver.takeoffTick, maneuver.stallTick, maneuver.recoveryTick, maneuver.windEntryTick, maneuver.windExitTick, maneuver.landingTick];
  if (requiredTicks.some((tick) => tick === undefined)) { push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_EVENT_MISSING", `${prefix}/maneuver`, "Integrated maneuver must record ground contact, takeoff, stall, recovery, wind entry/exit, and landing."); return; }
  if (!(maneuver.groundContactTick! < maneuver.takeoffTick! && maneuver.takeoffTick! < maneuver.stallTick! && maneuver.stallTick! < maneuver.recoveryTick! && maneuver.recoveryTick! < maneuver.landingTick!)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_ORDER", `${prefix}/maneuver`, "Integrated maneuver events are not in takeoff/stall/recovery/landing order.");
  if (maneuver.stallTick! < bounds.stallTick[0] || maneuver.stallTick! > bounds.stallTick[1] || maneuver.recoveryTick! < bounds.recoveryTick[0] || maneuver.recoveryTick! > bounds.recoveryTick[1]) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_WINDOW", `${prefix}/maneuver`, "Stall or recovery occurred outside the manifest-owned fixed-tick window.");
  if (maneuver.windEntryTick! < bounds.windTick[0] || maneuver.windExitTick! > bounds.windTick[1] || maneuver.windEntryTick! >= maneuver.windExitTick!) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_WIND", `${prefix}/maneuver`, "Integrated maneuver did not cross the wind volume inside its manifest-owned tick window.");
  if (maneuver.maximumAirborneAltitude < bounds.minimumAirborneAltitudeAfterGroundContact || maneuver.finalPosition[1] < bounds.groundedAltitude[0] || maneuver.finalPosition[1] > bounds.groundedAltitude[1] || Math.abs(maneuver.finalVelocity[1]) > 0.2) push(diagnostics, "TN_VERIFY_AERODYNAMICS_MANEUVER_LANDING", `${prefix}/maneuver`, "Integrated maneuver did not become airborne and finish settled on the runway.");
}

function compareValue(left: unknown, right: unknown, path: string, diagnostics: AerodynamicsDiagnostic[]): void {
  if (typeof left === "number" && typeof right === "number") {
    const tolerance = path.includes("lift") || path.includes("drag") || path.includes("force") ? PHYSICS_OBSERVATION_TOLERANCES.aerodynamicForce : path.includes("angle") || path.includes("sideslip") || path.includes("Deflection") ? PHYSICS_OBSERVATION_TOLERANCES.aerodynamicAngle : PHYSICS_OBSERVATION_TOLERANCES.aerodynamicVelocity;
    if (!near(left, right, tolerance)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_PARITY", path, `Web/native numeric values differ (${left} versus ${right}).`);
    return;
  }
  if (Array.isArray(left) && Array.isArray(right)) { if (left.length !== right.length) push(diagnostics, "TN_VERIFY_AERODYNAMICS_PARITY", path, "Web/native array lengths differ."); for (let index = 0; index < Math.min(left.length, right.length); index += 1) compareValue(left[index], right[index], `${path}/${index}`, diagnostics); return; }
  if (isRecord(left) && isRecord(right)) { const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort(); for (const key of keys) compareValue(left[key], right[key], `${path}/${key}`, diagnostics); return; }
  if (left !== right) push(diagnostics, "TN_VERIFY_AERODYNAMICS_PARITY", path, `Web/native values differ (${String(left)} versus ${String(right)}).`);
}

function elevatorTorqueX(sample: TraceSample): number { const surface = sample.observation.surfaces.find((item) => item.id === "elevator")!; const arm: Vec3 = [surface.forcePoint[0] - sample.input.position[0], surface.forcePoint[1] - sample.input.position[1], surface.forcePoint[2] - sample.input.position[2]]; return arm[1] * surface.lift[2] - arm[2] * surface.lift[1]; }
function dragMagnitude(observation: IAerodynamicObservation): number { return observation.surfaces.reduce((sum, surface) => sum + length(surface.drag), 0); }
function length(value: readonly number[]): number { return Math.hypot(...value); }
function distance(left: Vec3, right: Vec3): number { return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]); }
function near(left: number, right: number, tolerance: { absolute: number; relative: number }): boolean { return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= Math.max(tolerance.absolute, Math.max(Math.abs(left), Math.abs(right)) * tolerance.relative); }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function push(output: AerodynamicsDiagnostic[], code: string, path: string, message: string): void { output.push({ code, message, path, severity: "error", suggestedFix: "Regenerate the catalog-owned aerodynamic traces and fix the owning contract or runtime adapter." }); }

async function generateWebTrace(sourceHash: string, bundleHash: string): Promise<AerodynamicsTrace> {
  const world = JSON.parse(await readFile(resolve(fixtureDir, "world.ir.json"), "utf8")) as IWorldIr;
  const manifest = JSON.parse(await readFile(resolve(fixtureDir, "aerodynamics.scenarios.json"), "utf8")) as ScenarioManifest;
  const entity = world.entities.find((candidate) => candidate.id === manifest.entity);
  if (entity?.components.Transform === undefined || entity.components.RigidBody === undefined || entity.components.AerodynamicBody === undefined) throw new Error("Canonical aerodynamic craft is incomplete.");
  const observations: TraceSample[] = [];
  for (const [tick, sample] of manifest.samples.entries()) {
    entity.components.Transform.position = structuredClone(sample.position);
    entity.components.RigidBody.velocity = structuredClone(sample.velocity);
    if (!setPhysicsAerodynamicInputs(world, manifest.entity, sample.inputs ?? {})) throw new Error(`Aerodynamic input rejected at '${sample.label}'.`);
    const observation = stepPhysicsAerodynamics(world, manifest.fixedDt, tick).find((entry) => entry.entity === manifest.entity);
    if (observation === undefined) throw new Error(`Aerodynamic observation missing at '${sample.label}'.`);
    observations.push({ input: { inputs: { surfaces: sample.inputs?.surfaces ?? {}, thrusters: sample.inputs?.thrusters ?? {} }, position: sample.position, velocity: sample.velocity }, label: sample.label, observation, tick });
  }
  disposePhysicsAerodynamics(world);
  const maneuverWorld = JSON.parse(await readFile(resolve(fixtureDir, "world.ir.json"), "utf8")) as IWorldIr;
  const maneuver = await generateWebManeuver(maneuverWorld, manifest);
  return { bundleHash, fixedDt: manifest.fixedDt, fixture: "advanced-physics-aerodynamics", maneuver, maneuverBounds: manifest.maneuver.bounds, maneuverParity: manifest.maneuver.parity, observations, runtime: "web", schema: AERODYNAMICS_TRACE_SCHEMA, sourceHash, version: AERODYNAMICS_TRACE_VERSION };
}

async function generateWebManeuver(world: IWorldIr, manifest: ScenarioManifest): Promise<ManeuverTrace> {
  await initializePhysicsRuntime();
  preparePhysicsRuntime(world);
  const entity = world.entities.find((candidate) => candidate.id === manifest.entity)!;
  const checkpoints: ManeuverCheckpoint[] = [];
  const trace: ManeuverTrace = { checkpoints, finalPosition: [0, 0, 0], finalVelocity: [0, 0, 0], maximumAirborneAltitude: -Infinity };
  let tick = 0;
  let previouslyStalled = false;
  let insideWind = false;
  for (const segment of manifest.maneuver.segments) for (let step = 0; step < segment.steps; step += 1, tick += 1) {
    if (!setPhysicsAerodynamicInputs(world, manifest.entity, segment.inputs)) throw new Error(`Integrated aerodynamic inputs rejected in '${segment.label}'.`);
    const observation = stepPhysicsAerodynamics(world, manifest.fixedDt, tick)[0]!;
    stepPhysics(world, manifest.fixedDt, undefined, { tick });
    const position = structuredClone(entity.components.Transform?.position ?? [0, 0, 0]) as Vec3;
    const velocity = structuredClone(entity.components.RigidBody?.velocity ?? [0, 0, 0]) as Vec3;
    const stalled = observation.surfaces.some((surface) => surface.stalled);
    const wind = length(observation.windVelocity) > 0;
    const groundContact = position[1] >= manifest.maneuver.bounds.groundedAltitude[0] && position[1] <= manifest.maneuver.bounds.groundedAltitude[1];
    const settled = groundContact && Math.abs(velocity[1]) <= 0.2;
    if (trace.groundContactTick === undefined && groundContact) trace.groundContactTick = tick;
    if (trace.groundContactTick !== undefined) trace.maximumAirborneAltitude = Math.max(trace.maximumAirborneAltitude, position[1]);
    if (trace.takeoffTick === undefined && trace.groundContactTick !== undefined && position[1] >= manifest.maneuver.bounds.minimumAirborneAltitudeAfterGroundContact && velocity[1] > 0) trace.takeoffTick = tick;
    if (!previouslyStalled && stalled && trace.stallTick === undefined) trace.stallTick = tick;
    if (previouslyStalled && !stalled && trace.recoveryTick === undefined) trace.recoveryTick = tick;
    if (!insideWind && wind && trace.windEntryTick === undefined) trace.windEntryTick = tick;
    if (insideWind && !wind && trace.windExitTick === undefined) trace.windExitTick = tick;
    if (tick >= 200 && settled && trace.landingTick === undefined) trace.landingTick = tick;
    if (manifest.maneuver.checkpoints.includes(tick)) checkpoints.push({ position, stalled, tick, velocity, windVelocity: observation.windVelocity });
    previouslyStalled = stalled;
    insideWind = wind;
    trace.finalPosition = position;
    trace.finalVelocity = velocity;
  }
  disposePhysicsAerodynamics(world);
  disposePhysicsRuntime(world);
  return trace;
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(artifactDir, { recursive: true });
  const sourceHash = sha256(await readFile(resolve(fixtureDir, "world.ir.json")));
  const bundleHash = await hashDirectory(fixtureDir);
  const web = await generateWebTrace(sourceHash, bundleHash);
  await writeFile(resolve(artifactDir, "web-trace.json"), `${JSON.stringify(web, null, 2)}\n`);
  const nativeRun = spawnSync("cargo", ["run", "-q", "-p", "threenative_runtime", "--bin", "threenative_physics_self_verification_trace", "--", fixtureDir, "advanced-physics-aerodynamics", resolve(artifactDir, "native-trace.json"), sourceHash, bundleHash], { cwd: resolve(root, "runtime-bevy"), encoding: "utf8" });
  const diagnostics: AerodynamicsDiagnostic[] = [];
  if (nativeRun.status !== 0) push(diagnostics, "TN_VERIFY_AERODYNAMICS_NATIVE_TRACE_FAILED", "native-trace.json", nativeRun.stderr || nativeRun.stdout || "Native trace command failed.");
  let native: AerodynamicsTrace | undefined;
  try { native = JSON.parse(await readFile(resolve(artifactDir, "native-trace.json"), "utf8")) as AerodynamicsTrace; } catch { push(diagnostics, "TN_VERIFY_AERODYNAMICS_NATIVE_TRACE_MISSING", "native-trace.json", "Native trace is missing or invalid."); }
  if (native !== undefined) diagnostics.push(...validateAdvancedPhysicsAerodynamicsEvidence(web, native));
  if (native !== undefined && (native.sourceHash !== sourceHash || native.bundleHash !== bundleHash)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_FIXTURE_HASH", "fixtureHashes", "Native trace hashes do not match the canonical fixture.");
  const playtestFiles = ["web/summary.json", "web/manifest.json", "desktop/summary.json", "desktop/manifest.json"];
  try {
    const webPlaytest = JSON.parse(await readFile(resolve(playtestDir, "web/summary.json"), "utf8")) as PlaytestSummary;
    const nativePlaytest = JSON.parse(await readFile(resolve(playtestDir, "desktop/summary.json"), "utf8")) as PlaytestSummary;
    const playtestScenario = JSON.parse(await readFile(resolve(root, "examples/advanced-physics-aerodynamics/playtests/flight-course.playtest.json"), "utf8")) as { parity?: { compare?: { movementDistance?: { maxDelta?: number } } } };
    const targetMaxDelta = playtestScenario.parity?.compare?.movementDistance?.maxDelta;
    if (typeof targetMaxDelta !== "number" || !Number.isFinite(targetMaxDelta) || targetMaxDelta < 0) push(diagnostics, "TN_VERIFY_AERODYNAMICS_TARGET_PARITY_BOUND_INVALID", "playtest/parity", "The flight-course scenario must own a finite non-negative movementDistance.maxDelta.");
    else validateTargetPlaytests(webPlaytest, nativePlaytest, manifestBounds(web), targetMaxDelta, diagnostics);
  } catch {
    push(diagnostics, "TN_VERIFY_AERODYNAMICS_TARGET_PLAYTEST_MISSING", "playtest", "Current web and desktop flight-course playtest summaries are required.");
  }
  const manualDiagnostics: AerodynamicsDiagnostic[] = [];
  let manualStatus = "MISSING";
  try {
    const manual = JSON.parse(await readFile(resolve(artifactDir, "manual-web-debug.json"), "utf8")) as { bundleHash?: string; checklist?: Array<{ id?: string; passed?: boolean }>; screenshotHash?: string; sourceHash?: string; status?: string };
    const screenshotHash = sha256(await readFile(resolve(artifactDir, "manual-web-debug.png")));
    manualStatus = manual.status ?? "MISSING";
    const required = ["takeoff", "gust-response", "stall-entry", "stall-recovery", "controlled-landing", "force-vectors-explain-motion", "fresh-retry", "zero-runtime-errors"];
    if (manual.status !== "PASS" || manual.sourceHash !== sourceHash || manual.bundleHash !== bundleHash || manual.screenshotHash !== screenshotHash || required.some((id) => !manual.checklist?.some((item) => item.id === id && item.passed === true))) push(manualDiagnostics, "TN_VERIFY_AERODYNAMICS_MANUAL_EVIDENCE", "manual", "Hash-bound flight checklist or force-vector screenshot is stale or incomplete.");
  } catch { push(manualDiagnostics, "TN_VERIFY_AERODYNAMICS_MANUAL_EVIDENCE_MISSING", "manual", "Manual flight checklist and force-vector screenshot are required."); }
  const artifactHashes: Record<string, string> = {};
  for (const name of ["web-trace.json", "native-trace.json", "manual-web-debug.json", "manual-web-debug.png"]) try { artifactHashes[`tools/verify/artifacts/advanced-physics/phase-4-aerodynamics/${name}`] = sha256(await readFile(resolve(artifactDir, name))); } catch {}
  for (const name of playtestFiles) try { artifactHashes[`examples/advanced-physics-aerodynamics/artifacts/playtest/advanced-physics-aerodynamics-flight-course/${name}`] = sha256(await readFile(resolve(playtestDir, name))); } catch {}
  const metadata = { adapters: await adapterVersions(), artifactHashes, bundleHash, command: "pnpm verify:focused verify:advanced-physics-aerodynamics", completedAt: new Date().toISOString(), fixedDelta: web.fixedDt, platform: `${platform()}-${arch()} ${release()}`, scenario: "advanced-physics-aerodynamics", schemaVersion: AERODYNAMICS_TRACE_VERSION, seed: 7, sourceHash, startedAt, toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION };
  for (const message of advancedPhysicsEvidenceMetadataDiagnostics(metadata)) push(diagnostics, "TN_VERIFY_AERODYNAMICS_METADATA_INVALID", "metadata", message);
  const allDiagnostics = [...diagnostics, ...manualDiagnostics];
  const report = { schema: "threenative.advanced-physics.phase-evidence", version: "0.1.0", phase: 4, scenario: "advanced-physics-aerodynamics", status: allDiagnostics.length === 0 ? "PASS" : "FAIL", checkpoint: { automated: diagnostics.length === 0 ? "PASS" : "FAIL", manual: manualDiagnostics.length === 0 ? manualStatus : "MISSING" }, diagnosticCount: allDiagnostics.length, diagnostics: allDiagnostics, metadata };
  await writeFile(resolve(artifactDir, "verification-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (allDiagnostics.length > 0) process.exitCode = 1;
}

function validateTargetPlaytests(web: PlaytestSummary, native: PlaytestSummary, bounds: ManeuverBounds, maxDelta: number, diagnostics: AerodynamicsDiagnostic[]): void {
  const expected = [
    { runtime: "web", summary: web, target: "web" },
    { runtime: "bevy", summary: native, target: "desktop" },
  ];
  for (const item of expected) {
    if (item.summary.pass !== true || item.summary.target !== item.target || item.summary.runtime !== item.runtime || item.summary.scenario !== "advanced-physics-aerodynamics-flight-course") push(diagnostics, "TN_VERIFY_AERODYNAMICS_TARGET_PLAYTEST_INVALID", `playtest/${item.target}`, `The ${item.target} flight-course playtest is stale, failed, or identifies the wrong runtime.`);
    const pose = item.summary.finalPoses?.find((candidate) => candidate.entity === "craft")?.position;
    if (pose === undefined || pose.some((value) => !Number.isFinite(value)) || pose[1] < bounds.groundedAltitude[0] || pose[1] > bounds.groundedAltitude[1]) push(diagnostics, "TN_VERIFY_AERODYNAMICS_TARGET_LANDING_INVALID", `playtest/${item.target}/finalPoses`, `The ${item.target} flight-course must finish with the craft inside the manifest-owned runway altitude bound.`);
  }
  if (web.proofMetadata?.sourceHash === undefined || web.proofMetadata.sourceHash !== native.proofMetadata?.sourceHash || web.proofMetadata.bundleHash === undefined || web.proofMetadata.bundleHash !== native.proofMetadata?.bundleHash) push(diagnostics, "TN_VERIFY_AERODYNAMICS_TARGET_HASH_MISMATCH", "playtest/proofMetadata", "Web and desktop playtests must prove the same structured source and bundle.");
  const webPosition = web.finalPoses?.find((candidate) => candidate.entity === "craft")?.position;
  const nativePosition = native.finalPoses?.find((candidate) => candidate.entity === "craft")?.position;
  if (webPosition !== undefined && nativePosition !== undefined && distance(webPosition, nativePosition) > maxDelta) push(diagnostics, "TN_VERIFY_AERODYNAMICS_TARGET_OUTCOME_PARITY", "playtest/finalPoses", `Web and desktop flight-course landing positions differ by more than the scenario-owned ${maxDelta}-meter bound.`);
}

function manifestBounds(trace: AerodynamicsTrace): ManeuverBounds { return trace.maneuverBounds; }

async function hashDirectory(path: string): Promise<string> { const hash = createHash("sha256"); for (const file of await listFiles(path)) { hash.update(relative(path, file)); hash.update(await readFile(file)); } return `sha256-${hash.digest("hex")}`; }
async function listFiles(path: string): Promise<string[]> { const files: string[] = []; for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) files.push(...await listFiles(child)); else files.push(child); } return files.sort(); }
function sha256(value: Uint8Array): string { return `sha256-${createHash("sha256").update(value).digest("hex")}`; }
async function adapterVersions(): Promise<unknown[]> { const webPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/package.json"), "utf8")); const rapier = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/@dimforge/rapier3d-compat/package.json"), "utf8")); const three = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/three/package.json"), "utf8")); const cargo = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "utf8"); const workspace = await readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8"); return [{ adapter: "web", dependencies: { "@dimforge/rapier3d-compat": rapier.version, three: three.version }, runtime: webPackage.name, runtimeVersion: webPackage.version }, { adapter: "bevy", dependencies: { bevy: cargo.match(/^bevy\s*=\s*\{\s*version\s*=\s*"=?([^"]+)"/m)?.[1] ?? "unknown", rapier3d: cargo.match(/^rapier3d\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" }, runtime: "threenative_runtime", runtimeVersion: workspace.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" }]; }

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
