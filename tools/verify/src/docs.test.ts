import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocs } from "./docs.js";

test("should validate current docs without milestone-specific scripts", async () => {
  const root = await makeDocsRepo();

  const result = await checkDocs(root);
  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
});

test("should require contextual docs group indexes", async () => {
  const root = await makeDocsRepo();
  await writeFile(
    join(root, "docs/README.md"),
    "# Docs\n\n[cleanup PRD](PRDs/archive/cleanup-versioned-debt.md)\n\nRun `pnpm verify:release`.\n",
  );

  const result = await checkDocs(root);

  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_GROUP_INDEX_UNLINKED"),
    true,
  );
});

test("should reject unclassified flat docs pages", async () => {
  const root = await makeDocsRepo();
  await writeFile(join(root, "docs/new-feature.md"), "# New Feature\n");

  const result = await checkDocs(root);

  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_FLAT_PAGE_UNCLASSIFIED"),
    true,
  );
});

test("should document canonical verify tool paths", async () => {
  const root = await makeDocsRepo();

  const result = await checkDocs(root);

  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
});

test("should fail with line count when STATUS budget is exceeded", async () => {
  const root = await makeDocsRepo();
  await writeFile(
    join(root, "docs/STATUS.md"),
    [
      "# Status",
      "legacy milestone names remain.",
      "[cleanup PRD](PRDs/archive/cleanup-versioned-debt.md)",
      "`pnpm verify:release`",
      "`verify:scripting-helpers-lifecycle`",
      "[authoring](status/capabilities/authoring.md)",
      ...Array.from({ length: 260 }, (_, index) => `filler ${index}`),
    ].join("\n"),
  );

  const result = await checkDocs(root);

  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_STATUS_LINE_BUDGET_EXCEEDED" && diagnostic.message.includes("250")),
    true,
  );
});

test("should fail when a capability doc is orphaned", async () => {
  const root = await makeDocsRepo();
  await writeFile(join(root, "docs/status/capabilities/orphan.md"), "# Orphan\n");

  const result = await checkDocs(root);

  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_STATUS_CAPABILITY_ORPHAN" && diagnostic.path === "docs/status/capabilities/orphan.md"),
    true,
  );
});

test("should require stable contributor gates", async () => {
  const root = await makeDocsRepo();
  await writeFile(
    join(root, "docs/workflows/developer-workflow.md"),
    [
      "Generated artifacts are outputs.",
      "Fixtures are stable inputs.",
      "`examples/<name>/artifacts/<gate>/`",
      "`examples/<name>/dist/*`",
      "`tools/verify/artifacts/<gate>/`",
      "`packages/ir/artifacts/conformance/`",
      "`packages/ir/fixtures/*`",
      "`runtime-bevy/artifacts/<gate>/`",
      "`tools/verify/src`",
      "`scripts/` is wrapper-only",
    ].join("\n"),
  );

  const result = await checkDocs(root);

  assert.equal(result.ok, false);
  assert.equal(
    result.diagnostics.some((diagnostic) => diagnostic.message.includes("tools/verify/src/cli/run.ts")),
    true,
  );
});

async function makeDocsRepo() {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-gate-"));
  await mkdir(join(root, "docs/PRDs"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  for (const group of ["architecture", "contracts", "runtime", "workflows", "status"]) {
    await mkdir(join(root, "docs", group), { recursive: true });
    await writeFile(join(root, "docs", group, "README.md"), `# ${group}\n`);
  }
  await mkdir(join(root, "docs/status/capabilities"), { recursive: true });
  await writeFile(join(root, "docs/status/capabilities/authoring.md"), "# Authoring\n");
  await writeFile(join(root, "docs/PRDs/README.md"), "# PRDs\n\n[cleanup](archive/cleanup-versioned-debt.md)\n");
  await mkdir(join(root, "docs/PRDs/archive"), { recursive: true });
  await writeFile(join(root, "docs/PRDs/archive/cleanup-versioned-debt.md"), "# cleanup\n");
  await writeFile(
    join(root, "docs/README.md"),
    `# Docs

[cleanup PRD](PRDs/archive/cleanup-versioned-debt.md)

Run \`pnpm verify:release\`.

- [Architecture](architecture/README.md)
- [Contracts](contracts/README.md)
- [Runtime](runtime/README.md)
- [Workflows](workflows/README.md)
- [Status](status/README.md)
- [PRDs](PRDs/README.md)
`,
  );
  await writeFile(
    join(root, "docs/STATUS.md"),
    "# Status\n\nlegacy milestone names remain.\n\n[cleanup PRD](PRDs/archive/cleanup-versioned-debt.md)\n\n`pnpm verify:release`\n\n`verify:scripting-helpers-lifecycle`\n\n[authoring](status/capabilities/authoring.md)\n",
  );
  await writeFile(
    join(root, "docs/contracts/scripting.md"),
    "# Scripting\n\nSupported helper imports: `@threenative/script-stdlib` and `@threenative/racing-kit`.\n",
  );
  await writeFile(
    join(root, "docs/contracts/scripting-api.md"),
    "# Scripting API\n\nSupported helper imports: `@threenative/script-stdlib` and `@threenative/racing-kit`.\n",
  );
  await writeFile(
    join(root, "docs/workflows/developer-workflow.md"),
    [
      "Generated artifacts are outputs.",
      "Fixtures are stable inputs.",
      "`examples/<name>/artifacts/<gate>/`",
      "`examples/<name>/dist/*`",
      "`tools/verify/artifacts/<gate>/`",
      "`packages/ir/artifacts/conformance/`",
      "`packages/ir/fixtures/*`",
      "`runtime-bevy/artifacts/<gate>/`",
      "`tools/verify/src`",
      "`tools/verify/src/cli/run.ts`",
      "`scripts/` is wrapper-only",
    ].join("\n"),
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      scripts: {
        "check:docs": "node tools/verify/dist/cli/check-docs.js",
        "verify:focused": "node tools/verify/dist/cli/run.js",
        "verify:release": "node tools/verify/dist/cli/release.js",
        "verify:scripting-helpers-lifecycle": "node tools/verify/dist/cli/run.js verify:scripting-helpers-lifecycle",
      },
    }),
  );
  await writeFile(
    join(root, "scripts/version-name-allowlist.json"),
    JSON.stringify({ validClassifications: ["current-surface"], pathRules: [], requiredFrontDoorPhrases: [] }),
  );
  return root;
}
