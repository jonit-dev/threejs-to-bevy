import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkGodzillaSources } from "./check-godzilla-sources.mjs";

test("should report oversized TypeScript files and classes as warnings without failing", async () => {
  const root = await makeRepo({
    "packages/demo/src/Godzilla.ts": [
      "export class Godzilla {",
      "  one() { return 1; }",
      "  two() { return 2; }",
      "  three() { return 3; }",
      "}",
      "export function helper() { return true; }",
    ].join("\n"),
  });
  try {
    const result = await checkGodzillaSources({
      maxBlockLines: 3,
      maxFileLines: 5,
      maxTestFileLines: 20,
      repoRoot: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "warning");
    assert.equal(result.summary.warnings, 2);
    assert.equal(result.diagnostics.every((diagnostic) => diagnostic.severity === "warning"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_GODZILLA_FILE_LINES"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_GODZILLA_BLOCK_LINES" && diagnostic.kind === "class"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should use the looser test-file threshold", async () => {
  const root = await makeRepo({
    "packages/demo/src/feature.test.ts": [
      "test('large fixture setup', () => {",
      "  const a = 1;",
      "  const b = 2;",
      "  const c = 3;",
      "  return a + b + c;",
      "});",
    ].join("\n"),
  });
  try {
    const result = await checkGodzillaSources({
      maxBlockLines: 20,
      maxFileLines: 3,
      maxTestFileLines: 20,
      repoRoot: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "pass");
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should report oversized Rust structs and impl blocks as warnings", async () => {
  const root = await makeRepo({
    "runtime-bevy/crates/demo/src/lib.rs": [
      "pub struct Godzilla {",
      "    value: i32,",
      "    other: i32,",
      "}",
      "impl Godzilla {",
      "    pub fn one(&self) -> i32 { self.value }",
      "    pub fn two(&self) -> i32 { self.other }",
      "}",
    ].join("\n"),
  });
  try {
    const result = await checkGodzillaSources({
      maxBlockLines: 2,
      maxFileLines: 100,
      maxTestFileLines: 100,
      repoRoot: root,
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "warning");
    assert.equal(result.diagnostics.filter((diagnostic) => diagnostic.code === "TN_GODZILLA_BLOCK_LINES").length, 2);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.kind === "type"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.kind === "impl"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeRepo(files) {
  const root = await mkdtemp(join(tmpdir(), "tn-godzilla-sources-"));
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${content}\n`);
  }
  return root;
}
