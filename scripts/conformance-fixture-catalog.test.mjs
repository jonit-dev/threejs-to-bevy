import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  loadFixtureCatalog,
  resolveFixtureBundlePath,
  resolveFixtureEntry,
} from "./conformance-fixture-catalog.mjs";

test("should resolve canonical fixture ids from the catalog", async () => {
  const root = await makeCatalogRoot();
  const catalog = await loadFixtureCatalog(root);
  const resolved = resolveFixtureBundlePath(catalog, "physics-character", root);
  assert.match(resolved.bundlePath, /physics-character\/game\.bundle$/);
  assert.equal(resolved.canonicalId, "physics-character");
});

test("should reject old versioned fixture ids", async () => {
  const root = await makeCatalogRoot();
  const catalog = await loadFixtureCatalog(root);
  assert.equal(resolveFixtureEntry(catalog, "v9-physics-character"), null);
});

async function makeCatalogRoot() {
  const root = await mkdtemp(join(tmpdir(), "tn-fixture-catalog-"));
  const catalogDir = join(root, "packages/ir/fixtures/conformance");
  await mkdir(catalogDir, { recursive: true });
  await writeFile(
    join(catalogDir, "fixture-catalog.json"),
    JSON.stringify({
      fixtures: [
        {
          canonicalId: "physics-character",
          bundlePath: "packages/ir/fixtures/conformance/physics-character/game.bundle",
        },
      ],
    }),
  );
  return root;
}
