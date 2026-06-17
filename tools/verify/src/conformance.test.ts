import assert from "node:assert/strict";
import test from "node:test";

import { loadFixtureCatalog, resolveFixtureId } from "./conformance.js";

test("should resolve canonical fixture ids from the catalog", async () => {
  const catalog = await loadFixtureCatalog();
  const resolved = resolveFixtureId(catalog, "physics-character");
  assert.ok(resolved);
  assert.equal(resolved.entry.canonicalId, "physics-character");
  assert.match(resolved.entry.bundlePath, /physics-character/);
  assert.ok(resolved.entry.ownerDocs.length > 0);
});

test("should resolve legacy fixture ids with deprecation diagnostics", async () => {
  const catalog = await loadFixtureCatalog();
  const resolved = resolveFixtureId(catalog, "v9-physics-character");
  assert.ok(resolved);
  assert.equal(resolved.entry.canonicalId, "physics-character");
  assert.equal(resolved.legacyAliasUsed, true);
  assert.match(resolved.message ?? "", /physics-character/);
});

test("should reject fixture manifests with unclassified version labels", async () => {
  const catalog = await loadFixtureCatalog();
  assert.equal(resolveFixtureId(catalog, "v99-unknown-fixture"), null);
});
