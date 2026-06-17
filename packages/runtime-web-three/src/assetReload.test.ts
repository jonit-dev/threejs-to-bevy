import assert from "node:assert/strict";
import test from "node:test";

import { observeWebAssetReload } from "./assetReload.js";

test("assetReload should report equivalent web reload policy", () => {
  const report = observeWebAssetReload({
    changedAssets: [{ assetId: "tex.crate", change: "changed", path: "assets/crate.png" }],
    classification: "statePreservingReload",
    diagnostics: [],
    impactedHandles: [],
    schema: "threenative.asset-reload",
    statePolicy: "preserve",
    version: "0.1.0",
  });

  assert.equal(report.classification, "statePreservingReload");
  assert.equal(report.statePolicy, "preserve");
});
