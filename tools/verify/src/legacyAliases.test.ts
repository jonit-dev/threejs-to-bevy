import assert from "node:assert/strict";
import test from "node:test";

import { resolveScriptAlias } from "./legacyAliases.js";

test("should preserve verify:v9 as a compatibility alias", () => {
  const resolution = resolveScriptAlias("verify:v9");
  assert.equal(resolution.canonical, "verify:release");
  assert.equal(resolution.deprecated, true);
  assert.match(resolution.message ?? "", /verify:release/);
});

test("should produce actionable migration diagnostics for removed aliases", () => {
  const resolution = resolveScriptAlias("check:docs:v8");
  assert.equal(resolution.canonical, "check:docs");
  assert.equal(resolution.deprecated, true);
  assert.match(resolution.message ?? "", /check:docs/);
});
