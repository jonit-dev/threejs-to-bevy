import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV5 } from "./check-docs-v5.mjs";

test("should require V5 diagnostic ranges", async () => {
  const root = await makeDocsRoot({ diagnostics: "# Diagnostics\n\nTN_CONFORMANCE_*\n" });
  try {
    const result = await checkDocsV5(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V5_DIAGNOSTIC_RANGE_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass V5 diagnostics docs shape", async () => {
  const root = await makeDocsRoot();
  try {
    const result = await checkDocsV5(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeDocsRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v5-"));
  await mkdir(join(root, "docs/PRDs/v5"), { recursive: true });
  await writeFile(
    join(root, "docs/PRDs/v5/README.md"),
    [
      "V5-00-scope-and-contract-alignment.md",
      "V5-01-capability-derived-manifests-and-shared-fixtures.md",
      "V5-02-conformance-reports-and-native-observations.md",
      "V5-03-diagnostic-shape-normalization.md",
      "V5-04-fixture-builder-and-test-harness-refactor.md",
      "V5-05-native-runtime-regression-coverage.md",
      "V5-06-textured-standard-material-parity.md",
      "V5-07-lighting-atmosphere-shadow-and-color-parity.md",
      "V5-08-dense-content-instancing-lod-and-budgets.md",
      "V5-09-functional-visual-quality-scene.md",
      "V5-10-release-gate-and-docs-consistency.md",
      "V5-11-game-authoring-ergonomics-refactor.md",
    ].join("\n"),
  );
  await writeFile(join(root, "docs/STATUS.md"), "V5-03 diagnostic normalization\n");
  await writeFile(
    join(root, "docs/diagnostics.md"),
    overrides.diagnostics ??
      [
        "TN_CONFORMANCE_*",
        "TN_DOCS_V5_*",
        "TN_VERIFY_V5_*",
        "TN_BEVY_*",
        "TN_WEB_*",
        "TN_IR_DUPLICATE_ENTITY_ID",
        "suggestion",
      ].join("\n"),
  );
  return root;
}
