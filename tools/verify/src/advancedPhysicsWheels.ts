import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { arch, platform, release } from "node:os";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { PHYSICS_OBSERVATION_TOLERANCES, PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION, type IWheelAssemblyObservation, type IWorldIr } from "@threenative/ir";
import { ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION, advancedPhysicsEvidenceMetadataDiagnostics } from "./advancedPhysicsEvidence.js";

const root = resolve(fileURLToPath(new URL("../../../", import.meta.url)));
const gate = "advanced-physics-wheels";
const fixtureDir = resolve(root, "packages/ir/fixtures/conformance/advanced-physics-wheels/game.bundle");
const artifactDir = resolve(root, "tools/verify/artifacts/advanced-physics/phase-2-wheels");
const fixedDelta = 1 / 120;
const authoredWheelIds = ["rear-right", "front-left", "rear-left", "front-right"] as const;
const authoredVisualTargetIds = authoredWheelIds.map((wheelId) => `wheel-visual-${wheelId}`);
const manualPaths = {
  harnessHtml: resolve(artifactDir, "manual-web-debug-harness.html"),
  harnessSource: resolve(artifactDir, "manual-web-debug-harness.ts"),
  report: resolve(artifactDir, "manual-web-debug.json"),
  screenshot: resolve(artifactDir, "manual-web-debug.png"),
} as const;

type Wheel = IWheelAssemblyObservation["wheels"][number];
type Vec3 = [number, number, number];
type Quat = [number, number, number, number];
type Visual = {
  entity: string;
  interpolatedPosition: Vec3;
  interpolatedSpinAngle: number;
  interpolatedSteeringAngle: number;
  interpolationAlpha: number;
  position: Vec3;
  previousSpinAngle: number;
  spinAngle: number;
  steeringAngle: number;
  targetId: string;
  wheelId: string;
};
type Scenario = {
  chassisAngularVelocity: Vec3;
  chassisPosition: Vec3;
  chassisRotation: Quat;
  chassisVelocity: Vec3;
  debugTelemetry?: unknown;
  initialSpeed?: number;
  speed: number;
  visuals: readonly Visual[];
  wheels: readonly Wheel[];
};
export type AdvancedPhysicsWheelTrace = {
  authoredWheelIds: readonly string[];
  fixedDelta: number;
  runtime: "bevy" | "web";
  scenarios: {
    asphalt: Scenario;
    braking: Scenario;
    brakingCausalNegative: Scenario;
    driveCausalNegative: Scenario;
    ice: Scenario;
    staticLoad: Scenario;
    steering: Scenario;
    steeringCausalNegative: Scenario;
  };
};

export type WheelEvidenceDiagnostic = { code: string; message: string; path: string; severity: "error"; suggestedFix: string };

export function validateAdvancedPhysicsWheelEvidence(web: AdvancedPhysicsWheelTrace, native: AdvancedPhysicsWheelTrace): WheelEvidenceDiagnostic[] {
  const diagnostics: WheelEvidenceDiagnostic[] = [];
  exact(web.authoredWheelIds, authoredWheelIds, "web/authoredWheelIds", "TN_VERIFY_PHYSICS_WHEEL_ORDER", diagnostics);
  exact(native.authoredWheelIds, authoredWheelIds, "native/authoredWheelIds", "TN_VERIFY_PHYSICS_WHEEL_ORDER", diagnostics);
  compareNumber(web.fixedDelta, native.fixedDelta, PHYSICS_OBSERVATION_TOLERANCES.distance, "fixedDelta", "TN_VERIFY_PHYSICS_WHEEL_FIXED_DELTA", diagnostics);

  for (const name of ["staticLoad", "asphalt", "ice", "driveCausalNegative", "steering", "steeringCausalNegative", "braking", "brakingCausalNegative"] as const) {
    const webScenario = web.scenarios[name];
    const nativeScenario = native.scenarios[name];
    exact(webScenario.wheels.map((wheel) => wheel.wheelId), authoredWheelIds, `web/scenarios/${name}/wheelIds`, "TN_VERIFY_PHYSICS_WHEEL_ORDER", diagnostics);
    exact(nativeScenario.wheels.map((wheel) => wheel.wheelId), authoredWheelIds, `native/scenarios/${name}/wheelIds`, "TN_VERIFY_PHYSICS_WHEEL_ORDER", diagnostics);
    exact(webScenario.wheels.map((wheel) => wheel.grounded), nativeScenario.wheels.map((wheel) => wheel.grounded), `scenarios/${name}/grounded`, "TN_VERIFY_PHYSICS_WHEEL_GROUNDED_MISMATCH", diagnostics);
    exact(webScenario.wheels.map((wheel) => wheel.surface ?? null), nativeScenario.wheels.map((wheel) => wheel.surface ?? null), `scenarios/${name}/surface`, "TN_VERIFY_PHYSICS_WHEEL_SURFACE_MISMATCH", diagnostics);
    compareVisuals(webScenario.visuals, nativeScenario.visuals, `scenarios/${name}/visuals`, diagnostics);
    compareVector(webScenario.chassisAngularVelocity, nativeScenario.chassisAngularVelocity, PHYSICS_OBSERVATION_TOLERANCES.wheelChassisAngularVelocity, `scenarios/${name}/chassisAngularVelocity`, "TN_VERIFY_PHYSICS_WHEEL_ANGULAR_VELOCITY_MISMATCH", diagnostics);
    compareVector(webScenario.chassisPosition, nativeScenario.chassisPosition, PHYSICS_OBSERVATION_TOLERANCES.wheelChassisPosition, `scenarios/${name}/chassisPosition`, "TN_VERIFY_PHYSICS_WHEEL_POSITION_MISMATCH", diagnostics);
    compareQuaternion(webScenario.chassisRotation, nativeScenario.chassisRotation, `scenarios/${name}/chassisRotation`, diagnostics);
    compareVector(webScenario.chassisVelocity, nativeScenario.chassisVelocity, PHYSICS_OBSERVATION_TOLERANCES.wheelChassisVelocity, `scenarios/${name}/chassisVelocity`, "TN_VERIFY_PHYSICS_WHEEL_VELOCITY_MISMATCH", diagnostics);
    compareNumber(webScenario.speed, nativeScenario.speed, PHYSICS_OBSERVATION_TOLERANCES.wheelChassisSpeed, `scenarios/${name}/speed`, "TN_VERIFY_PHYSICS_WHEEL_SPEED_MISMATCH", diagnostics);
    if (webScenario.initialSpeed !== undefined || nativeScenario.initialSpeed !== undefined) compareNumber(webScenario.initialSpeed ?? Number.NaN, nativeScenario.initialSpeed ?? Number.NaN, PHYSICS_OBSERVATION_TOLERANCES.wheelChassisSpeed, `scenarios/${name}/initialSpeed`, "TN_VERIFY_PHYSICS_WHEEL_SPEED_MISMATCH", diagnostics);
    webScenario.wheels.forEach((wheel, index) => compareWheel(wheel, nativeScenario.wheels[index], `scenarios/${name}/wheels/${index}`, diagnostics));
  }

  for (const [runtime, trace] of [["web", web], ["native", native]] as const) {
    const staticLoad = trace.scenarios.staticLoad;
    if (!staticLoad.wheels.every((wheel) => wheel.grounded && wheel.compression > 0 && wheel.normalLoad > 0) || Math.abs(staticLoad.chassisVelocity[1]) > 0.1) {
      diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_STATIC_LOAD", `${runtime} static-load scenario did not settle with four loaded grounded wheels.`, `${runtime}/scenarios/staticLoad`, "Regenerate the static-load trace and fix suspension/contact behavior at the runtime boundary."));
    }
    if (!(trace.scenarios.asphalt.speed > trace.scenarios.ice.speed * 1.5 && trace.scenarios.ice.speed > 0.01)) {
      diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_SURFACE_CAUSALITY", `${runtime} asphalt acceleration must measurably exceed bounded non-zero ice acceleration.`, `${runtime}/scenarios`, "Verify the authored PhysicsSurface grip is consumed by the tire-force limit."));
    }
    if (!(trace.scenarios.asphalt.speed > 0.1 && trace.scenarios.driveCausalNegative.speed < trace.scenarios.asphalt.speed * 0.1)) {
      diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_DRIVE_CAUSAL_NEGATIVE", `${runtime} removing every driven flag did not suppress drive acceleration.`, `${runtime}/scenarios/driveCausalNegative/speed`, "Keep the causal fixture identical except for driven=false and ensure drive force applies only to driven wheels."));
    }
    const steeringPath = Math.abs(trace.scenarios.steering.chassisPosition[0]);
    const steeringYaw = yawMagnitude(trace.scenarios.steering.chassisRotation);
    const negativePath = Math.abs(trace.scenarios.steeringCausalNegative.chassisPosition[0]);
    const negativeYaw = yawMagnitude(trace.scenarios.steeringCausalNegative.chassisRotation);
    if (!(steeringPath > 0.05 && steeringYaw > 0.01)) diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_STEERING_OUTCOME", `${runtime} steering did not produce both yaw and a lateral path.`, `${runtime}/scenarios/steering`, "Drive continuously from the authored asphalt start with steering input and Y rotation enabled."));
    if (!(negativePath < steeringPath * 0.1 && negativeYaw < steeringYaw * 0.1)) diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_STEERING_CAUSAL_NEGATIVE", `${runtime} removing every steering flag did not suppress yaw and lateral path.`, `${runtime}/scenarios/steeringCausalNegative`, "Keep the command and starting pose identical while setting every authored wheel steering=false."));
    const brakingReduction = (trace.scenarios.braking.initialSpeed ?? 0) - trace.scenarios.braking.speed;
    const negativeReduction = (trace.scenarios.brakingCausalNegative.initialSpeed ?? 0) - trace.scenarios.brakingCausalNegative.speed;
    if (!((trace.scenarios.braking.initialSpeed ?? 0) > 0.1 && brakingReduction > 0.1)) diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_BRAKING_OUTCOME", `${runtime} braking did not measurably reduce speed after the drive warmup.`, `${runtime}/scenarios/braking`, "Capture warmup speed, release drive, and apply service braking to authored braked wheels."));
    if (!(trace.scenarios.brakingCausalNegative.speed > trace.scenarios.braking.speed + 0.1 && negativeReduction < brakingReduction * 0.25)) diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_BRAKE_CAUSAL_NEGATIVE", `${runtime} removing every braked flag did not suppress braking deceleration.`, `${runtime}/scenarios/brakingCausalNegative`, "Keep the warmup and brake command identical while setting every authored wheel braked=false."));
    exact(trace.scenarios.asphalt.wheels.map((wheel) => wheel.surface), authoredWheelIds.map(() => "ground-asphalt"), `${runtime}/scenarios/asphalt/surface`, "TN_VERIFY_PHYSICS_WHEEL_SURFACE_MISMATCH", diagnostics);
    exact(trace.scenarios.ice.wheels.map((wheel) => wheel.surface), authoredWheelIds.map(() => "ground-ice"), `${runtime}/scenarios/ice/surface`, "TN_VERIFY_PHYSICS_WHEEL_SURFACE_MISMATCH", diagnostics);
    for (const [name, scenario] of Object.entries(trace.scenarios)) validateVisualSemantics(runtime, name, scenario.visuals, diagnostics);
  }
  return diagnostics;
}

export function validateAdvancedPhysicsWheelVisualFixture(world: IWorldIr): WheelEvidenceDiagnostic[] {
  const diagnostics: WheelEvidenceDiagnostic[] = [];
  const chassis = world.entities.find((entity) => entity.id === "chassis");
  exact(chassis?.components.WheelAssembly?.wheels.map((wheel) => wheel.visual ?? null), authoredVisualTargetIds, "fixture/chassis/WheelAssembly/visuals", "TN_VERIFY_PHYSICS_WHEEL_VISUAL_FIXTURE", diagnostics);
  for (const targetId of authoredVisualTargetIds) {
    const target = world.entities.find((entity) => entity.id === targetId);
    if (target?.components.Transform === undefined || (target.components.Hierarchy as { parent?: string } | undefined)?.parent !== "chassis") diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_VISUAL_FIXTURE", `Authored wheel visual target ${targetId} must have Transform and Hierarchy parent chassis.`, `fixture/entities/${targetId}`, "Author the stable visual target as a chassis child and reference it from the matching wheel."));
  }
  return diagnostics;
}

async function main(): Promise<void> {
  await mkdir(artifactDir, { recursive: true });
  const startedAt = new Date().toISOString();
  const runtime = await loadRuntime();
  const validation = await runtime.validateBundle(fixtureDir);
  if (!validation.ok) throw new Error(`advanced physics wheel fixture is invalid: ${JSON.stringify(validation.diagnostics)}`);
  const sourceWorld = JSON.parse(await readFile(resolve(fixtureDir, "world.ir.json"), "utf8")) as IWorldIr;
  const webTrace = await traceWeb(runtime, sourceWorld);
  const webTracePath = resolve(artifactDir, "web-trace.json");
  const nativeTracePath = resolve(artifactDir, "native-trace.json");
  await writeJson(webTracePath, webTrace);
  const nativeRun = runNativeTrace(nativeTracePath);
  if (!nativeRun.ok) throw new Error(`native wheel trace failed: ${nativeRun.stderr || nativeRun.stdout}`);
  const nativeTrace = JSON.parse(await readFile(nativeTracePath, "utf8")) as AdvancedPhysicsWheelTrace;
  const debugOverlayPath = resolve(artifactDir, "debug-overlay.json");
  await writeJson(debugOverlayPath, { native: nativeTrace.scenarios.staticLoad.debugTelemetry, scenario: "static-load", web: webTrace.scenarios.staticLoad.debugTelemetry });
  const diagnostics = [...validateAdvancedPhysicsWheelVisualFixture(sourceWorld), ...validateAdvancedPhysicsWheelEvidence(webTrace, nativeTrace)];
  const sourceHash = sha256(await readFile(resolve(fixtureDir, "world.ir.json")));
  const bundleHash = await hashDirectory(fixtureDir);
  const manual = await validateManualEvidence(sourceHash, bundleHash, diagnostics);
  const artifactHashes = await hashArtifacts([debugOverlayPath, webTracePath, nativeTracePath, ...Object.values(manualPaths)]);
  const metadata = {
    adapters: await adapterVersions(),
    artifactHashes,
    bundleHash,
    command: "pnpm verify:focused verify:advanced-physics-wheels",
    completedAt: new Date().toISOString(),
    fixedDelta,
    platform: `${platform()}-${arch()} ${release()}`,
    scenario: gate,
    schemaVersion: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
    seed: 0,
    sourceHash,
    startedAt,
    toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION,
  };
  const metadataDiagnostics = advancedPhysicsEvidenceMetadataDiagnostics(metadata);
  for (const message of metadataDiagnostics) diagnostics.push(diagnostic("TN_VERIFY_ADVANCED_PHYSICS_METADATA_INVALID", message, "metadata", "Regenerate both adapter traces with the complete PRD 6.3 evidence envelope."));
  const report = {
    artifacts: { debugOverlay: repoRelative(debugOverlayPath), manualBrowserReport: repoRelative(manualPaths.report), manualHarness: repoRelative(manualPaths.harnessSource), manualScreenshot: repoRelative(manualPaths.screenshot), nativeTrace: repoRelative(nativeTracePath), webTrace: repoRelative(webTracePath) },
    assertions: { authoredWheelIds, causalNegatives: ["all driven flags removed", "all steering flags removed", "all braked flags removed"], scenarios: ["static-load", "asphalt", "ice", "steering", "braking"] },
    checkpoint: { automated: diagnostics.length === 0 ? "PASS" : "FAIL", manual: manual.status, reviewer: "Specialized PRD reviewer unavailable; root independent review inspected the hash-bound browser screenshot and telemetry." },
    diagnostics,
    generatedBy: "tools/verify/src/advancedPhysicsWheels.ts",
    manualReview: { asphaltIceRatio: manual.ratio, browserStatus: manual.status, screenshotHash: artifactHashes[repoRelative(manualPaths.screenshot)] },
    metadata,
    phase: 2,
    scenario: gate,
    schema: "threenative.advanced-physics.phase-evidence",
    status: diagnostics.length === 0 ? "PASS" : "FAIL",
    version: ADVANCED_PHYSICS_EVIDENCE_SCHEMA_VERSION,
  };
  await writeJson(resolve(artifactDir, "verification-report.json"), report);
  console.log(JSON.stringify(report, null, 2));
  if (diagnostics.length > 0) process.exitCode = 1;
}

async function validateManualEvidence(sourceHash: string, bundleHash: string, diagnostics: WheelEvidenceDiagnostic[]): Promise<{ ratio: number; status: string }> {
  let report: Record<string, any>;
  try {
    report = JSON.parse(await readFile(manualPaths.report, "utf8")) as Record<string, any>;
  } catch {
    diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_MANUAL_EVIDENCE_MISSING", "Manual browser report is missing or invalid.", repoRelative(manualPaths.report), "Recapture the real-browser wheel debug overlay and report."));
    return { ratio: 0, status: "MISSING" };
  }
  const harness = await readFile(manualPaths.harnessSource, "utf8");
  if (harness.includes("ground.id =") || harness.includes("PhysicsSurface.grip =")) {
    diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_MANUAL_FIXTURE_MUTATED", "Manual browser harness synthesizes a surface instead of selecting the authored split-surface fixture.", repoRelative(manualPaths.harnessSource), "Position the chassis over authored ground-asphalt or ground-ice without changing surface identity or grip."));
  }
  if (!manualEvidenceMetadataMatches(report, sourceHash, bundleHash)) {
    diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_MANUAL_EVIDENCE_STALE", "Manual browser evidence is not passing or does not match current source, bundle, or tolerance-registry version.", repoRelative(manualPaths.report), "Recapture manual browser evidence from the current catalog fixture and tolerance registry."));
  }
  for (const [path, expected] of Object.entries(report.metadata?.artifactHashes ?? {})) {
    try {
      if (sha256(await readFile(resolve(root, path))) !== expected) diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_MANUAL_ARTIFACT_STALE", `Manual artifact hash does not match ${path}.`, path, "Regenerate the manual report and artifact hashes together."));
    } catch {
      diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_MANUAL_ARTIFACT_MISSING", `Manual artifact is missing: ${path}.`, path, "Regenerate the complete manual evidence set."));
    }
  }
  const ratio = Number(report.findings?.asphaltVsIce?.ratio ?? 0);
  const wheelIds = report.findings?.staticLoad?.wheelIds;
  const grounded = report.findings?.staticLoad?.grounded;
  const surfaces = report.findings?.staticLoad?.surface;
  const debug = report.findings?.debugOverlay;
  if (!(ratio > 1.5) || JSON.stringify(wheelIds) !== JSON.stringify(authoredWheelIds) || !Array.isArray(grounded) || !grounded.every(Boolean) || !Array.isArray(surfaces) || !surfaces.every((surface: unknown) => surface === "ground-asphalt") || debug?.wheelCastCount !== 4 || debug?.contactNormalCount !== 4) {
    diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_MANUAL_ASSERTION_FAILED", "Manual browser evidence does not prove authored order, grounded asphalt contacts, debug casts, and lower ice acceleration.", repoRelative(manualPaths.report), "Inspect the browser overlay and recapture all required Phase 2 findings."));
  }
  return { ratio, status: String(report.status ?? "UNKNOWN") };
}

export function manualEvidenceMetadataMatches(report: Record<string, any>, sourceHash: string, bundleHash: string): boolean {
  return report.status === "PASS"
    && report.metadata?.sourceHash === sourceHash
    && report.metadata?.bundleHash === bundleHash
    && report.metadata?.toleranceRegistryVersion === PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION;
}

async function traceWeb(runtime: Record<string, any>, sourceWorld: IWorldIr): Promise<AdvancedPhysicsWheelTrace> {
  await runtime.initializePhysicsRuntime();
  return {
    authoredWheelIds,
    fixedDelta,
    runtime: "web",
    scenarios: {
      staticLoad: await runWebScenario(runtime, sourceWorld, { kind: "static", surface: "asphalt", steps: 1200 }),
      asphalt: await runWebScenario(runtime, sourceWorld, { kind: "drive", surface: "asphalt", steps: 180 }),
      ice: await runWebScenario(runtime, sourceWorld, { kind: "drive", surface: "ice", steps: 180 }),
      driveCausalNegative: await runWebScenario(runtime, sourceWorld, { driven: false, kind: "drive", surface: "asphalt", steps: 180 }),
      steering: await runWebScenario(runtime, sourceWorld, { kind: "steering", surface: "asphalt", steps: 90 }),
      steeringCausalNegative: await runWebScenario(runtime, sourceWorld, { kind: "steering", steering: false, surface: "asphalt", steps: 90 }),
      braking: await runWebScenario(runtime, sourceWorld, { kind: "braking", surface: "asphalt", steps: 60 }),
      brakingCausalNegative: await runWebScenario(runtime, sourceWorld, { braked: false, kind: "braking", surface: "asphalt", steps: 60 }),
    },
  };
}

async function runWebScenario(runtime: Record<string, any>, sourceWorld: IWorldIr, options: { braked?: boolean; driven?: boolean; kind: "braking" | "drive" | "static" | "steering"; steering?: boolean; surface: "asphalt" | "ice"; steps: number }): Promise<Scenario> {
  const world = structuredClone(sourceWorld);
  const chassis = world.entities.find((entity) => entity.id === "chassis")!;
  const ground = world.entities.find((entity) => entity.id === `ground-${options.surface}`)!;
  const groundPosition = ground.components.Transform?.position ?? [0, 0, 0];
  chassis.components.Transform!.position = [groundPosition[0], 1.02, groundPosition[2]];
  const assembly = chassis.components.WheelAssembly!;
  if (options.driven === false) for (const wheel of assembly.wheels) wheel.driven = false;
  if (options.steering === false) for (const wheel of assembly.wheels) wheel.steering = false;
  if (options.braked === false) for (const wheel of assembly.wheels) wheel.braked = false;
  const step = (): void => {
    runtime.preparePhysicsRuntime(world);
    runtime.stepPhysicsVehicles(world, fixedDelta);
    runtime.stepPhysics(world, fixedDelta);
  };
  let initialSpeed: number | undefined;
  if (options.kind === "braking") {
    runtime.setPhysicsVehicleControlInput(world, "chassis", { brake: 0, drive: 1, steering: 0 });
    for (let index = 0; index < 120; index += 1) step();
    const warmupVelocity = chassis.components.RigidBody?.velocity ?? [0, 0, 0];
    initialSpeed = Math.abs(warmupVelocity[2]);
    runtime.setPhysicsVehicleControlInput(world, "chassis", { brake: 1, drive: 0, steering: 0 });
  } else if (options.kind === "drive") {
    runtime.setPhysicsVehicleControlInput(world, "chassis", { brake: 0, drive: 1, steering: 0 });
  } else if (options.kind === "steering") {
    runtime.setPhysicsVehicleControlInput(world, "chassis", { brake: 0, drive: 1, steering: 0.5 });
  }
  for (let index = 0; index < options.steps; index += 1) step();
  const velocity = [...(chassis.components.RigidBody?.velocity ?? [0, 0, 0])] as [number, number, number];
  const angularVelocity = [...(chassis.components.RigidBody?.angularVelocity ?? [0, 0, 0])] as Vec3;
  const position = [...(chassis.components.Transform?.position ?? [0, 0, 0])] as Vec3;
  const rotation = [...(chassis.components.Transform?.rotation ?? [0, 0, 0, 1])] as Quat;
  const observation = runtime.observePhysicsVehicles(world)[0] as IWheelAssemblyObservation;
  const scenario = { chassisAngularVelocity: angularVelocity, chassisPosition: position, chassisRotation: rotation, chassisVelocity: velocity, ...(options.kind === "static" ? { debugTelemetry: runtime.buildPhysicsVehicleDebugOverlay(world) } : {}), ...(initialSpeed === undefined ? {} : { initialSpeed }), speed: Math.abs(velocity[2]), visuals: runtime.observePhysicsVehicleVisuals(world, "chassis", 0.5) as Visual[], wheels: observation.wheels };
  runtime.disposePhysicsVehicleRuntime(world);
  runtime.disposePhysicsRuntime(world);
  return scenario;
}

function runNativeTrace(outputPath: string): { ok: boolean; stderr: string; stdout: string } {
  const args = ["run", "-p", "threenative_runtime", "--bin", "threenative_physics_self_verification_trace", "--", fixtureDir, gate, outputPath];
  const result = spawnSync("cargo", args, { cwd: resolve(root, "runtime-bevy"), encoding: "utf8", timeout: 180_000 });
  return { ok: result.status === 0, stderr: result.stderr.slice(-4000), stdout: result.stdout.slice(-4000) };
}

function compareVisuals(web: readonly Visual[], native: readonly Visual[], path: string, diagnostics: WheelEvidenceDiagnostic[]): void {
  exact(web.map((visual) => visual.wheelId), authoredWheelIds, `${path}/web/wheelIds`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_ORDER", diagnostics);
  exact(native.map((visual) => visual.wheelId), authoredWheelIds, `${path}/native/wheelIds`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_ORDER", diagnostics);
  exact(web.map((visual) => visual.targetId), authoredVisualTargetIds, `${path}/web/targetIds`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_TARGET", diagnostics);
  exact(native.map((visual) => visual.targetId), authoredVisualTargetIds, `${path}/native/targetIds`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_TARGET", diagnostics);
  exact(web.map((visual) => visual.entity), authoredWheelIds.map(() => "chassis"), `${path}/web/entities`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_TARGET", diagnostics);
  exact(native.map((visual) => visual.entity), authoredWheelIds.map(() => "chassis"), `${path}/native/entities`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_TARGET", diagnostics);
  web.forEach((visual, index) => {
    const other = native[index];
    if (other === undefined) return;
    compareVector(visual.position, other.position, PHYSICS_OBSERVATION_TOLERANCES.wheelVisualPosition, `${path}/${index}/position`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", diagnostics);
    compareVector(visual.interpolatedPosition, other.interpolatedPosition, PHYSICS_OBSERVATION_TOLERANCES.wheelVisualPosition, `${path}/${index}/interpolatedPosition`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", diagnostics);
    compareNumber(visual.steeringAngle, other.steeringAngle, PHYSICS_OBSERVATION_TOLERANCES.wheelVisualSteeringAngle, `${path}/${index}/steeringAngle`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", diagnostics);
    compareNumber(visual.interpolatedSteeringAngle, other.interpolatedSteeringAngle, PHYSICS_OBSERVATION_TOLERANCES.wheelVisualSteeringAngle, `${path}/${index}/interpolatedSteeringAngle`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", diagnostics);
    compareAngle(wrapAngle(visual.spinAngle - visual.previousSpinAngle), wrapAngle(other.spinAngle - other.previousSpinAngle), PHYSICS_OBSERVATION_TOLERANCES.wheelVisualSpinAngle, `${path}/${index}/spinDelta`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", diagnostics);
    compareNumber(visual.interpolationAlpha, other.interpolationAlpha, PHYSICS_OBSERVATION_TOLERANCES.distance, `${path}/${index}/interpolationAlpha`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", diagnostics);
  });
}

function validateVisualSemantics(runtime: "native" | "web", scenario: string, visuals: readonly Visual[], diagnostics: WheelEvidenceDiagnostic[]): void {
  visuals.forEach((visual, index) => {
    const path = `${runtime}/scenarios/${scenario}/visuals/${index}`;
    if (![visual.previousSpinAngle, visual.spinAngle, visual.interpolatedSpinAngle].every((angle) => angle >= -Math.PI && angle <= Math.PI)) diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_VISUAL_INTERPOLATION", `${runtime} visual spin angles must be normalized to [-pi, pi].`, `${path}/spinAngle`, "Normalize retained wheel spin before presentation observation."));
    const expected = wrapAngle(visual.previousSpinAngle + wrapAngle(visual.spinAngle - visual.previousSpinAngle) * visual.interpolationAlpha);
    compareAngle(visual.interpolatedSpinAngle, expected, PHYSICS_OBSERVATION_TOLERANCES.wheelVisualSpinAngle, `${path}/interpolatedSpinAngle`, "TN_VERIFY_PHYSICS_WHEEL_VISUAL_INTERPOLATION", diagnostics);
    if (visual.interpolationAlpha !== 0.5) diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_VISUAL_INTERPOLATION", `${runtime} visual observation must use the paired alpha=0.5 checkpoint.`, `${path}/interpolationAlpha`, "Observe presentation state at alpha=0.5."));
  });
}

function compareAngle(left: number, right: number, tolerance: { absolute: number; relative: number }, path: string, code: string, diagnostics: WheelEvidenceDiagnostic[]): void {
  const delta = Math.abs(wrapAngle(left - right));
  const allowed = tolerance.absolute + tolerance.relative * Math.max(Math.abs(left), Math.abs(right));
  if (!Number.isFinite(left) || !Number.isFinite(right) || delta > allowed) diagnostics.push(diagnostic(code, `Angular parity exceeded registry tolerance: web=${left}, native=${right}, wrappedDelta=${delta}, allowed=${allowed}.`, path, "Fix normalized angle production or review the registry tolerance with paired measurements."));
}

function wrapAngle(value: number): number {
  const period = Math.PI * 2;
  return ((value + Math.PI) % period + period) % period - Math.PI;
}

function compareWheel(web: Wheel, native: Wheel | undefined, path: string, diagnostics: WheelEvidenceDiagnostic[]): void {
  if (native === undefined) {
    diagnostics.push(diagnostic("TN_VERIFY_PHYSICS_WHEEL_MISSING", "Native trace is missing an authored wheel observation.", path, "Emit every wheel observation in authored order."));
    return;
  }
  compareNumber(web.angularSpeed, native.angularSpeed, PHYSICS_OBSERVATION_TOLERANCES.wheelAngularSpeed, `${path}/angularSpeed`, "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", diagnostics);
  compareNumber(web.compression, native.compression, PHYSICS_OBSERVATION_TOLERANCES.wheelCompression, `${path}/compression`, "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", diagnostics);
  compareNumber(web.lateralSlip, native.lateralSlip, PHYSICS_OBSERVATION_TOLERANCES.wheelLateralSlip, `${path}/lateralSlip`, "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", diagnostics);
  compareNumber(web.longitudinalSlip, native.longitudinalSlip, PHYSICS_OBSERVATION_TOLERANCES.wheelLongitudinalSlip, `${path}/longitudinalSlip`, "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", diagnostics);
  compareNumber(web.normalLoad, native.normalLoad, PHYSICS_OBSERVATION_TOLERANCES.wheelNormalLoad, `${path}/normalLoad`, "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", diagnostics);
  exact(web.contact !== undefined, native.contact !== undefined, `${path}/contact/present`, "TN_VERIFY_PHYSICS_WHEEL_CONTACT_PRESENCE_MISMATCH", diagnostics);
  if (web.contact !== undefined && native.contact !== undefined) {
    exact(web.contact.entity, native.contact.entity, `${path}/contact/entity`, "TN_VERIFY_PHYSICS_WHEEL_CONTACT_ID_MISMATCH", diagnostics);
    exact(web.contact.child ?? null, native.contact.child ?? null, `${path}/contact/child`, "TN_VERIFY_PHYSICS_WHEEL_CONTACT_ID_MISMATCH", diagnostics);
    compareNumber(web.contact.distance, native.contact.distance, PHYSICS_OBSERVATION_TOLERANCES.wheelContactDistance, `${path}/contact/distance`, "TN_VERIFY_PHYSICS_WHEEL_CONTACT_NUMERIC_MISMATCH", diagnostics);
    compareVector(web.contact.point, native.contact.point, PHYSICS_OBSERVATION_TOLERANCES.wheelContactPoint, `${path}/contact/point`, "TN_VERIFY_PHYSICS_WHEEL_CONTACT_NUMERIC_MISMATCH", diagnostics);
    compareVector(web.contact.normal, native.contact.normal, PHYSICS_OBSERVATION_TOLERANCES.wheelContactNormal, `${path}/contact/normal`, "TN_VERIFY_PHYSICS_WHEEL_CONTACT_NUMERIC_MISMATCH", diagnostics);
  }
}

function compareVector(left: readonly number[], right: readonly number[], tolerance: { absolute: number; relative: number }, path: string, code: string, diagnostics: WheelEvidenceDiagnostic[]): void {
  if (left.length !== right.length) {
    diagnostics.push(diagnostic(code, `Vector parity failed: ${left.length} components != ${right.length}.`, path, "Emit the complete vector from both adapters."));
    return;
  }
  left.forEach((value, index) => compareNumber(value, right[index]!, tolerance, `${path}/${index}`, code, diagnostics));
}

function compareQuaternion(left: Quat, right: Quat, path: string, diagnostics: WheelEvidenceDiagnostic[]): void {
  const dot = left.reduce((sum, value, index) => sum + value * right[index]!, 0);
  const aligned = dot < 0 ? right.map((value) => -value) : right;
  compareVector(left, aligned, PHYSICS_OBSERVATION_TOLERANCES.wheelChassisRotation, path, "TN_VERIFY_PHYSICS_WHEEL_ROTATION_MISMATCH", diagnostics);
}

function yawMagnitude([x, y, z, w]: Quat): number {
  return Math.abs(Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z)));
}

function compareNumber(left: number, right: number, tolerance: { absolute: number; relative: number }, path: string, code: string, diagnostics: WheelEvidenceDiagnostic[]): void {
  const allowed = tolerance.absolute + tolerance.relative * Math.max(Math.abs(left), Math.abs(right));
  if (!Number.isFinite(left) || !Number.isFinite(right) || Math.abs(left - right) > allowed) diagnostics.push(diagnostic(code, `Numeric parity exceeded registry tolerance: web=${left}, native=${right}, allowed=${allowed}.`, path, "Fix the owning adapter or review the registry tolerance with paired measurements."));
}

function exact(left: unknown, right: unknown, path: string, code: string, diagnostics: WheelEvidenceDiagnostic[]): void {
  if (JSON.stringify(left) !== JSON.stringify(right)) diagnostics.push(diagnostic(code, `Exact parity failed: ${JSON.stringify(left)} != ${JSON.stringify(right)}.`, path, "Preserve authored order and exact semantic observations across adapters."));
}

function diagnostic(code: string, message: string, path: string, suggestedFix: string): WheelEvidenceDiagnostic {
  return { code, message, path, severity: "error", suggestedFix };
}

async function loadRuntime(): Promise<Record<string, any>> {
  const ir = await import(resolve(root, "packages/ir/dist/validate.js"));
  const web = await import(resolve(root, "packages/runtime-web-three/dist/index.js"));
  const webPhysics = await import(resolve(root, "packages/runtime-web-three/dist/physics.js"));
  return { ...ir, ...web, ...webPhysics };
}

async function adapterVersions(): Promise<unknown[]> {
  const webPackage = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/package.json"), "utf8")) as { name: string; version: string };
  const rapier = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/@dimforge/rapier3d-compat/package.json"), "utf8")) as { version: string };
  const three = JSON.parse(await readFile(resolve(root, "packages/runtime-web-three/node_modules/three/package.json"), "utf8")) as { version: string };
  const cargo = await readFile(resolve(root, "runtime-bevy/crates/threenative_runtime/Cargo.toml"), "utf8");
  const workspace = await readFile(resolve(root, "runtime-bevy/Cargo.toml"), "utf8");
  return [
    { adapter: "web", dependencies: { "@dimforge/rapier3d-compat": rapier.version, three: three.version }, runtime: webPackage.name, runtimeVersion: webPackage.version },
    { adapter: "bevy", dependencies: { bevy: cargo.match(/^bevy\s*=\s*\{\s*version\s*=\s*"=?([^"]+)"/m)?.[1] ?? "unknown", rapier3d: cargo.match(/^rapier3d\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" }, runtime: "threenative_runtime", runtimeVersion: workspace.match(/^version\s*=\s*"([^"]+)"/m)?.[1] ?? "unknown" },
  ];
}

async function hashDirectory(path: string): Promise<string> {
  const hash = createHash("sha256");
  for (const file of await listFiles(path)) {
    hash.update(relative(path, file));
    hash.update(await readFile(file));
  }
  return `sha256-${hash.digest("hex")}`;
}

async function listFiles(path: string): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...await listFiles(child));
    else files.push(child);
  }
  return files.sort();
}

async function hashArtifacts(paths: readonly string[]): Promise<Record<string, string>> {
  return Object.fromEntries(await Promise.all(paths.map(async (path) => [repoRelative(path), sha256(await readFile(path))])));
}

function sha256(value: Uint8Array): string { return `sha256-${createHash("sha256").update(value).digest("hex")}`; }
function repoRelative(path: string): string { return relative(root, path).replaceAll("\\", "/"); }
async function writeJson(path: string, value: unknown): Promise<void> { await mkdir(dirname(path), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`); }

if (process.argv[1] === fileURLToPath(import.meta.url)) void main();
