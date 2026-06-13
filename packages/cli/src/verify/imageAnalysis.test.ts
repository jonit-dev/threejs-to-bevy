import assert from "node:assert/strict";
import test from "node:test";

import { analyzeNonblank, compareFrames } from "./imageAnalysis.js";

test("should detect blank image", () => {
  const blank = new Uint8ClampedArray(4 * 10 * 10);
  const result = analyzeNonblank({ data: blank, height: 10, width: 10 });

  assert.equal(result.ok, false);
  assert.equal(result.changedPixelRatio, 0);
});

test("should detect changed frames", () => {
  const first = new Uint8ClampedArray(4 * 10 * 10);
  const second = new Uint8ClampedArray(4 * 10 * 10);
  for (let index = 0; index < second.length; index += 4) {
    second[index] = 255;
    second[index + 1] = 255;
    second[index + 2] = 255;
    second[index + 3] = 255;
  }

  const result = compareFrames({ data: first, height: 10, width: 10 }, { data: second, height: 10, width: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.changedPixelRatio, 1);
  assert.equal(result.averageBrightnessDelta, 1);
  assert.deepEqual(result.averageColorDelta, { blue: 1, green: 1, red: 1 });
});

test("should quantify subtle lightening between frames", () => {
  const first = new Uint8ClampedArray(4 * 10 * 10);
  const second = new Uint8ClampedArray(4 * 10 * 10);
  for (let index = 0; index < first.length; index += 4) {
    first[index] = 100;
    first[index + 1] = 100;
    first[index + 2] = 100;
    first[index + 3] = 255;
    second[index] = 110;
    second[index + 1] = 110;
    second[index + 2] = 110;
    second[index + 3] = 255;
  }

  const result = compareFrames({ data: first, height: 10, width: 10 }, { data: second, height: 10, width: 10 });

  assert.equal(result.ok, true);
  assert.equal(result.changedPixelRatio, 1);
  assert.ok(result.averageBrightnessDelta > 0.03);
  assert.ok(result.averageBrightnessDelta < 0.04);
});
