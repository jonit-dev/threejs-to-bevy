import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

import { analyzePngChange, collectNodeKinds, comparePngs } from "./verify-feature-parity-ui-native.mjs";

test("should derive observed UI kinds from the fixture tree", () => {
  const root = { children: [{ children: [{ id: "jump", kind: "touchControl" }], id: "stack", kind: "stack" }], id: "root", kind: "column" };
  assert.deepEqual([...collectNodeKinds(root)].sort(), ["column", "stack", "touchControl"]);
});

test("should measure the actual paired capture pixels", () => {
  const left = solid([0, 0, 0, 255]);
  const right = solid([255, 0, 0, 255]);
  assert.deepEqual(comparePngs(left, right), { differingPixelRatio: 1, meanAbsoluteError: 0.333333 });
});

test("should locate and summarize causal feature pixels", () => {
  const baseline = frame(3, 2, [20, 20, 20, 255]);
  const variant = frame(3, 2, [20, 20, 20, 255]);
  const parsed = PNG.sync.read(variant);
  parsed.data.set([80, 40, 20, 255], (1 * parsed.width + 2) * 4);

  assert.deepEqual(analyzePngChange(baseline, PNG.sync.write(parsed)), {
    bounds: { bottom: 1, left: 2, right: 2, top: 1 },
    changedPixels: 1,
    differingPixelRatio: 0.166667,
    meanBaselineRgb: [20, 20, 20],
    meanVariantRgb: [80, 40, 20],
  });
});

function solid(color) {
  return frame(2, 2, color);
}

function frame(width, height, color) {
  const png = new PNG({ height, width });
  for (let index = 0; index < png.data.length; index += 4) png.data.set(color, index);
  return PNG.sync.write(png);
}
