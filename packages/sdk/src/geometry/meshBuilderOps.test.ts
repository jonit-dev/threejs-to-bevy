import assert from "node:assert/strict";
import test from "node:test";

import { makeBox, makeRaw } from "./meshBuilderParts.js";
import {
  coherentNoisePart,
  mirrorPart,
  sampleCoherentNoise,
  subdivideParts,
  weldParts,
} from "./meshBuilderOps.js";

test("should return identical displacement when sampling same seed twice", () => {
  const sample = () => Array.from({ length: 32 }, (_, index) =>
    sampleCoherentNoise(index * 0.07, index * 0.03, index * -0.05, 4, 42));
  assert.deepEqual(sample(), sample());

  const source = makeBox(1, 1, 1);
  const options = { amplitude: 0.2, frequency: 1.5, octaves: 4, seed: 42 };
  const firstBytes = Buffer.from(new Float32Array(coherentNoisePart(source, options).positions).buffer);
  const secondBytes = Buffer.from(new Float32Array(coherentNoisePart(source, options).positions).buffer);
  assert.deepEqual(secondBytes, firstBytes);
});

test("should correlate neighboring coherent samples more than random jitter", () => {
  const coherent = Array.from({ length: 128 }, (_, index) => sampleCoherentNoise(index * 0.01, 0.4, -0.7, 4, 91));
  let state = 91;
  const jitter = Array.from({ length: 128 }, () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x80000000 - 1;
  });
  const neighborDelta = (values: readonly number[]) => values.slice(1).reduce(
    (total, value, index) => total + Math.abs(value - (values[index] ?? 0)),
    0,
  ) / (values.length - 1);
  assert.ok(neighborDelta(coherent) < neighborDelta(jitter) * 0.25);
});

test("should reduce vertex count when welding duplicated cube corners", () => {
  const welded = weldParts([makeBox(1, 1, 1)], 1e-6)[0]!;
  assert.equal(makeBox(1, 1, 1).positions.length / 3, 24);
  assert.equal(welded.positions.length / 3, 8);
  assert.equal(welded.colors.length, 8 * 4);
  assert.equal(welded.uvs.length, 8 * 2);
});

test("should quadruple triangle count when subdividing once", () => {
  const triangle = makeRaw({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
  const subdivided = subdivideParts([triangle], 1)[0]!;
  assert.equal(subdivided.indices.length / 3, 4);
  assert.equal(subdivided.positions.length / 3, 6);
});

test("should sample coherent noise by position rather than vertex order", () => {
  const first = sampleCoherentNoise(0.125, -0.5, 1.25, 3, 7);
  sampleCoherentNoise(99, 101, -83, 3, 7);
  const repeated = sampleCoherentNoise(0.125, -0.5, 1.25, 3, 7);
  assert.equal(repeated, first);
});

test("should reflect positions and preserve outward winding when mirroring", () => {
  const triangle = makeRaw({ positions: [0, 0, 0, 1, 0, 0, 0, 1, 0] });
  const mirrored = mirrorPart(triangle, "x");
  assert.deepEqual(mirrored.positions.map((value) => Object.is(value, -0) ? 0 : value), [0, 0, 0, -1, 0, 0, 0, 1, 0]);
  assert.deepEqual(mirrored.indices, [0, 2, 1]);
  assert.deepEqual(mirrored.normals, [0, 0, 1, 0, 0, 1, 0, 0, 1]);
});
