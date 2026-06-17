import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkDocs } from "./docs.js";

test("should validate current docs without milestone-specific scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-gate-"));
  await mkdir(join(root, "docs"), { recursive: true });
  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(
    join(root, "docs/README.md"),
    "# Docs\n\n[cleanup PRD](PRDs/cleanup-versioned-debt.md)\n\nRun `pnpm verify:release`.\n",
  );
  await writeFile(
    join(root, "docs/STATUS.md"),
    "# Status\n\nlegacy milestone names remain.\n\n[cleanup PRD](PRDs/cleanup-versioned-debt.md)\n\n`pnpm verify:release`\n",
  );
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({ scripts: { "check:docs": "node tools/verify/dist/cli/check-docs.js", "verify:release": "node tools/verify/dist/cli/release.js" } }),
  );
  await writeFile(
    join(root, "scripts/version-name-allowlist.json"),
    JSON.stringify({ validClassifications: ["current-surface"], pathRules: [], requiredFrontDoorPhrases: [] }),
  );

  const result = await checkDocs(root);
  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
});
