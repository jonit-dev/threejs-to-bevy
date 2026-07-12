import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = join(packageRoot, "../..");

test("should validate the diagnostics catalog shape", async () => {
  const catalog = await readJson(join(packageRoot, "diagnostics/diagnostics.catalog.json"));
  assert.equal(catalog.schema, "threenative.diagnostics-catalog");
  assert.equal(catalog.version, "0.1.0");
  assert.equal(catalog.package, "@threenative/ir");
  assert.equal(Array.isArray(catalog.entries), true);
  assert.equal(Array.isArray(catalog.families), true);

  const exactCodes = new Set<string>();
  for (const entry of catalog.entries) {
    assertCatalogItem(entry, "code");
    assert.match(entry.code, /^TN_IR_[A-Z0-9_]+$/);
    exactCodes.add(entry.code);
    assert.ok(entry.exampleRejectedInput !== undefined, `${entry.code} should include an example rejected input when practical`);
  }

  const familyPrefixes = new Set<string>();
  for (const family of catalog.families) {
    assertCatalogItem(family, "prefix");
    assert.match(family.prefix, /^TN_IR_[A-Z0-9_]+_$/);
    familyPrefixes.add(family.prefix);
  }

  assert.equal(exactCodes.has("TN_IR_SCHEMA_PAYLOAD_INVALID"), true);
  assert.equal(familyPrefixes.has("TN_IR_SYSTEM_"), true);
});

test("should list public diagnostics referenced by validators and docs", async () => {
  const catalog = await readJson(join(packageRoot, "diagnostics/diagnostics.catalog.json"));
  const exactCodes = new Set(catalog.entries.map((entry: { code: string }) => entry.code));
  const familyPrefixes = catalog.families.map((family: { prefix: string }) => family.prefix) as string[];
  const sourceFiles = [
    ...(await listFiles(join(packageRoot, "src"))).filter((file) => file.endsWith(".ts")),
    join(repoRoot, "docs/contracts/diagnostics.md"),
    join(repoRoot, "docs/contracts/distribution-contract.md"),
  ];
  const missing: string[] = [];

  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    for (const code of source.match(/TN_IR_[A-Z0-9_]+/g) ?? []) {
      if (exactCodes.has(code) || familyPrefixes.some((prefix) => code.startsWith(prefix))) {
        continue;
      }
      missing.push(`${code} in ${relative(repoRoot, file)}`);
    }
  }

  assert.deepEqual(missing, []);
});

test("should document every exported schema with stable id version and package path", async () => {
  const capabilities = await readJson(join(packageRoot, "capabilities/threenative.capabilities.json"));
  assert.equal(capabilities.schema, "threenative.capabilities");
  assert.equal(capabilities.version, "0.1.0");
  assert.deepEqual(capabilities.states, ["supported", "partial", "diagnostic-only", "non-portable"]);
  assert.equal(Array.isArray(capabilities.features), true);
  assert.equal(capabilities.features.some((feature: { runtimeSupport?: Record<string, string> }) => feature.runtimeSupport?.["web-three"] !== undefined && feature.runtimeSupport?.bevy !== undefined), true);

  const documentedSchemas = new Map<string, { $id: string; packagePath: string; schema: string; version: string }>(
    capabilities.schemaDocuments.map((document: { $id: string; packagePath: string; schema: string; version: string }) => [document.packagePath, document]),
  );
  const schemaFiles = (await readdir(join(packageRoot, "schemas"))).filter((file) => file.endsWith(".schema.json")).sort();

  for (const schemaFile of schemaFiles) {
    const packagePath = `schemas/${schemaFile}`;
    const schema = await readJson(join(packageRoot, packagePath));
    const documented = documentedSchemas.get(packagePath);
    assert.ok(documented, `${packagePath} should be listed in capability schemaDocuments`);
    assert.equal(documented.$id, schema.$id);
    assert.equal(documented.schema, schema.properties?.schema?.const);
    const versions = typeof schema.properties?.version?.const === "string" ? [schema.properties.version.const] : schema.properties?.version?.enum ?? [];
    assert.equal(versions.includes(documented.version), true);
    assert.match(schema.$id, /^https:\/\/schemas\.threenative\.local\/v1\/.+\.schema\.json$/);
    assert.equal(versions.includes("0.1.0"), true);
  }
});

function assertCatalogItem(item: Record<string, unknown>, key: "code" | "prefix"): void {
  assert.equal(typeof item[key], "string");
  assert.equal(item.severity === "error" || item.severity === "warning" || item.severity === "info", true, `${String(item[key])} should have a valid severity`);
  assert.equal(typeof item.surface, "string");
  assert.equal(typeof item.summary, "string");
  assert.equal(typeof item.pathShape, "string");
  assert.equal(typeof item.suggestedFix, "string");
}

async function listFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(root, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  }));
  return nested.flat();
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(path, "utf8"));
}
