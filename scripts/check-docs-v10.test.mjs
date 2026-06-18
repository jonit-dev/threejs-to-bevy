import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkDocsV10 } from "./check-docs-v10.mjs";

test("should require every current-batch parity item to have a V10 owner or boundary", async () => {
  const root = await makeDocsRoot({
    parity: defaultParity().replace("(V10-02)", ""),
  });
  try {
    const result = await checkDocsV10(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V10_OWNER_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject V10 completion claims without focused gate references", async () => {
  const root = await makeDocsRoot({
    parity: defaultParity().replace(
      "- [ ] `D` Direct Bevy authoring (V10-01 boundary)",
      "- [x] `P1` V10-02 promoted feature without evidence\n- [ ] `D` Direct Bevy authoring (V10-01 boundary)",
    ),
  });
  try {
    const result = await checkDocsV10(root);
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V10_COMPLETION_EVIDENCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass V10 docs gate shape", async () => {
  const root = await makeDocsRoot();
  try {
    const result = await checkDocsV10(root);
    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeDocsRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-docs-v10-"));
  const files = {
    "docs/PRDs/v10/README.md": overrides.index ?? defaultIndex(),
    "docs/PRDs/v10/V10-01-scope-triage-and-release-gate.md": overrides.prd ?? defaultPrd(),
    "docs/STATUS.md": overrides.status ?? defaultStatus(),
    "docs/bevy-feature-parity.md": overrides.parity ?? defaultParity(),
  };
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  return root;
}

function defaultIndex() {
  return [
    "V10-01-scope-triage-and-release-gate.md",
    "V10-02-advanced-renderer-materials-and-physics.md",
    "V10-03-cross-runtime-visual-calibration.md",
    "V10-04-production-platform-audio-assets-and-release.md",
    "pnpm verify:v10",
  ].join("\n");
}

function defaultPrd() {
  return ["scripts/check-docs-v10.mjs", "scripts/verify-v10.mjs", "artifacts/v10/verification-report.json"].join("\n");
}

function defaultStatus() {
  return ["pnpm check:docs", "pnpm verify:v10"].join("\n");
}

function defaultParity() {
  return [
    "### V10 Residual Ownership Map",
    "V10-01 V10-02 V10-03 V10-04 V10-01 boundary",
    "### Rendering",
    "- [ ] `P3` Atmospheric scattering (V10-02)",
    "- [ ] `D` Direct Bevy authoring (V10-01 boundary)",
    "### Editor, Debugging, and Developer Tools",
    "- [ ] `P1` Visual editor UI and inspector panels",
  ].join("\n");
}
