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

test("should reject old versioned fixture ids", async () => {
  const catalog = await loadFixtureCatalog();
  assert.equal(resolveFixtureId(catalog, "v9-physics-character"), null);
});

test("should reject fixture manifests with unclassified version labels", async () => {
  const catalog = await loadFixtureCatalog();
  assert.equal(resolveFixtureId(catalog, "v99-unknown-fixture"), null);
});

test("should expose fixture ownership metadata from the catalog", async () => {
  const catalog = await loadFixtureCatalog();
  const resolved = resolveFixtureId(catalog, "rendering-lights");

  assert.ok(resolved);
  assert.equal(resolved.entry.owner, "ir-contract");
  assert.equal(resolved.entry.sourceExample, "rendering-lights");
  assert.equal(resolved.entry.canonicalArtifactGate, "rendering-lights");
  assert.match(resolved.entry.regenerateCommand ?? "", /verify:v9:rendering-lights/);
});

test("should keep conformance fixture paths rooted in packages/ir/fixtures", async () => {
  const catalog = await loadFixtureCatalog();

  for (const fixture of catalog.fixtures) {
    assert.match(fixture.bundlePath, /^packages\/ir\/fixtures\/conformance\//, fixture.canonicalId);
    assert.equal(fixture.bundlePath.includes("/artifacts/"), false, fixture.canonicalId);
  }
});
