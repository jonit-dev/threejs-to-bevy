import assert from "node:assert/strict";
import test from "node:test";

import { BEVY_CATALOG_RESIDUAL_ROWS, residualDiagnosticCode } from "./bevyCatalogResiduals.js";

test("should cover every Bevy catalog residual row with triage evidence", () => {
  assert.equal(BEVY_CATALOG_RESIDUAL_ROWS.length, 22);
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
  assert.equal(residualDiagnosticCode("materials.advanced-pbr"), "TN_IR_MATERIAL_ADVANCED_PBR_UNSUPPORTED");
  assert.equal(residualDiagnosticCode("rendering.advanced-features"), "TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED");
});

test("should classify every shared visual residual boundary in the registry", () => {
  const expectedRows = [
    "geometry.advanced-deformation-csg",
    "geometry.storage-buffer",
    "materials.advanced-pbr",
    "materials.lightmaps",
    "materials.parallax",
    "rendering.advanced-features",
    "rendering.custom-post",
    "window.policy",
  ];
  for (const id of expectedRows) {
    const row = BEVY_CATALOG_RESIDUAL_ROWS.find((candidate) => candidate.id === id);
    assert.equal(row?.status, "diagnostic-only", `${id} should remain diagnostic-only`);
    assert.notEqual(row?.diagnosticCodes.length, 0, `${id} should own stable diagnostics`);
  }
});
