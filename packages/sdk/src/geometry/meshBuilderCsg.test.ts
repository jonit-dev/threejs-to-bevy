import assert from "node:assert/strict";
import test from "node:test";

import { solveMeshBuilderCsg } from "./meshBuilderCsg.js";
import { computeBounds, makeBox, makeFrustum, transformPart, type IMeshBuilderPart } from "./meshBuilderParts.js";

test("should remove interior volume when subtracting cylinder from box", () => {
  const box = makeBox(2, 2, 2);
  const cylinder = makeFrustum(0.45, 0.45, 3, 24);

  const result = solveMeshBuilderCsg(box, cylinder, "subtract");

  assert.deepEqual(computeBounds(result.positions), computeBounds(box.positions));
  assert.equal(rayHitsPart(result, [0, 2, 0], [0, -1, 0]), 0);
  assert.ok(result.indices.length > box.indices.length);
  const vertexCount = result.positions.length / 3;
  assert.equal(result.normals.length, vertexCount * 3);
  assert.equal(result.uvs.length, vertexCount * 2);
  assert.equal(result.colors.length, vertexCount * 4);
  assert.ok([...result.positions, ...result.normals, ...result.uvs, ...result.colors].every(Number.isFinite));
  assert.ok(result.indices.every((vertex) => vertex >= 0 && vertex < vertexCount));
  assert.ok(result.uvs.some((value) => value > 0 && value < 1));
});

test("should keep only overlap when intersecting offset boxes", () => {
  const left = makeBox(2, 2, 2);
  const right = transformPart(makeBox(2, 2, 2), {
    position: [0.75, 0.25, -0.5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });

  const result = solveMeshBuilderCsg(left, right, "intersect");

  assertBoundsClose(computeBounds(result.positions), {
    min: [-0.25, -0.75, -1],
    max: [1, 1, 0.5],
  });
});

test("should produce identical output when solving same operands twice", () => {
  const left = makeBox(2, 2, 2);
  const right = transformPart(makeBox(1.25, 1.25, 1.25), {
    position: [0.5, 0.5, 0.5],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });

  const first = solveMeshBuilderCsg(left, right, "union");
  const second = solveMeshBuilderCsg(left, right, "union");

  assert.deepEqual(Buffer.from(new Float32Array(second.positions).buffer), Buffer.from(new Float32Array(first.positions).buffer));
  assert.deepEqual(Buffer.from(new Uint32Array(second.indices).buffer), Buffer.from(new Uint32Array(first.indices).buffer));
  assert.deepEqual(Buffer.from(new Float32Array(second.uvs).buffer), Buffer.from(new Float32Array(first.uvs).buffer));
  assert.deepEqual(Buffer.from(new Float32Array(second.colors).buffer), Buffer.from(new Float32Array(first.colors).buffer));
});

test("should emit no degenerate triangles when operands share coplanar faces", () => {
  const left = transformPart(makeBox(1, 1, 1), {
    position: [-0.5, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });
  const right = transformPart(makeBox(1, 1, 1), {
    position: [0.5, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
  });

  const result = solveMeshBuilderCsg(left, right, "union");

  for (let index = 0; index < result.indices.length; index += 3) {
    const area = triangleArea(
      positionAt(result, result.indices[index]!),
      positionAt(result, result.indices[index + 1]!),
      positionAt(result, result.indices[index + 2]!),
    );
    assert.ok(area > 1e-10, `triangle ${index / 3} has area ${area}`);
  }
});

function assertBoundsClose(
  actual: { min: readonly number[]; max: readonly number[] },
  expected: { min: readonly number[]; max: readonly number[] },
): void {
  for (let axis = 0; axis < 3; axis += 1) {
    assert.ok(Math.abs(actual.min[axis]! - expected.min[axis]!) < 1e-8);
    assert.ok(Math.abs(actual.max[axis]! - expected.max[axis]!) < 1e-8);
  }
}

function rayHitsPart(part: IMeshBuilderPart, origin: readonly number[], direction: readonly number[]): number {
  let hits = 0;
  for (let index = 0; index < part.indices.length; index += 3) {
    if (rayTriangleDistance(
      origin,
      direction,
      positionAt(part, part.indices[index]!),
      positionAt(part, part.indices[index + 1]!),
      positionAt(part, part.indices[index + 2]!),
    ) !== undefined) {
      hits += 1;
    }
  }
  return hits;
}

function rayTriangleDistance(
  origin: readonly number[],
  direction: readonly number[],
  a: readonly number[],
  b: readonly number[],
  c: readonly number[],
): number | undefined {
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const h = cross(direction, edge2);
  const determinant = dot(edge1, h);
  if (Math.abs(determinant) < 1e-10) {
    return undefined;
  }
  const inverse = 1 / determinant;
  const s = subtract(origin, a);
  const u = inverse * dot(s, h);
  if (u < 0 || u > 1) {
    return undefined;
  }
  const q = cross(s, edge1);
  const v = inverse * dot(direction, q);
  if (v < 0 || u + v > 1) {
    return undefined;
  }
  const distance = inverse * dot(edge2, q);
  return distance > 1e-10 ? distance : undefined;
}

function triangleArea(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  const normal = cross(subtract(b, a), subtract(c, a));
  return Math.hypot(normal[0], normal[1], normal[2]) * 0.5;
}

function positionAt(part: IMeshBuilderPart, vertex: number): [number, number, number] {
  return [
    part.positions[vertex * 3]!,
    part.positions[vertex * 3 + 1]!,
    part.positions[vertex * 3 + 2]!,
  ];
}

function subtract(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
}

function cross(a: readonly number[], b: readonly number[]): [number, number, number] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

function dot(a: readonly number[], b: readonly number[]): number {
  return a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
}
