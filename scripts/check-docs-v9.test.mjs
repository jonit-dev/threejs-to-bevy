import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkDocsV9 } from "./check-docs-v9.mjs";

test("should require support PRD links and artifact paths when V9 support gate is present", async () => {
  const root = await makeDocsRoot({
    index: defaultIndex().replace("verify:v9:support", "missing-support-gate"),
    prd: defaultPrd().replace("tools/verify/artifacts/support/verification-report.json", "missing-report.json"),
  });
  try {
    const result = await checkDocsV9(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_INDEX_LINK_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_PRD_ARTIFACT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require V9 status and parity support references", async () => {
  const root = await makeDocsRoot({ parity: "V9-06 support planned only\n", status: "V9-06 support planned only\n" });
  try {
    const result = await checkDocsV9(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_STATUS_SUPPORT_MISSING"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_PARITY_SUPPORT_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass V9 support docs gate shape", async () => {
  const root = await makeDocsRoot();
  try {
    const result = await checkDocsV9(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeDocsRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v9-"));
  const files = {
    "docs/PRDs/v9/README.md": overrides.index ?? defaultIndex(),
    "docs/PRDs/v9/V9-06-audio-persistence-tooling-support.md": overrides.prd ?? defaultPrd(),
    "docs/STATUS.md": overrides.status ?? defaultStatus(),
    "docs/bevy-feature-parity.md": overrides.parity ?? defaultParity(),
  };
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

function defaultIndex() {
  return [
    "V9-06-audio-persistence-tooling-support.md",
    "verify:v9:support",
    "verify:v9:audio-support",
    "verify:v9:local-data-support",
    "verify:v9:diagnostics-support",
    "verify:v9:editor-support",
    "verify:v9:stress-support",
  ].join("\n");
}

function defaultPrd() {
  return [
    "packages/ir/fixtures/conformance/support-stress/game.bundle",
    "tools/verify/artifacts/audio-support/",
    "tools/verify/artifacts/local-data-support/",
    "tools/verify/artifacts/diagnostics-support/",
    "tools/verify/artifacts/editor-support/",
    "tools/verify/artifacts/stress-support/",
    "tools/verify/artifacts/support/verification-report.json",
  ].join("\n");
}

function defaultStatus() {
  return [
    "V9-06 Phase 1",
    "V9-06 local data",
    "V9-06 diagnostics/debug draw",
    "V9-06 editor tooling",
    "V9-06 target profiles",
    "V9-06 aggregate support gate",
  ].join("\n");
}

function defaultParity() {
  return [
    "V9-06 now carries schema-backed `local-data.ir.json`",
    "V9-06 Phase 1 adds bounded attenuation curves",
    "focused web/native/script evidence under `tools/verify/artifacts/diagnostics-support/`",
    "focused evidence under `tools/verify/artifacts/editor-support/`",
    "large-scene stress artifacts under `tools/verify/artifacts/stress-support/`",
    "Cloud save",
    "streaming/network audio",
    "runtime networking",
  ].join("\n");
}
