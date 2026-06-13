import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { verifyV3Atmosphere } from "./v3Atmosphere.js";

test("v3Atmosphere should report renderer atmosphere artifacts", async () => {
  const root = await makeBundle(true);
  try {
    const report = await verifyV3Atmosphere({ artifactDir: root, bundlePath: root });

    assert.equal(report.status, "pass");
    assert.equal(report.observation.profileId, "atmosphere.forest");
    assert.equal(report.observation.fogMode, "exponential");
    assert.equal(report.observation.shadowMapSize, 1024);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("v3Atmosphere should fail when profile is missing", async () => {
  const root = await makeBundle(false);
  try {
    const report = await verifyV3Atmosphere({ artifactDir: root, bundlePath: root });

    assert.equal(report.status, "fail");
    assert.equal(report.diagnostics[0]?.code, "TN_V3_ATMOSPHERE_MISSING");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

async function makeBundle(includeAtmosphere: boolean): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-v3-atmosphere-"));
  await mkdir(join(root, "assets/environment"), { recursive: true });
  await writeJson(root, "manifest.json", {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "atmosphere",
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
    ...(includeAtmosphere
      ? {
          atmosphere: {
            active: true,
            id: "atmosphere.forest",
            sun: { castsShadow: true, color: "#ffd39a", direction: [-0.4, -0.8, -0.2], id: "sun.forest", intensity: 3.2 },
            ambient: { color: "#8fb2a5", intensity: 0.8, mode: "constant" },
            fog: { color: "#9eb6aa", density: 0.028, enabled: true, mode: "exponential" },
            sky: { color: "#9eb6aa" },
            colorManagement: { exposure: 1.05, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
            shadows: { bias: -0.0005, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 45, normalBias: 0.02, receiverPolicy: "terrain-and-path" },
          },
        }
      : {}),
    path: { id: "path.main", points: [[0, 0, 3], [0, 0, -3]], width: 2 },
    sourceAssets: [],
    instances: [],
  });
  return root;
}

async function writeJson(root: string, file: string, value: unknown): Promise<void> {
  await writeFile(join(root, file), `${JSON.stringify(value, null, 2)}\n`);
}
