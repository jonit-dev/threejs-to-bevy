import assert from "node:assert/strict";
import test from "node:test";

import { diagnoseUnsupportedRuntimeDeclarations, validateRuntimeDiagnosticReport } from "./runtimeDiagnostics.js";

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
