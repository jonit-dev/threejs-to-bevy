import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveGeneratorOverwritePolicy } from "./generatorProvenance.js";
import { validateGeneratorDocument } from "./operations/sharedA.js";

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

test("rejects malformed generator-owned animation ids", async () => {
  const diagnostics = await validateGeneratorDocument("content/generators/aircraft.generator.json", {
    schema: "threenative.generator",
    id: "aircraft",
    provider: "blender",
    providerVersion: "4.3",
    recipe: "content/recipes/aircraft.blender.json",
    outputs: ["assets/generated/aircraft.glb"],
    animationIds: ["idle", "idle"],
  });

  assert.equal(
    diagnostics.some((diagnostic) => diagnostic.code === "TN_AUTHORING_GENERATOR_ANIMATION_IDS_DUPLICATE"),
    true,
  );
});
