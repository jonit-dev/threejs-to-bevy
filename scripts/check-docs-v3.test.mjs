import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV3 } from "./check-docs-v3.mjs";

test("should require v3 performance artifact docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v3-"));
  try {
    await mkdir(join(root, "docs/PRDs/v3"), { recursive: true });
    await mkdir(join(root, "examples/v3-environment"), { recursive: true });
    await writeFile(join(root, "docs/PRDs/v3/README.md"), "V3\n");
    await writeFile(join(root, "docs/PRDs/v3/V3-02-threejs-performance-and-instancing.md"), "V3 performance\n");
    await writeFile(join(root, "examples/v3-environment/README.md"), "V3 dist/forest.bundle assets/environment\n");

    const result = await checkDocsV3(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V3_ARTIFACT_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
