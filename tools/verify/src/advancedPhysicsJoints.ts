import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION, validateBundle, type IWorldIr } from "@threenative/ir";
import { validateAdvancedPhysicsDebugEvidence, type AdvancedPhysicsDebugEvidence } from "./advancedPhysicsDebugEvidence.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const fixtureDir = resolve(root, "packages/ir/fixtures/conformance/advanced-physics-joints/game.bundle");
const artifactDir = resolve(root, "tools/verify/artifacts/advanced-physics/phase-5-joints");

export const ADVANCED_PHYSICS_JOINT_TRACE_SCHEMA = "threenative.advanced-physics-joints-trace";
export const ADVANCED_PHYSICS_JOINT_TRACE_VERSION = "0.1.0";

type Runtime = "bevy" | "web";
type JointKind = "ball" | "fixed" | "hinge" | "rope" | "slider" | "suspension";
type Motor = { mode: "position" | "velocity"; target: number };
type Tolerance = { absolute: number; relative: number };

export interface AdvancedPhysicsJointExpectedManifest {
  fixture: "advanced-physics-joints";
  loadRamp: {
    appliedForces: number[];
    breakEvent: "break";
    breakEventCount: 1;
    breakForce: number;
    forceTolerance: Tolerance;
    joint: string;
    maximumBreakTickDelta: number;
    removalDelayTicks: number;
    torqueTolerance: Tolerance;
  };
  patchReconcile: {
    actions: Array<"initial" | "patch" | "despawn" | "spawn">;
    maximumBodyRebuilds: number;
    maximumJointRebuilds: number;
    requireUnrelatedBodyHandlesPreserved: boolean;
  };
  perKind: {
    maximumRelativePositionError: number;
    maximumRelativeRotationError: number;
    ordered: Array<{ connectedEntity: string; entity: string; kind: JointKind; motor?: Motor }>;
  };
  schema: "threenative.advanced-physics-joints-expected";
  toleranceRegistryVersion: string;
  traceSchema: typeof ADVANCED_PHYSICS_JOINT_TRACE_SCHEMA;
  traceVersion: typeof ADVANCED_PHYSICS_JOINT_TRACE_VERSION;
  version: "0.1.0";
}

export interface NormalizedJointIdentityObservation {
  active: boolean;
  connectedEntity: string;
  entity: string;
  kind: JointKind;
  lifecycle: number;
}

export interface NormalizedJointObservation extends NormalizedJointIdentityObservation {
  force: number;
  torque: number;
}

export interface NormalizedJointBreakEvent {
  connectedEntity: string;
  entity: string;
  force: number;
  kind: JointKind;
  phase: "break";
  torque: number;
}

export interface AdvancedPhysicsJointScenarios {
  fixedDt: number;
  loadRamp: {
    forcePoint: [number, number, number];
    joint: string;
    samples: Array<{ force: [number, number, number]; steps: number }>;
  };
  patchReconcile: {
    joint: string;
    steps: Array<{ action: "initial" | "patch" | "despawn" | "spawn"; patch?: unknown }>;
    unrelatedBodies: string[];
  };
  perKind: { jointIds: string[]; settleSteps: number };
  schema: "threenative.advanced-physics-joints-scenarios";
  seed: number;
  version: "0.1.0";
}

export interface AdvancedPhysicsJointTrace {
  bundleHash: string;
  fixture: "advanced-physics-joints";
  fixedDt: number;
  debugEvidence: AdvancedPhysicsDebugEvidence[];
  loadRamp: {
    events: Array<{ observation: NormalizedJointBreakEvent; tick: number }>;
    removedAtTick: number;
    samples: Array<{ appliedForce: number; observation: NormalizedJointObservation; relativePositionError: number; relativeRotationError: number; tick: number }>;
  };
  patchReconcile: {
    bodyRebuilds: number;
    jointRebuilds: number;
    steps: Array<{ action: "initial" | "patch" | "despawn" | "spawn"; observations: NormalizedJointIdentityObservation[] }>;
    unrelatedBodyHandlesPreserved: boolean;
  };
  perKind: NormalizedJointIdentityObservation[];
  runtime: Runtime;
  schema: typeof ADVANCED_PHYSICS_JOINT_TRACE_SCHEMA;
  sourceHash: string;
  version: typeof ADVANCED_PHYSICS_JOINT_TRACE_VERSION;
}

export interface JointEvidenceDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error";
  suggestedFix: string;
}

export function validateAdvancedPhysicsJointFixture(
  world: IWorldIr,
  scenarios: AdvancedPhysicsJointScenarios,
  expected: AdvancedPhysicsJointExpectedManifest,
): JointEvidenceDiagnostic[] {
  const diagnostics: JointEvidenceDiagnostic[] = [];
  if (scenarios.schema !== "threenative.advanced-physics-joints-scenarios" || scenarios.version !== "0.1.0") {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_SCENARIO_SCHEMA", "joints.scenarios.json", "Joint scenario identity is invalid.");
  }
  if (!Number.isInteger(scenarios.seed) || scenarios.seed < 0) push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_SCENARIO_SEED", "joints.scenarios.json/seed", "Joint scenario seed must be a non-negative integer.");
  if (expected.schema !== "threenative.advanced-physics-joints-expected" || expected.version !== "0.1.0" || expected.traceSchema !== ADVANCED_PHYSICS_JOINT_TRACE_SCHEMA || expected.traceVersion !== ADVANCED_PHYSICS_JOINT_TRACE_VERSION) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_EXPECTED_SCHEMA", "joint-trace.expected.json", "Expected trace manifest identity is invalid.");
  }
  if (expected.toleranceRegistryVersion !== PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_TOLERANCE_REGISTRY", "joint-trace.expected.json/toleranceRegistryVersion", "Expected trace tolerances do not identify the current physics tolerance registry.");
  }
  if (!finiteNonNegative(expected.perKind.maximumRelativePositionError) || !finiteNonNegative(expected.perKind.maximumRelativeRotationError)) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_POSE_BOUNDS", "joint-trace.expected.json/perKind", "Fixed-joint relative-pose bounds must be finite non-negative numbers.");
  }
  const authored = world.entities.flatMap((entity) => {
    const joint = entity.components.PhysicsJoint;
    return joint === undefined ? [] : [{ connectedEntity: joint.connectedEntity, entity: entity.id, kind: joint.kind, motor: joint.motor === undefined ? undefined : { mode: joint.motor.mode, target: joint.motor.target } }];
  }).sort((left, right) => left.entity.localeCompare(right.entity));
  exact(authored, expected.perKind.ordered, "world.ir.json/PhysicsJoint", "TN_VERIFY_PHYSICS_JOINT_AUTHORED_ORDER", diagnostics);
  exact(scenarios.perKind.jointIds, expected.perKind.ordered.map((joint) => joint.entity), "joints.scenarios.json/perKind/jointIds", "TN_VERIFY_PHYSICS_JOINT_SCENARIO_ORDER", diagnostics);
  exact(scenarios.patchReconcile.steps.map((step) => step.action), expected.patchReconcile.actions, "joints.scenarios.json/patchReconcile/steps", "TN_VERIFY_PHYSICS_JOINT_PATCH_SEQUENCE", diagnostics);
  if (scenarios.loadRamp.joint !== expected.loadRamp.joint || scenarios.patchReconcile.joint !== "joint.hinge") {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_SCENARIO_TARGET", "joints.scenarios.json", "Load-ramp and patch scenarios do not target the canonical joints.");
  }
  const forces = scenarios.loadRamp.samples.map((sample) => magnitude(sample.force));
  exact(forces, expected.loadRamp.appliedForces, "joints.scenarios.json/loadRamp/samples", "TN_VERIFY_PHYSICS_JOINT_LOAD_RAMP", diagnostics);
  if (!forces.some((force) => force < expected.loadRamp.breakForce) || !forces.some((force) => force > expected.loadRamp.breakForce)) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_LOAD_RAMP", "joints.scenarios.json/loadRamp/samples", "Load ramp must include samples below and above the authored break threshold.");
  }
  return diagnostics;
}

export function validateAdvancedPhysicsJointEvidence(
  web: AdvancedPhysicsJointTrace,
  native: AdvancedPhysicsJointTrace,
  expected: AdvancedPhysicsJointExpectedManifest,
): JointEvidenceDiagnostic[] {
  const diagnostics: JointEvidenceDiagnostic[] = [];
  validateIdentity(web, "web", diagnostics);
  validateIdentity(native, "bevy", diagnostics);
  if (web.sourceHash.length === 0 || web.bundleHash.length === 0 || web.sourceHash !== native.sourceHash || web.bundleHash !== native.bundleHash) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_PROVENANCE", "fixtureHashes", "Paired traces must identify the same non-empty source and bundle hashes.");
  }
  compare(web.fixedDt, native.fixedDt, { absolute: 0.000001, relative: 0.000001 }, "fixedDt", "TN_VERIFY_PHYSICS_JOINT_FIXED_DELTA", diagnostics);
  diagnostics.push(...validateAdvancedPhysicsDebugEvidence("advanced-physics-joints", web.debugEvidence ?? [], native.debugEvidence ?? []));
  const expectedIdentities = expected.perKind.ordered.map(({ connectedEntity, entity, kind }) => ({ connectedEntity, entity, kind }));
  for (const [runtime, trace] of [["web", web], ["native", native]] as const) {
    exact(trace.perKind.map(({ connectedEntity, entity, kind }) => ({ connectedEntity, entity, kind })), expectedIdentities, `${runtime}/perKind`, "TN_VERIFY_PHYSICS_JOINT_KIND_ORDER", diagnostics);
    trace.perKind.forEach((joint, index) => {
      if (!joint.active || !Number.isInteger(joint.lifecycle) || joint.lifecycle < 0) {
        push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_KIND_OUTCOME", `${runtime}/perKind/${index}`, "Joint observation must be active with a finite non-negative lifecycle field.");
      }
    });
    validateLoadRamp(runtime, trace, expected, diagnostics);
    validatePatchReconcile(runtime, trace, expected, diagnostics);
  }
  if (web.loadRamp.samples.length === native.loadRamp.samples.length) {
    web.loadRamp.samples.forEach((sample, index) => {
      const other = native.loadRamp.samples[index];
      if (other === undefined) return;
      exact([sample.tick, sample.appliedForce], [other.tick, other.appliedForce], `loadRamp/samples/${index}`, "TN_VERIFY_PHYSICS_JOINT_LOAD_ORDER", diagnostics);
      compare(sample.observation.force, other.observation.force, expected.loadRamp.forceTolerance, `loadRamp/samples/${index}/force`, "TN_VERIFY_PHYSICS_JOINT_LOAD_PARITY", diagnostics);
      compare(sample.observation.torque, other.observation.torque, expected.loadRamp.torqueTolerance, `loadRamp/samples/${index}/torque`, "TN_VERIFY_PHYSICS_JOINT_LOAD_PARITY", diagnostics);
      compare(sample.relativePositionError, other.relativePositionError, { absolute: 0.005, relative: 0.05 }, `loadRamp/samples/${index}/relativePositionError`, "TN_VERIFY_PHYSICS_JOINT_POSE_PARITY", diagnostics);
      compare(sample.relativeRotationError, other.relativeRotationError, { absolute: 0.005, relative: 0.05 }, `loadRamp/samples/${index}/relativeRotationError`, "TN_VERIFY_PHYSICS_JOINT_POSE_PARITY", diagnostics);
    });
  } else {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_LOAD_ORDER", "loadRamp/samples", "Paired traces contain different load-ramp sample counts.");
  }
  const webBreak = web.loadRamp.events[0]?.tick;
  const nativeBreak = native.loadRamp.events[0]?.tick;
  if (webBreak === undefined || nativeBreak === undefined || Math.abs(webBreak - nativeBreak) > expected.loadRamp.maximumBreakTickDelta) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_BREAK_TICK_PARITY", "loadRamp/events", "Paired traces break outside the manifest-owned tick delta.");
  }
  const webEvent = web.loadRamp.events[0]?.observation;
  const nativeEvent = native.loadRamp.events[0]?.observation;
  if (webEvent !== undefined && nativeEvent !== undefined) {
    exact(
      [webEvent.connectedEntity, webEvent.entity, webEvent.kind, webEvent.phase],
      [nativeEvent.connectedEntity, nativeEvent.entity, nativeEvent.kind, nativeEvent.phase],
      "loadRamp/events/0",
      "TN_VERIFY_PHYSICS_JOINT_BREAK_EVENT_PARITY",
      diagnostics,
    );
    compare(webEvent.force, nativeEvent.force, expected.loadRamp.forceTolerance, "loadRamp/events/0/force", "TN_VERIFY_PHYSICS_JOINT_LOAD_PARITY", diagnostics);
    compare(webEvent.torque, nativeEvent.torque, expected.loadRamp.torqueTolerance, "loadRamp/events/0/torque", "TN_VERIFY_PHYSICS_JOINT_LOAD_PARITY", diagnostics);
  }
  compareLifecycleDeltas(web.loadRamp.samples.map((sample) => sample.observation.lifecycle), native.loadRamp.samples.map((sample) => sample.observation.lifecycle), "loadRamp/lifecycle", diagnostics);
  compareLifecycleDeltas(patchLifecycle(web), patchLifecycle(native), "patchReconcile/lifecycle", diagnostics);
  return diagnostics;
}

function validateIdentity(trace: AdvancedPhysicsJointTrace, runtime: Runtime, diagnostics: JointEvidenceDiagnostic[]): void {
  if (trace.schema !== ADVANCED_PHYSICS_JOINT_TRACE_SCHEMA || trace.version !== ADVANCED_PHYSICS_JOINT_TRACE_VERSION || trace.fixture !== "advanced-physics-joints" || trace.runtime !== runtime) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_TRACE_SCHEMA", `${runtime}/trace`, "Trace identity is invalid.");
  }
}

function validateLoadRamp(runtime: string, trace: AdvancedPhysicsJointTrace, expected: AdvancedPhysicsJointExpectedManifest, diagnostics: JointEvidenceDiagnostic[]): void {
  exact(trace.loadRamp.samples.map((sample) => sample.appliedForce), expected.loadRamp.appliedForces, `${runtime}/loadRamp/samples`, "TN_VERIFY_PHYSICS_JOINT_LOAD_ORDER", diagnostics);
  validateMonotonicLifecycle(trace.loadRamp.samples.map((sample) => sample.observation.lifecycle), `${runtime}/loadRamp/lifecycle`, diagnostics);
  trace.loadRamp.samples.forEach((sample, index) => {
    if (sample.appliedForce < expected.loadRamp.breakForce && (!finiteNonNegative(sample.relativePositionError) || sample.relativePositionError > expected.perKind.maximumRelativePositionError || !finiteNonNegative(sample.relativeRotationError) || sample.relativeRotationError > expected.perKind.maximumRelativeRotationError)) {
      push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_FIXED_LOAD_HOLD", `${runtime}/loadRamp/samples/${index}`, "Fixed-joint relative pose exceeded the manifest-owned bound below its break threshold.");
    }
  });
  const expectedJoint = expected.perKind.ordered.find((joint) => joint.entity === expected.loadRamp.joint);
  const events = trace.loadRamp.events.filter((event) => event.observation.entity === expected.loadRamp.joint && event.observation.phase === expected.loadRamp.breakEvent);
  if (events.length !== expected.loadRamp.breakEventCount) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_BREAK_ONCE", `${runtime}/loadRamp/events`, "The joint must emit exactly one normalized break event.");
  }
  const event = events[0]?.observation;
  if (event !== undefined && (event.connectedEntity !== expectedJoint?.connectedEntity || event.kind !== expectedJoint?.kind || !finiteNonNegative(event.force) || !finiteNonNegative(event.torque) || event.force < expected.loadRamp.breakForce)) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_BREAK_PAYLOAD", `${runtime}/loadRamp/events/0`, "Break event identity or normalized load does not match the expected threshold crossing.");
  }
  if (events[0] !== undefined && trace.loadRamp.removedAtTick !== events[0].tick + expected.loadRamp.removalDelayTicks) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_SAFE_REMOVAL", `${runtime}/loadRamp/removedAtTick`, "The broken joint must be absent on the next declared safe tick.");
  }
}

function validatePatchReconcile(runtime: string, trace: AdvancedPhysicsJointTrace, expected: AdvancedPhysicsJointExpectedManifest, diagnostics: JointEvidenceDiagnostic[]): void {
  exact(trace.patchReconcile.steps.map((step) => step.action), expected.patchReconcile.actions, `${runtime}/patchReconcile/steps`, "TN_VERIFY_PHYSICS_JOINT_PATCH_SEQUENCE", diagnostics);
  const target = expected.perKind.ordered.find((joint) => joint.entity === "joint.hinge");
  const targetByStep = trace.patchReconcile.steps.map((step) => step.observations.find((observation) => observation.entity === target?.entity));
  if (targetByStep[0]?.active !== true || targetByStep[1]?.active !== true || targetByStep[2]?.active === true || targetByStep[3]?.active !== true) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_PATCH_LIFECYCLE", `${runtime}/patchReconcile/steps`, "Patched joint must remain active, disappear on despawn, and return on spawn.");
  }
  validateMonotonicLifecycle(targetByStep.flatMap((observation) => observation === undefined ? [] : [observation.lifecycle]), `${runtime}/patchReconcile/lifecycle`, diagnostics);
  if (trace.patchReconcile.bodyRebuilds > expected.patchReconcile.maximumBodyRebuilds || trace.patchReconcile.jointRebuilds > expected.patchReconcile.maximumJointRebuilds) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_REBUILD_BUDGET", `${runtime}/patchReconcile`, "Patch reconciliation exceeds the manifest-owned body or joint rebuild budget.");
  }
  if (expected.patchReconcile.requireUnrelatedBodyHandlesPreserved && !trace.patchReconcile.unrelatedBodyHandlesPreserved) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_UNRELATED_HANDLE_CHURN", `${runtime}/patchReconcile/unrelatedBodyHandlesPreserved`, "A joint patch changed unrelated body handles.");
  }
}

function patchLifecycle(trace: AdvancedPhysicsJointTrace): number[] {
  return trace.patchReconcile.steps.flatMap((step) => step.observations.find((observation) => observation.entity === "joint.hinge")?.lifecycle ?? []);
}

function validateMonotonicLifecycle(values: readonly number[], path: string, diagnostics: JointEvidenceDiagnostic[]): void {
  if (values.some((value, index) => !Number.isInteger(value) || value < 0 || (index > 0 && value < values[index - 1]!))) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_LIFECYCLE_ORDER", path, "Adapter-local lifecycle values must be finite non-negative monotonic integers.");
  }
}

function compareLifecycleDeltas(web: readonly number[], native: readonly number[], path: string, diagnostics: JointEvidenceDiagnostic[]): void {
  const deltas = (values: readonly number[]) => values.slice(1).map((value, index) => value - values[index]!);
  exact(deltas(web), deltas(native), path, "TN_VERIFY_PHYSICS_JOINT_LIFECYCLE_PARITY", diagnostics);
}

async function main(): Promise<void> {
  const startedAt = new Date().toISOString();
  await mkdir(artifactDir, { recursive: true });
  const diagnostics: JointEvidenceDiagnostic[] = [];
  const world = JSON.parse(await readFile(resolve(fixtureDir, "world.ir.json"), "utf8")) as IWorldIr;
  const scenarios = JSON.parse(await readFile(resolve(fixtureDir, "joints.scenarios.json"), "utf8")) as AdvancedPhysicsJointScenarios;
  const expected = JSON.parse(await readFile(resolve(fixtureDir, "joint-trace.expected.json"), "utf8")) as AdvancedPhysicsJointExpectedManifest;
  diagnostics.push(...validateAdvancedPhysicsJointFixture(world, scenarios, expected));
  const validation = await validateBundle(fixtureDir);
  if (!validation.ok) push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_FIXTURE_INVALID", "game.bundle", JSON.stringify(validation.diagnostics));
  const sourceHash = sha256(await readFile(resolve(fixtureDir, "world.ir.json")));
  const bundleHash = await hashDirectory(fixtureDir);
  let web: AdvancedPhysicsJointTrace | undefined;
  const runtime = await import("@threenative/runtime-web-three") as Record<string, unknown>;
  const traceWeb = runtime.traceAdvancedPhysicsJoints;
  if (typeof traceWeb !== "function") {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_WEB_TRACE_UNAVAILABLE", "packages/runtime-web-three", "The web adapter has not exposed the Phase 5 normalized joint trace entry point.");
  } else {
    web = await (traceWeb as (input: unknown) => Promise<AdvancedPhysicsJointTrace> | AdvancedPhysicsJointTrace)({ bundleHash, expected, fixtureDir, scenarios, sourceHash, world });
    await writeJson(resolve(artifactDir, "web-trace.json"), web);
  }
  const nativePath = resolve(artifactDir, "native-trace.json");
  const nativeRun = spawnSync("cargo", ["run", "-q", "-p", "threenative_runtime", "--bin", "threenative_physics_self_verification_trace", "--", fixtureDir, "advanced-physics-joints", nativePath, sourceHash, bundleHash], { cwd: resolve(root, "runtime-bevy"), encoding: "utf8" });
  let native: AdvancedPhysicsJointTrace | undefined;
  if (nativeRun.status !== 0) {
    push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_NATIVE_TRACE_FAILED", "runtime-bevy", nativeRun.stderr || nativeRun.stdout || "Native joint trace failed.");
  } else {
    try { native = JSON.parse(await readFile(nativePath, "utf8")) as AdvancedPhysicsJointTrace; } catch { push(diagnostics, "TN_VERIFY_PHYSICS_JOINT_NATIVE_TRACE_MISSING", "native-trace.json", "Native joint trace is missing or invalid."); }
  }
  if (web !== undefined && native !== undefined) diagnostics.push(...validateAdvancedPhysicsJointEvidence(web, native, expected));
  const webPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/package.json"), "utf8")) as { dependencies?: Record<string, string>; version?: string };
  const nativeCargo = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "utf8");
  const workspaceCargo = await readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8");
  const artifactHashes: Record<string, string> = {};
  for (const path of [resolve(artifactDir, "web-trace.json"), nativePath]) {
    try { artifactHashes[repoRelative(path)] = sha256(await readFile(path)); } catch {}
  }
  const report = {
    artifacts: { nativeTrace: repoRelative(nativePath), webTrace: repoRelative(resolve(artifactDir, "web-trace.json")) },
    artifactHashes,
    checkpoint: { automated: diagnostics.length === 0 ? "PASS" : "FAIL" },
    diagnosticCount: diagnostics.length,
    diagnostics,
    generatedBy: "tools/verify/src/advancedPhysicsJoints.ts",
    metadata: {
      bundleHash,
      command: "pnpm verify:focused verify:advanced-physics-joints",
      completedAt: new Date().toISOString(),
      dependencyVersions: { rapierJs: webPackage.dependencies?.["@dimforge/rapier3d-compat"] ?? "unknown", rapierRust: nativeCargo.match(/rapier3d\s*=\s*"([^"]+)"/)?.[1] ?? "unknown" },
      fixedDelta: scenarios.fixedDt,
      platform: `${process.platform}-${process.arch}`,
      runtimeAdapters: ["web-three", "bevy"],
      runtimeVersions: { bevy: workspaceCargo.match(/version\s*=\s*"([^"]+)"/)?.[1] ?? "unknown", web: webPackage.version ?? "unknown" },
      scenario: "advanced-physics-joints",
      schemaVersion: ADVANCED_PHYSICS_JOINT_TRACE_VERSION,
      seed: scenarios.seed,
      sourceHash,
      startedAt,
      toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION,
    },
    phase: 5,
    scenario: "advanced-physics-joints",
    schema: "threenative.advanced-physics.phase-evidence",
    status: diagnostics.length === 0 ? "PASS" : "FAIL",
    version: "0.1.0",
  };
  await writeJson(resolve(artifactDir, "verification-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
  if (diagnostics.length > 0) process.exitCode = 1;
}

function compare(left: number, right: number, tolerance: Tolerance, path: string, code: string, diagnostics: JointEvidenceDiagnostic[]): void {
  if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > Math.max(tolerance.absolute, Math.max(Math.abs(left), Math.abs(right)) * tolerance.relative)) push(diagnostics, code, path, `Numeric values ${left} and ${right} exceed the owned tolerance.`);
}

function exact(left: unknown, right: unknown, path: string, code: string, diagnostics: JointEvidenceDiagnostic[]): void {
  if (stableJson(left) !== stableJson(right)) push(diagnostics, code, path, `Expected ${JSON.stringify(right)}, received ${JSON.stringify(left)}.`);
}

function finiteNonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function magnitude(value: readonly number[]): number { return Math.hypot(...value); }
function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, child]) => child !== undefined).sort(([left], [right]) => left.localeCompare(right)).map(([key, child]) => `${JSON.stringify(key)}:${stableJson(child)}`).join(",")}}`;
  return JSON.stringify(value);
}
function push(diagnostics: JointEvidenceDiagnostic[], code: string, path: string, message: string): void { diagnostics.push({ code, message, path, severity: "error", suggestedFix: "Regenerate both normalized joint traces from the canonical fixture and fix the owning runtime boundary." }); }
function repoRelative(path: string): string { return relative(root, path).replaceAll("\\", "/"); }
function sha256(value: Uint8Array): string { return `sha256-${createHash("sha256").update(value).digest("hex")}`; }
async function writeJson(path: string, value: unknown): Promise<void> { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
async function hashDirectory(path: string): Promise<string> { const hash = createHash("sha256"); for (const file of await listFiles(path)) { hash.update(relative(path, file)); hash.update(await readFile(file)); } return `sha256-${hash.digest("hex")}`; }
async function listFiles(path: string): Promise<string[]> { const files: string[] = []; for (const entry of await readdir(path, { withFileTypes: true })) { const child = resolve(path, entry.name); if (entry.isDirectory()) files.push(...await listFiles(child)); else files.push(child); } return files.sort(); }

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
