import assert from "node:assert/strict";
import test from "node:test";

import { BEVY_CATALOG_RESIDUAL_ROWS, diagnoseBevyCatalogResidualDeclarations } from "./bevyCatalogResiduals.js";

test("should reject IME behavior when target lacks text composition support", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    uiWindow: {
      ime: { path: "target.profile.json/targets/web/textComposition", targetProfile: "web-no-composition" },
    },
  });

  assert.equal(diagnostics[0]?.code, "TN_CATALOG_UI_IME_TARGET_UNSUPPORTED");
  assert.equal(diagnostics[0]?.target, "web-no-composition");
  assert.equal(diagnostics[0]?.path, "target.profile.json/targets/web/textComposition");
});

test("should reject non-deterministic UI routing and platform window policies", () => {
  const diagnostics = diagnoseBevyCatalogResidualDeclarations({
    uiWindow: {
      customMaterials: [{ id: "ui.hologram", shader: "custom" }],
      dragDropNodes: { deterministic: false },
      viewportNodes: { deterministic: false },
      windowPolicy: {
        clearColorRuntimeUpdate: true,
        cursorImage: "assets/cursor.png",
        lowPowerPresentMode: true,
        multiWindow: true,
      },
    },
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_CATALOG_UI_VIEWPORT_ROUTING_UNSUPPORTED",
    "TN_CATALOG_UI_DRAG_DROP_ROUTING_UNSUPPORTED",
    "TN_CATALOG_UI_CUSTOM_MATERIAL_UNSUPPORTED",
    "TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED",
    "TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED",
    "TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED",
    "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
  ]);
  assert.equal(diagnostics.every((diagnostic) => diagnostic.severity === "error"), true);
  const customMaterials = BEVY_CATALOG_RESIDUAL_ROWS.find((row) => row.id === "ui.custom-materials");
  assert.equal(customMaterials?.status, "diagnostic-only");
  assert.deepEqual(customMaterials?.diagnosticCodes, ["TN_CATALOG_UI_CUSTOM_MATERIAL_UNSUPPORTED"]);
  const viewportNodes = BEVY_CATALOG_RESIDUAL_ROWS.find((row) => row.id === "ui.viewport-nodes");
  assert.equal(viewportNodes?.status, "diagnostic-only");
  assert.deepEqual(viewportNodes?.diagnosticCodes, ["TN_CATALOG_UI_VIEWPORT_ROUTING_UNSUPPORTED"]);
  const dragDropNodes = BEVY_CATALOG_RESIDUAL_ROWS.find((row) => row.id === "ui.drag-drop-nodes");
  assert.equal(dragDropNodes?.status, "diagnostic-only");
  assert.deepEqual(dragDropNodes?.diagnosticCodes, ["TN_CATALOG_UI_DRAG_DROP_ROUTING_UNSUPPORTED"]);
  const windowPolicy = BEVY_CATALOG_RESIDUAL_ROWS.find((row) => row.id === "window.policy");
  assert.equal(windowPolicy?.status, "diagnostic-only");
  assert.deepEqual(windowPolicy?.diagnosticCodes, [
    "TN_CATALOG_WINDOW_CLEAR_COLOR_RUNTIME_UNSUPPORTED",
    "TN_CATALOG_WINDOW_CURSOR_UNSUPPORTED",
    "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED",
    "TN_CATALOG_WINDOW_POWER_POLICY_UNSUPPORTED",
  ]);
});
