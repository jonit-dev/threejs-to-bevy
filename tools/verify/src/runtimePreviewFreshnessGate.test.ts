import assert from "node:assert/strict";
import test from "node:test";

import { validateRuntimePreviewFreshness } from "./runtimePreviewFreshnessGate.js";

test("rejects stale execution and duplicate rebuild reloads", () => {
  const diagnostics = validateRuntimePreviewFreshness({
    executedRuntimeBuildHash: "old",
    initialRuntimeBuildHash: "old",
    reloadCount: 3,
    runtimeBuildHash: "new",
    runtimeVersion: "two",
  });
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_RUNTIME_PREVIEW_EXECUTED_STALE"), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_VERIFY_RUNTIME_PREVIEW_RELOAD_COUNT"), true);
});
