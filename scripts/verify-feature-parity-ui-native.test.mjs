import assert from "node:assert/strict";
import test from "node:test";

import { PNG } from "../packages/cli/node_modules/pngjs/lib/png.js";

import { collectNodeKinds, comparePngs } from "./verify-feature-parity-ui-native.mjs";

test("should derive observed UI kinds from the fixture tree", () => {
  const root = { children: [{ children: [{ id: "jump", kind: "touchControl" }], id: "stack", kind: "stack" }], id: "root", kind: "column" };
  assert.deepEqual([...collectNodeKinds(root)].sort(), ["column", "stack", "touchControl"]);
});

test("should measure the actual paired capture pixels", () => {
  const left = solid([0, 0, 0, 255]);
  const right = solid([255, 0, 0, 255]);
  assert.deepEqual(comparePngs(left, right), { differingPixelRatio: 1, meanAbsoluteError: 0.333333 });
});

function solid(color) {
  const frame = new PNG({ height: 2, width: 2 });
  for (let index = 0; index < frame.data.length; index += 4) frame.data.set(color, index);
  return PNG.sync.write(frame);
}
