import assert from "node:assert/strict";
import test from "node:test";

import { projectCommandResultSummary, SUMMARY_STDOUT_MAX_BYTES } from "./resultProjection.js";

test("projects canonical bounded command summary fields", () => {
  const result = projectCommandResultSummary({
    exitCode: 1,
    stdout: `${JSON.stringify({
      artifacts: {
        report: "/tmp/report.json",
        screenshot: "/tmp/frame.png",
      },
      code: "TN_EXAMPLE_FAILED",
      detailsArtifactPath: "/tmp/details.json",
      diagnostics: Array.from({ length: 5 }, (_, index) => ({
        code: `TN_EXAMPLE_${index}`,
        message: `Diagnostic ${index}`,
        severity: index === 0 ? "error" : "warning",
        suggestedFix: `Repair ${index}`,
      })),
      ignoredDeepPayload: "x".repeat(16_000),
      message: "Example failed.",
      output: { outputArtifactPath: "/tmp/output.json" },
    })}\n`,
  });
  const payload = JSON.parse(result.stdout) as {
    artifacts: string[];
    code: string;
    diagnostics: Array<{ code: string; fix?: { instruction: string } }>;
    schema: string;
    status: string;
    version: string;
  };

  assert.equal(result.exitCode, 1);
  assert.equal(payload.schema, "threenative.command-summary");
  assert.equal(payload.version, "0.1.0");
  assert.equal(payload.status, "failed");
  assert.equal(payload.code, "TN_EXAMPLE_FAILED");
  assert.deepEqual(payload.diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_EXAMPLE_0",
    "TN_EXAMPLE_1",
    "TN_EXAMPLE_2",
  ]);
  assert.deepEqual(payload.diagnostics[0]?.fix, { instruction: "Repair 0" });
  assert.deepEqual(payload.artifacts, ["/tmp/report.json", "/tmp/frame.png", "/tmp/details.json", "/tmp/output.json"]);
  assert.equal(Buffer.byteLength(result.stdout, "utf8") <= SUMMARY_STDOUT_MAX_BYTES, true);
});

test("keeps successful exit behavior and projects a top-level artifact pointer", () => {
  const result = projectCommandResultSummary({
    exitCode: 0,
    stdout: `${JSON.stringify({
      bundlePath: "/tmp/game.bundle",
      code: "TN_BUILD_OK",
      diagnostics: [],
      message: "Built.",
    })}\n`,
  });
  const payload = JSON.parse(result.stdout) as { artifacts: string[]; diagnostics: unknown[]; status: string };

  assert.equal(result.exitCode, 0);
  assert.equal(payload.status, "ok");
  assert.deepEqual(payload.diagnostics, []);
  assert.deepEqual(payload.artifacts, ["/tmp/game.bundle"]);
});

test("fails closed when advertised summary output is not JSON", () => {
  const result = projectCommandResultSummary({ exitCode: 0, stdout: "human-only output\n" });
  const payload = JSON.parse(result.stdout) as { code: string; status: string };

  assert.equal(result.exitCode, 2);
  assert.equal(payload.code, "TN_COMMAND_SUMMARY_OUTPUT_INVALID");
  assert.equal(payload.status, "failed");
});

test("keeps adversarial multibyte and escaped output inside the stdout budget", () => {
  const noisy = "\\\n\u{1f600}".repeat(4_000);
  const result = projectCommandResultSummary({
    exitCode: 1,
    stdout: `${JSON.stringify({
      artifacts: Array.from({ length: 20 }, (_, index) => `/tmp/${noisy}-${index}`),
      code: noisy,
      diagnostics: Array.from({ length: 10 }, () => ({
        code: noisy,
        message: noisy,
        severity: "error",
        suggestion: noisy,
      })),
    })}\n`,
  });

  const payload = JSON.parse(result.stdout) as { artifacts: string[]; diagnostics: Array<{ fix?: unknown }> };
  assert.equal(payload.diagnostics.length, 3);
  assert.equal(payload.diagnostics.every((diagnostic) => diagnostic.fix !== undefined), true);
  assert.equal(payload.artifacts.length, 5);
  assert.equal(Buffer.byteLength(result.stdout, "utf8") <= SUMMARY_STDOUT_MAX_BYTES, true);
});
