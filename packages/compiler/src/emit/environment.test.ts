import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

import { World, environmentMap, lightProbe, skybox, textureAsset } from "@threenative/sdk";
import { validateBundle } from "@threenative/ir";

import { emitBundle } from "./bundle.js";
import type { IEnvironmentDeclaration } from "./environment.js";

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

test("should reject explicit scatter counts beyond the emission budget", async () => {
  const root = await mkdtemp(join(process.cwd(), "tmp-env-scatter-budget-"));
  try {
    await writeEnvironmentAsset(root);

    await assert.rejects(
      emitBundle(
        {
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        },
        {
          world: new World(),
          environment: environmentDeclaration({ count: 10_001, id: "scatter.too-many" }),
        },
      ),
      /scatter\.too-many.*exceeding the maximum of 10000/i,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject density-derived scatter counts beyond the emission budget", async () => {
  const root = await mkdtemp(join(process.cwd(), "tmp-env-scatter-density-budget-"));
  try {
    await writeEnvironmentAsset(root);

    await assert.rejects(
      emitBundle(
        {
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project",
          version: "0.1.0",
        },
        {
          world: new World(),
          environment: environmentDeclaration({ bounds: { min: [0, 0, 0], max: [200, 0, 200] }, density: 1, id: "scatter.dense" }),
        },
      ),
      /scatter\.dense.*exceeding the maximum of 10000/i,
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit deterministic chunk meshes for reference heightmap", async () => {
  const root = await mkdtemp(join(process.cwd(), "tmp-env-terrain-heightmap-"));
  try {
    await mkdir(join(root, "assets-source/environment/glTF"), { recursive: true });
    await mkdir(join(root, "assets/terrain"), { recursive: true });
    await writeFile(join(root, "assets/terrain/reference.heightmap.json"), JSON.stringify({ samples: [0, 32768, 65535, 16384, 49152, 32768, 0, 32768, 65535] }));
    const heightmap = {
      encoding: "u16-normalized",
      format: "json",
      height: 3,
      heightRange: { min: -1, max: 1 },
      id: "heightmap.reference",
      kind: "heightmap",
      path: "assets/terrain/reference.heightmap.json",
      width: 3,
    } as const;
    const source = {
      assets: [heightmap],
      world: new World(),
      environment: {
        sourceDir: "assets-source/environment/glTF",
        assetNames: [],
        path: { id: "path.main", points: [[0, 0, 0], [2, 0, 2]], width: 1 },
        instances: [],
        terrain: {
          bounds: { min: [0, -2, 0], max: [2, 2, 2] },
          heightmap: { asset: "heightmap.reference", cellSize: 1, heightScale: 2, origin: [0, 0, 0] },
          heightMode: "heightmap",
          id: "terrain.reference",
        },
      } satisfies IEnvironmentDeclaration,
    };
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const firstBundle = await emitBundle(config, source);
    const secondBundle = await emitBundle({ ...config, outDir: "dist/game-again.bundle" }, source);
    const firstEnvironment = await readFile(join(firstBundle, "environment.scene.json"), "utf8");
    const secondEnvironment = await readFile(join(secondBundle, "environment.scene.json"), "utf8");
    const manifest = JSON.parse(await readFile(join(firstBundle, "manifest.json"), "utf8"));
    const assets = JSON.parse(await readFile(join(firstBundle, "assets.manifest.json"), "utf8"));
    const environment = JSON.parse(firstEnvironment);
    const validation = await validateBundle(firstBundle);

    assert.equal(validation.ok, true);
    assert.equal(firstEnvironment, secondEnvironment);
    assertCapability(manifest, "environment", "terrain.heightfield");
    assertCapability(manifest, "physics", "collider.heightfield");
    assert.deepEqual(environment.terrain.chunks, [
      {
        bounds: { max: [2, 2, 2], min: [0, -2, 0] },
        heightRange: { max: 2, min: -2 },
        id: "terrain.reference.chunk.0",
        mesh: "mesh.terrain.reference.chunk.0",
        sampleRange: { x: [0, 2], z: [0, 2] },
      },
    ]);
    assert.deepEqual(environment.terrain.collider, {
      asset: "heightmap.reference",
      cellSize: 1,
      heightRange: { max: 2, min: -2 },
      heightScale: 2,
      kind: "heightfield",
      mesh: "mesh.terrain.reference.chunk.0",
      origin: [0, 0, 0],
      sampleCount: [3, 3],
    });
    const meshAsset = assets.assets.find((asset: { id: string }) => asset.id === "mesh.terrain.reference.chunk.0");
    assert.equal(meshAsset?.kind, "mesh");
    assert.deepEqual(meshAsset.binaryAttributes.map((attribute: { count: number; itemSize: number; name: string }) => [attribute.name, attribute.itemSize, attribute.count]), [
      ["position", 3, 9],
      ["normal", 3, 9],
      ["uv", 2, 9],
    ]);
    assert.equal(meshAsset.binaryIndices.count, 24);
    assert.equal(await readFile(join(firstBundle, "generated/meshes/mesh.terrain.reference.chunk.0.00.position.bin")).then((buffer) => buffer.byteLength), 108);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should expand terrain-filtered scatter placements deterministically", async () => {
  const root = await mkdtemp(join(process.cwd(), "tmp-env-terrain-scatter-"));
  try {
    await writeEnvironmentAsset(root);
    await mkdir(join(root, "assets/terrain"), { recursive: true });
    await writeFile(join(root, "assets/terrain/ridge.heightmap.json"), JSON.stringify({ samples: [0, 2, 4, 0, 2, 4, 0, 2, 4] }));
    const heightmap = {
      encoding: "float32",
      format: "json",
      height: 3,
      heightRange: { min: 0, max: 4 },
      id: "heightmap.ridge",
      kind: "heightmap",
      path: "assets/terrain/ridge.heightmap.json",
      width: 3,
    } as const;
    const source = {
      assets: [heightmap],
      world: new World(),
      environment: {
        sourceDir: "assets-source/environment/glTF",
        assetNames: ["Grass.gltf"],
        path: { id: "path.main", points: [[0, 0, 0], [0, 0, 2]], width: 0.5 },
        instances: [],
        terrain: {
          bounds: { min: [0, 0, 0], max: [2, 4, 2] },
          heightmap: { asset: "heightmap.ridge", cellSize: 1, heightScale: 1, origin: [0, 0, 0] },
          heightMode: "heightmap",
          id: "terrain.ridge",
        },
        scatter: [
          {
            assetIds: ["env.Grass"],
            bounds: { min: [1, 0, 1], max: [1, 0, 1] },
            count: 1,
            id: "scatter.ridge",
            maxScale: 1,
            maxSlope: 80,
            minHeight: 1.5,
            minScale: 1,
            seed: 7,
          },
          {
            assetIds: ["env.Grass"],
            bounds: { min: [1, 0, 1], max: [1, 0, 1] },
            count: 1,
            id: "scatter.too-steep",
            maxScale: 1,
            maxSlope: 10,
            minScale: 1,
            seed: 7,
          },
          {
            assetIds: ["env.Grass"],
            bounds: { min: [0, 0, 1], max: [0, 0, 1] },
            count: 1,
            id: "scatter.path",
            maxScale: 1,
            minScale: 1,
            seed: 7,
          },
        ],
      } satisfies IEnvironmentDeclaration,
    };
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const firstBundle = await emitBundle(config, source);
    const secondBundle = await emitBundle({ ...config, outDir: "dist/game-again.bundle" }, source);
    const firstEnvironment = await readFile(join(firstBundle, "environment.scene.json"), "utf8");
    const secondEnvironment = await readFile(join(secondBundle, "environment.scene.json"), "utf8");
    const environment = JSON.parse(firstEnvironment);
    const scatter = environment.instances.filter((instance: { kind: string }) => instance.kind === "scatter");

    assert.equal(firstEnvironment, secondEnvironment);
    assert.equal(scatter.length, 1);
    assert.equal(scatter[0].id, "scatter.ridge.env.Grass.000");
    assert.deepEqual(scatter[0].position, [1, 2, 1]);
    assert.equal(scatter[0].placement.terrainHeight, 2);
    assert.ok(scatter[0].placement.slope > 10);
    assert.ok(scatter.every((instance: { position: [number, number, number] }) => Math.abs(instance.position[0]) > 0.25));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function assertCapability(manifest: { requiredCapabilities: Record<string, string[]> }, domain: string, capability: string): void {
  assert.ok(manifest.requiredCapabilities[domain]?.includes(capability), `${domain}:${capability}`);
}

async function writeEnvironmentAsset(root: string): Promise<void> {
  await mkdir(join(root, "assets-source/environment/glTF"), { recursive: true });
  await writeFile(join(root, "assets-source/environment/glTF/Grass.gltf"), JSON.stringify({ asset: { version: "2.0" }, buffers: [{ uri: "Grass.bin" }] }));
  await writeFile(join(root, "assets-source/environment/glTF/Grass.bin"), "grass");
}

function environmentDeclaration(scatter: {
  bounds?: { min: [number, number, number]; max: [number, number, number] };
  count?: number;
  density?: number;
  id: string;
}): IEnvironmentDeclaration {
  return {
    sourceDir: "assets-source/environment/glTF",
    assetNames: ["Grass.gltf"],
    path: { id: "path.main", points: [[0, 0, 0], [1, 0, 0]], width: 1 },
    instances: [],
    scatter: [
      {
        assetIds: ["env.Grass"],
        bounds: scatter.bounds ?? { min: [0, 0, 0], max: [10, 0, 10] },
        id: scatter.id,
        maxScale: 1,
        minScale: 1,
        seed: 1,
        ...(scatter.count === undefined ? {} : { count: scatter.count }),
        ...(scatter.density === undefined ? {} : { density: scatter.density }),
      },
    ],
  };
}
