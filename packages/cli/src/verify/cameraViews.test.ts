import assert from "node:assert/strict";
import test from "node:test";

import { analyzeCameraViewParity } from "./cameraViews.js";
import type { IPixelFrame } from "./imageAnalysis.js";

test("camera view parity should accept matching semantic marker placement", () => {
  const web = frameWithMarkers();
  const bevy = frameWithMarkers({ offsetX: 2, offsetY: 1 });

  const result = analyzeCameraViewParity(web, bevy);

  assert.equal(result.ok, true);
  assert.deepEqual(result.markers.map((marker) => marker.ok), [true, true, true, true]);
});

test("camera view parity should reject shifted semantic marker placement", () => {
  const web = frameWithMarkers();
  const bevy = frameWithMarkers({ offsetX: 24, offsetY: 0 });

  const result = analyzeCameraViewParity(web, bevy);

  assert.equal(result.ok, false);
  assert.equal(result.markers.some((marker) => !marker.ok), true);
});

function frameWithMarkers(offset: { offsetX?: number; offsetY?: number } = {}): IPixelFrame {
  const width = 400;
  const height = 220;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 17;
    data[index + 1] = 19;
    data[index + 2] = 24;
    data[index + 3] = 255;
  }

  const offsetX = offset.offsetX ?? 0;
  const offsetY = offset.offsetY ?? 0;
  fillRect(data, width, 40 + offsetX, 45 + offsetY, 80, 70, [90, 90, 90]);
  fillRect(data, width, 145 + offsetX, 75 + offsetY, 80, 75, [85, 205, 255]);
  fillRect(data, width, 250 + offsetX, 20 + offsetY, 70, 75, [255, 136, 68]);
  fillRect(data, width, 250 + offsetX, 130 + offsetY, 70, 75, [34, 204, 85]);
  return { data, height, width };
}

function fillRect(
  data: Uint8ClampedArray,
  frameWidth: number,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number],
): void {
  for (let row = y; row < y + height; row += 1) {
    for (let column = x; column < x + width; column += 1) {
      const index = (row * frameWidth + column) * 4;
      data[index] = color[0];
      data[index + 1] = color[1];
      data[index + 2] = color[2];
      data[index + 3] = 255;
    }
  }
}
