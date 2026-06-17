import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV9EditorSupport } from "./verify-v9-editor-support.mjs";

test("should verify editor screenshot and structured diff artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-editor-"));
  try {
    const result = await verifyV9EditorSupport({ artifactDir: join(root, "artifacts"), repoRoot: root });

    assert.equal(result.ok, true);
    assert.match(result.artifacts.structuredDiffPath, /structured-diff\.json$/);
    assert.match(result.artifacts.panelScreenshotPath, /panel-screenshot\.txt$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
