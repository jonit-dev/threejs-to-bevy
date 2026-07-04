import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "./errors.js";
import { boxCollider, capsuleCollider, meshCollider, rigidBody, sphereCollider } from "./physics.js";

test("physics should create deterministic collider filters and slopes", () => {
  assert.deepEqual(boxCollider([1, 2, 3], { layer: "player", mask: ["world", "sensor"], slope: { axis: "x", direction: 1, rise: 1, run: 2 }, trigger: true }), {
    kind: "box",
    layer: "player",
    mask: ["world", "sensor"],
    size: [1, 2, 3],
    slope: { axis: "x", direction: 1, rise: 1, run: 2 },
    trigger: true,
  });
  assert.deepEqual(sphereCollider(1, { layer: "sensor" }), {
    kind: "sphere",
    layer: "sensor",
    radius: 1,
    trigger: undefined,
  });
  assert.deepEqual(capsuleCollider(0.5, 2, { mask: ["world"] }), {
    height: 2,
    kind: "capsule",
    mask: ["world"],
    radius: 0.5,
    trigger: undefined,
  });
  assert.deepEqual(meshCollider({ layer: "world" }), {
    kind: "mesh",
    layer: "world",
    trigger: undefined,
  });
});

test("physics should create primitive solver material and body metadata", () => {
  assert.deepEqual(
    rigidBody("dynamic", {
      angularVelocity: [0, 0.5, 0],
      damping: 0.1,
      gravityScale: 0.5,
      inverseMass: 0.5,
      mass: 2,
      sleepThreshold: 0.01,
      solverIterations: 8,
      velocity: [0, -1, 0],
    }),
    {
      angularVelocity: [0, 0.5, 0],
      damping: 0.1,
      enabledRotations: undefined,
      enabledTranslations: undefined,
      gravityScale: 0.5,
      inverseMass: 0.5,
      kind: "dynamic",
      mass: 2,
      sleepThreshold: 0.01,
      solverIterations: 8,
      velocity: [0, -1, 0],
    },
  );
  assert.deepEqual(rigidBody("static", { inverseMass: 0 }), {
    angularVelocity: undefined,
    damping: undefined,
    enabledRotations: undefined,
    enabledTranslations: undefined,
    gravityScale: undefined,
    inverseMass: 0,
    kind: "static",
    mass: undefined,
    sleepThreshold: undefined,
    solverIterations: undefined,
    velocity: undefined,
  });
  assert.deepEqual(boxCollider([1, 1, 1], { friction: 0.75, restitution: 0.25 }), {
    friction: 0.75,
    kind: "box",
    restitution: 0.25,
    size: [1, 1, 1],
    slope: undefined,
    trigger: undefined,
  });
});

test("physics should reject invalid portable filter names", () => {
  assertSdkCode(() => boxCollider([1, 1, 1], { layer: "" }), "TN_SDK_PHYSICS_FILTER_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { mask: ["world", ""] }), "TN_SDK_PHYSICS_FILTER_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { slope: { axis: "y" as "x", direction: 1, rise: 1, run: 1 } }), "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { slope: { axis: "x", direction: 0 as 1, rise: 1, run: 1 } }), "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { slope: { axis: "x", direction: 1, rise: 0, run: 1 } }), "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID");
});

test("physics should reject invalid primitive solver metadata", () => {
  assertSdkCode(() => rigidBody("dynamic", { angularVelocity: [0, Number.NaN, 0] }), "TN_SDK_PHYSICS_BODY_INVALID_ANGULAR_VELOCITY");
  assertSdkCode(() => rigidBody("dynamic", { damping: -1 }), "TN_SDK_PHYSICS_BODY_INVALID_DAMPING");
  assertSdkCode(() => rigidBody("dynamic", { gravityScale: Number.NaN }), "TN_SDK_PHYSICS_BODY_INVALID_GRAVITY_SCALE");
  assertSdkCode(() => rigidBody("dynamic", { inverseMass: 1, mass: 2 }), "TN_SDK_PHYSICS_BODY_INVALID_INVERSE_MASS");
  assertSdkCode(() => rigidBody("kinematic", { inverseMass: 1 }), "TN_SDK_PHYSICS_BODY_INVALID_INVERSE_MASS");
  assertSdkCode(() => rigidBody("dynamic", { sleepThreshold: -1 }), "TN_SDK_PHYSICS_BODY_INVALID_SLEEP_THRESHOLD");
  assertSdkCode(() => rigidBody("dynamic", { solverIterations: 65 }), "TN_SDK_PHYSICS_BODY_INVALID_SOLVER_ITERATIONS");
  assertSdkCode(() => boxCollider([1, 1, 1], { friction: -1 }), "TN_SDK_PHYSICS_COLLIDER_INVALID_FRICTION");
  assertSdkCode(() => boxCollider([1, 1, 1], { restitution: 1.5 }), "TN_SDK_PHYSICS_COLLIDER_INVALID_RESTITUTION");
});

function assertSdkCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error) => error instanceof SdkError && error.code === code);
}
