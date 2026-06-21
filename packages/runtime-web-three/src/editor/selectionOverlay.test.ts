import assert from "node:assert/strict";
import test from "node:test";

import { buildSelectionOverlay } from "./selectionOverlay.js";

test("should build read-only overlay model", () => {
  assert.deepEqual(buildSelectionOverlay({ bounds: { max: [1, 1, 1], min: [0, 0, 0] }, id: "world:0" }), {
    bounds: { max: [1, 1, 1], min: [0, 0, 0] },
    id: "world:0",
    readOnly: true,
  });
});
