import assert from "node:assert/strict";
import test from "node:test";

import type { IPixelFrame } from "./imageAnalysis.js";
import { analyzeV9VisualBlankness, analyzeV9VisualRegions } from "./v9VisualMatrix.js";

test("should fail blank screenshots before region comparison", () => {
  const web = solidFrame(64, 64, 0);
  const bevy = solidFrame(64, 64, 120);
  const diagnostics = analyzeV9VisualBlankness(web, bevy, { bevyPath: "bevy.png", webPath: "web.png" });
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_V9_VISUAL_BLANK"));
});

test("should fail when a required visual region is missing", () => {
  const web = solidFrame(64, 64, 0);
  const bevy = solidFrame(64, 64, 120);
  const diagnostics = analyzeV9VisualRegions(web, bevy, [{ height: 0.5, width: 0.5, x: 0.25, y: 0.25 }]);
  assert.ok(diagnostics.some((diagnostic) => diagnostic.code === "TN_V9_VISUAL_REGION_MISSING"));
});

function solidFrame(width: number, height: number, value: number): IPixelFrame {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = value;
    data[index + 1] = value;
    data[index + 2] = value;
    data[index + 3] = 255;
  }
  return { data, height, width };
}
