import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { checkQualityV10 } from "./check-quality-v10.mjs";

test("should fail when parity docs claim unchecked V10 completion without evidence", async () => {
  const root = await makeRepo();
  try {
    await writeFile(join(root, "docs/bevy-feature-parity.md"), `${defaultParity()}\n- [x] \`P1\` V10-02 promoted item\n`);
    const result = await checkQualityV10({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_CHECK_V10_COMPLETION_EVIDENCE_MISSING"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when V10 scripts are missing from package.json", async () => {
  const root = await makeRepo({ scripts: { "verify:v10": "node missing.mjs" } });
  try {
    const result = await checkQualityV10({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_CHECK_V10_SCRIPT_UNREGISTERED"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should pass V10 quality gate shape", async () => {
  const root = await makeRepo();
  try {
    const result = await checkQualityV10({ repoRoot: root });
    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeRepo(options = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-check-v10-"));
  const scripts = {
    "check:docs": "pnpm build:verify-tools && node tools/verify/dist/cli/check-docs.js",
    "verify:v10": "node scripts/verify-v10.mjs",
    ...options.scripts,
  };
  const files = {
    "package.json": `${JSON.stringify({ scripts }, null, 2)}\n`,
    "docs/PRDs/v10/README.md": defaultIndex(),
    "docs/PRDs/v10/V10-01-scope-triage-and-release-gate.md": defaultPrd(),
    "docs/PRDs/v10/V10-02-advanced-renderer-materials-and-physics.md": "# V10-02\n",
    "docs/PRDs/v10/V10-03-cross-runtime-visual-calibration.md": "# V10-03\n",
    "docs/PRDs/v10/V10-04-production-platform-audio-assets-and-release.md": "# V10-04\n",
    "docs/STATUS.md": defaultStatus(),
    "docs/bevy-feature-parity.md": defaultParity(),
    "packages/ir/fixtures/rejected/v10-boundaries/catalog.json": defaultCatalog(),
  };
  for (const [file, content] of Object.entries(files)) {
    const path = join(root, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, content);
  }
  JSON.parse(await readFile(join(root, "package.json"), "utf8"));
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
  return ["### V10 Residual Ownership Map", "V10-01 V10-02 V10-03 V10-04 V10-01 boundary", "### Rendering", "- [ ] `P3` Atmospheric scattering (V10-02)", "- [ ] `D` Direct Bevy authoring (V10-01 boundary)"].join("\n");
}

function defaultCatalog() {
  return `${JSON.stringify(
    {
      fixtures: [
        {
          expectedDiagnostic: "TN_IR_NETWORKING_UNSUPPORTED",
          id: "online-replication",
          ownerPrd: "docs/PRDs/v10/V10-01-scope-triage-and-release-gate.md",
        },
      ],
      schema: "threenative.rejected-fixtures.v10-boundaries",
      version: "0.1.0",
    },
    null,
    2,
  )}\n`;
}
