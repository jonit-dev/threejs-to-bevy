import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV7 } from "./check-docs-v7.mjs";

test("should require every V7 PRD link from the index", async () => {
  const root = await makeDocsRoot({
    index: defaultIndex().replace(
      "[V7-08 Packaging](./V7-08-packaging-target-profiles-and-platform-diagnostics.md)",
      "V7-08-packaging-target-profiles-and-platform-diagnostics.md",
    ),
  });
  try {
    const result = await checkDocsV7(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V7_INDEX_LINK_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require V7 scope and evidence phrases", async () => {
  const root = await makeDocsRoot({ index: defaultIndex().replace("only builds", "") });
  try {
    const result = await checkDocsV7(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V7_SCOPE_PHRASE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported V7 product-surface claims", async () => {
  const root = await makeDocsRoot({ status: `${defaultStatus()}\nV7 supports plugin APIs as a completion feature.\n` });
  try {
    const result = await checkDocsV7(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.at(-1)?.code, "TN_DOCS_V7_SCOPE_CLAIM_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require V7 status and parity pointers", async () => {
  const root = await makeDocsRoot({ parity: "verify:v7\ndeferred\nnever portable\n" });
  try {
    const result = await checkDocsV7(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V7_STATUS_PARITY_SCOPE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass V7 docs gate shape", async () => {
  const root = await makeDocsRoot();
  try {
    const result = await checkDocsV7(root);

    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeDocsRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v7-"));
  await mkdir(join(root, "docs/PRDs/v7"), { recursive: true });
  await writeFile(join(root, "docs/PRDs/v7/README.md"), overrides.index ?? defaultIndex());
  await writeFile(join(root, "docs/STATUS.md"), overrides.status ?? defaultStatus());
  await writeFile(join(root, "docs/bevy-feature-parity.md"), overrides.parity ?? defaultParity());
  return root;
}

function defaultIndex() {
  return [
    "V7-00-post-v6-gap-triage-and-contract-alignment.md",
    "[V7-00 Scope](./V7-00-post-v6-gap-triage-and-contract-alignment.md)",
    "[V7-01 Conformance](./V7-01-v7-conformance-fixtures-and-evidence-harness.md)",
    "[V7-02 Physics](./V7-02-advanced-physics-and-character-runtime-parity.md)",
    "[V7-03 Animation](./V7-03-animation-graphs-state-machines-events-and-particles.md)",
    "[V7-04 UI](./V7-04-rich-portable-ui-navigation-and-input-parity.md)",
    "[V7-05 Audio](./V7-05-spatial-audio-buses-and-runtime-audio-hardening.md)",
    "[V7-06 Renderer](./V7-06-renderer-and-dense-content-runtime-parity.md)",
    "[V7-07 Scripting](./V7-07-scripting-determinism-and-runtime-lifecycle.md)",
    "[V7-08 Packaging](./V7-08-packaging-target-profiles-and-platform-diagnostics.md)",
    "[V7-09 Performance](./V7-09-performance-budgets-and-profiling-evidence.md)",
    "[V7-10 Scene](./V7-10-functional-v7-scene-and-template.md)",
    "[V7-11 Gate](./V7-11-release-gate-and-docs-consistency.md)",
    "post-V6 gap promoted, deferred, or never portable",
    "examples/ templates/ artifacts/v7 rendered only builds backend-specific diagnostics",
  ].join("\n");
}

function defaultStatus() {
  return "V7 PRDs verify:v7 deferred never portable\n";
}

function defaultParity() {
  return "V7 PRDs verify:v7 deferred never portable\n";
}
