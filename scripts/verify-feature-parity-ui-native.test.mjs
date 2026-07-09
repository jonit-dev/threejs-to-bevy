import assert from "node:assert/strict";
import test from "node:test";

import { compareUiNativeReports } from "./verify-feature-parity-ui-native.mjs";

test("should detect world attachment or caret trace drift", () => {
  const web = { attachments: { projections: [{ node: "enemy.nameplate" }] }, effects: { effects: [] }, textEdit: { frames: [{ caret: 3 }] } };
  const native = {
    attachments: { projections: [] },
    effects: { effects: [] },
    images: { images: [{ atlas: {}, nineSlice: {}, node: "quest.frame" }] },
    textEdit: { frames: [{ caret: 2 }] },
    visualEffects: { effects: [{ gradient: {}, node: "advanced.ui", shadow: {} }] },
  };
  assert.deepEqual(compareUiNativeReports(web, native).map((entry) => entry.key), ["attachments", "textEdit"]);
});
