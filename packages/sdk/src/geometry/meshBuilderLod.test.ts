import assert from "node:assert/strict";
import test from "node:test";

import { decimateMeshPart, meshTriangleAreaSquared } from "./meshBuilderLod.js";
import { makeSphere } from "./meshBuilderParts.js";

test("should reduce triangle count within tolerance when decimating to 0.25", () => {
  const source = makeSphere(1, 32, 16);
  const level = decimateMeshPart(source, 0.25);
  const ratio = level.indices.length / source.indices.length;
  assert.ok(ratio >= 0.1 && ratio <= 0.4, `triangle ratio ${ratio}`);
  for (let index = 0; index < level.indices.length; index += 3) {
    const triangle = level.indices.slice(index, index + 3);
    assert.equal(new Set(triangle).size, 3);
    assert.ok(meshTriangleAreaSquared(level.positions, triangle) > 1e-20);
  }
});

test("should produce identical levels when decimating same mesh twice", () => {
  const source = makeSphere(1, 24, 12);
  const first = decimateMeshPart(source, 0.25);
  const second = decimateMeshPart(source, 0.25);
  assert.deepEqual(Buffer.from(new Float32Array(second.positions).buffer), Buffer.from(new Float32Array(first.positions).buffer));
  assert.deepEqual(Buffer.from(new Float32Array(second.normals).buffer), Buffer.from(new Float32Array(first.normals).buffer));
  assert.deepEqual(Buffer.from(new Float32Array(second.uvs).buffer), Buffer.from(new Float32Array(first.uvs).buffer));
  assert.deepEqual(Buffer.from(new Float32Array(second.colors).buffer), Buffer.from(new Float32Array(first.colors).buffer));
  assert.deepEqual(Buffer.from(new Uint32Array(second.indices).buffer), Buffer.from(new Uint32Array(first.indices).buffer));
});

test("should preserve decimation ratio across uniformly scaled meshes", () => {
  const unit = makeSphere(1, 32, 16);
  const tiny = makeSphere(1e-6, 32, 16);
  const unitLevel = decimateMeshPart(unit, 0.25);
  const tinyLevel = decimateMeshPart(tiny, 0.25);
  const unitRatio = unitLevel.indices.length / unit.indices.length;
  const tinyRatio = tinyLevel.indices.length / tiny.indices.length;
  assert.ok(Math.abs(tinyRatio - unitRatio) < 0.01, `${tinyRatio} vs ${unitRatio}`);
  assert.ok(tinyRatio >= 0.1 && tinyRatio <= 0.4);
});
