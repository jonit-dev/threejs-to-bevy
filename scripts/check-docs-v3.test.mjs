import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocsV3 } from "./check-docs-v3.mjs";

test("should require v3 performance artifact docs", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v3-"));
  try {
    await writeDocsFixture(root);
    await writeFile(join(root, "examples/v3-environment/README.md"), "V3 dist/forest.bundle assets/environment\n");

    const result = await checkDocsV3(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V3_ARTIFACT_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should validate v3 prd index links", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v3-links-"));
  try {
    await writeDocsFixture(root, { omitIndexLink: "V3-01-scene-asset-bundling-and-budgets.md" });

    const result = await checkDocsV3(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_DOCS_V3_INDEX_LINK_MISSING");
    assert.match(result.diagnostics[0]?.message ?? "", /V3-01/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeDocsFixture(root, options = {}) {
  const prds = [
    "V3-00-roadmap-and-contract-alignment.md",
    "V3-01-scene-asset-bundling-and-budgets.md",
    "V3-02-threejs-performance-and-instancing.md",
  ];
  await mkdir(join(root, "docs/releases"), { recursive: true });
  await mkdir(join(root, "docs/v3"), { recursive: true });
  await mkdir(join(root, "docs/PRDs/v3"), { recursive: true });
  await mkdir(join(root, "examples/v3-environment"), { recursive: true });
  const links = prds
    .filter((file) => file !== options.omitIndexLink)
    .map((file) => `- [${file}](./${file})`)
    .join("\n");
  await writeFile(
    join(root, "docs/PRDs/v3/README.md"),
    `# V3\n\nPreview_2.jpg Three.js performance first-person Bevy verify:v3\n\n${links}\n\n## V3 Acceptance Criteria\n\n- Forest scene proof.\n\n## Release Gate\n`,
  );
  await writeFile(
    join(root, "docs/README.md"),
    [
      "# Docs",
      "",
      "[STATUS.md](STATUS.md)",
      "[releases/v3-completion.md](releases/v3-completion.md)",
      "[conventions.md](conventions.md)",
      "[feature-maturity.md](feature-maturity.md)",
      "[verify-v3.md](verify-v3.md)",
      "",
    ].join("\n"),
  );
  await writeFile(join(root, "docs/STATUS.md"), "# Status\n\nV3\n\npnpm verify:v3\n\n## V3 Does Not Prove\n");
  await writeFile(join(root, "docs/releases/v3-completion.md"), "# V3 Completion\n\nV3\n");
  await writeFile(join(root, "docs/conventions.md"), "# Conventions\n\nV3\n");
  await writeFile(join(root, "docs/feature-maturity.md"), "# Feature Maturity\n\nV3\n");
  await writeFile(join(root, "docs/verify-v3.md"), "# verify:v3\n\nV3\n");
  await writeFile(join(root, "docs/diagnostics.md"), "# Diagnostics\n\nV3\n");
  await writeFile(join(root, "docs/v3/environment-scene-ir.md"), "# Environment Scene IR\n\nV3\n");
  await writeFile(join(root, "docs/v3/asset-pipeline.md"), "# V3 Asset Pipeline\n\nV3\n");
  await writeFile(join(root, "docs/v3/visual-parity-policy.md"), "# Visual Parity Policy\n\nV3\n");
  for (const file of prds) {
    await writeFile(join(root, "docs/PRDs/v3", file), `# ${file}\n\nV3 performance\n`);
  }
  await writeFile(
    join(root, "examples/v3-environment/README.md"),
    "V3 dist/forest.bundle assets/environment performance threejs-bevy-side-by-side.png\n",
  );
}
