import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";
import {
  ADVANCED_PHYSICS_JOINT_TRACE_SCHEMA,
  ADVANCED_PHYSICS_JOINT_TRACE_VERSION,
  validateAdvancedPhysicsJointEvidence,
  validateAdvancedPhysicsJointFixture,
  type AdvancedPhysicsJointExpectedManifest,
  type AdvancedPhysicsJointScenarios,
  type AdvancedPhysicsJointTrace,
} from "./advancedPhysicsJoints.js";

const fixture = new URL("../../../packages/ir/fixtures/conformance/advanced-physics-joints/game.bundle/", import.meta.url);

async function fixtureInputs(): Promise<{ expected: AdvancedPhysicsJointExpectedManifest; scenarios: AdvancedPhysicsJointScenarios; world: IWorldIr }> {
  const [world, scenarios, expected] = await Promise.all([
    readFile(new URL("world.ir.json", fixture), "utf8"),
    readFile(new URL("joints.scenarios.json", fixture), "utf8"),
    readFile(new URL("joint-trace.expected.json", fixture), "utf8"),
  ]);
  return { expected: JSON.parse(expected), scenarios: JSON.parse(scenarios), world: JSON.parse(world) };
}

function trace(runtime: "bevy" | "web", expected: AdvancedPhysicsJointExpectedManifest): AdvancedPhysicsJointTrace {
  const lifecycleBase = runtime === "web" ? 10 : 100;
  const observations = expected.perKind.ordered.map((joint, index) => ({
    active: true,
    connectedEntity: joint.connectedEntity,
    entity: joint.entity,
    kind: joint.kind,
    lifecycle: lifecycleBase,
  }));
  return {
    bundleHash: "sha256-bundle",
    fixture: "advanced-physics-joints",
    fixedDt: 1 / 120,
    loadRamp: {
      events: [{ observation: { connectedEntity: "anchor.fixed", entity: "joint.fixed", force: 650, kind: "fixed", phase: "break", torque: 20 }, tick: 3 }],
      removedAtTick: 4,
      samples: expected.loadRamp.appliedForces.map((appliedForce, tick) => ({
        appliedForce,
        observation: { active: tick < 3, connectedEntity: "anchor.fixed", entity: "joint.fixed", force: appliedForce, kind: "fixed", lifecycle: lifecycleBase + tick, torque: appliedForce * 0.03 },
        relativePositionError: 0.001,
        relativeRotationError: 0.001,
        tick,
      })),
    },
    patchReconcile: {
      bodyRebuilds: 0,
      jointRebuilds: 3,
      steps: expected.patchReconcile.actions.map((action, index) => ({
        action,
        observations: action === "despawn" ? observations.filter((joint) => joint.entity !== "joint.hinge") : observations.map((joint) => joint.entity === "joint.hinge" ? { ...joint, lifecycle: lifecycleBase + Math.min(index, 2) } : joint),
      })),
      unrelatedBodyHandlesPreserved: true,
    },
    perKind: observations,
    runtime,
    schema: ADVANCED_PHYSICS_JOINT_TRACE_SCHEMA,
    sourceHash: "sha256-source",
    version: ADVANCED_PHYSICS_JOINT_TRACE_VERSION,
  };
}

test("advanced physics joint fixture covers every kind, load ramp, and patch reconciliation", async () => {
  const { expected, scenarios, world } = await fixtureInputs();

  assert.deepEqual(validateAdvancedPhysicsJointFixture(world, scenarios, expected), []);
  assert.deepEqual(expected.perKind.ordered.map((joint) => joint.kind), ["ball", "fixed", "hinge", "rope", "slider", "suspension"]);
  assert.ok(expected.loadRamp.appliedForces.some((force) => force < expected.loadRamp.breakForce));
  assert.ok(expected.loadRamp.appliedForces.some((force) => force > expected.loadRamp.breakForce));
  assert.deepEqual(expected.patchReconcile.actions, ["initial", "patch", "despawn", "spawn"]);
});

test("advanced physics joint fixture requires finite manifest-owned pose bounds", async () => {
  const { expected, scenarios, world } = await fixtureInputs();
  expected.perKind.maximumRelativePositionError = Number.NaN;

  const codes = validateAdvancedPhysicsJointFixture(world, scenarios, expected).map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_POSE_BOUNDS"));
});

test("advanced physics joint evidence accepts the canonical paired normalized trace shape", async () => {
  const { expected } = await fixtureInputs();

  assert.deepEqual(validateAdvancedPhysicsJointEvidence(trace("web", expected), trace("bevy", expected), expected), []);
});

test("advanced physics joint evidence rejects inactive per-kind observations", async () => {
  const { expected } = await fixtureInputs();
  const native = trace("bevy", expected);
  native.perKind[0]!.active = false;

  const codes = validateAdvancedPhysicsJointEvidence(trace("web", expected), native, expected).map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_KIND_OUTCOME"));
});

test("advanced physics joint evidence rejects duplicate break events and early removal", async () => {
  const { expected } = await fixtureInputs();
  const native = trace("bevy", expected);
  native.loadRamp.events.push({ observation: { connectedEntity: "anchor.fixed", entity: "joint.fixed", force: 800, kind: "fixed", phase: "break", torque: 25 }, tick: 4 });
  native.loadRamp.removedAtTick = 3;

  const codes = validateAdvancedPhysicsJointEvidence(trace("web", expected), native, expected).map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_BREAK_ONCE"));
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_SAFE_REMOVAL"));
});

test("advanced physics joint evidence rejects fixed-joint drift below the break threshold", async () => {
  const { expected } = await fixtureInputs();
  const native = trace("bevy", expected);
  native.loadRamp.samples[2]!.relativePositionError = expected.perKind.maximumRelativePositionError + 0.01;

  const codes = validateAdvancedPhysicsJointEvidence(trace("web", expected), native, expected).map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_FIXED_LOAD_HOLD"));
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_POSE_PARITY"));
});

test("advanced physics joint evidence rejects unrelated body churn and rebuild budget drift", async () => {
  const { expected } = await fixtureInputs();
  const native = trace("bevy", expected);
  native.patchReconcile.bodyRebuilds = 1;
  native.patchReconcile.unrelatedBodyHandlesPreserved = false;

  const codes = validateAdvancedPhysicsJointEvidence(trace("web", expected), native, expected).map((diagnostic) => diagnostic.code);
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_REBUILD_BUDGET"));
  assert.ok(codes.includes("TN_VERIFY_PHYSICS_JOINT_UNRELATED_HANDLE_CHURN"));
});
