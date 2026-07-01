import assert from "node:assert/strict";
import test from "node:test";

import { NumberEx, Quat, TransformMath, Vec3 } from "./index.js";

test("should compute yaw quaternions deterministically", () => {
  assert.deepEqual(Quat.fromYaw(Math.PI / 2).map((value) => NumberEx.round(value, 6)), [0, 0.707107, 0, 0.707107]);
  assert.equal(NumberEx.round(Quat.yaw(Quat.fromYaw(Math.PI / 2)), 6), 1.570796);
});

test("should compute lookAt quaternions without host access", () => {
  const rotation = Quat.lookAt([0, 0, 0], [1, 0, 0]);

  assert.equal(rotation.every(Number.isFinite), true);
  assert.deepEqual(rotation.map((value) => NumberEx.round(value, 6)), [0, 0.707107, 0, 0.707107]);
});

test("should compute vector and transform helpers deterministically", () => {
  assert.deepEqual(Vec3.round(Vec3.add([1.1111, 0, 2], Vec3.scale({ x: 2, y: 4, z: -1 }, 0.5)), 2), [2.11, 2, 1.5]);
  assert.equal(NumberEx.round(Vec3.distance2d([0, 99, 0], [3, -4, 4]), 3), 5);
  assert.deepEqual(TransformMath.pose({ position: [1, 2, 3], yaw: Math.PI }).position, [1, 2, 3]);
});
