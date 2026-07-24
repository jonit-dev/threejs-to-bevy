import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveGeneratorOverwritePolicy } from "./generatorProvenance.js";

test("resolves generator overwrite policy from explicit intent, existing provenance, then default", async () => {
  const root = join(tmpdir(), `tn-generator-policy-${process.pid}-${Date.now()}`);
  try {
    assert.deepEqual(
      await resolveGeneratorOverwritePolicy(root, "aircraft"),
      { owner: "default", policy: "manual" },
    );
    await mkdir(join(root, "content/generators"), { recursive: true });
    await writeFile(
      join(root, "content/generators/aircraft.generator.json"),
      `${JSON.stringify({ id: "aircraft", overwritePolicy: "replace" })}\n`,
    );
    assert.deepEqual(
      await resolveGeneratorOverwritePolicy(root, "aircraft"),
      { owner: "existing-provenance", policy: "replace" },
    );
    assert.deepEqual(
      await resolveGeneratorOverwritePolicy(root, "aircraft", "skip"),
      { owner: "explicit-flag", policy: "skip" },
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
