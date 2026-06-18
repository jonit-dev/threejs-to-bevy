import assert from "node:assert/strict";
import test from "node:test";

import {
  analyzeRegionMetrics,
  averageLuminance,
  computeLuminanceHistogram,
  detectCameraFramingDrift,
  histogramDelta,
  sampleEdgeEnergy,
} from "./analyze.js";

function solidFrame(width: number, height: number, color: readonly [number, number, number]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = color[0];
    data[index + 1] = color[1];
    data[index + 2] = color[2];
    data[index + 3] = 255;
  }
  return { data, height, width };
}

function imageAnalysisStub() {
  return {
    absoluteRegion(frame: { height: number; width: number }, region: { height: number; width: number; x: number; y: number }) {
      return {
        height: Math.max(1, Math.floor(frame.height * region.height)),
        width: Math.max(1, Math.floor(frame.width * region.width)),
        x: Math.floor(frame.width * region.x),
        y: Math.floor(frame.height * region.y),
      };
    },
    analyzeNonblank() {
      return { changedPixelRatio: 1, ok: true, threshold: 0.002 };
    },
    compareFramesDetailed(
      first: { data: ArrayLike<number>; height: number; width: number },
      second: { data: ArrayLike<number>; height: number; width: number },
    ) {
      let changedPixels = 0;
      let brightness = 0;
      let red = 0;
      let green = 0;
      let blue = 0;
      let maxChannel = 0;
      const total = first.width * first.height;
      for (let index = 0; index < first.data.length; index += 4) {
        const dr = Math.abs((first.data[index] ?? 0) - (second.data[index] ?? 0));
        const dg = Math.abs((first.data[index + 1] ?? 0) - (second.data[index + 1] ?? 0));
        const db = Math.abs((first.data[index + 2] ?? 0) - (second.data[index + 2] ?? 0));
        if (dr + dg + db > 12) {
          changedPixels += 1;
        }
        red += dr;
        green += dg;
        blue += db;
        maxChannel = Math.max(maxChannel, dr, dg, db);
        brightness += Math.abs(
          ((first.data[index] ?? 0) + (first.data[index + 1] ?? 0) + (first.data[index + 2] ?? 0)) / 3
          - ((second.data[index] ?? 0) + (second.data[index + 1] ?? 0) + (second.data[index + 2] ?? 0)) / 3,
        );
      }
      return {
        averageBrightnessDelta: brightness / total / 255,
        averageColorDelta: { blue: blue / total / 255, green: green / total / 255, red: red / total / 255 },
        changedPixelRatio: changedPixels / total,
        maxChannelDelta: maxChannel / 255,
        ok: true,
        p95ChannelDelta: maxChannel / 255,
        threshold: 0.001,
      };
    },
    cropFrame(
      frame: { data: ArrayLike<number>; height: number; width: number },
      region: { height: number; width: number; x: number; y: number },
    ) {
      const data = new Uint8ClampedArray(region.width * region.height * 4);
      for (let row = 0; row < region.height; row += 1) {
        for (let column = 0; column < region.width; column += 1) {
          const from = ((row + region.y) * frame.width + column + region.x) * 4;
          const to = (row * region.width + column) * 4;
          data[to] = frame.data[from] ?? 0;
          data[to + 1] = frame.data[from + 1] ?? 0;
          data[to + 2] = frame.data[from + 2] ?? 0;
          data[to + 3] = frame.data[from + 3] ?? 255;
        }
      }
      return { data, height: region.height, width: region.width };
    },
  };
}

test("visual calibration analyzer should compute region color and luminance deltas deterministically", () => {
  const web = solidFrame(100, 100, [200, 100, 50]);
  const bevy = solidFrame(100, 100, [200, 100, 50]);
  const shifted = solidFrame(100, 100, [220, 100, 50]);
  const region = { factor: "color", id: "swatch", region: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 } };
  const thresholds = { changedPixelRatio: 0.02, luminanceDelta: 0.02 };

  const identical = analyzeRegionMetrics({
    bevyFrame: bevy,
    fixture: { thresholds },
    imageAnalysis: imageAnalysisStub(),
    region,
    webFrame: web,
  });
  const drift = analyzeRegionMetrics({
    bevyFrame: shifted,
    fixture: { thresholds },
    imageAnalysis: imageAnalysisStub(),
    region,
    webFrame: web,
  });

  assert.equal(identical.failures.length, 0);
  assert.ok(drift.failures.length > 0);
  assert.equal(averageLuminance(web, region.region), averageLuminance(bevy, region.region));
  assert.ok(Math.abs(averageLuminance(web, region.region) - averageLuminance(shifted, region.region)) > 0);
  assert.equal(histogramDelta(computeLuminanceHistogram(web), computeLuminanceHistogram(bevy)), 0);
});

test("visual calibration analyzer should detect camera framing drift from edge samples", () => {
  const web = solidFrame(120, 80, [20, 20, 20]);
  const bevy = solidFrame(120, 80, [20, 20, 20]);
  for (let x = 54; x < 66; x += 1) {
    const index = (4 * 120 + x) * 4;
    web.data[index] = 240;
    web.data[index + 1] = 240;
    web.data[index + 2] = 240;
  }
  const region = { id: "frame-edge-top", region: { x: 0.45, y: 0.0, width: 0.1, height: 0.1 } };
  const stable = detectCameraFramingDrift(web, bevy, region, 0.05);
  const shifted = detectCameraFramingDrift(web, web, region, 0.05);

  assert.equal(stable.ok, false);
  assert.equal(shifted.ok, true);
  assert.ok(sampleEdgeEnergy(web, region.region) > sampleEdgeEnergy(bevy, region.region));
  assert.match(stable.regionId, /frame-edge-top/);
});
