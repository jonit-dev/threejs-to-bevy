import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { listDeprecatedScriptAliases, resolveScriptAlias } from "./legacyAliases.js";

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

test("should list deprecated milestone commands with replacements", () => {
  const aliases = listDeprecatedScriptAliases();
  assert.ok(aliases.length > 0);
  for (const alias of aliases) {
    assert.equal(alias.deprecated, true);
    assert.notEqual(alias.canonical, alias.legacy);
    assert.match(alias.message ?? "", new RegExp(alias.canonical.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("should preserve public legacy package scripts", async () => {
  const repoRoot = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
  const packageJson = JSON.parse(await readFile(resolve(repoRoot, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };

  for (const scriptName of ["check:docs:v1", "check:docs:v8", "verify:v7", "verify:v9"]) {
    assert.ok(packageJson.scripts[scriptName], `${scriptName} should remain a package script`);
    assert.match(packageJson.scripts[scriptName], /legacy-script-alias|verify-v\d+\.mjs/);
  }
});
