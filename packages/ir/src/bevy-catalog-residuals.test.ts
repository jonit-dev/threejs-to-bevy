import assert from "node:assert/strict";
import test from "node:test";

import { BEVY_CATALOG_RESIDUAL_ROWS } from "./bevyCatalogResiduals.js";

test("should cover every Bevy catalog residual row with triage evidence", () => {
  assert.equal(BEVY_CATALOG_RESIDUAL_ROWS.length, 13);
  for (const row of BEVY_CATALOG_RESIDUAL_ROWS) {
    assert.equal(row.baseline, "bevy-0.14.2", `${row.id} should declare baseline triage`);
    assert.notEqual(row.promotionCriteria.length, 0, `${row.id} should declare promotion criteria`);
    assert.equal(
      row.diagnosticCodes.length > 0 || row.reportEvidence.length > 0 || row.status === "promoted",
      true,
      `${row.id} should have diagnostics, report evidence, or a promoted bounded contract`,
    );
  }
});
