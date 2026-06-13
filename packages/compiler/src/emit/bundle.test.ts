import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  World,
  action,
  axis,
  commands,
  defineInputMap,
  defineRuntimeConfig,
  defineComponent,
  defineEvent,
  defineQuery,
  fixedUpdate,
  keyboard,
  pointerButton,
  update,
} from "@threenative/sdk";
import { validateBundle } from "@threenative/ir";
import { Bar, Button, Column, Text, Ui } from "@threenative/ui";

import { emitBundle } from "./bundle.js";

test("should emit deterministic cube bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-"));
  try {
    await mkdir(join(root, "dist"));
    const scene = makeScene();
    const config = {
      entry: "src/game.ts",
      outDir: "dist/first.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };
    const first = await emitBundle(config, scene);
    const firstWorld = await readFile(join(first, "world.ir.json"), "utf8");
    const second = await emitBundle({ ...config, outDir: "dist/second.bundle" }, scene);
    const secondWorld = await readFile(join(second, "world.ir.json"), "utf8");

    assert.equal(firstWorld, secondWorld);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit ecs schema files for world root", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-ecs-"));
  try {
    const Health = defineComponent("Health", {
      current: "number",
      max: "number",
    });
    const DamageEvent = defineEvent("DamageEvent", {
      amount: "number",
      target: "entity",
    });
    const world = new World()
      .spawn("player", Health({ current: 100, max: 100 }))
      .addEvent(DamageEvent)
      .setInputMap(
        defineInputMap({
          actions: [action("Attack", [pointerButton(0)]), action("Pause", [keyboard("Escape")])],
          axes: [axis("MoveX", { negative: [keyboard("KeyA")], positive: [keyboard("KeyD")] })],
        }),
      )
      .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 30, window: { height: 720, width: 1280 } }))
      .addSystem(
        fixedUpdate("applyDamage", {
          commands: [commands.setComponent("target", Health), commands.emitEvent(DamageEvent)],
          eventReads: [DamageEvent],
          eventWrites: [DamageEvent],
          reads: [Health],
          run: (context) => context,
          writes: [Health],
        }),
      );
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, world);
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const components = JSON.parse(await readFile(join(bundlePath, "schemas/components.schema.json"), "utf8"));
    const events = JSON.parse(await readFile(join(bundlePath, "schemas/events.schema.json"), "utf8"));
    const systems = JSON.parse(await readFile(join(bundlePath, "systems.ir.json"), "utf8"));
    const input = JSON.parse(await readFile(join(bundlePath, "input.ir.json"), "utf8"));
    const runtimeConfig = JSON.parse(await readFile(join(bundlePath, "runtime.config.json"), "utf8"));
    const scripts = await readFile(join(bundlePath, "scripts.bundle.js"), "utf8");

    assert.equal(manifest.files.componentSchemas, "schemas/components.schema.json");
    assert.equal(manifest.files.scripts, "scripts.bundle.js");
    assert.equal(manifest.files.input, "input.ir.json");
    assert.equal(manifest.files.runtimeConfig, "runtime.config.json");
    assert.equal(manifest.entry.scripts, "scripts.bundle.js");
    assert.equal(manifest.entry.systems, "systems.ir.json");
    assert.deepEqual(Object.keys(components.schemas), ["Health"]);
    assert.deepEqual(Object.keys(events.schemas), ["DamageEvent"]);
    assert.deepEqual(systems.systems[0]?.commands, [
      { component: "Health", entity: "target", kind: "setComponent" },
      { event: "DamageEvent", kind: "emitEvent" },
    ]);
    assert.deepEqual(systems.systems[0]?.script, { bundle: "scripts.bundle.js", exportName: "system_applyDamage" });
    assert.deepEqual(input.actions.map((item: { id: string }) => item.id), ["Attack", "Pause"]);
    assert.equal(runtimeConfig.time.fixedDelta, 1 / 30);
    assert.match(scripts, /system_applyDamage/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit ecs schemas for query-only system", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-ecs-query-"));
  try {
    const Player = defineComponent("Player");
    const Dead = defineComponent("Dead");
    const world = new World().addSystem(
      update("findPlayers", {
        queries: [defineQuery({ with: [Player], without: [Dead] })],
      }),
    );
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, world);
    const components = JSON.parse(await readFile(join(bundlePath, "schemas/components.schema.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.deepEqual(Object.keys(components.schemas), ["Dead", "Player"]);
    assert.equal(result.ok, true);
    assert.deepEqual(result.diagnostics, []);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit ui ir for scene with portable hud", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-ui-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, {
      scene: makeScene(),
      ui: Ui({
        children: Column({
          children: [
            Text({ id: "hud.health.label", text: "Health" }),
            Bar({ binding: { field: "current", kind: "resource", name: "Health" }, id: "hud.health", max: 100 }),
            Button({ action: "Pause", focusable: true, id: "hud.pause", label: "Pause" }),
          ],
          id: "hud.stack",
        }),
        id: "hud",
      }),
    });

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const ui = JSON.parse(await readFile(join(bundlePath, "ui.ir.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(manifest.entry.ui, "ui.ir.json");
    assert.deepEqual(
      ui.root.children[0].children.map((node: { kind: string }) => node.kind),
      ["text", "bar", "button"],
    );
    assert.equal(ui.root.children[0].children[2].action, "Pause");
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit sandboxed v3 environment bundle assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-v3-env-"));
  try {
    await mkdir(join(root, "assets-source/environment/glTF"), { recursive: true });
    await writeFile(
      join(root, "assets-source/environment/glTF/Tree_1.gltf"),
      JSON.stringify({
        asset: { version: "2.0" },
        buffers: [{ uri: "Tree_1.bin" }],
        images: [{ uri: "Tree_Bark.png" }],
      }),
    );
    await writeFile(join(root, "assets-source/environment/glTF/Tree_1.bin"), "tree-binary");
    await writeFile(join(root, "assets-source/environment/glTF/Tree_Bark.png"), "tree-texture");
    await writeFile(join(root, "assets-source/environment/Preview_2.jpg"), "preview");

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/forest.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      {
        scene: makeScene(),
        environment: {
          sourceDir: "assets-source/environment/glTF",
          previewImage: "assets-source/environment/Preview_2.jpg",
          assetNames: ["Tree_1.gltf"],
          budgets: {
            maxAssetBytes: 100,
            maxBundleBytes: 1000,
            supportedModelFormats: ["gltf"],
            supportedTextureFormats: ["jpeg", "png"],
          },
          path: {
            id: "forest.path.main",
            width: 2,
            points: [
              [0, 0, 1],
              [0, 0, -1],
            ],
          },
          instances: [{ id: "tree.1", sourceAsset: "env.Tree_1", position: [1, 0, 0] }],
        },
      },
    );

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8"));
    const environment = JSON.parse(await readFile(join(bundlePath, "environment.scene.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(manifest.entry.environmentScene, "environment.scene.json");
    assert.deepEqual(
      assets.assets
        .map((asset: { path?: string }) => asset.path)
        .filter(Boolean)
        .sort(),
      [
        "assets/environment/Tree_1.bin",
        "assets/environment/Tree_1.gltf",
        "assets/environment/Tree_Bark.png",
        "assets/environment/reference/Preview_2.jpg",
        "assets/mesh.cube.main.generated",
      ]
        .filter((path) => path !== "assets/mesh.cube.main.generated")
        .sort(),
    );
    assert.equal(environment.referenceImage, "tex.env.reference.Preview_2");
    assert.equal(environment.sourceAssets[0].asset, "model.env.Tree_1");
    assert.equal(await readFile(join(bundlePath, "assets/environment/Tree_1.bin"), "utf8"), "tree-binary");
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("environment should emit deterministic terrain path and scatter instances", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-env-authoring-"));
  try {
    await writeEnvironmentAsset(root, "Grass.gltf");
    const config = {
      entry: "src/game.ts",
      outDir: "dist/forest.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };
    const source = {
      scene: makeScene(),
      environment: makeEnvironmentDeclaration({
        scatter: [
          {
            assetIds: ["env.Grass"],
            bounds: { min: [-5, 0, -5], max: [5, 0, 5] },
            count: 4,
            exclusionZoneIds: ["camera.start"],
            id: "scatter.grass",
            maxScale: 1.2,
            minScale: 0.8,
            seed: 42,
            tags: ["grass"],
          },
        ],
      }),
    };

    const first = await emitBundle(config, source);
    const firstEnvironment = await readFile(join(first, "environment.scene.json"), "utf8");
    const second = await emitBundle({ ...config, outDir: "dist/forest-again.bundle" }, source);
    const secondEnvironment = await readFile(join(second, "environment.scene.json"), "utf8");
    const environment = JSON.parse(firstEnvironment);

    assert.equal(firstEnvironment, secondEnvironment);
    assert.equal(environment.terrain.id, "terrain.forest");
    assert.equal(environment.atmosphere.id, "atmosphere.forest");
    assert.equal(environment.instances.filter((instance: { kind: string }) => instance.kind === "scatter").length, 4);
    assert.deepEqual(
      environment.instances.map((instance: { id: string }) => instance.id),
      ["tree.hero", "scatter.grass.env.Grass.000", "scatter.grass.env.Grass.001", "scatter.grass.env.Grass.002", "scatter.grass.env.Grass.003"],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("environment should keep scatter instances outside path clearing", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-env-scatter-"));
  try {
    await writeEnvironmentAsset(root, "Grass.gltf");
    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/forest.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      {
        scene: makeScene(),
        environment: makeEnvironmentDeclaration({
          path: {
            clearingRadius: 1.5,
            id: "forest.path.main",
            points: [
              [0, 0, 5],
              [0, 0, -5],
            ],
            width: 2,
          },
          scatter: [
            {
              assetIds: ["env.Grass"],
              bounds: { min: [-4, 0, -4], max: [4, 0, 4] },
              count: 8,
              id: "scatter.grass",
              maxScale: 1,
              minScale: 1,
              seed: 11,
            },
          ],
        }),
      },
    );

    const environment = JSON.parse(await readFile(join(bundlePath, "environment.scene.json"), "utf8"));
    const scatter = environment.instances.filter((instance: { kind: string }) => instance.kind === "scatter");

    assert.equal(scatter.length, 8);
    assert.equal(scatter.every((instance: { position: [number, number, number] }) => Math.abs(instance.position[0]) > 1.5), true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeScene(): Scene {
  const scene = new Scene({ id: "scene" });
  const mesh = new Mesh({
    id: "cube.main",
    geometry: new BoxGeometry(),
    material: new MeshStandardMaterial({ color: "#2f80ed" }),
  });
  const camera = new PerspectiveCamera({ id: "camera.main", fovY: 60, near: 0.1, far: 100 });
  scene.add(mesh);
  scene.add(camera);
  scene.setActiveCamera(camera);
  return scene;
}

async function writeEnvironmentAsset(root: string, name: string): Promise<void> {
  await mkdir(join(root, "assets-source/environment/glTF"), { recursive: true });
  await writeFile(join(root, `assets-source/environment/glTF/${name}`), JSON.stringify({ asset: { version: "2.0" } }));
  await writeFile(join(root, `assets-source/environment/glTF/${name.replace(/\.gltf$/, ".bin")}`), "asset");
}

function makeEnvironmentDeclaration(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceDir: "assets-source/environment/glTF",
    assetNames: ["Grass.gltf"],
    atmosphere: {
      active: true,
      id: "atmosphere.forest",
      sun: { castsShadow: true, color: "#ffd39a", direction: [-0.45, -0.8, -0.2], id: "sun.forest", intensity: 3.2 },
      ambient: { color: "#8fb2a5", intensity: 0.8, mode: "constant" },
      fog: { color: "#9eb6aa", density: 0.028, enabled: true, mode: "exponential" },
      sky: { color: "#9eb6aa", horizonColor: "#d6c39d" },
      colorManagement: { exposure: 1.05, outputColorSpace: "srgb", textureColorSpace: "srgb", toneMapping: "aces" },
      shadows: { bias: -0.0005, cascadeCount: 1, enabled: true, mapSize: 1024, maxDistance: 45, normalBias: 0.02, receiverPolicy: "terrain-and-path" },
    },
    terrain: { bounds: { min: [-8, 0, -8], max: [8, 0, 8] }, heightMode: "flat", id: "terrain.forest" },
    path: {
      clearingRadius: 1.5,
      edgeFalloff: 0.4,
      id: "forest.path.main",
      points: [
        [0, 0, 5],
        [0, 0, -5],
      ],
      width: 2,
    },
    exclusionZones: [{ bounds: { min: [-1, 0, 3], max: [1, 0, 5] }, id: "camera.start" }],
    bookmarks: [{ expectedTags: ["grass"], id: "bookmark.start", pitch: -4, position: [0, 1.7, 6], yaw: 180 }],
    instances: [{ id: "tree.hero", kind: "hero", sourceAsset: "env.Grass", position: [-3, 0, 2], tags: ["tree"] }],
    ...overrides,
  };
}
