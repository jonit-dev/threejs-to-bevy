import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { checkColorParityContract } from "./check-color-parity-contract.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

test("should pass color parity contract checks in the repository", async () => {
  const result = await checkColorParityContract();
  assert.equal(result.ok, true, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"));
});

test("should fail when verify:focused script is missing", async () => {
  const root = await makeBrokenRoot({ packageScripts: {} });
  try {
    const result = await checkColorParityContract({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_COLOR_PARITY_SCRIPT_MISSING"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeBrokenRoot(overrides = {}) {
  const root = await mkdtemp(join(tmpdir(), "tn-color-parity-contract-"));
  const copyPaths = [
    "examples/v8-color-parity/src/game.ts",
    "examples/v8-color-parity/threenative.config.json",
    "examples/v8-lighting-tone/src/game.ts",
    "packages/cli/src/verify/colorParitySwatches.ts",
    "packages/cli/src/verify/colorParityVisual.ts",
    "packages/cli/dist/verify",
    "scripts/verify-v8-color-parity.mjs",
    "docs/STATUS.md",
  ];
  for (const relativePath of copyPaths) {
    const source = join(repoRoot, relativePath);
    const target = join(root, relativePath);
    await mkdir(dirname(target), { recursive: true });
    const fileStat = await stat(source);
    if (fileStat.isDirectory()) {
      await cpDir(source, target);
      continue;
    }
    await writeFile(target, await readFile(source));
  }
  const packageJson = {
    name: "threejs-to-bevy",
    scripts: overrides.packageScripts ?? { "verify:focused": "node tools/verify/dist/cli/run.js" },
  };
  await writeFile(join(root, "package.json"), `${JSON.stringify(packageJson, null, 2)}\n`);
  return root;
}

async function cpDir(source, target) {
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const from = join(source, entry.name);
    const to = join(target, entry.name);
    if (entry.isDirectory()) {
      await cpDir(from, to);
    } else {
      await writeFile(to, await readFile(from));
    }
  }
}
