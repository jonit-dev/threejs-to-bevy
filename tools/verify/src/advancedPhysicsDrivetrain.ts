import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { arch, platform, release } from "node:os";

import { PHYSICS_CAPABILITY_LIMITS, PHYSICS_OBSERVATION_TOLERANCES, PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION, PHYSICS_PHASE3_OUTCOME_TOLERANCES, PHYSICS_PHASE3_VEHICLE_TOLERANCES, type IVehicleControllerComponent, type IVehicleControllerInput, type IVehicleControllerObservation, type IWorldIr } from "@threenative/ir";
import { disposePhysicsVehicleRuntime, initializePhysicsRuntime, tracePhysicsVehicleControllerInputs } from "@threenative/runtime-web-three";
import { advancedPhysicsEvidenceMetadataDiagnostics } from "./advancedPhysicsEvidence.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const artifactDir = resolve(root, "tools/verify/artifacts/advanced-physics/phase-3-drivetrain");
const fixtureDir = resolve(root, "packages/ir/fixtures/conformance/advanced-physics-drivetrain/game.bundle");
export const DRIVETRAIN_TRACE_SCHEMA = "threenative.advanced-physics-drivetrain-trace";
export const DRIVETRAIN_TRACE_VERSION = "0.1.0";
export const DRIVETRAIN_SCENARIOS = ["automaticLaunch", "manualShift", "steering", "braking", "reverse", "assistTransitions", "retry", "differentialOpen", "differentialLocked", "differentialLimitedSlip"] as const;
export const DRIVETRAIN_WHEEL_IDS = ["rear-right", "front-left", "rear-left", "front-right"] as const;

export type DrivetrainScenarioId = typeof DRIVETRAIN_SCENARIOS[number];
export type DrivetrainSample = { chassisAngularVelocity: [number, number, number]; chassisPosition: [number, number, number]; chassisRotation: [number, number, number, number]; chassisVelocity: [number, number, number]; input: IVehicleControllerInput; label: string; observation: IVehicleControllerObservation; tick: number; wheels: Array<{ grounded: boolean; longitudinalSlip: number; wheelId: string }> };
export type DrivetrainStraightStabilityBounds = { maxAbsYaw: number; maxAbsYawRate: number; maxConsecutiveZeroContactTicks: number; maxLateralDisplacement: number; minimumGroundedWheelCoverage: number; requireTerminalAllWheelsGrounded: true; startTick: number; throughTick: number };
export type DrivetrainScenario = { checkpoints: number[]; id: DrivetrainScenarioId; inputs: Array<{ input: IVehicleControllerInput; tick: number }>; observations: DrivetrainSample[]; outcomeBounds?: { straightStability: DrivetrainStraightStabilityBounds }; setup?: { chassisPosition: [number, number, number]; differential?: "open" | "locked" | "limited-slip"; limitedSlipRatio?: number; surfaceRegion: "split-grip" } };
export type AdvancedPhysicsDrivetrainTrace = { bundleHash: string; fixedDt: number; fixture: "advanced-physics-drivetrain"; runtime: "bevy" | "web"; scenarios: DrivetrainScenario[]; schema: typeof DRIVETRAIN_TRACE_SCHEMA; sourceHash: string; version: typeof DRIVETRAIN_TRACE_VERSION };
export type DrivetrainEvidenceDiagnostic = { code: string; message: string; path: string; severity: "error"; suggestedFix: string };
const manualChecklist = ["visible-chassis-and-four-wheels", "steering-yaw-and-lateral-path", "gear-rpm-clutch-telemetry", "abs-tcs-state-transitions", "authored-order-torque-path", "fresh-retry", "zero-runtime-errors"] as const;
type JsonRecord = Record<string, unknown>;
type ParsedManifestSegment = { input: unknown; label: unknown; steps: unknown };
type ParsedManifestScenario = { checkpoints: unknown[]; controllerOverride?: JsonRecord; id: string; initialPose?: { position: unknown[] }; outcomeBounds?: { straightStability?: unknown }; segments: ParsedManifestSegment[]; travelCorridor?: { endpoint: unknown[] } };
type ParsedScenarioManifest = { entity?: string; fixedDt?: number; scenarios: ParsedManifestScenario[]; schema?: string; version?: string };
type ParsedFixtureEntity = { components: JsonRecord; id: string };
type RuntimeManifestScenario = { checkpoints: number[]; controllerOverride?: JsonRecord; id: DrivetrainScenarioId; initialPose: [number, number, number]; outcomeBounds?: { straightStability: DrivetrainStraightStabilityBounds }; segments: Array<{ input: IVehicleControllerInput; label: string; steps: number }> };

export function manualDrivetrainEvidenceDiagnostics(report: unknown, expected: { bundleHash: string; screenshotHash: string; sourceHash: string }): DrivetrainEvidenceDiagnostic[] {
  const diagnostics: DrivetrainEvidenceDiagnostic[] = [];
  const parsed = record(report); const metadata = record(parsed?.metadata); const findings = record(parsed?.findings); const checklist = records(parsed?.checklist);
  if (parsed?.status !== "PASS") push(diagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_STATUS", "manual/status", "Manual browser report status must be PASS.");
  for (const message of advancedPhysicsEvidenceMetadataDiagnostics(metadata)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_METADATA", "manual/metadata", message);
  if (metadata?.sourceHash !== expected.sourceHash || metadata?.bundleHash !== expected.bundleHash || metadata?.toleranceRegistryVersion !== PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION) push(diagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_FIXTURE_STALE", "manual/metadata", "Manual evidence is not bound to the current source, bundle, and tolerance registry.");
  const screenshotPath = "tools/verify/artifacts/advanced-physics/phase-3-drivetrain/manual-web-debug.png";
  if (record(metadata?.artifactHashes)?.[screenshotPath] !== expected.screenshotHash) push(diagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_SCREENSHOT_STALE", "manual/metadata/artifactHashes", "Screenshot hash is absent or stale.");
  if (JSON.stringify(checklist.map((item) => item.id)) !== JSON.stringify(manualChecklist) || !checklist.every((item) => item.passed === true)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_CHECKLIST", "manual/checklist", "Manual checklist must contain every canonical item in order and pass each one.");
  if (findings?.runtimeErrors !== 0 || typeof findings.visibleMeshes !== "number" || findings.visibleMeshes < 5 || findings.wheelCount !== 4) push(diagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_FINDINGS", "manual/findings", "Manual findings must prove visible vehicle geometry and zero runtime errors.");
  return diagnostics;
}

export function drivetrainScenarioManifestDiagnostics(value: unknown): DrivetrainEvidenceDiagnostic[] {
  const diagnostics: DrivetrainEvidenceDiagnostic[] = [];
  const manifest = parseScenarioManifest(value);
  if (manifest?.schema !== "threenative.advanced-physics-drivetrain-scenarios" || manifest.version !== DRIVETRAIN_TRACE_VERSION || manifest.entity !== "chassis" || manifest.fixedDt === undefined || manifest.fixedDt <= 0) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_MANIFEST_INVALID", "scenarioManifest", "Scenario manifest identity, entity, or fixedDt is invalid.");
  if (manifest === undefined || JSON.stringify(manifest.scenarios.map((item) => item.id)) !== JSON.stringify(DRIVETRAIN_SCENARIOS)) { push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_MANIFEST_ORDER", "scenarioManifest/scenarios", "Scenario manifest order must match the descriptor-owned scenario registry."); return diagnostics; }
  for (const scenario of manifest.scenarios) {
    const steps = scenario.segments.reduce((sum, segment) => sum + (typeof segment.steps === "number" && Number.isInteger(segment.steps) && segment.steps > 0 ? segment.steps : 0), 0);
    if (scenario.initialPose === undefined || scenario.initialPose.position.length !== 3 || scenario.initialPose.position.some((item) => typeof item !== "number" || !Number.isFinite(item)) || steps === 0) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_MANIFEST_INVALID", `scenarioManifest/${scenario.id}`, "Each scenario requires a finite initial pose and positive input segments.");
    if (!validTravelCorridor(scenario)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_CORRIDOR_INVALID", `scenarioManifest/${scenario.id}/travelCorridor`, "Each scenario requires a finite endpoint in its declared forward or reverse direction.");
    if (scenario.checkpoints.some((tick, index) => !Number.isInteger(tick) || Number(tick) < 0 || Number(tick) >= steps || (index > 0 && Number(tick) <= Number(scenario.checkpoints[index - 1])))) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_CHECKPOINT_INVALID", `scenarioManifest/${scenario.id}/checkpoints`, "Checkpoint ticks must be ordered and inside the declared segments.");
    for (const [index, segment] of scenario.segments.entries()) if (typeof segment.label !== "string" || segment.label.length === 0 || typeof segment.steps !== "number" || !Number.isInteger(segment.steps) || segment.steps <= 0 || !validInput(segment.input)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_INPUT_INVALID", `scenarioManifest/${scenario.id}/segments/${index}`, "Every segment requires a label, positive steps, and normalized controller input.");
  }
  const stabilityScenarios = manifest.scenarios.filter((item) => item.id === "automaticLaunch" || item.id === "retry");
  const stability = stabilityScenarios[0]?.outcomeBounds?.straightStability;
  if (!validStraightStabilityBounds(stability) || stabilityScenarios.some((item) => JSON.stringify(item.outcomeBounds?.straightStability) !== JSON.stringify(stability))) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_STABILITY_BOUNDS_INVALID", "scenarioManifest/automaticLaunch/outcomeBounds", "Automatic launch and retry require the same finite, positive, manifest-owned straight-stability bounds.");
  const differential = manifest.scenarios.filter((item) => item.id.startsWith("differential")); if (new Set(differential.map((item) => JSON.stringify(item.initialPose))).size !== 1) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_DIFFERENTIAL_DRIFT", "scenarioManifest/differential", "Differential modes must share exact authored geometry and pose.");
  return diagnostics;
}

export function drivetrainFixtureGeometryDiagnostics(world: unknown, assets: unknown, manifestValue: unknown): DrivetrainEvidenceDiagnostic[] {
  const diagnostics: DrivetrainEvidenceDiagnostic[] = [];
  const entities = parseFixtureEntities(world); const manifest = parseScenarioManifest(manifestValue); const assetRows = records(record(assets)?.assets);
  const chassis = entities.find((item) => item.id === manifest?.entity); const wheels = records(record(chassis?.components.WheelAssembly)?.wheels);
  if (!Array.isArray(wheels) || wheels.length !== DRIVETRAIN_WHEEL_IDS.length) push(diagnostics, "TN_VERIFY_DRIVETRAIN_FIXTURE_GEOMETRY_INVALID", "world/chassis/WheelAssembly/wheels", "Canonical chassis must retain four authored wheels.");
  else for (const wheel of wheels) {
    const target = entities.find((item) => item.id === wheel.visual); const attachment = wheel.attachment; const radius = wheel.radius; const actual = record(target?.components.Transform)?.position;
    const expected = Array.isArray(attachment) && attachment.length === 3 && typeof radius === "number" ? [attachment[0], attachment[1] - radius, attachment[2]] : undefined;
    if (target === undefined || expected === undefined || !sameNumbers(actual, expected)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_VISUAL_TARGET_OFFSET_DRIFT", `world/${String(wheel.visual ?? "missing")}/Transform/position`, "Each wheel visual target must retain the local offset derived from its authored attachment and radius.");
  }
  const normal = entities.find((item) => item.id === "ground-asphalt"); const normalSize = record(normal?.components.Collider)?.size; const normalPosition = record(normal?.components.Transform)?.position; const meshId = record(normal?.components.MeshRenderer)?.mesh; const meshSize = assetRows.find((item) => item.id === meshId)?.size;
  if (!sameNumbers(normalSize, meshSize) || !boxContainsScenarioCorridors(normalPosition, normalSize, manifest?.scenarios.filter((item) => !item.id.startsWith("differential") && item.id !== "assistTransitions") ?? [])) push(diagnostics, "TN_VERIFY_DRIVETRAIN_FIXTURE_GEOMETRY_INVALID", "world/ground-asphalt", "Normal proof surface mesh/collider dimensions must agree and contain every declared travel corridor.");
  const split = [entities.find((item) => item.id === "ground-split-left-ice"), entities.find((item) => item.id === "ground-split-right-asphalt")]; const splitScenarios = manifest?.scenarios.filter((item) => item.id.startsWith("differential") || item.id === "assistTransitions") ?? [];
  if (split.some((item) => item === undefined) || split.some((item) => !boxContainsScenarioCorridors(record(item?.components.Transform)?.position, record(item?.components.Collider)?.size, splitScenarios)) || boxesOverlapX(normalPosition, normalSize, record(split[0]?.components.Transform)?.position, record(split[0]?.components.Collider)?.size) || boxesOverlapX(normalPosition, normalSize, record(split[1]?.components.Transform)?.position, record(split[1]?.components.Collider)?.size)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_FIXTURE_GEOMETRY_INVALID", "world/split-grip", "Split-grip pads must contain every declared travel corridor and remain separate from the normal proof surface.");
  return diagnostics;
}

function validInput(input: unknown): input is IVehicleControllerInput { const value = record(input); return value !== undefined && [value.throttle, value.brake, value.handbrake, value.clutch].every((item) => typeof item === "number" && item >= 0 && item <= 1) && typeof value.steer === "number" && value.steer >= -1 && value.steer <= 1 && (value.gear === undefined || Number.isInteger(value.gear)); }
function validTravelCorridor(scenario: ParsedManifestScenario): boolean { const start = scenario.initialPose?.position; const end = scenario.travelCorridor?.endpoint; if (!isFiniteVector(start, 3) || !isFiniteVector(end, 2)) return false; const deltaZ = end[1]! - start[2]!; return scenario.id === "reverse" ? deltaZ > 0 : deltaZ < 0; }
function validStraightStabilityBounds(value: unknown): value is DrivetrainStraightStabilityBounds { const bounds = record(value); return bounds?.requireTerminalAllWheelsGrounded === true && Number.isInteger(bounds.startTick) && Number(bounds.startTick) >= 0 && Number.isInteger(bounds.throughTick) && Number(bounds.throughTick) >= Number(bounds.startTick) && Number.isInteger(bounds.maxConsecutiveZeroContactTicks) && Number(bounds.maxConsecutiveZeroContactTicks) >= 0 && typeof bounds.minimumGroundedWheelCoverage === "number" && bounds.minimumGroundedWheelCoverage > 0 && bounds.minimumGroundedWheelCoverage <= 1 && [bounds.maxLateralDisplacement, bounds.maxAbsYaw, bounds.maxAbsYawRate].every((item) => typeof item === "number" && Number.isFinite(item) && item > 0); }
function sameNumbers(left: unknown, right: unknown): boolean { return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => typeof item === "number" && Number.isFinite(item) && item === right[index]); }
function boxContainsScenarioCorridors(position: unknown, size: unknown, scenarios: ParsedManifestScenario[]): boolean { if (!isFiniteVector(position, 3) || !isFiniteVector(size, 3)) return false; const centerX = position[0]; const centerZ = position[2]; const width = size[0]; const length = size[2]; if (centerX === undefined || centerZ === undefined || width === undefined || length === undefined) return false; for (const scenario of scenarios) { const start = scenario.initialPose?.position; const end = scenario.travelCorridor?.endpoint; if (!isFiniteVector(start, 3) || !isFiniteVector(end, 2)) return false; for (const [x, z] of [[start[0], start[2]], end]) if (x === undefined || z === undefined || Math.abs(x - centerX) > width / 2 || Math.abs(z - centerZ) > length / 2) return false; } return true; }
function boxesOverlapX(leftPosition: unknown, leftSize: unknown, rightPosition: unknown, rightSize: unknown): boolean { if (!isFiniteVector(leftPosition, 3) || !isFiniteVector(leftSize, 3) || !isFiniteVector(rightPosition, 3) || !isFiniteVector(rightSize, 3)) return true; const leftX = leftPosition[0]; const rightX = rightPosition[0]; const leftWidth = leftSize[0]; const rightWidth = rightSize[0]; if (leftX === undefined || rightX === undefined || leftWidth === undefined || rightWidth === undefined) return true; return Math.abs(leftX - rightX) < (leftWidth + rightWidth) / 2; }

function parseScenarioManifest(value: unknown): ParsedScenarioManifest | undefined { const root = record(value); const scenarioRows = records(root?.scenarios); if (root === undefined || !Array.isArray(root.scenarios) || scenarioRows.length !== root.scenarios.length) return undefined; return { entity: string(root.entity), fixedDt: finite(root.fixedDt), schema: string(root.schema), version: string(root.version), scenarios: scenarioRows.map((scenario) => ({ checkpoints: array(scenario.checkpoints), controllerOverride: record(scenario.controllerOverride), id: string(scenario.id) ?? "", initialPose: record(scenario.initialPose) === undefined ? undefined : { position: array(record(scenario.initialPose)?.position) }, outcomeBounds: record(scenario.outcomeBounds) === undefined ? undefined : { straightStability: record(scenario.outcomeBounds)?.straightStability }, segments: records(scenario.segments).map((segment) => ({ input: segment.input, label: segment.label, steps: segment.steps })), travelCorridor: record(scenario.travelCorridor) === undefined ? undefined : { endpoint: array(record(scenario.travelCorridor)?.endpoint) } })) }; }
function parseFixtureEntities(value: unknown): ParsedFixtureEntity[] { return records(record(value)?.entities).flatMap((entity) => { const id = string(entity.id); const components = record(entity.components); return id === undefined || components === undefined ? [] : [{ components, id }]; }); }
function record(value: unknown): JsonRecord | undefined { return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : undefined; }
function records(value: unknown): JsonRecord[] { return Array.isArray(value) ? value.filter((item): item is JsonRecord => record(item) !== undefined) : []; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function string(value: unknown): string | undefined { return typeof value === "string" ? value : undefined; }
function finite(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }
function isFiniteVector(value: unknown, length: number): value is number[] { return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item)); }

export function validateAdvancedPhysicsDrivetrainEvidence(web: AdvancedPhysicsDrivetrainTrace, native: AdvancedPhysicsDrivetrainTrace): DrivetrainEvidenceDiagnostic[] {
  const diagnostics: DrivetrainEvidenceDiagnostic[] = [];
  for (const [runtime, trace] of [["web", web], ["native", native]] as const) validateEnvelope(runtime, trace, diagnostics);
  if (!near(web.fixedDt, native.fixedDt, PHYSICS_OBSERVATION_TOLERANCES.distance)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_FIXED_DT_MISMATCH", "fixedDt", "Runtime fixed steps differ.");
  if (web.sourceHash !== native.sourceHash || web.bundleHash !== native.bundleHash) push(diagnostics, "TN_VERIFY_DRIVETRAIN_FIXTURE_HASH_MISMATCH", "fixtureHashes", "Runtime traces were not generated from the same source and bundle hashes.");
  for (const id of DRIVETRAIN_SCENARIOS) {
    const ws = web.scenarios.find((item) => item.id === id); const ns = native.scenarios.find((item) => item.id === id);
    if (!ws || !ns) continue;
    if (JSON.stringify(ws.inputs) !== JSON.stringify(ns.inputs)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_INPUT_MISMATCH", `scenarios/${id}/inputs`, "Recorded normalized input schedules differ.");
    if (JSON.stringify(ws.checkpoints) !== JSON.stringify(ns.checkpoints)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_CHECKPOINT_MISMATCH", `scenarios/${id}/checkpoints`, "Declared checkpoint schedules differ.");
    if (JSON.stringify(ws.outcomeBounds) !== JSON.stringify(ns.outcomeBounds)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_OUTCOME_BOUNDS_MISMATCH", `scenarios/${id}/outcomeBounds`, "Manifest-owned scenario outcome bounds differ.");
    if (ws.observations.length !== ns.observations.length) { push(diagnostics, "TN_VERIFY_DRIVETRAIN_SAMPLE_COUNT_MISMATCH", `scenarios/${id}/observations`, "Runtime sample counts differ."); continue; }
    if (JSON.stringify(transitions(ws)) !== JSON.stringify(transitions(ns))) push(diagnostics, "TN_VERIFY_DRIVETRAIN_TRANSITION_MISMATCH", `scenarios/${id}/transitions`, "Gear, shift, or assist transition order differs.");
    ws.checkpoints.forEach((tick) => {
      const left = ws.observations[tick]!; const right = ns.observations[tick]!;
      if (left.observation.shiftState !== "engaged" || right.observation.shiftState !== "engaged") push(diagnostics, "TN_VERIFY_DRIVETRAIN_CHECKPOINT_NOT_STABLE", `scenarios/${id}/observations/${tick}`, "Manifest-owned numeric checkpoints must be engaged in both traces.");
      else compareSample(left, right, `scenarios/${id}/observations/${tick}`, diagnostics);
    });
    compareKinematicOutcome(ws, ns, `scenarios/${id}/outcome`, diagnostics);
  }
  for (const [runtime, trace] of [["web", web], ["native", native]] as const) validateCausality(runtime, trace, diagnostics);
  return diagnostics;
}

function validateEnvelope(runtime: string, trace: AdvancedPhysicsDrivetrainTrace, diagnostics: DrivetrainEvidenceDiagnostic[]): void {
  if (trace.schema !== DRIVETRAIN_TRACE_SCHEMA || trace.version !== DRIVETRAIN_TRACE_VERSION || trace.fixture !== "advanced-physics-drivetrain") push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCHEMA_INVALID", runtime, "Trace schema, version, or fixture identity is invalid.");
  if (!/^sha256-[0-9a-f]{64}$/.test(trace.sourceHash) || !/^sha256-[0-9a-f]{64}$/.test(trace.bundleHash)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_FIXTURE_HASH_INVALID", runtime, "Trace source and bundle hashes must be resolved SHA-256 values.");
  if (JSON.stringify(trace.scenarios.map((item) => item.id)) !== JSON.stringify(DRIVETRAIN_SCENARIOS)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SCENARIO_ORDER", `${runtime}/scenarios`, "Scenario IDs must be complete and in canonical order.");
  for (const scenario of trace.scenarios) {
    if (scenario.checkpoints.length === 0 || scenario.checkpoints.some((tick, index) => !Number.isInteger(tick) || tick < 0 || tick >= scenario.observations.length || (index > 0 && tick <= scenario.checkpoints[index - 1]!))) push(diagnostics, "TN_VERIFY_DRIVETRAIN_CHECKPOINT_INVALID", `${runtime}/scenarios/${scenario.id}/checkpoints`, "Checkpoint ticks must be ordered, unique, and inside the trace.");
    if (scenario.observations.length === 0 || scenario.observations.some((sample, index) => sample.tick !== index)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_TICK_SEQUENCE", `${runtime}/scenarios/${scenario.id}/observations`, "Observations must contain consecutive zero-based fixed ticks.");
    for (const sample of scenario.observations) {
      if (sample.observation.entity !== "chassis" || JSON.stringify(sample.observation.torquePath.wheels.map((wheel) => wheel.wheelId)) !== JSON.stringify(DRIVETRAIN_WHEEL_IDS)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SEMANTIC_MISMATCH", `${runtime}/scenarios/${scenario.id}/observations/${sample.tick}`, "Entity or authored torque-path wheel order is invalid.");
      if (JSON.stringify(sample.wheels.map((wheel) => wheel.wheelId)) !== JSON.stringify(DRIVETRAIN_WHEEL_IDS) || sample.wheels.some((wheel) => typeof wheel.grounded !== "boolean" || !Number.isFinite(wheel.longitudinalSlip))) push(diagnostics, "TN_VERIFY_DRIVETRAIN_WHEEL_OBSERVATION_INVALID", `${runtime}/scenarios/${scenario.id}/observations/${sample.tick}/wheels`, "Runtime-derived wheel observations must be finite and authored-order.");
      if (JSON.stringify(sample.input) !== JSON.stringify(sample.observation.inputs)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_INPUT_OBSERVATION_MISMATCH", `${runtime}/scenarios/${scenario.id}/observations/${sample.tick}/inputs`, "Observation must echo the exact normalized input consumed at that tick.");
    }
  }
}

function compareSample(left: DrivetrainSample, right: DrivetrainSample, path: string, diagnostics: DrivetrainEvidenceDiagnostic[]): void {
  if (left.tick !== right.tick || left.label !== right.label || left.observation.entity !== right.observation.entity || left.observation.gear !== right.observation.gear || left.observation.shiftState !== right.observation.shiftState || left.observation.absActive !== right.observation.absActive || left.observation.tcsActive !== right.observation.tcsActive) push(diagnostics, "TN_VERIFY_DRIVETRAIN_SEMANTIC_MISMATCH", path, "Discrete controller observation semantics differ.");
  for (const [field, tolerance] of [["speed", PHYSICS_PHASE3_VEHICLE_TOLERANCES.speed], ["engineRpm", PHYSICS_PHASE3_VEHICLE_TOLERANCES.engineRpm], ["clutch", PHYSICS_PHASE3_VEHICLE_TOLERANCES.clutch], ["driveTorque", PHYSICS_PHASE3_VEHICLE_TOLERANCES.driveTorque]] as const) if (!near(left.observation[field], right.observation[field], tolerance)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_NUMERIC_MISMATCH", `${path}/observation/${field}`, `${field} exceeds its Phase 3 vehicle tolerance.`);
  for (const field of ["engine", "clutch", "gearbox", "finalDrive"] as const) if (!near(left.observation.torquePath[field], right.observation.torquePath[field], PHYSICS_PHASE3_VEHICLE_TOLERANCES.torquePath)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_TORQUE_PATH_MISMATCH", `${path}/observation/torquePath/${field}`, "Torque-path stage exceeds its Phase 3 vehicle tolerance.");
  left.observation.torquePath.wheels.forEach((wheel, index) => { if (wheel.wheelId !== right.observation.torquePath.wheels[index]?.wheelId || !near(wheel.torque, right.observation.torquePath.wheels[index]?.torque ?? Number.NaN, PHYSICS_PHASE3_VEHICLE_TOLERANCES.torquePath)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_TORQUE_PATH_MISMATCH", `${path}/observation/torquePath/wheels/${index}`, "Authored-order wheel torque exceeds its Phase 3 vehicle tolerance."); });
  left.wheels.forEach((wheel, index) => { const other = right.wheels[index]; if (!other || wheel.wheelId !== other.wheelId || wheel.grounded !== other.grounded) push(diagnostics, "TN_VERIFY_DRIVETRAIN_WHEEL_SEMANTIC_MISMATCH", `${path}/wheels/${index}`, "Wheel identity or grounded state differs."); });
}

function compareKinematicOutcome(left: DrivetrainScenario, right: DrivetrainScenario, path: string, diagnostics: DrivetrainEvidenceDiagnostic[]): void {
  const leftOutcome = kinematicOutcome(left); const rightOutcome = kinematicOutcome(right);
  for (const [field, tolerance] of [["longitudinalProgress", PHYSICS_PHASE3_OUTCOME_TOLERANCES.longitudinalProgress], ["lateralProgressRatio", PHYSICS_PHASE3_OUTCOME_TOLERANCES.lateralProgressRatio], ["yaw", PHYSICS_PHASE3_OUTCOME_TOLERANCES.yaw]] as const) if (!near(leftOutcome[field], rightOutcome[field], tolerance)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_OUTCOME_MISMATCH", `${path}/${field}`, `${field} exceeds its Phase 3 trace-derived outcome tolerance.`);
}

function kinematicOutcome(scenario: DrivetrainScenario): { lateralProgressRatio: number; longitudinalProgress: number; yaw: number } {
  const start = scenario.observations.find((sample) => sample.label !== "settle") ?? scenario.observations[0]!; const end = scenario.observations.at(-1)!;
  const [x, y, z, w] = start.chassisRotation; const direction = scenario.id === "reverse" ? -1 : 1; const forwardX = direction * -2 * (x * z + w * y); const forwardZ = direction * (-1 + 2 * (x * x + y * y));
  const deltaX = end.chassisPosition[0] - start.chassisPosition[0]; const deltaZ = end.chassisPosition[2] - start.chassisPosition[2]; const longitudinalProgress = deltaX * forwardX + deltaZ * forwardZ; const lateral = Math.abs(deltaX * -forwardZ + deltaZ * forwardX);
  const startYaw = 2 * Math.atan2(start.chassisRotation[1], start.chassisRotation[3]); const endYaw = 2 * Math.atan2(end.chassisRotation[1], end.chassisRotation[3]);
  return { lateralProgressRatio: lateral / Math.max(Math.abs(longitudinalProgress), 1e-6), longitudinalProgress, yaw: Math.abs(endYaw - startYaw) };
}

function validateCausality(runtime: string, trace: AdvancedPhysicsDrivetrainTrace, diagnostics: DrivetrainEvidenceDiagnostic[]): void {
  const scenario = (id: DrivetrainScenarioId) => trace.scenarios.find((item) => item.id === id)!;
  const last = (id: DrivetrainScenarioId) => scenario(id).observations.at(-1)!;
  const automaticGears = scenario("automaticLaunch").observations.map((item) => item.observation.gear).filter((gear, index, values) => index === 0 || gear !== values[index - 1]);
  if (JSON.stringify(automaticGears) !== JSON.stringify([1, 2, 3, 4]) || last("automaticLaunch").observation.speed <= 0.1) push(diagnostics, "TN_VERIFY_DRIVETRAIN_AUTOMATIC_SHIFT", `${runtime}/automaticLaunch`, "Automatic launch must accelerate through the exact ordered gear sequence [1, 2, 3, 4].");
  const automatic = scenario("automaticLaunch"); const stability = automatic.outcomeBounds?.straightStability; const start = stability === undefined ? undefined : automatic.observations[stability.startTick];
  if (!start || !validStraightStabilityBounds(stability) || !straightStabilityPasses(automatic, start, stability)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_STRAIGHT_STABILITY", `${runtime}/automaticLaunch/outcomeBounds/straightStability`, "Zero-steer launch must retain bounded contact coverage, terminal grounding, lateral displacement, yaw, and yaw rate over the manifest-owned window.");
  if (last("manualShift").observation.gear !== 2 || !scenario("manualShift").inputs.some((item) => item.input.gear === 2)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_SHIFT", `${runtime}/manualShift`, "Manual schedule must explicitly reach and retain second gear.");
  const steering = scenario("steering").observations; const yaw = steering.map((sample) => 2 * Math.atan2(sample.chassisRotation[1], sample.chassisRotation[3]));
  if (Math.abs(last("steering").chassisPosition[0] - steering[0]!.chassisPosition[0]) <= 0.05 || Math.abs(yaw.at(-1)! - yaw[0]!) <= 0.01 || steering.some((sample, index) => index > 0 && Math.hypot(...sample.chassisPosition.map((value, axis) => value - steering[index - 1]!.chassisPosition[axis]!) as [number, number, number]) > 2)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_STEERING_OUTCOME", `${runtime}/steering`, "Steering must create bounded continuous lateral path and yaw without teleportation.");
  const braking = scenario("braking").observations; if (!(braking.at(-1)!.observation.speed < Math.max(...braking.map((item) => item.observation.speed)) - 0.05)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_BRAKING_OUTCOME", `${runtime}/braking`, "Braking must reduce speed after warmup.");
  if (last("reverse").observation.gear !== -1 || last("reverse").chassisVelocity[2] <= 0.05) push(diagnostics, "TN_VERIFY_DRIVETRAIN_REVERSE_OUTCOME", `${runtime}/reverse`, "Reverse gear must produce opposite longitudinal motion.");
  const assists = scenario("assistTransitions").observations; if (!orderedPulse(assists.map((item) => item.observation.tcsActive)) || !orderedPulse(assists.map((item) => item.observation.absActive))) push(diagnostics, "TN_VERIFY_DRIVETRAIN_ASSIST_TRANSITIONS", `${runtime}/assistTransitions`, "Recorded assist states must transition inactive to active to inactive for both TCS and ABS.");
  if (!equivalentScenario(scenario("automaticLaunch"), scenario("retry"))) push(diagnostics, "TN_VERIFY_DRIVETRAIN_RETRY_NONDETERMINISTIC", `${runtime}/retry`, "Fresh-world retry must reproduce the complete automatic-launch sequence.");
  const differentialScenarios = [scenario("differentialOpen"), scenario("differentialLocked"), scenario("differentialLimitedSlip")];
  if (new Set(differentialScenarios.map((item) => JSON.stringify(item.setup?.chassisPosition))).size !== 1) push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_SETUP", `${runtime}/differential`, "All differential modes must use the same manifest-owned initial pose.");
  validateDifferential(runtime, differentialScenarios[0]!, "open", diagnostics); validateDifferential(runtime, differentialScenarios[1]!, "locked", diagnostics); validateDifferential(runtime, differentialScenarios[2]!, "limited-slip", diagnostics);
}

function validateDifferential(runtime: string, scenario: DrivetrainScenario, kind: "open" | "locked" | "limited-slip", diagnostics: DrivetrainEvidenceDiagnostic[]): void {
  if (scenario.setup?.differential !== kind || scenario.setup.surfaceRegion !== "split-grip") { push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_SETUP", `${runtime}/${scenario.id}/setup`, "Differential scenarios require a manifest-owned authored split-grip pose and may vary only differential mode."); return; }
  const measurements = scenario.observations.filter((sample) => {
    const left = sample.wheels.find((wheel) => wheel.wheelId === "rear-left"); const right = sample.wheels.find((wheel) => wheel.wheelId === "rear-right");
    return left?.grounded === true && right?.grounded === true && Math.abs(sample.observation.driveTorque) > PHYSICS_OBSERVATION_TOLERANCES.vehicleDriveTorque.absolute;
  });
  if (kind === "limited-slip") {
    const spread = (sample: DrivetrainSample) => Math.abs(Math.abs(sample.wheels.find((wheel) => wheel.wheelId === "rear-left")!.longitudinalSlip) - Math.abs(sample.wheels.find((wheel) => wheel.wheelId === "rear-right")!.longitudinalSlip));
    const below = measurements.find((sample) => spread(sample) <= PHYSICS_CAPABILITY_LIMITS.vehicleLimitedSlipActivationDelta); const above = [...measurements].reverse().find((sample) => spread(sample) > PHYSICS_CAPABILITY_LIMITS.vehicleLimitedSlipActivationDelta);
    if (!below || !above) { push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_DEADBAND_COVERAGE", `${runtime}/${scenario.id}/wheels`, "Limited-slip evidence requires grounded active-torque samples below and above the descriptor-owned activation delta."); return; }
    if (!equalRearTorque(below)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_CAUSALITY", `${runtime}/${scenario.id}/torquePath/deadband`, "Limited-slip torque must remain equal at or below the descriptor-owned activation delta.");
    validateLimitedSlipBias(runtime, scenario, above, diagnostics); return;
  }
  const measurement = [...measurements].reverse().find((sample) => {
    const left = sample.wheels.find((wheel) => wheel.wheelId === "rear-left")!; const right = sample.wheels.find((wheel) => wheel.wheelId === "rear-right")!;
    return Math.abs(left.longitudinalSlip - right.longitudinalSlip) > PHYSICS_OBSERVATION_TOLERANCES.wheelLongitudinalSlip.absolute;
  });
  if (!measurement) { push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_ASYMMETRY", `${runtime}/${scenario.id}/wheels`, "No active-torque sample contained grounded measurable runtime-derived rear-wheel slip asymmetry."); return; }
  if (!equalRearTorque(measurement)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_CAUSALITY", `${runtime}/${scenario.id}/torquePath`, "Open and locked differentials must allocate equal torque to eligible driven wheels.");
}

function equalRearTorque(sample: DrivetrainSample): boolean { const torque = sample.observation.torquePath.wheels; const left = torque.find((wheel) => wheel.wheelId === "rear-left")?.torque; const right = torque.find((wheel) => wheel.wheelId === "rear-right")?.torque; return typeof left === "number" && typeof right === "number" && Math.abs(left - right) <= 1e-6; }

function validateLimitedSlipBias(runtime: string, scenario: DrivetrainScenario, measurement: DrivetrainSample, diagnostics: DrivetrainEvidenceDiagnostic[]): void {
  const endWheels = measurement.wheels;
  const leftSlip = Math.abs(endWheels.find((wheel) => wheel.wheelId === "rear-left")?.longitudinalSlip ?? Number.NaN); const rightSlip = Math.abs(endWheels.find((wheel) => wheel.wheelId === "rear-right")?.longitudinalSlip ?? Number.NaN);
  if (!endWheels.find((wheel) => wheel.wheelId === "rear-left")?.grounded || !endWheels.find((wheel) => wheel.wheelId === "rear-right")?.grounded || !Number.isFinite(leftSlip) || !Number.isFinite(rightSlip) || Math.abs(leftSlip - rightSlip) <= PHYSICS_OBSERVATION_TOLERANCES.wheelLongitudinalSlip.absolute) { push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_ASYMMETRY", `${runtime}/${scenario.id}/wheels`, "Authored split grip did not produce grounded measurable runtime-derived rear-wheel slip asymmetry."); return; }
  const wheelTorques = measurement.observation.torquePath.wheels;
  const lowSlipId = leftSlip < rightSlip ? "rear-left" : "rear-right"; const highSlipId = lowSlipId === "rear-left" ? "rear-right" : "rear-left";
  const lowerSlip = Math.abs(wheelTorques.find((wheel) => wheel.wheelId === lowSlipId)?.torque ?? Number.NaN);
  const higherSlip = Math.abs(wheelTorques.find((wheel) => wheel.wheelId === highSlipId)?.torque ?? Number.NaN);
  if (!(lowerSlip > higherSlip && lowerSlip / Math.max(higherSlip, 1e-9) <= (scenario.setup?.limitedSlipRatio ?? 1) + 1e-6)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_CAUSALITY", `${runtime}/${scenario.id}/torquePath`, "Limited-slip torque above the activation delta must bias the lower-slip wheel within the authored ratio.");
}

function orderedPulse(values: boolean[]): boolean { const first = values.indexOf(true); return first > 0 && values.slice(first).includes(false); }
function straightStabilityPasses(scenario: DrivetrainScenario, start: DrivetrainSample, bounds: DrivetrainStraightStabilityBounds): boolean {
  if (bounds.startTick >= scenario.observations.length || bounds.throughTick >= scenario.observations.length) return false;
  const window = scenario.observations.slice(bounds.startTick, bounds.throughTick + 1); let groundedWheelSamples = 0; let zeroContactRun = 0; let longestZeroContactRun = 0;
  for (const sample of window) {
    if (sample.input.steer !== 0 || Math.abs(sample.chassisPosition[0] - start.chassisPosition[0]) > bounds.maxLateralDisplacement || Math.abs(2 * Math.atan2(sample.chassisRotation[1], sample.chassisRotation[3])) > bounds.maxAbsYaw || Math.abs(sample.chassisAngularVelocity[1]) > bounds.maxAbsYawRate) return false;
    const grounded = sample.wheels.filter((wheel) => wheel.grounded).length; groundedWheelSamples += grounded; zeroContactRun = grounded === 0 ? zeroContactRun + 1 : 0; longestZeroContactRun = Math.max(longestZeroContactRun, zeroContactRun);
  }
  const terminalGrounded = window.at(-1)?.wheels.every((wheel) => wheel.grounded) === true;
  const coverage = groundedWheelSamples / (window.length * DRIVETRAIN_WHEEL_IDS.length);
  return terminalGrounded && coverage >= bounds.minimumGroundedWheelCoverage && longestZeroContactRun <= bounds.maxConsecutiveZeroContactTicks;
}
function transitions(scenario: DrivetrainScenario): Array<{ absActive: boolean; gear: number; shiftState: string; tcsActive: boolean }> { const output: Array<{ absActive: boolean; gear: number; shiftState: string; tcsActive: boolean }> = []; for (const sample of scenario.observations) { const next = { absActive: sample.observation.absActive, gear: sample.observation.gear, shiftState: sample.observation.shiftState, tcsActive: sample.observation.tcsActive }; const previous = output.at(-1); if (!previous || previous.absActive !== next.absActive || previous.gear !== next.gear || previous.shiftState !== next.shiftState || previous.tcsActive !== next.tcsActive) output.push(next); } return output; }
function equivalentScenario(left: DrivetrainScenario, right: DrivetrainScenario): boolean { if (left.observations.length !== right.observations.length) return false; return left.observations.every((sample, index) => JSON.stringify(sample.input) === JSON.stringify(right.observations[index]!.input) && JSON.stringify(sample.observation) === JSON.stringify(right.observations[index]!.observation) && JSON.stringify(sample.chassisPosition) === JSON.stringify(right.observations[index]!.chassisPosition) && JSON.stringify(sample.chassisVelocity) === JSON.stringify(right.observations[index]!.chassisVelocity) && JSON.stringify(sample.chassisRotation) === JSON.stringify(right.observations[index]!.chassisRotation) && JSON.stringify(sample.chassisAngularVelocity) === JSON.stringify(right.observations[index]!.chassisAngularVelocity)); }
function near(left: number, right: number, tolerance: { absolute: number; relative: number }): boolean { return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= Math.max(tolerance.absolute, Math.max(Math.abs(left), Math.abs(right)) * tolerance.relative); }
function push(output: DrivetrainEvidenceDiagnostic[], code: string, path: string, message: string): void { output.push({ code, message, path, severity: "error", suggestedFix: "Regenerate the exact recorded-input scenario and fix the owning runtime or contract boundary." }); }

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(artifactDir, { recursive: true });
  const diagnostics: DrivetrainEvidenceDiagnostic[] = [];
  const manualDiagnostics: DrivetrainEvidenceDiagnostic[] = [];
  const sourceBytes = await readFile(resolve(fixtureDir, "world.ir.json")); const sourceHash = sha256(sourceBytes);
  const bundleHash = await hashDirectory(fixtureDir);
  const scenarioManifest = JSON.parse(await readFile(resolve(fixtureDir, "drivetrain.scenarios.json"), "utf8")); diagnostics.push(...drivetrainScenarioManifestDiagnostics(scenarioManifest));
  const sourceWorld = JSON.parse(sourceBytes.toString("utf8")); const sourceAssets = JSON.parse(await readFile(resolve(fixtureDir, "assets.manifest.json"), "utf8")); diagnostics.push(...drivetrainFixtureGeometryDiagnostics(sourceWorld, sourceAssets, scenarioManifest));
  try {
    const webTrace = await generateWebTrace(sourceHash, bundleHash);
    await writeFile(resolve(artifactDir, "web-trace.json"), `${JSON.stringify(webTrace, null, 2)}\n`);
  } catch (error) { push(diagnostics, "TN_VERIFY_DRIVETRAIN_WEB_TRACE_FAILED", "web-trace.json", String(error)); }
  const nativeRun = spawnSync("cargo", ["run", "-q", "-p", "threenative_runtime", "--bin", "threenative_physics_self_verification_trace", "--", fixtureDir, "advanced-physics-drivetrain", resolve(artifactDir, "native-trace.json"), sourceHash, bundleHash], { cwd: resolve(root, "runtime-bevy"), encoding: "utf8" });
  if (nativeRun.status !== 0) push(diagnostics, "TN_VERIFY_DRIVETRAIN_NATIVE_TRACE_FAILED", "native-trace.json", nativeRun.stderr || nativeRun.stdout || "Native trace command failed.");
  let web: AdvancedPhysicsDrivetrainTrace | undefined; let native: AdvancedPhysicsDrivetrainTrace | undefined;
  for (const [name, assign] of [["web-trace.json", (value: AdvancedPhysicsDrivetrainTrace) => { web = value; }], ["native-trace.json", (value: AdvancedPhysicsDrivetrainTrace) => { native = value; }]] as const) try { assign(JSON.parse(await readFile(resolve(artifactDir, name), "utf8"))); } catch { push(diagnostics, "TN_VERIFY_DRIVETRAIN_TRACE_MISSING", name, `${name} is missing or invalid.`); }
  if (web && native) {
    if (web.sourceHash !== sourceHash || native.sourceHash !== sourceHash || web.bundleHash !== bundleHash || native.bundleHash !== bundleHash) push(diagnostics, "TN_VERIFY_DRIVETRAIN_FIXTURE_HASH_MISMATCH", "fixtureHashes", "Trace hashes do not match the current canonical fixture.");
    diagnostics.push(...validateAdvancedPhysicsDrivetrainEvidence(web, native));
  }
  let manualStatus = "MISSING"; try { const manual = JSON.parse(await readFile(resolve(artifactDir, "manual-web-debug.json"), "utf8")); manualStatus = manual.status; const screenshot = await readFile(resolve(artifactDir, "manual-web-debug.png")); manualDiagnostics.push(...manualDrivetrainEvidenceDiagnostics(manual, { bundleHash, screenshotHash: sha256(screenshot), sourceHash })); } catch { push(manualDiagnostics, "TN_VERIFY_DRIVETRAIN_MANUAL_EVIDENCE_MISSING", "manual", "Hash-bound manual browser report or screenshot is missing."); }
  const artifactHashes: Record<string, string> = {};
  for (const name of ["web-trace.json", "native-trace.json", "manual-web-debug.json", "manual-web-debug.png"]) try { artifactHashes[`tools/verify/artifacts/advanced-physics/phase-3-drivetrain/${name}`] = sha256(await readFile(resolve(artifactDir, name))); } catch {}
  const metadata = { adapters: await adapterVersions(), artifactHashes, bundleHash, command: "pnpm verify:focused verify:advanced-physics-drivetrain", completedAt: new Date().toISOString(), fixedDelta: web?.fixedDt ?? native?.fixedDt ?? 1 / 60, platform: `${platform()}-${arch()} ${release()}`, scenario: "advanced-physics-drivetrain", schemaVersion: DRIVETRAIN_TRACE_VERSION, seed: 0, sourceHash, startedAt, toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION };
  for (const message of advancedPhysicsEvidenceMetadataDiagnostics(metadata)) push(diagnostics, "TN_VERIFY_DRIVETRAIN_METADATA_INVALID", "metadata", message);
  const allDiagnostics = [...diagnostics, ...manualDiagnostics]; const manualCheckpoint = manualDiagnostics.length === 0 ? manualStatus : manualStatus === "MISSING" ? "MISSING" : "FAIL";
  const report = { schema: "threenative.advanced-physics.phase-evidence", version: "0.1.0", phase: 3, scenario: "advanced-physics-drivetrain", status: allDiagnostics.length === 0 ? "PASS" : "FAIL", checkpoint: { automated: diagnostics.length === 0 ? "PASS" : "FAIL", manual: manualCheckpoint }, diagnosticCount: allDiagnostics.length, diagnostics: summarizeDiagnostics(allDiagnostics), metadata };
  await writeFile(resolve(artifactDir, "verification-report.json"), `${JSON.stringify(report, null, 2)}\n`); console.log(JSON.stringify(report, null, 2)); if (allDiagnostics.length) process.exitCode = 1;
}

async function generateWebTrace(sourceHash: string, bundleHash: string): Promise<AdvancedPhysicsDrivetrainTrace> {
  await initializePhysicsRuntime();
  const sourceValue: unknown = JSON.parse(await readFile(resolve(fixtureDir, "world.ir.json"), "utf8")); if (!isDrivetrainWorld(sourceValue)) throw new Error("Canonical drivetrain world does not match the typed world schema."); const source = sourceValue;
  const manifestValue: unknown = JSON.parse(await readFile(resolve(fixtureDir, "drivetrain.scenarios.json"), "utf8")); const parsedManifest = parseScenarioManifest(manifestValue); if (parsedManifest?.entity === undefined || parsedManifest.fixedDt === undefined) throw new Error("Canonical drivetrain manifest does not match the typed scenario schema.");
  const manifest = { entity: parsedManifest.entity, fixedDt: parsedManifest.fixedDt, scenarios: parsedManifest.scenarios.map(runtimeManifestScenario) };
  if (JSON.stringify(manifest.scenarios.map((item) => item.id)) !== JSON.stringify(DRIVETRAIN_SCENARIOS)) throw new Error("Scenario manifest order does not match DRIVETRAIN_SCENARIOS.");
  const run = (scenario: typeof manifest.scenarios[number]): DrivetrainScenario => {
    const world = structuredClone(source); const entity = world.entities.find((candidate) => candidate.id === manifest.entity); if (entity?.components.VehicleController === undefined || entity.components.Transform === undefined) throw new Error(`Scenario ${scenario.id} is missing the typed chassis controller or transform.`); const controller = applyControllerOverride(entity.components.VehicleController, scenario.controllerOverride); entity.components.VehicleController = controller;
    entity.components.Transform.position = structuredClone(scenario.initialPose);
    const observations = tracePhysicsVehicleControllerInputs(world, manifest.entity, manifest.fixedDt, scenario.segments) as DrivetrainSample[];
    disposePhysicsVehicleRuntime(world);
    let tick = 0; const inputs = scenario.segments.map((segment) => { const entry = { tick, input: segment.input }; tick += segment.steps; return entry; });
    return { checkpoints: scenario.checkpoints, id: scenario.id, inputs, observations, ...(scenario.outcomeBounds === undefined ? {} : { outcomeBounds: structuredClone(scenario.outcomeBounds) }), ...(scenario.id.startsWith("differential") ? { setup: { differential: controller.differential.kind, ...(controller.differential.limitedSlipRatio === undefined ? {} : { limitedSlipRatio: controller.differential.limitedSlipRatio }), surfaceRegion: "split-grip", chassisPosition: scenario.initialPose } } : {}) };
  };
  return { schema: DRIVETRAIN_TRACE_SCHEMA, version: DRIVETRAIN_TRACE_VERSION, runtime: "web", fixture: "advanced-physics-drivetrain", sourceHash, bundleHash, fixedDt: manifest.fixedDt, scenarios: manifest.scenarios.map(run) };
}

function runtimeManifestScenario(scenario: ParsedManifestScenario): RuntimeManifestScenario { const id = DRIVETRAIN_SCENARIOS.find((candidate) => candidate === scenario.id); const pose = scenario.initialPose?.position; const checkpoints = scenario.checkpoints.filter((tick): tick is number => typeof tick === "number" && Number.isInteger(tick)); const segments = scenario.segments.flatMap((segment) => validInput(segment.input) && typeof segment.label === "string" && typeof segment.steps === "number" && Number.isInteger(segment.steps) && segment.steps > 0 ? [{ input: segment.input, label: segment.label, steps: segment.steps }] : []); if (id === undefined || !isFiniteVector(pose, 3) || checkpoints.length !== scenario.checkpoints.length || segments.length !== scenario.segments.length) throw new Error(`Scenario '${scenario.id}' does not match the typed runtime manifest schema.`); const stability = scenario.outcomeBounds?.straightStability; return { checkpoints, controllerOverride: scenario.controllerOverride, id, initialPose: [pose[0]!, pose[1]!, pose[2]!], ...(validStraightStabilityBounds(stability) ? { outcomeBounds: { straightStability: stability } } : {}), segments }; }
function isDrivetrainWorld(value: unknown): value is IWorldIr { const world = record(value); return world?.schema === "threenative.world" && world.version === "0.1.0" && Array.isArray(world.entities) && world.entities.every((entity) => { const row = record(entity); return typeof row?.id === "string" && record(row.components) !== undefined; }) && (world.events === undefined || record(world.events) !== undefined) && (world.resources === undefined || record(world.resources) !== undefined); }
function applyControllerOverride(source: IVehicleControllerComponent, override: JsonRecord | undefined): IVehicleControllerComponent { const controller = structuredClone(source); if (override === undefined) return controller; const transmission = record(override.transmission); if (transmission?.shiftPolicy === "automatic" || transmission?.shiftPolicy === "manual") controller.transmission.shiftPolicy = transmission.shiftPolicy; if (typeof transmission?.downshiftRpm === "number") controller.transmission.downshiftRpm = transmission.downshiftRpm; if (typeof transmission?.upshiftRpm === "number") controller.transmission.upshiftRpm = transmission.upshiftRpm; const differential = record(override.differential); if (differential?.kind === "open" || differential?.kind === "locked" || differential?.kind === "limited-slip") controller.differential = { kind: differential.kind, ...(typeof differential.limitedSlipRatio === "number" ? { limitedSlipRatio: differential.limitedSlipRatio } : {}) }; const assists = record(override.assists); for (const name of ["abs", "tcs"] as const) { const next = record(assists?.[name]); if (next === undefined || controller.assists?.[name] === undefined || typeof next.enabled !== "boolean") continue; controller.assists[name] = { ...controller.assists[name], enabled: next.enabled }; } return controller; }
async function adapterVersions(): Promise<unknown[]> { const webPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/package.json"), "utf8")); const rapier = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/@dimforge/rapier3d-compat/package.json"), "utf8")); const three = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/three/package.json"), "utf8")); const cargo = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "utf8"); const workspace = await readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8"); return [{ adapter: "web", dependencies: { "@dimforge/rapier3d-compat": rapier.version, three: three.version }, runtime: webPackage.name, runtimeVersion: webPackage.version }, { adapter: "bevy", dependencies: { bevy: cargo.match(/^bevy\s*=\s*\{\s*version\s*=\s*"=?([^"]+)"/m)?.[1] ?? "unknown", rapier3d: cargo.match(/^rapier3d\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" }, runtime: "threenative_runtime", runtimeVersion: workspace.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" }]; }
function summarizeDiagnostics(value: DrivetrainEvidenceDiagnostic[]): DrivetrainEvidenceDiagnostic[] { const counts = new Map<string, number>(); const output: DrivetrainEvidenceDiagnostic[] = []; for (const item of value) { const count = counts.get(item.code) ?? 0; counts.set(item.code, count + 1); if (count < 3) output.push(item); } return output.map((item) => counts.get(item.code)! > 3 ? { ...item, message: `${item.message} (${counts.get(item.code)} total; representative paths capped at 3)` } : item); }
async function hashDirectory(path: string): Promise<string> { const hash = createHash("sha256"); for (const file of await listFiles(path)) { hash.update(relative(path, file)); hash.update(await readFile(file)); } return `sha256-${hash.digest("hex")}`; }
async function listFiles(path: string): Promise<string[]> { const files: string[] = []; for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) files.push(...await listFiles(child)); else files.push(child); } return files.sort(); }
function sha256(value: Uint8Array): string { return `sha256-${createHash("sha256").update(value).digest("hex")}`; }

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
