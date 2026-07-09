import assert from "node:assert/strict";
import test from "node:test";

import { analyzeRenderingQualityParity, analyzeV9RenderingLightsParity } from "./renderingQuality.js";
import { analyzeVisualQuality, type IPixelFrame } from "./imageAnalysis.js";
import { gameQualityMetricBundle, namedRegionMetricBundle } from "./visualMetricBundles.js";

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

test("V9 rendering lights parity requires skybox reflection shadow dense and gizmo regions", () => {
  const web = v9FixtureFrame();
  const bevy = v9FixtureFrame({
    skybox: [76, 118, 164],
    reflection: [190, 210, 235],
    shadow: [56, 63, 76],
  });

  const result = analyzeV9RenderingLightsParity(web, bevy);

  assert.deepEqual(result.regions.map((region) => region.name), [
    "skybox",
    "reflection-probe",
    "point-shadow-pcf",
    "dense-hlod",
    "debug-gizmo",
  ]);
  assert.equal(result.regions.every((region) => region.ok), true);
});

test("V9 rendering lights parity rejects skybox and point-shadow drift", () => {
  const web = v9FixtureFrame();
  const bevy = v9FixtureFrame({
    skybox: [4, 8, 14],
    shadow: [245, 240, 232],
  });

  const result = analyzeV9RenderingLightsParity(web, bevy);

  assert.equal(result.regions.find((region) => region.name === "skybox")?.ok, false);
  assert.equal(result.regions.find((region) => region.name === "point-shadow-pcf")?.ok, false);
});

test("visual quality penalizes flat primitive frames", () => {
  const flat = flatFrame([80, 80, 80]);
  const result = analyzeVisualQuality(flat);

  assert.equal(result.ok, false);
  assert.equal(result.colorBucketCount, 1);
  assert.equal(result.localContrast, 0);
});

test("visual quality accepts styled scaffold color and contrast", () => {
  const styled = v9FixtureFrame({
    dense: [36, 140, 88],
    gizmo: [248, 196, 40],
    reflection: [210, 232, 255],
    shadow: [38, 44, 58],
    skybox: [64, 128, 196],
  });
  const result = analyzeVisualQuality(styled);

  assert.equal(result.ok, true);
  assert.equal(result.colorBucketCount >= result.thresholds.minColorBuckets, true);
  assert.equal(result.localContrast >= result.thresholds.minLocalContrast, true);
});

test("visual metric bundle summarizes game quality thresholds", () => {
  const styled = v9FixtureFrame({
    dense: [36, 140, 88],
    gizmo: [248, 196, 40],
    reflection: [210, 232, 255],
    shadow: [38, 44, 58],
    skybox: [64, 128, 196],
  });
  for (let index = 0; index < 12; index += 1) {
    fillRect(
      styled.data as Uint8ClampedArray,
      styled.width,
      (index % 6) * 12,
      78 + Math.floor(index / 6) * 8,
      8,
      6,
      [24 + index * 17, 80 + index * 9, 180 - index * 8],
    );
  }

  const bundle = gameQualityMetricBundle(styled);

  assert.equal(bundle.id, "game-quality");
  assert.equal(bundle.ok, true);
  assert.equal(Number(bundle.metrics.colorBucketCount) >= Number(bundle.thresholds.minColorBucketCount), true);
  assert.equal(Number(bundle.metrics.localContrastRatio) >= Number(bundle.thresholds.minLocalContrastRatio), true);
});

test("visual metric bundle reports named region drift", () => {
  const web = fixtureFrame();
  const bevy = fixtureFrame({ sky: [20, 20, 40] });

  const bundle = namedRegionMetricBundle("rendering-quality", web, bevy, [
    { name: "sky", region: { x: 0.18, y: 0.03, width: 0.64, height: 0.16 }, thresholds: { maxAverageBrightnessDelta: 0.08, maxAverageColorDelta: 0.08, maxChangedPixelRatio: 0.35 } },
  ]);

  assert.equal(bundle.id, "rendering-quality");
  assert.equal(bundle.ok, false);
  assert.equal(bundle.regions?.[0]?.name, "sky");
  assert.equal(bundle.regions?.[0]?.ok, false);
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

function v9FixtureFrame(
  overrides: Partial<Record<"dense" | "gizmo" | "reflection" | "shadow" | "skybox", [number, number, number]>> = {},
): IPixelFrame {
  const width = 100;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  fillRect(data, width, 0, 0, width, height, [98, 104, 94]);
  fillRect(data, width, 18, 3, 64, 18, overrides.skybox ?? [76, 118, 164]);
  fillRect(data, width, 40, 36, 20, 24, overrides.reflection ?? [190, 210, 235]);
  fillRect(data, width, 33, 58, 34, 18, overrides.shadow ?? [56, 63, 76]);
  fillRect(data, width, 8, 36, 22, 32, overrides.dense ?? [74, 118, 66]);
  fillRect(data, width, 70, 20, 22, 32, overrides.gizmo ?? [230, 194, 48]);
  return { data, height, width };
}

function flatFrame(color: [number, number, number]): IPixelFrame {
  const width = 100;
  const height = 100;
  const data = new Uint8ClampedArray(width * height * 4);
  fillRect(data, width, 0, 0, width, height, color);
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
