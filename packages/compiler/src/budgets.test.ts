import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { emitBundle } from "./emit/bundle.js";

test("budgets should include performance thresholds in the emitted target profile", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-budget-"));
  try {
    await mkdir(join(root, "assets-source/environment/glTF"), { recursive: true });
    await writeFile(join(root, "assets-source/environment/glTF/Grass.gltf"), JSON.stringify({ asset: { version: "2.0" } }));
    await writeFile(join(root, "assets-source/environment/glTF/Grass.bin"), "grass");
    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/forest.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      {
        scene: { children: [], constructor: { name: "Scene" } },
        environment: {
          assetNames: ["Grass.gltf"],
          sourceDir: "assets-source/environment/glTF",
          budgets: { maxBundleBytes: 10000, supportedModelFormats: ["gltf"], supportedTextureFormats: ["png"] },
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
          path: { id: "path", points: [[0, 0, 0], [1, 0, 1]], width: 1 },
          instances: [],
        },
      },
    );

    const targetProfile = JSON.parse(await readFile(join(bundlePath, "target.profile.json"), "utf8"));

    assert.equal(targetProfile.performance.drawCalls.max, 120);
    assert.equal(targetProfile.performance.p95FrameMs.max, 24);
    assert.equal(targetProfile.performance.triangles.max, 450000);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
