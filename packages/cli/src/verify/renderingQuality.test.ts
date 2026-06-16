import assert from "node:assert/strict";
import test from "node:test";

import { analyzeRenderingQualityParity } from "./renderingQuality.js";
import type { IPixelFrame } from "./imageAnalysis.js";

test("rendering quality parity accepts matching fog and sky regions", () => {
  const web = fixtureFrame();
  const bevy = fixtureFrame({ sky: [110, 175, 215], fog: [198, 212, 198], foreground: [42, 88, 211] });

  const result = analyzeRenderingQualityParity(web, bevy);

  assert.equal(result.regions.every((region) => region.ok), true);
  assert.equal(result.fogEvidence.web.ok, true);
  assert.equal(result.fogEvidence.bevy.ok, true);
});

test("rendering quality parity rejects sky and fog region drift", () => {
  const web = fixtureFrame();
  const bevy = fixtureFrame({ sky: [20, 20, 40], fog: [35, 45, 70], foreground: [45, 80, 195] });

  const result = analyzeRenderingQualityParity(web, bevy);

  assert.equal(result.regions.some((region) => !region.ok), true);
  assert.equal(result.fogEvidence.bevy.ok, false);
});

function fixtureFrame(overrides: Partial<Record<"fog" | "foreground" | "sky", [number, number, number]>> = {}): IPixelFrame {
  const width = 100;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  fillRect(data, width, 0, 0, width, height, [120, 110, 90]);
  fillRect(data, width, 0, 0, width, 24, overrides.sky ?? [106, 174, 214]);
  fillRect(data, width, 24, 43, 20, 24, overrides.foreground ?? [36, 87, 214]);
  fillRect(data, width, 58, 42, 24, 24, overrides.fog ?? [201, 214, 199]);
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
