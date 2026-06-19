import assert from "node:assert/strict";
import test from "node:test";

import { reportWebGeneratedAssetPolicy, reportWebWindowCatalogPolicy, traceWebTextInputEvents } from "./bevyCatalogResiduals.js";

test("should emit text input value events in order", () => {
  assert.deepEqual(traceWebTextInputEvents(["h", "he", "hero"]), [
    { action: "input", order: 1, value: "h" },
    { action: "input", order: 2, value: "he" },
    { action: "commit", order: 3, value: "hero" },
  ]);
});

test("should report window resize and scale-factor observations", () => {
  const report = reportWebWindowCatalogPolicy(1280, 720, 2);

  assert.deepEqual(report.resize, { height: 720, scaleFactor: 2, width: 1280 });
  assert.equal(report.diagnostics[0]?.code, "TN_CATALOG_WINDOW_MULTI_WINDOW_UNSUPPORTED");
});

test("should report generated assets as bundle artifacts", () => {
  assert.deepEqual(reportWebGeneratedAssetPolicy("generated.navmesh", "threenative.generated.navmesh"), {
    assetId: "generated.navmesh",
    path: "artifacts/generated/generated.navmesh.json",
    schema: "threenative.generated.navmesh",
    status: "bundle-artifact",
  });
});
