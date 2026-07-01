import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { V9_SAMPLE_MATRIX, verifyV9SampleScenes } from "./verify-v9-sample-scenes.mjs";

test("should require every V9 latest-merge domain to have fixture evidence", () => {
  const domains = new Set(V9_SAMPLE_MATRIX.map((sample) => sample.domain));
  assert.ok(domains.has("animation"));
  assert.ok(domains.has("physics-character"));
  assert.ok(domains.has("physics-solver"));
  assert.ok(domains.has("rendering-lights"));
});

test("should fail when a sample fixture bundle is missing required artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-samples-"));
  try {
    const reportPath = join(root, "tools/verify/artifacts/sample-scenes/verification-report.json");
    const result = await verifyV9SampleScenes({
      artifactDir: join(root, "tools/verify/artifacts/sample-scenes"),
      repoRoot: root,
      reportPath,
      run: async ({ name }) => ({
        durationMs: 1,
        exitCode: name.startsWith("build ") ? 0 : 0,
        stderr: "",
        stdout: "{}",
      }),
    });
    const saved = JSON.parse(await readFile(reportPath, "utf8"));
    assert.equal(result.ok, false);
    assert.equal(saved.diagnostics[0]?.code, "TN_VERIFY_V9_SAMPLE_ARTIFACT_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
