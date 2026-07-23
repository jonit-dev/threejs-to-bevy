import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION } from "@threenative/ir";
import { manualEvidenceMetadataMatches, validateAdvancedPhysicsWheelEvidence, validateAdvancedPhysicsWheelVisualFixture, type AdvancedPhysicsWheelTrace } from "./advancedPhysicsWheels.js";
import { expectedPhysicsDebugCategories } from "./advancedPhysicsDebugEvidence.js";

const ids = ["rear-right", "front-left", "rear-left", "front-right"];
const contact = (surface: string) => ({ distance: 0.2, entity: surface, normal: [0, 1, 0] as [number, number, number], point: [0, 0.05, 0] as [number, number, number] });
const wheels = (surface: string, moving = true) => ids.map((wheelId) => ({ angularSpeed: moving ? 2 : 0, compression: 0.2, contact: contact(surface), grounded: true, lateralSlip: moving ? 0.01 : 0, longitudinalSlip: moving ? 0.2 : 0, normalLoad: 250, surface, wheelId }));
const yaw = (angle: number): [number, number, number, number] => [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)];
const visuals = () => ids.map((wheelId, index) => ({
  entity: "chassis",
  interpolatedPosition: [index, -0.39, index] as [number, number, number],
  interpolatedSpinAngle: 0.15,
  interpolatedSteeringAngle: wheelId.startsWith("front") ? 0.3 : 0,
  interpolationAlpha: 0.5,
  position: [index, -0.38, index] as [number, number, number],
  previousSpinAngle: 0.1,
  spinAngle: 0.2,
  steeringAngle: wheelId.startsWith("front") ? 0.3 : 0,
  targetId: `wheel-visual-${wheelId}`,
  wheelId,
}));
const scenario = (surface: string, speed: number, x = 0, rotation = yaw(0), moving = speed > 0) => ({
  chassisAngularVelocity: [0, x === 0 ? 0 : 0.2, 0] as [number, number, number],
  chassisPosition: [x, 1, surface === "ground-ice" ? -26 : 22] as [number, number, number],
  chassisRotation: rotation,
  chassisVelocity: [0, 0, -speed] as [number, number, number],
  speed,
  visuals: visuals(),
  wheels: wheels(surface, moving),
});
const debugEvidence = expectedPhysicsDebugCategories("advanced-physics-wheels").map((category) => ({
  category,
  id: `${category}:fixture`,
  kind: (category === "wheel" ? "sphere" : category === "force" || category === "slip" ? "vector" : category === "suspension" ? "line" : "point") as "line" | "point" | "sphere" | "vector",
}));
const trace = (runtime: "bevy" | "web"): AdvancedPhysicsWheelTrace => ({
  authoredWheelIds: ids,
  fixedDelta: 1 / 120,
  runtime,
  scenarios: {
    asphalt: scenario("ground-asphalt", 3),
    braking: { ...scenario("ground-asphalt", 0.2), initialSpeed: 3 },
    brakingCausalNegative: { ...scenario("ground-asphalt", 3), initialSpeed: 3 },
    driveCausalNegative: scenario("ground-asphalt", 0, 0, yaw(0), false),
    ice: scenario("ground-ice", 1),
    staticLoad: { ...scenario("ground-asphalt", 0, 0, yaw(0), false), debugEvidence },
    steering: scenario("ground-asphalt", 3, 1, yaw(0.2)),
    steeringCausalNegative: scenario("ground-asphalt", 3, 0, yaw(0)),
  },
});

function diagnosticsAfter(mutator: (native: AdvancedPhysicsWheelTrace) => void) {
  const native = trace("bevy");
  mutator(native);
  return validateAdvancedPhysicsWheelEvidence(trace("web"), native);
}

test("advanced physics wheel evidence accepts paired exact semantics, full observations, and causal outcomes", () => {
  assert.deepEqual(validateAdvancedPhysicsWheelEvidence(trace("web"), trace("bevy")), []);
});

test("manual wheel evidence fails closed on tolerance-registry drift", () => {
  const report = { status: "PASS", metadata: { bundleHash: "bundle", sourceHash: "source", toleranceRegistryVersion: PHYSICS_OBSERVATION_TOLERANCE_REGISTRY_VERSION } };
  assert.equal(manualEvidenceMetadataMatches(report, "source", "bundle"), true);
  report.metadata.toleranceRegistryVersion = "stale";
  assert.equal(manualEvidenceMetadataMatches(report, "source", "bundle"), false);
});

test("advanced physics wheel visual fixture owns exact chassis-child targets", async () => {
  const fixture = JSON.parse(await readFile(new URL("../../../packages/ir/fixtures/conformance/advanced-physics-wheels/game.bundle/world.ir.json", import.meta.url), "utf8"));
  assert.deepEqual(validateAdvancedPhysicsWheelVisualFixture(fixture), []);
  delete fixture.entities.find((entity: { id: string }) => entity.id === "wheel-visual-front-left").components.Hierarchy;
  assert.ok(validateAdvancedPhysicsWheelVisualFixture(fixture).some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_WHEEL_VISUAL_FIXTURE"));
});

for (const testCase of [
  { name: "authored order", code: "TN_VERIFY_PHYSICS_WHEEL_ORDER", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels = [...value.scenarios.steering.wheels].reverse(); } },
  { name: "surface identity", code: "TN_VERIFY_PHYSICS_WHEEL_SURFACE_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.surface = "ground-ice"; } },
  { name: "grounded state", code: "TN_VERIFY_PHYSICS_WHEEL_GROUNDED_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.grounded = false; } },
  { name: "contact presence", code: "TN_VERIFY_PHYSICS_WHEEL_CONTACT_PRESENCE_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { delete value.scenarios.steering.wheels[0]!.contact; } },
  { name: "contact entity", code: "TN_VERIFY_PHYSICS_WHEEL_CONTACT_ID_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.contact!.entity = "wrong-ground"; } },
  { name: "contact child", code: "TN_VERIFY_PHYSICS_WHEEL_CONTACT_ID_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.contact!.child = "wrong-child"; } },
  { name: "visual authored order", code: "TN_VERIFY_PHYSICS_WHEEL_VISUAL_ORDER", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.visuals = [...value.scenarios.steering.visuals].reverse(); } },
  { name: "visual target", code: "TN_VERIFY_PHYSICS_WHEEL_VISUAL_TARGET", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.visuals[0]!.targetId = "wrong-target"; } },
] as const) {
  test(`advanced physics wheel evidence fails closed for isolated ${testCase.name} drift`, () => {
    assert.ok(diagnosticsAfter(testCase.mutate).some((diagnostic) => diagnostic.code === testCase.code));
  });
}

for (const testCase of [
  { name: "chassis angular velocity", code: "TN_VERIFY_PHYSICS_WHEEL_ANGULAR_VELOCITY_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.chassisAngularVelocity[1] += 1; } },
  { name: "chassis position", code: "TN_VERIFY_PHYSICS_WHEEL_POSITION_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.chassisPosition[0] += 1; } },
  { name: "chassis rotation", code: "TN_VERIFY_PHYSICS_WHEEL_ROTATION_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.chassisRotation = yaw(1); } },
  { name: "chassis velocity", code: "TN_VERIFY_PHYSICS_WHEEL_VELOCITY_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.chassisVelocity[2] -= 1; } },
  { name: "speed", code: "TN_VERIFY_PHYSICS_WHEEL_SPEED_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.speed += 1; } },
  { name: "initial braking speed", code: "TN_VERIFY_PHYSICS_WHEEL_SPEED_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.braking.initialSpeed! += 1; } },
  { name: "wheel angular speed", code: "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.angularSpeed += 1; } },
  { name: "wheel compression", code: "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.compression += 1; } },
  { name: "wheel lateral slip", code: "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.lateralSlip += 1; } },
  { name: "wheel longitudinal slip", code: "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.longitudinalSlip += 1; } },
  { name: "wheel normal load", code: "TN_VERIFY_PHYSICS_WHEEL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.normalLoad += 1000; } },
  { name: "contact distance", code: "TN_VERIFY_PHYSICS_WHEEL_CONTACT_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.contact!.distance += 1; } },
  { name: "contact point", code: "TN_VERIFY_PHYSICS_WHEEL_CONTACT_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.contact!.point = [1, 0.05, 0]; } },
  { name: "contact normal", code: "TN_VERIFY_PHYSICS_WHEEL_CONTACT_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.wheels[0]!.contact!.normal = [0, 0, 0]; } },
  { name: "visual suspension position", code: "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.visuals[0]!.position = [10, 0, 0]; } },
  { name: "visual steering angle", code: "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.visuals[1]!.steeringAngle = 1; } },
  { name: "visual spin angle", code: "TN_VERIFY_PHYSICS_WHEEL_VISUAL_NUMERIC_MISMATCH", mutate: (value: AdvancedPhysicsWheelTrace) => { value.scenarios.steering.visuals[0]!.spinAngle = 1; } },
] as const) {
  test(`advanced physics wheel evidence fails closed for isolated ${testCase.name} numeric drift`, () => {
    assert.ok(diagnosticsAfter(testCase.mutate).some((diagnostic) => diagnostic.code === testCase.code));
  });
}

test("advanced physics wheel evidence proves the drive flag causal control", () => {
  assert.ok(diagnosticsAfter((value) => { value.scenarios.driveCausalNegative.speed = value.scenarios.asphalt.speed; }).some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_WHEEL_DRIVE_CAUSAL_NEGATIVE"));
});

test("advanced physics wheel evidence proves the steering flag causal control", () => {
  assert.ok(diagnosticsAfter((value) => { value.scenarios.steeringCausalNegative.chassisPosition[0] = 1; value.scenarios.steeringCausalNegative.chassisRotation = yaw(0.2); }).some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_WHEEL_STEERING_CAUSAL_NEGATIVE"));
});

test("advanced physics wheel evidence proves the braked flag causal control", () => {
  assert.ok(diagnosticsAfter((value) => { value.scenarios.brakingCausalNegative.speed = value.scenarios.braking.speed; }).some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_WHEEL_BRAKE_CAUSAL_NEGATIVE"));
});

test("advanced physics wheel evidence fails closed on invalid visual interpolation semantics", () => {
  assert.ok(diagnosticsAfter((value) => { value.scenarios.steering.visuals[0]!.interpolatedSpinAngle = 2; }).some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_WHEEL_VISUAL_INTERPOLATION"));
});

test("advanced physics wheel evidence accepts shortest interpolation across the wrap boundary", () => {
  const web = trace("web");
  const native = trace("bevy");
  for (const value of [web, native]) {
    const visual = value.scenarios.steering.visuals[0]!;
    visual.previousSpinAngle = 3.1;
    visual.spinAngle = -3.1;
    visual.interpolatedSpinAngle = -Math.PI;
  }
  assert.deepEqual(validateAdvancedPhysicsWheelEvidence(web, native), []);
  native.scenarios.steering.visuals[0]!.interpolatedSpinAngle = 0;
  assert.ok(validateAdvancedPhysicsWheelEvidence(web, native).some((diagnostic) => diagnostic.code === "TN_VERIFY_PHYSICS_WHEEL_VISUAL_INTERPOLATION"));
});
