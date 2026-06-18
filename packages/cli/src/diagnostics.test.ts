import assert from "node:assert/strict";
import test from "node:test";

import { formatPackageRepairHintDiagnostic } from "./diagnostics.js";

test("should format package repair hints when support artifact cannot be produced", () => {
  const diagnostic = formatPackageRepairHintDiagnostic({
    artifactPath: "tools/verify/artifacts/stress-support/native-profiler.json",
    message: "Native profiler artifact could not be produced.",
    suggestion: "Run the native target with profiler capture enabled or mark GPU timing optional.",
    target: "desktopNative",
  });

  assert.deepEqual(diagnostic, {
    artifactPath: "tools/verify/artifacts/stress-support/native-profiler.json",
    code: "TN_PACKAGE_SUPPORT_ARTIFACT_REPAIR_HINT",
    message: "Native profiler artifact could not be produced.",
    severity: "error",
    suggestion: "Run the native target with profiler capture enabled or mark GPU timing optional.",
    target: "desktopNative",
  });
});
