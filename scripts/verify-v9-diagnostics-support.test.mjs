import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV9DiagnosticsSupport } from "./verify-v9-diagnostics-support.mjs";

test("should fail when required diagnostic artifact is missing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-diagnostics-"));
  try {
    const result = await verifyV9DiagnosticsSupport({ artifactDir: join(root, "artifacts"), repoRoot: root, writeArtifacts: false });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_V9_DIAGNOSTICS_ARTIFACT_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
