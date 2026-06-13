import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV4 } from "./check-docs-v4.mjs";

test("should require v4 quickjs scope terms", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v4-scope-"));
  try {
    await writeDocsFixture(root, {
      scopeText: "V4 proves scripts.bundle.js patch event command primitive\n",
    });

    const result = await checkDocsV4(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V4_SCOPE_TERM_MISSING");
    assert.match(result.diagnostics[0]?.message ?? "", /QuickJS/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should validate v4 prd index links", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v4-links-"));
  try {
    await writeDocsFixture(root, { omitIndexLink: "V4-01-script-ir-and-api-contract.md" });

    const result = await checkDocsV4(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V4_INDEX_LINK_MISSING");
    assert.match(result.diagnostics[0]?.message ?? "", /V4-01/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject excluded capabilities as v4 acceptance criteria", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v4-excluded-"));
  try {
    await writeDocsFixture(root, { acceptance: "- The primitive proof requires full physics.\n" });

    const result = await checkDocsV4(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V4_EXCLUDED_ACCEPTANCE_SCOPE");
    assert.match(result.diagnostics[0]?.message ?? "", /full physics/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeDocsFixture(root, options = {}) {
  const prds = [
    "V4-00-roadmap-and-contract-alignment.md",
    "V4-01-script-ir-and-api-contract.md",
  ];
  await mkdir(join(root, "docs/PRDs/v4"), { recursive: true });
  const links = prds
    .filter((file) => file !== options.omitIndexLink)
    .map((file) => `- [${file}](./${file})`)
    .join("\n");
  const scopeText =
    options.scopeText ?? "V4 QuickJS scripts.bundle.js patch event command primitive proof.\n";
  const acceptance = options.acceptance ?? "- Equivalent patch/event/command logs for a primitive scene.\n";

  await writeFile(
    join(root, "docs/PRDs/v4/README.md"),
    `# V4 PRDs\n\n${scopeText}\n${links}\n\n## V4 Acceptance Criteria\n\n${acceptance}\n## Release Gate\n`,
  );
  for (const file of ["docs/ROADMAP.md", "docs/scripting.md", "docs/scripting-api.md", "docs/feature-maturity.md"]) {
    await mkdir(join(root, file, ".."), { recursive: true });
    await writeFile(join(root, file), scopeText);
  }
  for (const file of prds) {
    await writeFile(join(root, "docs/PRDs/v4", file), `# ${file}\n\n${scopeText}`);
  }
  await writeFile(join(root, "package.json"), '{ "scripts": { "check:docs:v4": "node scripts/check-docs-v4.mjs" } }\n');
}
