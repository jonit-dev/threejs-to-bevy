import assert from "node:assert/strict";
import test from "node:test";

import { validateRuntimeWriteAuditEvidence } from "./runtimeWriteAuditGate.js";

test("runtime write audit gate rejects cross-runtime sensor and audit drift", () => {
  const diagnostics = validateRuntimeWriteAuditEvidence({
    nativeAudit: { observations: [], schema: "threenative.runtime-write-audit", version: "0.1.0" },
    nativeSensorPhases: ["enter", "stay"],
    nativeTestSource: "",
    sameTickSensorReadStable: false,
    webAudit: { observations: [], schema: "threenative.runtime-write-audit", version: "0.1.0" },
    webConflictDiagnostics: [],
    webSensorPhases: ["enter", "enter", "exit"],
  });

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_SENSOR_PHASES",
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_SENSOR_PARITY",
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_SENSOR_MUTATED_READ",
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_CONFLICT_MISSING",
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_DISPOSITION_MISSING",
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_DISPOSITION_MISSING",
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_DISPOSITION_MISSING",
    "TN_VERIFY_RUNTIME_WRITE_AUDIT_NATIVE_SENSOR_TEST_MISSING",
  ]);
});
