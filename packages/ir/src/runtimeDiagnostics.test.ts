import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeWriteObservation, diagnoseUnsupportedRuntimeDeclarations, runtimeWriteValueFingerprint, serializeRuntimeWriteAudit, validateRuntimeDiagnosticReport, validateRuntimeWriteAuditReport } from "./runtimeDiagnostics.js";

test("should reject networking declarations with stable diagnostics when networking is out of scope", () => {
  const diagnostics = diagnoseUnsupportedRuntimeDeclarations({
    networking: {
      multiplayer: { mode: "peer" },
      onlinePresence: true,
      prediction: true,
      replication: true,
      serverAuthority: true,
      websocket: "wss://example.invalid",
    },
    unsupportedFeatures: {
      dom: true,
      filesystem: true,
      rawPlatformApi: true,
    },
  }, "src/networking.ts");

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_UNSUPPORTED_NETWORKING_WEBSOCKET"), true);
  assert.equal(diagnostics.every((diagnostic) => diagnostic.severity === "error"), true);
  assert.equal(diagnostics.every((diagnostic) => diagnostic.path.startsWith("src/networking.ts/")), true);
  assert.equal(diagnostics.every((diagnostic) => typeof diagnostic.suggestion === "string"), true);
});

test("runtime diagnostics report should validate shape", () => {
  const result = validateRuntimeDiagnosticReport({
    schema: "threenative.runtime-diagnostics",
    version: "0.1.0",
    diagnostics: [{ code: "TN_PLATFORM_AUDIO_AUTOPLAY_BLOCKED", message: "Autoplay blocked.", path: "audio.ir.json/music/0", severity: "warning", suggestion: "Wait for user input." }],
  });

  assert.equal(result.ok, true);
});

test("should reject raw backend handles and dynamic gameplay host escape hatches", () => {
  const diagnostics = diagnoseUnsupportedRuntimeDeclarations({
    unsupportedFeatures: {
      promise: { unbounded: true },
      rawRuntimeHandle: "bevy::prelude::Entity",
      runtimePlugin: "bevy_rapier3d",
      timer: { kind: "setInterval" },
      worker: "./worker.js",
    },
  }, "systems.ir.json/runtime");

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    [
      "TN_UNSUPPORTED_FEATURE_PROMISE",
      "TN_UNSUPPORTED_FEATURE_RAW_RUNTIME_HANDLE",
      "TN_UNSUPPORTED_FEATURE_RUNTIME_PLUGIN",
      "TN_UNSUPPORTED_FEATURE_TIMER",
      "TN_UNSUPPORTED_FEATURE_WORKER",
    ],
  );
  assert.equal(diagnostics[1]?.path, "systems.ir.json/runtime/unsupportedFeatures/rawRuntimeHandle");
  assert.match(diagnostics[2]?.suggestion ?? "", /portable SDK\/IR declaration/);
});

test("should serialize bounded write observations deterministically", () => {
  const first = createRuntimeWriteObservation({
    disposition: "accepted",
    newValue: { z: 2, a: [1, 2, 3] },
    oldValue: { a: 0 },
    path: "Transform/position",
    schedule: "fixedUpdate",
    system: "move",
    targetId: "player",
    targetKind: "component",
    tick: 4,
    writer: "script",
  });
  const second = createRuntimeWriteObservation({
    disposition: "accepted",
    newValue: { a: [1, 2, 3], z: 2 },
    oldValue: { a: 0 },
    path: "Transform/position",
    schedule: "fixedUpdate",
    system: "move",
    targetId: "player",
    targetKind: "component",
    tick: 4,
    writer: "script",
  });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.equal(first.oldFingerprint, second.oldFingerprint);
  assert.equal(first.inlineValue, undefined);
  const serialized = serializeRuntimeWriteAudit([first]);
  assert.deepEqual(Object.keys(serialized), ["observations", "schema", "version"]);
  assert.equal(validateRuntimeWriteAuditReport(serialized).ok, true);
  assert.equal(runtimeWriteValueFingerprint({ b: 1, a: 2 }), runtimeWriteValueFingerprint({ a: 2, b: 1 }));
});
