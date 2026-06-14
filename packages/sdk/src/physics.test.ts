import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "./errors.js";
import { boxCollider, capsuleCollider, meshCollider, sphereCollider } from "./physics.js";

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

test("physics should reject invalid portable filter names", () => {
  assertSdkCode(() => boxCollider([1, 1, 1], { layer: "" }), "TN_SDK_PHYSICS_FILTER_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { mask: ["world", ""] }), "TN_SDK_PHYSICS_FILTER_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { slope: { axis: "y" as "x", direction: 1, rise: 1, run: 1 } }), "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { slope: { axis: "x", direction: 0 as 1, rise: 1, run: 1 } }), "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID");
  assertSdkCode(() => boxCollider([1, 1, 1], { slope: { axis: "x", direction: 1, rise: 0, run: 1 } }), "TN_SDK_PHYSICS_COLLIDER_SLOPE_INVALID");
});

function assertSdkCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error) => error instanceof SdkError && error.code === code);
}
