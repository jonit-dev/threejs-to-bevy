import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV9AnimationParticles } from "./verify-v9-animation-particles.mjs";

test("should require all v9 animation particle artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-animation-particles-"));
  try {
    const result = await verifyV9AnimationParticles({
      artifactDir: join(root, "artifacts/v9/animation-particles"),
      repoRoot: root,
      runNativeParticleTest: async () => undefined,
      webParticleReport: async () => ({
        backend: "web-three",
        emitters: [{ count: 3, id: "dust", name: "particle.model.hero.dust", shape: "point" }],
        schema: "threenative.v9.animation-particles",
        version: "0.1.0",
      }),
    });

    assert.equal(result.ok, true);
    assert.deepEqual(Object.keys(result.artifacts).sort(), [
      "nativeScreenshotPath",
      "nativeTracePath",
      "reportPath",
      "webScreenshotPath",
      "webTracePath",
    ]);
    const report = JSON.parse(await readFile(result.artifacts.reportPath, "utf8"));
    assert.equal(report.comparison.summary.particleCount, 3);
    assert.equal((await readFile(result.artifacts.webScreenshotPath, "utf8")).includes("<svg"), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should fail v9 animation particle verification when particles are blank", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v9-animation-particles-blank-"));
  try {
    const result = await verifyV9AnimationParticles({
      artifactDir: join(root, "artifacts/v9/animation-particles"),
      repoRoot: root,
      runNativeParticleTest: async () => undefined,
      webParticleReport: async () => ({
        backend: "web-three",
        emitters: [{ count: 0, id: "dust", name: "particle.model.hero.dust", shape: "point" }],
        schema: "threenative.v9.animation-particles",
        version: "0.1.0",
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.comparison.diagnostics[0]?.code, "TN_VERIFY_V9_PARTICLE_BLANK");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
