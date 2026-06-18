import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { collectTestFiles } from "./runTests.js";

test("should discover nested compiled test files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-verify-tests-"));
  try {
    await mkdir(join(root, "dist/nested"), { recursive: true });
    await writeFile(
      join(root, "dist/nested/example.test.js"),
      "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('nested', () => assert.equal(1, 1));\n",
    );

    const files = collectTestFiles(join(root, "dist"));

    assert.deepEqual(files.map((file) => file.replace(`${root}/`, "")), ["dist/nested/example.test.js"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
