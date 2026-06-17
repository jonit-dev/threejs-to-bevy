import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyInputUiAccessibility } from "./verify-v9-input-ui-accessibility.mjs";

test("should require picking overlay evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-input-ui-a11y-"));
  try {
    const result = await verifyInputUiAccessibility({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_VERIFY_V9_PICKING_OVERLAY_MISSING");
    assert.match(result.diagnostics[0]?.repairHint ?? "", /picking-debug/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
