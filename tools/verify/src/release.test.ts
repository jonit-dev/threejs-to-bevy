import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { RELEASE_FOCUSED_GATES, runReleaseGate } from "./release.js";

test("release gate should run without importing scripts implementation", async () => {
  const source = await readFile(new URL("../src/release.ts", import.meta.url), "utf8");

  assert.equal(source.includes("scripts/verify-v9.mjs"), false);
  assert.equal(source.includes("../../../scripts/verify-v9.mjs"), false);
});

test("release gate should report failed typed step diagnostics", async () => {
  const result = await runReleaseGate({
    artifactDir: "/tmp/tn-release-test-artifacts",
    focusedGates: [],
    repoRoot: "/tmp/tn-release-test-root",
    reportPath: "/tmp/tn-release-test-artifacts/verification-report.json",
    run: async () => ({
      durationMs: 1,
      exitCode: 1,
      stderr: "failed",
      stdout: "",
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_RELEASE_STEP_FAILED");
});

test("release gate should keep focused gate artifact contracts", () => {
  assert.ok(RELEASE_FOCUSED_GATES.some((gate) => gate.script === "verify:bundle-safety-hardening"));
  assert.ok(RELEASE_FOCUSED_GATES.every((gate) => gate.reportPath.endsWith(".json")));
});
