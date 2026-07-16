import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

import { analyzePngChange, collectNodeKinds, comparePngs } from "./verify-feature-parity-ui-native.mjs";
import { nativeCaptureNeedsRetry, runNativeCaptureWithRetry } from "./visual-calibration/capture.mjs";

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

test("should retry only transient native swap-chain acquire timeouts", async () => {
  const delays = [];
  let attempts = 0;
  await runNativeCaptureWithRetry(async () => {
    attempts += 1;
    if (attempts < 3) {
      const error = new Error("Couldn't get swap chain texture");
      error.stderr = "A timeout was encountered while trying to acquire the next frame";
      throw error;
    }
  }, { delay: async (milliseconds) => { delays.push(milliseconds); } });
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [750, 1_500]);

  let deterministicAttempts = 0;
  await assert.rejects(
    runNativeCaptureWithRetry(async () => {
      deterministicAttempts += 1;
      throw new Error("UI node was not found for capture state");
    }, { delay: async () => {} }),
    /UI node was not found/,
  );
  assert.equal(deterministicAttempts, 1);

  const swapChainError = new Error("Couldn't get swap chain texture: A timeout was encountered while trying to acquire the next frame");
  assert.equal(await nativeCaptureNeedsRetry(swapChainError, new URL("missing-native-capture.png", import.meta.url)), true);
  assert.equal(await nativeCaptureNeedsRetry(swapChainError, new URL(import.meta.url).pathname), false);
});

function solid(color) {
  return frame(2, 2, color);
}

function frame(width, height, color) {
  const png = new PNG({ height, width });
  for (let index = 0; index < png.data.length; index += 4) png.data.set(color, index);
  return PNG.sync.write(png);
}
