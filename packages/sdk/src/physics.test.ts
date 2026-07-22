import assert from "node:assert/strict";
import test from "node:test";

import * as sdk from "./index.js";
import { SdkError } from "./errors.js";
import { aerodynamicBody, aerodynamicSurface, boxCollider, capsuleCollider, meshCollider, physicsSurface, rigidBody, sphereCollider, thruster, tireModel, wheelAssembly, wheelControlInput, windVolume, type PhysicsColliderKind } from "./physics.js";

type AssertNever<T extends never> = T;
type UnsupportedPublicColliderKind = AssertNever<Exclude<PhysicsColliderKind, "box" | "capsule" | "mesh" | "sphere">>;

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

test("physics should expose only promoted portable collider helpers", () => {
  const _unsupportedColliderKind: UnsupportedPublicColliderKind | undefined = undefined;
  assert.equal(_unsupportedColliderKind, undefined);
  assert.deepEqual(
    [boxCollider([1, 2, 3]), sphereCollider(1), capsuleCollider(0.5, 2), meshCollider()].map((collider) => collider.kind),
    ["box", "sphere", "capsule", "mesh"],
  );
  assert.equal("cylinderCollider" in sdk, false);
});

test("physics should author bounded vehicle contracts without losing stable references", () => {
  const tire = tireModel({ lateralSlipCurve: [{ slip: -1, grip: 0.5 }, { slip: 1, grip: 0.5 }], loadSensitivity: 1, longitudinalSlipCurve: [{ slip: -1, grip: 0.7 }, { slip: 1, grip: 0.7 }], rollingResistance: 0.02 });
  const assembly = wheelAssembly([{ attachment: [-1, 0, 1], braked: true, driven: true, id: "front-left", radius: 0.35, steering: true, suspension: { damperRate: 2400, springRate: 30_000, travel: 0.25 }, tire: "tire.sport", visual: "wheel.front-left", width: 0.24 }], { maxSteeringAngle: 0.6, maxSuspensionForce: 20_000, maxTireForce: 12_000 });
  assert.equal(tire.longitudinalSlipCurve[0]?.slip, -1);
  assert.equal(assembly.wheels[0]?.visual, "wheel.front-left");
  assert.deepEqual(physicsSurface({ combineRule: "multiply", grip: 0.6, rollingResistance: 0.04 }), { combineRule: "multiply", grip: 0.6, rollingResistance: 0.04 });
  assert.deepEqual(wheelControlInput({ brake: 0.25, drive: -0.5, steering: 1 }), { brake: 0.25, drive: -0.5, steering: 1 });
  assert.throws(() => tireModel({ ...tire, lateralSlipCurve: [{ slip: 0, grip: 1 }, { slip: 0, grip: 0.5 }] }), (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_PHYSICS_TIRE_SLIP_CURVE_NON_MONOTONIC");
  assert.throws(() => wheelControlInput({ brake: 1.1, drive: 0, steering: 0 }), (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_PHYSICS_WHEEL_CONTROL_INVALID");
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
  assertSdkCode(() => boxCollider([1, 1, 1], { mask: Array.from({ length: 33 }, (_, index) => `layer.${index}`) }), "TN_SDK_PHYSICS_FILTER_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { contact: { phases: [] } }), "TN_SDK_PHYSICS_FILTER_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { sensor: { phases: [] } }), "TN_SDK_PHYSICS_SENSOR_INVALID");
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
  assertSdkCode(() => capsuleCollider(0.6, 1), "TN_SDK_PHYSICS_COLLIDER_INVALID_HEIGHT");
});

test("physics should create bounded aerodynamic declarations", () => {
  const wing = aerodynamicSurface({ area: 4, aspectRatio: 6, centerOfPressure: [0, 0, -1], control: { input: 0, maxDeflection: 0.4, response: 5 }, dragCurve: [{ angle: -1, coefficient: 0.5 }, { angle: 1, coefficient: 0.5 }], id: "wing.main", liftCurve: [{ angle: -1, coefficient: -1 }, { angle: 1, coefficient: 1 }], recoveryAngle: 0.25, stallAngle: 0.35 });
  const engine = thruster({ direction: [0, 0, -1], fuelHook: "fuel.main", id: "engine.main", maxForce: 5000, point: [0, 0, 1], response: 3, throttle: 0.5 });
  assert.deepEqual(aerodynamicBody({ dragArea: [1, 2, 3], maxForce: 100_000, surfaces: [wing], thrusters: [engine] }).surfaces.map((surface) => surface.id), ["wing.main"]);
  assert.deepEqual(windVolume({ gust: { amplitude: [1, 0, 0], frequency: 0.5, seed: 7 }, shape: "box", size: [10, 10, 10], velocity: [2, 0, 0] }).velocity, [2, 0, 0]);
});

test("physics should reject invalid aerodynamic bounds", () => {
  const wing = { area: 4, aspectRatio: 6, centerOfPressure: [0, 0, -1] as const, dragCurve: [{ angle: -1, coefficient: 0.5 }, { angle: 1, coefficient: 0.5 }], id: "wing.main", liftCurve: [{ angle: -1, coefficient: -1 }, { angle: 1, coefficient: 1 }], recoveryAngle: 0.25, stallAngle: 0.35 };
  assertSdkCode(() => aerodynamicSurface({ ...wing, recoveryAngle: 0.4 }), "TN_SDK_PHYSICS_AERO_STALL_INVALID");
  assertSdkCode(() => aerodynamicBody({ dragArea: [1, 1, 1], maxForce: 1, surfaces: [wing, wing] }), "TN_SDK_PHYSICS_AERO_ID_DUPLICATE");
  assertSdkCode(() => thruster({ direction: [0, 0, 0], id: "engine", maxForce: 1, point: [0, 0, 0], response: 1 }), "TN_SDK_PHYSICS_THRUSTER_DIRECTION_INVALID");
  assertSdkCode(() => windVolume({ shape: "sphere", velocity: [0, 0, 0] }), "TN_SDK_PHYSICS_WIND_SHAPE_INVALID");
});

function assertSdkCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error) => error instanceof SdkError && error.code === code);
}
