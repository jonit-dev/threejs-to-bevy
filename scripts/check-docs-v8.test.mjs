import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkDocsV8 } from "./check-docs-v8.mjs";

test("should require every V8 PRD link from the index", async () => {
  const root = await makeDocsRoot({
    index: defaultIndex().replace("V8-00-local-editor-scope-and-contract.md", "missing.md"),
  });
  try {
    const result = await checkDocsV8(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V8_INDEX_LINK_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require V8 scope and evidence phrases", async () => {
  const root = await makeDocsRoot({ index: "[V8-00](./V8-00-local-editor-scope-and-contract.md)\n" });
  try {
    const result = await checkDocsV8(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V8_SCOPE_PHRASE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsupported V8 product-surface claims", async () => {
  const root = await makeDocsRoot({ status: `${defaultStatus()}\nV8 supports collaboration as a completion feature.\n` });
  try {
    const result = await checkDocsV8(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.at(-1)?.code, "TN_DOCS_V8_SCOPE_CLAIM_UNSUPPORTED");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require V8 status and parity pointers", async () => {
  const root = await makeDocsRoot({ parity: "V8 PRDs local editor offline\n" });
  try {
    const result = await checkDocsV8(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V8_STATUS_PARITY_SCOPE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass V8 docs gate shape", async () => {
  const root = await makeDocsRoot();
  try {
    const result = await checkDocsV8(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeDocsRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v8-"));
  const files = {
    "docs/PRDs/v8/README.md": overrides.index ?? defaultIndex(),
    "docs/ROADMAP.md": overrides.roadmap ?? defaultRoadmap(),
    "docs/STATUS.md": overrides.status ?? defaultStatus(),
    "docs/bevy-feature-parity.md": overrides.parity ?? defaultParity(),
  };
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  await readFile(join(root, "docs/PRDs/v8/README.md"), "utf8");
  return root;
}

function defaultIndex() {
  return [
    "[V8-00 Scope](./V8-00-local-editor-scope-and-contract.md)",
    "local editor structured SDK/ECS/IR save/load structured diffs bundle preview offline diagnostics",
  ].join("\n");
}

function defaultStatus() {
  return "V8 PRDs local editor offline collaboration\n";
}

function defaultParity() {
  return "V8 PRDs local editor offline collaboration\n";
}

function defaultRoadmap() {
  return "V8 local editor structured SDK/ECS/IR save/load structured diffs bundle preview offline diagnostics\n";
}
