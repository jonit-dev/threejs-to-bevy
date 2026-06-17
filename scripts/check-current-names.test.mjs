import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  checkCurrentNames,
  loadVersionNameAllowlist,
  validateAllowlistShape,
} from "./check-current-names.mjs";

test("should classify legacy version names when scanning repo surfaces", async () => {
  const root = await makeRepoRoot({
    "docs/PRDs/v9/README.md": "# V9 PRDs\n\nHistorical milestone batch.\n",
    "scripts/verify-v9.mjs": "export const gate = 'verify:v9';\n",
    "examples/v9-physics-character/package.json": '{"name":"v9-physics-character"}\n',
  });

  try {
    const allowlist = await loadVersionNameAllowlist(root);
    const result = await checkCurrentNames({ root, allowlist });
    const historical = result.inventory.filter((item) => item.classification === "historical-archive");
    const compat = result.inventory.filter((item) => item.classification === "compat-alias");
    assert.ok(historical.length > 0, "expected historical-archive classifications");
    assert.ok(compat.length > 0, "expected compat-alias classifications");
    assert.ok(
      result.inventory.every((item) => item.classification !== "unclassified"),
      "fixture repo occurrences should be classified",
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject new current version labels outside the allowlist", async () => {
  const root = await makeRepoRoot({
    "docs/README.md": `# Docs

Current release gate: V10 release gate for all contributors.
`,
  });

  try {
    const allowlist = await loadVersionNameAllowlist(root);
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_NAMES_STRICT_FRONT_DOOR_VIOLATION"),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes("V10")),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require owner and policy for each retained version reference", async () => {
  const allowlist = await loadVersionNameAllowlist();
  const diagnostics = validateAllowlistShape(allowlist);
  assert.deepEqual(diagnostics, []);
  for (const rule of allowlist.pathRules) {
    assert.ok(rule.owner, `missing owner for ${rule.id}`);
    assert.ok(rule.policy, `missing policy for ${rule.id}`);
    assert.ok(rule.rationale, `missing rationale for ${rule.id}`);
    assert.ok(rule.classification, `missing classification for ${rule.id}`);
    assert.ok(
      allowlist.validClassifications.includes(rule.classification),
      `invalid classification for ${rule.id}`,
    );
  }
});

test("should pass current repo naming inventory", async () => {
  const repoRoot = new URL("..", import.meta.url).pathname;
  const allowlist = await loadVersionNameAllowlist(repoRoot);
  const result = await checkCurrentNames({ root: repoRoot, allowlist });
  if (!result.ok) {
    const errors = result.diagnostics
      .filter((diagnostic) => diagnostic.severity === "error")
      .slice(0, 20)
      .map((diagnostic) => `${diagnostic.code} ${diagnostic.path}: ${diagnostic.message}`)
      .join("\n");
    assert.fail(`expected repo naming inventory to pass\n${errors}`);
  }
});

async function makeRepoRoot(files) {
  const root = await mkdtemp(join(tmpdir(), "tn-check-names-"));
  const bundledAllowlist = await readFile(
    new URL("./version-name-allowlist.json", import.meta.url),
    "utf8",
  );

  await mkdir(join(root, "scripts"), { recursive: true });
  await writeFile(join(root, "scripts/version-name-allowlist.json"), bundledAllowlist);

  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }

  return root;
}
