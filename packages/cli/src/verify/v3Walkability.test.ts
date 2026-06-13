import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV3Walkability } from "./v3Walkability.js";

test("v3Walkability should report path and blocker probes", async () => {
  const root = await makeBundle(true);
  try {
    const report = await verifyV3Walkability({ artifactDir: root, bundlePath: root });

    assert.equal(report.status, "pass");
    assert.deepEqual(report.probes.map((probe) => probe.id), ["path-center", "path-edge", "blocking-prop"]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v3Walkability should fail when walkability data is missing", async () => {
  const root = await makeBundle(false);
  try {
    const report = await verifyV3Walkability({ artifactDir: root, bundlePath: root });

    assert.equal(report.status, "fail");
    assert.equal(report.diagnostics[0]?.code, "TN_V3_WALKABILITY_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeBundle(includeWalkability: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-walkability-"));
  await mkdir(join(root, "assets/environment"), { recursive: true });
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "walkability",
    entry: { world: "world.ir.json", environmentScene: "environment.scene.json" },
    files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" },
    requiredCapabilities: {},
  });
  await writeJson(root, "world.ir.json", { schema: "threenative.world", version: "0.1.0", entities: [] });
  await writeJson(root, "assets.manifest.json", { schema: "threenative.assets", version: "0.1.0", assets: [] });
  await writeJson(root, "materials.ir.json", { schema: "threenative.materials", version: "0.1.0", materials: [] });
  await writeJson(root, "target.profile.json", { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] });
  await writeJson(root, "environment.scene.json", {
    schema: "threenative.environment-scene",
    version: "0.1.0",
    path: { id: "path.main", points: [[0, 0, 3], [0, 0, -3]], width: 2 },
    sourceAssets: [{ id: "env.Rock", asset: "model.env.Rock", category: "rock" }],
    instances: [{ id: "rock.blocking", sourceAsset: "env.Rock", position: [1, 0, 0] }],
    ...(includeWalkability
      ? {
          walkability: {
            blockers: [{ collider: { radius: 0.5, type: "cylinder" }, id: "blocker.rock", instance: "rock.blocking" }],
            movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
            regions: [{ id: "path", points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] }],
            terrain: { height: 0, surface: "terrain" },
          },
        }
      : {}),
  });
  return root;
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
