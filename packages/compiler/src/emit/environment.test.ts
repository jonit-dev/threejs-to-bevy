import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { World, environmentMap, lightProbe, skybox, textureAsset } from "@threenative/sdk";
import { validateBundle } from "@threenative/ir";

import { emitBundle } from "./bundle.js";

test("should emit rendering environment capabilities when skybox and probes are declared", async () => {
  const root = await mkdtemp(join(process.cwd(), "tmp-env-lighting-"));
  try {
    await mkdir(join(root, "assets-source/environment/glTF"), { recursive: true });
    await mkdir(join(root, "assets/sky"), { recursive: true });
    await writeFile(join(root, "assets-source/environment/glTF/Grass.gltf"), JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "Grass.bin" }] }));
    await writeFile(join(root, "assets-source/environment/glTF/Grass.bin"), "grass");
    for (const file of ["px.png", "nx.png", "py.png", "ny.png", "pz.png", "nz.png", "studio.png"]) {
      await writeFile(join(root, `assets/sky/${file}`), "texture");
    }

    const skyFaces = {
      negativeX: textureAsset("tex.sky.nx", "assets/sky/nx.png"),
      negativeY: textureAsset("tex.sky.ny", "assets/sky/ny.png"),
      negativeZ: textureAsset("tex.sky.nz", "assets/sky/nz.png"),
      positiveX: textureAsset("tex.sky.px", "assets/sky/px.png"),
      positiveY: textureAsset("tex.sky.py", "assets/sky/py.png"),
      positiveZ: textureAsset("tex.sky.pz", "assets/sky/pz.png"),
    };
    const studio = textureAsset("tex.env.studio", "assets/sky/studio.png");
    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project",
        version: "0.1.0",
      },
      {
        world: new World(),
        environment: {
          sourceDir: "assets-source/environment/glTF",
          assetNames: ["Grass.gltf"],
          skybox: skybox({ faces: skyFaces, mode: "cubemap" }, { intensity: 0.8, rotationY: 0.25 }),
          environmentMap: environmentMap({ asset: studio, mode: "equirect" }, { intent: "reflection" }),
          lightProbes: [
            lightProbe("probe.center", {
              bounds: { min: [-3, 0, -3], max: [3, 4, 3] },
              influenceRadius: 5,
              source: { asset: studio, mode: "equirect" },
            }),
          ],
          path: { id: "path.main", points: [[0, 0, 0], [1, 0, 0]], width: 1 },
          instances: [],
        },
      },
    );

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8"));
    const environment = JSON.parse(await readFile(join(bundlePath, "environment.scene.json"), "utf8"));
    const validation = await validateBundle(bundlePath);

    assert.equal(validation.ok, true);
    assertCapability(manifest, "rendering", "skybox");
    assertCapability(manifest, "rendering", "environment-map");
    assertCapability(manifest, "rendering", "light-probes");
    assert.deepEqual(
      assets.assets.filter((asset: { id: string }) => asset.id.startsWith("tex.")).map((asset: { id: string; path: string }) => [asset.id, asset.path]),
      [
        ["tex.env.studio", "assets/sky/studio.png"],
        ["tex.sky.nx", "assets/sky/nx.png"],
        ["tex.sky.ny", "assets/sky/ny.png"],
        ["tex.sky.nz", "assets/sky/nz.png"],
        ["tex.sky.px", "assets/sky/px.png"],
        ["tex.sky.py", "assets/sky/py.png"],
        ["tex.sky.pz", "assets/sky/pz.png"],
      ],
    );
    assert.equal(environment.skybox.faces.positiveX, "tex.sky.px");
    assert.equal(environment.environmentMap.asset, "tex.env.studio");
    assert.equal(environment.lightProbes[0].source.asset, "tex.env.studio");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function assertCapability(manifest: { requiredCapabilities: Record<string, string[]> }, domain: string, capability: string): void {
  assert.ok(manifest.requiredCapabilities[domain]?.includes(capability), `${domain}:${capability}`);
}
