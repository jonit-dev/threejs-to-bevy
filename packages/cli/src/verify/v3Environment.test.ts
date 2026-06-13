import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV3Environment } from "./v3Environment.js";

test("v3Environment should save web performance artifacts", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-env-"));
  try {
    const bundle = join(root, "bundle");
    await mkdir(join(bundle, "assets"), { recursive: true });
    await writeBundle(bundle);

    const report = await verifyV3Environment({ artifactDir: join(root, "artifacts"), bundlePath: bundle });
    const saved = JSON.parse(await readFile(report.artifacts.metricsPath, "utf8"));

    assert.equal(report.status, "pass");
    assert.equal(saved.instancedGroups, 1);
    assert.equal(report.rendererEvidence?.instancingSource, "placeholder-runtime-plan");
    assert.equal(report.rendererEvidence?.placeholderGroups, 1);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_V3_ENVIRONMENT_PLACEHOLDER_INSTANCING_EVIDENCE"), true);
    assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_V3_ENVIRONMENT_SYNTHETIC_RENDERER_METRICS"), true);
    assert.match(report.artifacts.rawSamplesPath, /v3-performance-samples\.json$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function writeBundle(root: string): Promise<void> {
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "v3",
    requiredCapabilities: {},
    entry: { world: "world.ir.json", environmentScene: "environment.scene.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
  });
  await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [], resources: {} });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeFile(join(root, "assets/grass.png"), "texture");
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [{ id: "tex.grass", kind: "texture", format: "png", path: "assets/grass.png" }] });
  await writeJson(root, "environment.scene.json", {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    sourceAssets: [{ id: "env.Grass", asset: "model.env.Grass", category: "grass" }],
    instances: [
      { id: "grass.1", sourceAsset: "env.Grass", position: [0, 0, 0] },
      { id: "grass.2", sourceAsset: "env.Grass", position: [1, 0, 0] },
    ],
    path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
  });
  await writeJson(root, "target.profile.json", {
    schema: "threenative.target-profile",
    version: "0.1.0",
    targets: ["web"],
    performance: {
      averageFrameMs: { max: 18 },
      drawCalls: { max: 120 },
      instancedGroups: { max: 32 },
      instances: { max: 1600 },
      loadMs: { max: 2200 },
      p95FrameMs: { max: 24 },
      requiredTarget: "web",
      textureBytes: { max: 18000000 },
      triangles: { max: 450000 },
      uninstancedRepeatedProps: { max: 0 },
      worstFrameMs: { max: 36 },
    },
  });
}

async function writeJson(root: string, path: string, value: unknown): Promise<void> {
  await mkdir(join(root, path, ".."), { recursive: true });
  await writeFile(join(root, path), `${JSON.stringify(value)}\n`);
}
