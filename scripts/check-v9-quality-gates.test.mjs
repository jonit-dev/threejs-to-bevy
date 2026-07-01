import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkV9QualityGates } from "./check-v9-quality-gates.mjs";

test("should fail when a V9 PRD names a verifier that is absent from package scripts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-check-v9-"));
  try {
    await writeMinimalV9Repo(root, {
      scripts: {
        "check:quality:v9": "node scripts/check-v9-quality-gates.mjs",
        "verify:v9": "node scripts/verify-v9.mjs",
      },
    });
    await writeFile(
      join(root, "docs/PRDs/v9/V9-01-animation-particles-runtime-parity.md"),
      "# test\n\nRun `pnpm verify:v9:missing-gate`.\n",
    );
    const result = await checkV9QualityGates({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_VERIFIER_UNREGISTERED"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when a V9 fixture lacks catalog ownership", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-check-v9-"));
  try {
    await writeMinimalV9Repo(root);
    const catalogPath = join(root, "packages/ir/fixtures/conformance/v9-fixture-catalog.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog.fixtures[0].ownerPrd = "";
    await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
    const result = await checkV9QualityGates({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_FIXTURE_OWNER_MISSING"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail when a completed V9 PRD lacks fixture evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-check-v9-"));
  try {
    await writeMinimalV9Repo(root);
    await rm(join(root, "packages/ir/fixtures/conformance/physics-character/game.bundle"), { force: true, recursive: true });
    const result = await checkV9QualityGates({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_SAMPLE_EVIDENCE_MISSING"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should require CI or documented manual release coverage for verify:release", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-check-v9-"));
  try {
    await writeMinimalV9Repo(root);
    await writeFile(join(root, "docs/STATUS.md"), "# status\n");
    const result = await checkV9QualityGates({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_DOCS_V9_RELEASE_COVERAGE_MISSING"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

export async function writeMinimalV9Repo(root, options = {}) {
  const scripts = {
    "check:quality:v9": "node scripts/check-v9-quality-gates.mjs",
    "verify:v9": "node scripts/verify-v9.mjs",
    "verify:v9:animation-state": "node scripts/verify-animation-state.mjs",
    "verify:v9:animation-blending": "node scripts/verify-animation-blending.mjs",
    "verify:v9:animation-particles": "node scripts/verify-v9-animation-particles.mjs",
    "verify:v9:physics-character": "node scripts/verify-physics-character.mjs",
    "verify:v9:assets-gltf-scene-workflow": "node scripts/verify-v9-assets-gltf-scene-workflow.mjs",
    "verify:v9:rendering-lights": "node scripts/verify-rendering-lights.mjs",
    "verify:v9:skeletal-animation": "node scripts/verify-v9-skeletal-animation.mjs",
    ...options.scripts,
  };
  await mkdir(join(root, "docs/PRDs/v9"), { recursive: true });
  await mkdir(join(root, "packages/ir/fixtures/conformance/animation-state/game.bundle"), { recursive: true });
  for (const fixture of ["physics-character", "physics-character-solver", "rendering-lights"]) {
    await mkdir(join(root, "packages/ir/fixtures/conformance", fixture, "game.bundle"), { recursive: true });
    await writeFile(join(root, "packages/ir/fixtures/conformance", fixture, "game.bundle/manifest.json"), "{}\n");
  }
  await writeFile(join(root, "package.json"), `${JSON.stringify({ scripts }, null, 2)}\n`);
  await writeFile(join(root, "docs/STATUS.md"), "# status\n\nUse `pnpm verify:release`.\n");
  await writeFile(join(root, "docs/bevy-feature-parity.md"), "# parity\n\n`pnpm verify:release`\n");
  await writeFile(join(root, "docs/developer-workflow.md"), "# workflow\n\nRun focused gates, then `pnpm verify:release`, then `pnpm verify:all`.\n");
  await writeFile(
    join(root, "packages/ir/fixtures/conformance/v9-fixture-catalog.json"),
    `${JSON.stringify(
      {
        fixtures: [
          {
            aggregateGate: "verify:v9",
            bundlePath: "packages/ir/fixtures/conformance/animation-state/game.bundle",
            id: "animation-state",
            ownerPrd: "docs/PRDs/v9/V9-01-animation-particles-runtime-parity.md",
            visualEvidenceRequired: false,
          },
        ],
        schema: "threenative.conformance.v9-fixture-catalog",
        version: "0.1.0",
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(join(root, "packages/ir/fixtures/conformance/animation-state/game.bundle/manifest.json"), "{}\n");
}
