import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkDistributionContract, validatePackageManifest } from "./check-distribution-contract.mjs";

test("should require type declarations and declaration maps for public packages", async () => {
  const root = await makeRepoRoot({
    "tsconfig.base.json": JSON.stringify({ compilerOptions: { declaration: true, declarationMap: false } }),
    "packages/sdk/package.json": JSON.stringify({
      exports: { ".": { default: "./dist/index.js", types: "./dist/index.d.ts" } },
      files: ["dist"],
      name: "@threenative/sdk",
      publishConfig: { access: "public" },
    }),
  });

  try {
    const result = await checkDistributionContract({
      contracts: [{ exports: [{ kind: "js", subpath: ".", types: "./dist/index.d.ts" }], files: ["dist"], name: "@threenative/sdk", packagePath: "packages/sdk" }],
      root,
    });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_DECLARATION_MAP_DISABLED"), true);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_TYPES_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require public schemas diagnostics capabilities and examples to be exported", () => {
  const diagnostics = validatePackageManifest(
    {
      exports: [
        { kind: "js", subpath: ".", types: "./dist/index.d.ts" },
        { kind: "static", subpath: "./schemas/*" },
        { kind: "static", subpath: "./capabilities/*" },
        { kind: "static", subpath: "./diagnostics/*" },
        { kind: "static", subpath: "./examples/*" },
      ],
      files: ["dist", "schemas", "capabilities", "diagnostics", "examples"],
      name: "@threenative/ir",
      packagePath: "packages/ir",
    },
    {
      exports: { ".": { default: "./dist/index.js", types: "./dist/index.d.ts" }, "./schemas/*": "./schemas/*" },
      files: ["dist", "schemas"],
      name: "@threenative/ir",
      publishConfig: { access: "public" },
      types: "./dist/index.d.ts",
    },
  );

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_EXPORT_MISSING" && diagnostic.message.includes("./capabilities/*")), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_EXPORT_MISSING" && diagnostic.message.includes("./diagnostics/*")), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_EXPORT_MISSING" && diagnostic.message.includes("./examples/*")), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_FILES_ENTRY_MISSING" && diagnostic.message.includes("capabilities")), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_FILES_ENTRY_MISSING" && diagnostic.message.includes("diagnostics")), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_DISTRIBUTION_FILES_ENTRY_MISSING" && diagnostic.message.includes("examples")), true);
});

test("should accept the current package contract after required metadata is present", async () => {
  const result = await checkDistributionContract();
  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join("\n"));
});

async function makeRepoRoot(files) {
  const root = await mkdtemp(join(tmpdir(), "tn-distribution-contract-"));
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, `${content}\n`);
  }
  return root;
}
