import assert from "node:assert/strict";
import test from "node:test";

import { BEVY_CATALOG_RESIDUAL_ROWS } from "./bevyCatalogResiduals.js";

test("should cover every Bevy catalog residual row with triage evidence", () => {
  assert.equal(BEVY_CATALOG_RESIDUAL_ROWS.length, 15);
  for (const row of BEVY_CATALOG_RESIDUAL_ROWS) {
    assert.equal(row.baseline, "bevy-0.14.2", `${row.id} should declare baseline triage`);
    assert.notEqual(row.promotionCriteria.length, 0, `${row.id} should declare promotion criteria`);
    assert.equal(
      row.diagnosticCodes.length > 0 || row.reportEvidence.length > 0 || row.status === "promoted",
      true,
      `${row.id} should have diagnostics, report evidence, or a promoted bounded contract`,
    );
  }
  const resizeScale = BEVY_CATALOG_RESIDUAL_ROWS.find((row) => row.id === "window.resize-scale");
  assert.equal(resizeScale?.status, "promoted");
  assert.deepEqual(resizeScale?.reportEvidence, ["web.window-resize-scale", "bevy.window-resize-scale"]);
  const windowPolicy = BEVY_CATALOG_RESIDUAL_ROWS.find((row) => row.id === "window.policy");
  assert.equal(windowPolicy?.status, "diagnostic-only");
  assert.equal(windowPolicy?.reportEvidence.length, 0);
});
