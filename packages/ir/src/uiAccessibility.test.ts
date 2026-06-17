import assert from "node:assert/strict";
import test from "node:test";

import { auditUiAccessibility } from "./uiAccessibility.js";
import type { IUiIr } from "./types.js";

test("uiAccessibility should report slider without accessible name when focusable", () => {
  const report = auditUiAccessibility({
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "volume",
      kind: "slider",
      focusable: true,
      action: "SetVolume",
      value: 0.5,
    },
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.diagnostics[0], {
    code: "TN_UI_A11Y_NAME_MISSING",
    message: "UI node 'volume' is focusable or interactive and needs an accessible name.",
    path: "ui.nodes[root]",
    repairHint: "ui.nodes[root].accessibilityLabel",
    severity: "error",
  });
});

test("uiAccessibility should allow decorative image without accessible name when presentation role is set", () => {
  const report = auditUiAccessibility(makeUi());

  assert.deepEqual(report.diagnostics.filter((diagnostic) => diagnostic.code === "TN_UI_A11Y_IMAGE_NAME_MISSING"), []);
  assert.equal(report.ok, true);
});

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "decorative",
      kind: "image",
      role: "none",
      src: "assets/ui/divider.png",
    },
  };
}
