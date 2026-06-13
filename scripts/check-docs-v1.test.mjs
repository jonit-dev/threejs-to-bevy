import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV1 } from "./check-docs-v1.mjs";

test("should catch legacy bundle names in v1 docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v1-"));
  try {
    await mkdir(join(root, "docs/PRDs/v1"), { recursive: true });
    await writeFile(
      join(root, "docs/PRDs/v1/README.md"),
      [
        "tn create",
        "tn validate",
        "tn build",
        "tn dev --target web",
        "tn dev --target desktop",
        "tn verify",
      ].join("\n"),
    );
    await writeFile(
      join(root, "docs/PRDs/v1/V1-99-fixture.md"),
      "# Fixture\n\nUses scene.ir.json.\n\n**Tests Required:**\n\n**User Verification:**\n\n## Acceptance Criteria\n",
    );

    const result = await checkDocsV1({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V1_LEGACY_BUNDLE_NAME");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
