import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyParticleCommands } from "./verify-particle-commands.mjs";

test("should write particle command reports and visual artifacts", async () => {
  const root = await mkdtempProject("tn-particle-commands-");
  try {
    const bundle = join(root, "packages/ir/fixtures/conformance/particle-commands/game.bundle");
    await mkdir(bundle, { recursive: true });
    await writeFile(join(bundle, "assets.manifest.json"), JSON.stringify({
      assets: [
        {
          id: "model.hero",
          kind: "model",
          particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 8, ratePerSecond: 8, shape: "point" }],
          path: "assets/hero.glb",
        },
      ],
      schema: "threenative.assets",
      version: "0.1.0",
    }));

    const report = await verifyParticleCommands({
      artifactDir: join(root, "tools/verify/artifacts/particle-commands"),
      bundlePath: bundle,
      repoRoot: root,
      validateBundle: async () => ({ diagnostics: [], ok: true }),
    });

    assert.equal(report.ok, true);
    assert.equal(report.comparison.summary.maxObservedParticles, 8);
    assert.deepEqual(Object.keys(report.artifacts).sort(), [
      "diff",
      "nativeFrame",
      "nativeReport",
      "report",
      "webFrame",
      "webReport",
    ]);
    assert.equal((await readFile(join(root, report.artifacts.webFrame), "utf8")).includes("<svg"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function mkdtempProject(prefix) {
  return await mkdtemp(join(tmpdir(), prefix));
}
