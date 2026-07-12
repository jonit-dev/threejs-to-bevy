import assert from "node:assert/strict";
import test from "node:test";

import { validateScriptLocalModulesEvidence } from "./scriptLocalModulesGate.js";

test("script local modules gate rejects nondeterministic or duplicated bundles", () => {
  const diagnostics = validateScriptLocalModulesEvidence({
    bundleHash: "invalid",
    deterministic: false,
    expected: { collect: { score: 5 } },
    nativeBundleEntry: "legacy.js",
    quickJsLoadable: false,
    sharedModuleOccurrences: 2,
    systems: { collect: { score: 4 } },
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_VERIFY_SCRIPT_MODULES_NONDETERMINISTIC",
    "TN_VERIFY_SCRIPT_MODULES_QUICKJS_FAILED",
    "TN_VERIFY_SCRIPT_MODULES_SHARED_DUPLICATED",
    "TN_VERIFY_SCRIPT_MODULES_NATIVE_ENTRY_DRIFT",
    "TN_VERIFY_SCRIPT_MODULES_RUNTIME_RESULT",
    "TN_VERIFY_SCRIPT_MODULES_BUNDLE_HASH",
  ]);
});
