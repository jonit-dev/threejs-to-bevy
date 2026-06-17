import assert from "node:assert/strict";
import test from "node:test";

import { validateAssetReloadReport } from "./assetReload.js";

test("assetReload should validate state preserving reload reports", () => {
  const diagnostics = validateAssetReloadReport({
    changedAssets: [{ assetId: "tex.crate", change: "changed", path: "assets/crate.png" }],
    classification: "statePreservingReload",
    diagnostics: [],
    impactedHandles: ["handle.door"],
    schema: "threenative.asset-reload",
    statePolicy: "preserve",
    version: "0.1.0",
  });

  assert.deepEqual(diagnostics, []);
});
