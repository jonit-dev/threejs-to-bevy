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
    "examples/sample-scene/package.json": '{"name":"sample-scene"}\n',
  });

  try {
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
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
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
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

test("should ignore version-looking lockfile integrity hashes", async () => {
  const root = await makeRepoRoot({
    "pnpm-lock.yaml": "packages:\n  picomatch@2.3.2:\n    resolution: {integrity: sha512-V7+vQEJ06Z+c5tSye8S+nHUfI51xoXIXjHQ99cQtKUkQqqO1kO/KCJUfZXuB47h/YBlDhah2H3hdUGXn8ie0oA==}\n",
  });

  try {
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
    assert.equal(result.inventory.some((item) => item.path === "pnpm-lock.yaml"), false);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should skip generated asset source snapshots during name inventory", async () => {
  const root = await makeRepoRoot({
    "docs/data/objaverse-glb-asset-sources.snapshot.json": `${JSON.stringify({ note: "Generated snapshot mentions V10 but is not source prose." })}\n`,
    "docs/data/catalog-source.json": `${JSON.stringify({ note: "Current source mentions V10 and should still be scanned." })}\n`,
  });

  try {
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(
      result.inventory.some((item) => item.path === "docs/data/objaverse-glb-asset-sources.snapshot.json"),
      false,
    );
    assert.equal(
      result.inventory.some((item) => item.path === "docs/data/catalog-source.json"),
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

test("should reject versioned root artifact paths", async () => {
  const root = await makeRepoRoot({
    "artifacts/v10/native-ui-effects/report.json": "{}\n",
  });

  try {
    const allowlist = await loadVersionNameAllowlist(root);
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_ARTIFACT_LAYOUT_VERSIONED_ROOT_ARTIFACT"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should allow owned aggregate and feature-named artifact paths", async () => {
  const root = await makeRepoRoot({
    "tools/verify/artifacts/release/verification-report.json": "{}\n",
    "packages/ir/artifacts/conformance/verification-report.json": "{}\n",
    "tools/verify/artifacts/native-ui-effects/report.json": "{}\n",
  });

  try {
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject game ts template entries", async () => {
  const root = await makeRepoRoot({
    "templates/legacy/threenative.config.json": `${JSON.stringify({ entry: "src/game.ts" })}\n`,
  });

  try {
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_NAMES_GAME_TS_TEMPLATE_ENTRY"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject game ts example entries and files", async () => {
  const root = await makeRepoRoot({
    "examples/legacy/src/game.ts": "export default {}\n",
    "examples/legacy/threenative.config.json": `${JSON.stringify({ entry: "src/game.ts" })}\n`,
  });

  try {
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_NAMES_GAME_TS_EXAMPLE_ENTRY"),
      true,
    );
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_NAMES_GAME_TS_EXAMPLE_FILE"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject legacy scaffold guidance in active docs", async () => {
  const root = await makeRepoRoot({
    "docs/workflows/ai-workflows.md": "tn init my-game --template game-starter --json\n",
  });

  try {
    const allowlist = { ...(await loadVersionNameAllowlist(root)), requiredFrontDoorPhrases: [] };
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_NAMES_GAME_TS_SCAFFOLD_GUIDANCE"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject tmp artifact paths", async () => {
  const root = await makeRepoRoot({
    "tmp/simple-game/artifacts/report.json": "{}\n",
  });

  try {
    const allowlist = await loadVersionNameAllowlist(root);
    const result = await checkCurrentNames({ root, allowlist });
    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.code === "TN_ARTIFACT_LAYOUT_TMP_ARTIFACT"),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
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
