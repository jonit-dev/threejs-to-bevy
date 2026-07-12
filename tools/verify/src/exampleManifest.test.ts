import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { exampleManifestDiagnostics, examplePathsByClassification, readExampleManifest } from "./exampleManifest.js";

const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));

test("example manifest should classify every current example", async () => {
  const manifest = await readExampleManifest(repoRoot);
  assert.notEqual(manifest, undefined);
  assert.deepEqual(await exampleManifestDiagnostics(repoRoot), []);
  assert.deepEqual(await examplePathsByClassification(repoRoot, "release-enrolled"), [
    "examples/humanoid-physics-course",
    "examples/metro-surfer-heist",
  ]);
  assert.deepEqual(await examplePathsByClassification(repoRoot, "build-only"), [
    "examples/coin-patrol",
    "examples/lumen-lite-showcase",
    "examples/neon-harbor-rescue",
    "examples/stylized-nature-component",
  ]);
});

test("example manifest should reject unclassified and stale entries", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-example-manifest-"));
  try {
    await mkdir(join(root, "examples/kept-example"), { recursive: true });
    await mkdir(join(root, "examples/unclassified-example"), { recursive: true });
    await writeFile(join(root, "examples/manifest.json"), `${JSON.stringify({
      schema: "threenative.examples.manifest",
      version: "0.1.0",
      examples: [
        { classification: "build-only", path: "examples/kept-example", reason: "Build-only fixture." },
        { classification: "retired", path: "examples/unknown-classification", reason: "" },
        { classification: "fixture-only", path: "examples/missing-example", reason: "Stale entry." },
      ],
    }, null, 2)}\n`);

    const diagnostics = await exampleManifestDiagnostics(root);
    assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code).sort(), [
      "TN_VERIFY_EXAMPLE_MANIFEST_CLASSIFICATION",
      "TN_VERIFY_EXAMPLE_MANIFEST_REASON",
      "TN_VERIFY_EXAMPLE_MANIFEST_UNCLASSIFIED",
      "TN_VERIFY_EXAMPLE_MANIFEST_UNKNOWN_PATH",
      "TN_VERIFY_EXAMPLE_MANIFEST_UNKNOWN_PATH",
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
