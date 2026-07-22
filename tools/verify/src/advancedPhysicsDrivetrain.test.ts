import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { IVehicleControllerInput, IVehicleControllerObservation } from "@threenative/ir";
import { PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION, PHYSICS_PHASE3_VEHICLE_TOLERANCES } from "@threenative/ir";
import { DRIVETRAIN_SCENARIOS, DRIVETRAIN_TRACE_SCHEMA, DRIVETRAIN_TRACE_VERSION, DRIVETRAIN_WHEEL_IDS, drivetrainFixtureGeometryDiagnostics, drivetrainScenarioManifestDiagnostics, manualDrivetrainEvidenceDiagnostics, validateAdvancedPhysicsDrivetrainEvidence, type AdvancedPhysicsDrivetrainTrace, type DrivetrainScenarioId } from "./advancedPhysicsDrivetrain.js";

const neutral: IVehicleControllerInput = { brake: 0, clutch: 0, handbrake: 0, steer: 0, throttle: 1 };
function observation(id: DrivetrainScenarioId): IVehicleControllerObservation {
  const gear = id === "reverse" ? -1 : id === "automaticLaunch" || id === "manualShift" || id === "retry" ? 2 : 1;
  return { absActive: id === "assistTransitions", clutch: 0, driveTorque: 100, engineRpm: 3000, entity: "chassis", gear, inputs: id === "manualShift" ? { ...neutral, gear: 2 } : id === "reverse" ? { ...neutral, gear: -1 } : neutral, shiftState: "engaged", speed: id === "braking" ? 1 : 3, tcsActive: id === "assistTransitions", torquePath: { engine: 100, clutch: 100, gearbox: 190, finalDrive: 703, wheels: DRIVETRAIN_WHEEL_IDS.map((wheelId) => ({ wheelId, torque: id === "differentialLimitedSlip" && wheelId === "rear-left" ? 150 : id === "differentialLimitedSlip" && wheelId === "rear-right" ? 100 : 100 })) } };
}
function trace(runtime: "bevy" | "web"): AdvancedPhysicsDrivetrainTrace {
  const hash = `sha256-${"a".repeat(64)}`;
  return { schema: DRIVETRAIN_TRACE_SCHEMA, version: DRIVETRAIN_TRACE_VERSION, runtime, fixture: "advanced-physics-drivetrain", sourceHash: hash, bundleHash: hash, fixedDt: 1 / 60, scenarios: DRIVETRAIN_SCENARIOS.map((id) => {
    const end = observation(id); const first = structuredClone(end); const middle = structuredClone(end); if (id === "braking") first.speed = 3;
    if (id === "assistTransitions") { first.absActive = false; first.tcsActive = false; end.absActive = false; end.tcsActive = false; }
    const input = end.inputs; const wheels = DRIVETRAIN_WHEEL_IDS.map((wheelId) => ({ wheelId, grounded: true, longitudinalSlip: wheelId === "rear-left" ? 0.1 : wheelId === "rear-right" ? 0.8 : 0.2 }));
    const sample = (tick: number, value: IVehicleControllerObservation) => { const sampleWheels = structuredClone(wheels); const sampleObservation = structuredClone(value); if (id === "differentialLimitedSlip" && tick === 0) { sampleWheels.find((wheel) => wheel.wheelId === "rear-right")!.longitudinalSlip = 0.1; sampleObservation.torquePath.wheels.find((wheel) => wheel.wheelId === "rear-left")!.torque = 100; } return { tick, label: id, input: sampleObservation.inputs, observation: sampleObservation, chassisAngularVelocity: [0, id === "steering" ? 0.1 : 0, 0] as [number, number, number], chassisPosition: [id === "steering" ? tick * 0.05 : 0, 1, 0] as [number, number, number], chassisRotation: [0, id === "steering" ? Math.sin(tick * 0.01) : 0, 0, id === "steering" ? Math.cos(tick * 0.01) : 1] as [number, number, number, number], chassisVelocity: [0, 0, id === "reverse" ? 1 : -1] as [number, number, number], wheels: sampleWheels }; };
    const observations = [sample(0, first), sample(1, middle), sample(2, end), sample(3, end)];
    if (id === "automaticLaunch" || id === "retry") observations.forEach((item, index) => { item.observation.gear = index + 1; });
    return { checkpoints: [0, 3], id, inputs: [{ tick: 0, input }], outcomeBounds: id === "automaticLaunch" || id === "retry" ? { straightStability: { maxAbsYaw: 0.06, maxAbsYawRate: 0.25, maxConsecutiveZeroContactTicks: 1, maxLateralDisplacement: 0.5, minimumGroundedWheelCoverage: 0.975, requireTerminalAllWheelsGrounded: true, startTick: 0, throughTick: 1 } } : undefined, setup: id.startsWith("differential") ? { differential: id === "differentialOpen" ? "open" : id === "differentialLocked" ? "locked" : "limited-slip", ...(id === "differentialLimitedSlip" ? { limitedSlipRatio: 2.5 } : {}), surfaceRegion: "split-grip", chassisPosition: [30, 1.02, 40] } : undefined, observations };
  }) };
}
function diagnostics(mutator: (value: AdvancedPhysicsDrivetrainTrace) => void) { const native = trace("bevy"); mutator(native); return validateAdvancedPhysicsDrivetrainEvidence(trace("web"), native); }

test("paired drivetrain evidence accepts the canonical complete trace", () => assert.deepEqual(validateAdvancedPhysicsDrivetrainEvidence(trace("web"), trace("bevy")), []));
test("RPM negative proof exceeds the durable Phase 3 field bound", () => assert.ok(500 > Math.max(PHYSICS_PHASE3_VEHICLE_TOLERANCES.engineRpm.absolute, 1400 * PHYSICS_PHASE3_VEHICLE_TOLERANCES.engineRpm.relative)));
for (const item of [
  ["schema", "TN_VERIFY_DRIVETRAIN_SCHEMA_INVALID", (v: AdvancedPhysicsDrivetrainTrace) => { (v as { schema: string }).schema = "wrong"; }],
  ["scenario order", "TN_VERIFY_DRIVETRAIN_SCENARIO_ORDER", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios.reverse(); }],
  ["tick sequence", "TN_VERIFY_DRIVETRAIN_TICK_SEQUENCE", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[1]!.tick = 4; }],
  ["input", "TN_VERIFY_DRIVETRAIN_INPUT_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.inputs[0]!.input.throttle = 0; }],
  ["fixture hash mismatch", "TN_VERIFY_DRIVETRAIN_FIXTURE_HASH_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.sourceHash = `sha256-${"d".repeat(64)}`; }],
  ["invalid fixture hash", "TN_VERIFY_DRIVETRAIN_FIXTURE_HASH_INVALID", (v: AdvancedPhysicsDrivetrainTrace) => { v.bundleHash = "invalid"; }],
  ["sample count", "TN_VERIFY_DRIVETRAIN_SAMPLE_COUNT_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations.pop(); }],
  ["input observation echo", "TN_VERIFY_DRIVETRAIN_INPUT_OBSERVATION_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { const sample = v.scenarios[0]!.observations[0]!; sample.input = { brake: 0, clutch: 0, handbrake: 0, steer: 0, throttle: 0 }; sample.observation.inputs = { brake: 0, clutch: 0, handbrake: 0, steer: 0, throttle: 1 }; }],
  ["discrete semantic", "TN_VERIFY_DRIVETRAIN_SEMANTIC_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[0]!.observation.gear = 7; }],
  ["RPM bound", "TN_VERIFY_DRIVETRAIN_NUMERIC_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[0]!.observation.engineRpm += 500; }],
  ["torque path", "TN_VERIFY_DRIVETRAIN_TORQUE_PATH_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[0]!.observation.torquePath.engine += 100; }],
  ["local longitudinal progress", "TN_VERIFY_DRIVETRAIN_OUTCOME_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations.at(-1)!.chassisPosition[2] -= 5; }],
  ["lateral progress ratio", "TN_VERIFY_DRIVETRAIN_OUTCOME_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations.at(-1)!.chassisPosition[0] += 5; }],
  ["yaw outcome", "TN_VERIFY_DRIVETRAIN_OUTCOME_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations.at(-1)!.chassisRotation = [0, Math.sin(0.5), 0, Math.cos(0.5)]; }],
  ["wheel order", "TN_VERIFY_DRIVETRAIN_WHEEL_OBSERVATION_INVALID", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[0]!.wheels.reverse(); }],
  ["wheel grounded", "TN_VERIFY_DRIVETRAIN_WHEEL_SEMANTIC_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[0]!.wheels[0]!.grounded = false; }],
  ["per-wheel torque bound", "TN_VERIFY_DRIVETRAIN_TORQUE_PATH_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { const wheels = v.scenarios[0]!.observations[0]!.observation.torquePath.wheels as Array<{wheelId:string;torque:number}>; wheels[0]!.torque += 100; }],
  ["torque wheel order", "TN_VERIFY_DRIVETRAIN_SEMANTIC_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { const wheels = v.scenarios[0]!.observations[0]!.observation.torquePath.wheels as Array<{wheelId:string;torque:number}>; wheels.reverse(); }],
  ["semantic transition sequence", "TN_VERIFY_DRIVETRAIN_TRANSITION_MISMATCH", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[1]!.observation.shiftState = "shifting"; }],
  ["unstable numeric checkpoint", "TN_VERIFY_DRIVETRAIN_CHECKPOINT_NOT_STABLE", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations.at(-1)!.observation.shiftState = "shifting"; }],
  ["automatic causal", "TN_VERIFY_DRIVETRAIN_AUTOMATIC_SHIFT", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations.at(-1)!.observation.gear = 1; }],
  ["straight stability", "TN_VERIFY_DRIVETRAIN_STRAIGHT_STABILITY", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[1]!.chassisPosition[0] = 3; }],
  ["sustained airborne stability", "TN_VERIFY_DRIVETRAIN_STRAIGHT_STABILITY", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations.slice(0, 2).forEach((sample) => sample.wheels.forEach((wheel) => { wheel.grounded = false; })); }],
  ["missing terminal grounding", "TN_VERIFY_DRIVETRAIN_STRAIGHT_STABILITY", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[0]!.observations[1]!.wheels[0]!.grounded = false; }],
  ["manual causal", "TN_VERIFY_DRIVETRAIN_MANUAL_SHIFT", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[1]!.observations.at(-1)!.observation.gear = 1; }],
  ["steering causal", "TN_VERIFY_DRIVETRAIN_STEERING_OUTCOME", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[2]!.observations.forEach((s) => { s.chassisPosition[0] = 0; }); }],
  ["braking causal", "TN_VERIFY_DRIVETRAIN_BRAKING_OUTCOME", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[3]!.observations.at(-1)!.observation.speed = 3; }],
  ["reverse causal", "TN_VERIFY_DRIVETRAIN_REVERSE_OUTCOME", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[4]!.observations.at(-1)!.chassisVelocity[2] = -1; }],
  ["assist causal", "TN_VERIFY_DRIVETRAIN_ASSIST_TRANSITIONS", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[5]!.observations.forEach((s) => { s.observation.absActive = false; }); }],
  ["tcs causal", "TN_VERIFY_DRIVETRAIN_ASSIST_TRANSITIONS", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[5]!.observations.forEach((s) => { s.observation.tcsActive = false; }); }],
  ["retry causal", "TN_VERIFY_DRIVETRAIN_RETRY_NONDETERMINISTIC", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[6]!.observations.at(-1)!.observation.speed = 10; }],
  ["differential setup", "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_SETUP", (v: AdvancedPhysicsDrivetrainTrace) => { v.scenarios[7]!.setup!.chassisPosition[2] = -24; }],
  ["differential causal", "TN_VERIFY_DRIVETRAIN_DIFFERENTIAL_CAUSALITY", (v: AdvancedPhysicsDrivetrainTrace) => { for (const sample of v.scenarios[9]!.observations) { const wheels = sample.observation.torquePath.wheels as Array<{wheelId:string;torque:number}>; wheels.find((w) => w.wheelId === "rear-left")!.torque = 50; } }],
] as const) test(`drivetrain evidence fails closed for isolated ${item[0]} drift`, () => assert.ok(diagnostics(item[2]).some((entry) => entry.code === item[1])));

const hash = `sha256-${"b".repeat(64)}`; const screenshotPath = "tools/verify/artifacts/advanced-physics/phase-3-drivetrain/manual-web-debug.png";
function manual(): any { return { status: "PASS", checklist: ["visible-chassis-and-four-wheels", "steering-yaw-and-lateral-path", "gear-rpm-clutch-telemetry", "abs-tcs-state-transitions", "authored-order-torque-path", "fresh-retry", "zero-runtime-errors"].map((id) => ({ id, passed: true })), findings: { runtimeErrors: 0, visibleMeshes: 12, wheelCount: 4 }, metadata: { adapters: [{ adapter: "web", runtime: "@threenative/runtime-web-three", runtimeVersion: "0.1.11", dependencies: { three: "0.181.2" } }, { adapter: "bevy", runtime: "threenative_runtime", runtimeVersion: "0.1.11", dependencies: { bevy: "0.14.2" } }], artifactHashes: { [screenshotPath]: hash }, bundleHash: hash, command: "manual browser capture", completedAt: "2026-07-22T20:00:00.000Z", fixedDelta: 1 / 60, platform: "linux-x64", scenario: "advanced-physics-drivetrain", schemaVersion: "0.1.0", seed: 0, sourceHash: hash, startedAt: "2026-07-22T19:59:00.000Z", toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION } }; }
test("manual drivetrain evidence accepts complete hash-bound browser proof", () => assert.deepEqual(manualDrivetrainEvidenceDiagnostics(manual(), { bundleHash: hash, screenshotHash: hash, sourceHash: hash }), []));
for (const [name, code, mutate] of [
  ["status", "TN_VERIFY_DRIVETRAIN_MANUAL_STATUS", (v: any) => { v.status = "FAIL"; }],
  ["metadata", "TN_VERIFY_DRIVETRAIN_MANUAL_METADATA", (v: any) => { delete v.metadata.adapters; }],
  ["source hash", "TN_VERIFY_DRIVETRAIN_MANUAL_FIXTURE_STALE", (v: any) => { v.metadata.sourceHash = `sha256-${"c".repeat(64)}`; }],
  ["bundle hash", "TN_VERIFY_DRIVETRAIN_MANUAL_FIXTURE_STALE", (v: any) => { v.metadata.bundleHash = `sha256-${"c".repeat(64)}`; }],
  ["tolerance registry", "TN_VERIFY_DRIVETRAIN_MANUAL_FIXTURE_STALE", (v: any) => { v.metadata.toleranceRegistryVersion = "stale"; }],
  ["screenshot hash", "TN_VERIFY_DRIVETRAIN_MANUAL_SCREENSHOT_STALE", (v: any) => { v.metadata.artifactHashes[screenshotPath] = `sha256-${"c".repeat(64)}`; }],
  ["checklist", "TN_VERIFY_DRIVETRAIN_MANUAL_CHECKLIST", (v: any) => { v.checklist[0].passed = false; }],
  ["findings", "TN_VERIFY_DRIVETRAIN_MANUAL_FINDINGS", (v: any) => { v.findings.runtimeErrors = 1; }],
] as const) test(`manual drivetrain evidence fails closed for isolated ${name} drift`, () => { const value = manual(); mutate(value); assert.ok(manualDrivetrainEvidenceDiagnostics(value, { bundleHash: hash, screenshotHash: hash, sourceHash: hash }).some((entry) => entry.code === code)); });

test("canonical drivetrain scenario manifest is valid and fails closed on adapter-list drift", async () => {
  const manifest = JSON.parse(await readFile(new URL("../../../packages/ir/fixtures/conformance/advanced-physics-drivetrain/game.bundle/drivetrain.scenarios.json", import.meta.url), "utf8"));
  assert.deepEqual(drivetrainScenarioManifestDiagnostics(manifest), []);
  const reordered = structuredClone(manifest); reordered.scenarios.reverse(); assert.ok(drivetrainScenarioManifestDiagnostics(reordered).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_SCENARIO_MANIFEST_ORDER"));
  const invalidInput = structuredClone(manifest); invalidInput.scenarios[0].segments[0].input.throttle = 2; assert.ok(drivetrainScenarioManifestDiagnostics(invalidInput).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_SCENARIO_INPUT_INVALID"));
  const invalidCheckpoint = structuredClone(manifest); invalidCheckpoint.scenarios[0].checkpoints = [9999]; assert.ok(drivetrainScenarioManifestDiagnostics(invalidCheckpoint).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_SCENARIO_CHECKPOINT_INVALID"));
  const invalidCorridor = structuredClone(manifest); invalidCorridor.scenarios.find((item: { id: string }) => item.id === "reverse").travelCorridor.endpoint[1] = -100; assert.ok(drivetrainScenarioManifestDiagnostics(invalidCorridor).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_SCENARIO_CORRIDOR_INVALID"));
  const stabilityDrift = structuredClone(manifest); stabilityDrift.scenarios[0].outcomeBounds.straightStability.maxLateralDisplacement = -1; assert.ok(drivetrainScenarioManifestDiagnostics(stabilityDrift).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_SCENARIO_STABILITY_BOUNDS_INVALID"));
  const activeWindowDrift = structuredClone(manifest); activeWindowDrift.scenarios[0].outcomeBounds.straightStability.startTick = 120; assert.ok(drivetrainScenarioManifestDiagnostics(activeWindowDrift).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_SCENARIO_STABILITY_BOUNDS_INVALID"));
  const geometryDrift = structuredClone(manifest); geometryDrift.scenarios.at(-1).initialPose.position[0] = 21; assert.ok(drivetrainScenarioManifestDiagnostics(geometryDrift).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_SCENARIO_DIFFERENTIAL_DRIFT"));
});

test("drivetrain playtest wrapper derives its launch schedule and input bridge from the canonical manifest", async () => {
  const fixtureUrl = new URL("../../../packages/ir/fixtures/conformance/advanced-physics-drivetrain/game.bundle/", import.meta.url);
  const exampleUrl = new URL("../../../examples/advanced-physics-drivetrain/", import.meta.url);
  const [manifest, scenario, config, input, systems, scripts, bundleManifest] = await Promise.all([
    readFile(new URL("drivetrain.scenarios.json", fixtureUrl), "utf8").then(JSON.parse),
    readFile(new URL("playtests/automatic-launch.playtest.json", exampleUrl), "utf8").then(JSON.parse),
    readFile(new URL("threenative.config.json", exampleUrl), "utf8").then(JSON.parse),
    readFile(new URL("input.ir.json", fixtureUrl), "utf8").then(JSON.parse),
    readFile(new URL("systems.ir.json", fixtureUrl), "utf8").then(JSON.parse),
    readFile(new URL("scripts.bundle.js", fixtureUrl), "utf8"),
    readFile(new URL("manifest.json", fixtureUrl), "utf8").then(JSON.parse),
  ]);
  const launch = manifest.scenarios.find((item: { id: string }) => item.id === "automaticLaunch");
  assert.ok(launch);
  assert.deepEqual(scenario.setup.entities, [{ entity: manifest.entity, position: launch.initialPose.position }]);
  const derivedSteps = launch.segments.map((segment: { input: { throttle: number }; label: string; steps: number }) => segment.input.throttle > 0
    ? { holdTicks: segment.steps, label: segment.label, press: "KeyW", release: true }
    : { label: segment.label, release: false, waitTicks: segment.steps });
  assert.deepEqual(scenario.steps, derivedSteps);
  assert.equal(config.outDir, "../../packages/ir/fixtures/conformance/advanced-physics-drivetrain/game.bundle");
  assert.deepEqual(input.actions, [{ bindings: [{ code: "KeyW", device: "keyboard" }], id: "throttle" }]);
  assert.deepEqual(systems.systems.map((system: { services: string[] }) => system.services), [["physics.vehicle.setInputs"]]);
  assert.match(scripts, /ctx\.input\.action\("throttle"\)/);
  assert.match(scripts, /ctx\.physics\.vehicle\.setInputs\("chassis"/);
  assert.deepEqual(bundleManifest.entry, { scripts: "scripts.bundle.js", systems: "systems.ir.json", world: "world.ir.json" });
  assert.equal(scenario.assert.movement.maxDistance, 30);
  const drifted = structuredClone(scenario); drifted.steps[0].waitTicks -= 1;
  assert.notDeepEqual(drifted.steps, derivedSteps);
});

test("canonical drivetrain geometry derives visual offsets and separates proof surfaces", async () => {
  const base = new URL("../../../packages/ir/fixtures/conformance/advanced-physics-drivetrain/game.bundle/", import.meta.url);
  const [world, assets, manifest] = await Promise.all(["world.ir.json", "assets.manifest.json", "drivetrain.scenarios.json"].map(async (name) => JSON.parse(await readFile(new URL(name, base), "utf8"))));
  assert.deepEqual(drivetrainFixtureGeometryDiagnostics(world, assets, manifest), []);
  const visualDrift = structuredClone(world); visualDrift.entities.find((item: any) => item.id === "wheel-visual-rear-right").components.Transform.position[2] = -350;
  assert.ok(drivetrainFixtureGeometryDiagnostics(visualDrift, assets, manifest).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_VISUAL_TARGET_OFFSET_DRIFT"));
  const meshDrift = structuredClone(assets); meshDrift.assets.find((item: any) => item.id === "mesh.ground").size[0] = 10;
  assert.ok(drivetrainFixtureGeometryDiagnostics(world, meshDrift, manifest).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_FIXTURE_GEOMETRY_INVALID"));
  const reverseCorridorDrift = structuredClone(world); const runway = reverseCorridorDrift.entities.find((item: any) => item.id === "ground-asphalt"); runway.components.Transform.position[2] = -75; runway.components.Collider.size[2] = 250;
  assert.ok(drivetrainFixtureGeometryDiagnostics(reverseCorridorDrift, assets, manifest).some((item) => item.code === "TN_VERIFY_DRIVETRAIN_FIXTURE_GEOMETRY_INVALID"));
});
