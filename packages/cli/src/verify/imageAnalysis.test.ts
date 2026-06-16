import assert from "node:assert/strict";
import test from "node:test";

import { analyzeNonblank, absoluteRegion, averageColor, compareFrames, cropFrame, parseHexColor } from "./imageAnalysis.js";

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

test("should crop normalized regions and compare detailed deltas", () => {
  const width = 100;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  fillRegion(data, width, height, { height: 20, width: 20, x: 10, y: 10 }, [200, 40, 40]);
  const frame = { data, height, width };
  const cropped = cropFrame(frame, absoluteRegion(frame, { x: 0.1, y: 0.1, width: 0.2, height: 0.2 }));
  const average = averageColor(cropped);

  assert.ok(average.red > 0.7);
  assert.deepEqual(parseHexColor("#ff0000"), { blue: 0, green: 0, red: 1 });
});

function fillRegion(
  data: Uint8ClampedArray,
  frameWidth: number,
  frameHeight: number,
  region: { height: number; width: number; x: number; y: number },
  rgb: [number, number, number],
): void {
  for (let row = region.y; row < region.y + region.height; row += 1) {
    for (let column = region.x; column < region.x + region.width; column += 1) {
      const index = (row * frameWidth + column) * 4;
      data[index] = rgb[0];
      data[index + 1] = rgb[1];
      data[index + 2] = rgb[2];
      data[index + 3] = 255;
    }
  }
}
