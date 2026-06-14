import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "./errors.js";
import { boxCollider, capsuleCollider, meshCollider, sphereCollider } from "./physics.js";

test("physics should create deterministic collider filters", () => {
  assert.deepEqual(boxCollider([1, 2, 3], { layer: "player", mask: ["world", "sensor"], trigger: true }), {
    kind: "box",
    layer: "player",
    mask: ["world", "sensor"],
    size: [1, 2, 3],
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
});

function assertSdkCode(fn: () => unknown, code: string): void {
  assert.throws(fn, (error) => error instanceof SdkError && error.code === code);
}
