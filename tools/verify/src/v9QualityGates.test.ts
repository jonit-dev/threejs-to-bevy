import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { checkV9QualityGates } from "./v9QualityGates.js";

test("should scan completed V9 PRDs from the current done layout", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-quality-"));
  try {
    await writeMinimalRepo(root);
    await writeFile(
      join(root, "docs/PRDs/done/v9/V9-01-animation-particles-runtime-parity.md"),
      "# V9-01\n\nRun `pnpm verify:v9:missing-gate`.\n",
    );

    const result = await checkV9QualityGates({ repoRoot: root });

    assert.equal(result.ok, false);
    assert.equal(
      result.diagnostics.some((diagnostic) => diagnostic.message.includes("verify:v9:missing-gate")),
      true,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeMinimalRepo(root: string): Promise<void> {
  const scripts = {
    "verify:alias": "node scripts/legacy-script-alias.mjs",
    "verify:focused": "pnpm build:verify-tools && node tools/verify/dist/cli/run.js",
  };
  await mkdir(join(root, "docs/PRDs/done/v9"), { recursive: true });
  await mkdir(join(root, "packages/ir/fixtures/conformance/animation-state/game.bundle"), { recursive: true });
  await writeFile(join(root, "package.json"), `${JSON.stringify({ scripts }, null, 2)}\n`);
  await writeFile(join(root, "docs/STATUS.md"), "# status\n\nUse `pnpm verify:release`.\n");
  await writeFile(join(root, "docs/bevy-feature-parity.md"), "# parity\n\n`pnpm verify:release`\n");
  await writeFile(join(root, "docs/developer-workflow.md"), "# workflow\n\nRun `pnpm verify:release`.\n");
  for (const fixture of ["physics-character", "physics-character-solver", "rendering-lights"]) {
    await mkdir(join(root, "packages/ir/fixtures/conformance", fixture, "game.bundle"), { recursive: true });
    await writeFile(join(root, "packages/ir/fixtures/conformance", fixture, "game.bundle/manifest.json"), "{}\n");
  }
  await writeFile(
    join(root, "packages/ir/fixtures/conformance/v9-fixture-catalog.json"),
    `${JSON.stringify(
      {
        fixtures: [
          {
            aggregateGate: "verify:v9",
            bundlePath: "packages/ir/fixtures/conformance/animation-state/game.bundle",
            id: "animation-state",
            ownerPrd: "docs/PRDs/done/v9/V9-01-animation-particles-runtime-parity.md",
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
