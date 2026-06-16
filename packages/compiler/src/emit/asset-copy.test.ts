import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { copyAssetFiles, resolveBundlePath } from "./asset-copy.js";

test("resolveBundlePath should reject unsafe bundle asset paths", () => {
  assert.throws(() => resolveBundlePath("/tmp/bundle", "/tmp/escape.png"), /must be relative/);
  assert.throws(() => resolveBundlePath("/tmp/bundle", "../escape.png"), /parent traversal/);
  assert.throws(() => resolveBundlePath("/tmp/bundle", "assets/../escape.png"), /parent traversal/);
});

test("copyAssetFiles should copy only file-backed bundle assets inside outDir", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-asset-copy-"));
  try {
    await writeFile(join(root, "source.png"), "texture");

    await copyAssetFiles(root, join(root, "bundle"), [
      { id: "generated.mesh" },
      { id: "tex.source", kind: "texture", path: "assets/source.png", sourcePath: "source.png" },
    ]);

    assert.equal(await readFile(join(root, "bundle/assets/source.png"), "utf8"), "texture");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
