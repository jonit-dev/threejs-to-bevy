import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AmbientLight,
  BoxGeometry,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  SpotLight,
  World,
  action,
  axis,
  audioAsset,
  boxCollider,
  characterController,
  commands,
  defineAudio,
  defineInputMap,
  defineRuntimeConfig,
  defineComponent,
  defineEvent,
  defineQuery,
  fixedUpdate,
  gamepad,
  keyboard,
  loopingMusic,
  oneShotSound,
  pointerButton,
  pointerAxis,
  physics,
  rigidBody,
  textureAsset,
  touchControl,
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

test("should omit scripts bundle when no systems exist", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-no-scripts-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, makeScene());
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));

    assert.equal(manifest.entry.scripts, undefined);
    assert.equal(manifest.files.scripts, undefined);
    await assert.rejects(() => readFile(join(bundlePath, "scripts.bundle.js"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit character controller capabilities from composed game roots", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-character-"));
  try {
    await mkdir(join(root, "dist"));
    const scene = new Scene({ id: "scene" });
    scene.add(
      new Mesh({
        geometry: new BoxGeometry({ size: [1, 2, 1] }),
        id: "player",
        material: new MeshStandardMaterial({ color: "#2f80ed" }),
        physics: physics({
          body: rigidBody("kinematic"),
          collider: boxCollider([1, 2, 1], { slope: { axis: "x", direction: 1, rise: 1, run: 2 } }),
        }),
      }),
    );
    const world = new World().spawn("player", characterController({ interactAction: "Interact", slopeLimit: 45, stepOffset: 0.35 }));
    const input = defineInputMap({
      actions: [action("Interact", [keyboard("KeyE")])],
      axes: [
        axis("MoveX", { negative: [keyboard("KeyA")], positive: [keyboard("KeyD")] }),
        axis("MoveZ", { negative: [keyboard("KeyW")], positive: [keyboard("KeyS")] }),
      ],
    });

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      { input, scene, world },
    );
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assertCapability(manifest, "character", "controller");
    assertCapability(manifest, "character", "blocking");
    assertCapability(manifest, "character", "grounding");
    assertCapability(manifest, "character", "interaction");
    assertCapability(manifest, "character", "slope-limit");
    assertCapability(manifest, "character", "step-offset");
    assertCapability(manifest, "physics", "collider.slope");
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
    assertCapability(manifest, "ecs", "component-reflection");
    assertCapability(manifest, "scripting", "component-reflection");
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

test("should derive manifest capabilities from emitted bundle IR", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-capabilities-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/albedo.png"), "texture");
    await writeFile(join(root, "assets/music.ogg"), "music");
    await writeFile(join(root, "assets/hit.wav"), "hit");
    await writeEnvironmentAsset(root, "Grass.gltf");

    const Health = defineComponent("Health", { current: "number" });
    const HitEvent = defineEvent("HitEvent", { target: "entity" });
    const scene = new Scene({ id: "scene" });
    const parent = new Mesh({
      geometry: new BoxGeometry(),
      id: "parent",
      material: new MeshStandardMaterial({ color: "#ffffff" }),
    });
    parent.add(
      new Mesh({
        castShadow: false,
        geometry: new PlaneGeometry(),
        id: "child.hidden",
        material: new MeshStandardMaterial({
          alphaMode: "blend",
          baseColorTexture: textureAsset("tex.albedo", "assets/albedo.png"),
          clearcoat: 0.8,
          clearcoatRoughness: 0.25,
          color: "#ffffff",
          emissive: "#33ccff",
          emissiveIntensity: 2,
          opacity: 0.6,
          specularIntensity: 0.7,
          transmission: 0.45,
        }),
        receiveShadow: true,
        physics: physics({
          body: rigidBody("dynamic", { mass: 1 }),
          collider: boxCollider([1, 1, 1], { trigger: true }),
        }),
        visible: false,
      }),
    );
    const camera = new OrthographicCamera({ far: 50, id: "camera.ortho", near: 0.1, size: 5 });
    scene.add(parent);
    scene.add(camera);
    scene.add(new AmbientLight({ id: "light.ambient" }));
    scene.add(new PointLight({ id: "light.point", range: 12 }));
    scene.add(new SpotLight({ angle: 0.65, id: "light.spot", range: 16 }));
    scene.setActiveCamera(camera);

    const world = new World()
      .spawn("player", Health({ current: 10 }))
      .addEvent(HitEvent)
      .setRuntimeConfig(defineRuntimeConfig({ fixedDelta: 1 / 30 }))
      .addSystem(
        fixedUpdate("tick", {
          commands: [commands.emitEvent(HitEvent)],
          eventWrites: [HitEvent],
          queries: [defineQuery({ with: [Health] })],
          run: (context) => context,
          services: ["physics.raycast"],
        }),
      );

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      {
        audio: defineAudio({
          music: [loopingMusic("music.main", { asset: audioAsset("audio.music", "assets/music.ogg"), volume: 0.4 })],
          oneShots: [oneShotSound("hit", { asset: audioAsset("audio.hit", "assets/hit.wav"), event: "HitEvent", volume: 0.75 })],
        }),
        environment: makeEnvironmentDeclaration(),
        input: defineInputMap({
          actions: [
            action("Jump", [keyboard("Space"), pointerButton(0), gamepad("buttonSouth", { required: false })]),
            action("MoveBackward", [keyboard("KeyS")]),
            action("MoveForward", [keyboard("KeyW")]),
            action("MoveLeft", [keyboard("KeyA")]),
            action("MoveRight", [keyboard("KeyD")]),
          ],
          axes: [
            axis("LookX", { negative: [touchControl("look", "x")], value: pointerAxis("deltaX") }),
            axis("LookY", { value: pointerAxis("deltaY") }),
          ],
        }),
        scene,
        ui: Ui({
          children: Button({ action: "Jump", focusable: true, id: "hud.jump", label: "Jump" }),
          id: "hud",
        }),
        world,
      },
    );

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.deepEqual(result.diagnostics, []);
    assert.equal(result.ok, true);
    assertCapability(manifest, "asset", "audio.ogg");
    assertCapability(manifest, "asset", "texture.png");
    assertCapability(manifest, "audio", "one-shot");
    assertCapability(manifest, "audio", "volume");
    assertCapability(manifest, "environment", "walkability");
    assertCapability(manifest, "input", "device.gamepad");
    assertCapability(manifest, "physics", "collider.box");
    assertCapability(manifest, "physics", "rigid-body.dynamic");
    assertCapability(manifest, "rendering", "camera.active");
    assertCapability(manifest, "rendering", "camera.orthographic");
    assertCapability(manifest, "rendering", "light.angle");
    assertCapability(manifest, "rendering", "light.point");
    assertCapability(manifest, "rendering", "light.range");
    assertCapability(manifest, "rendering", "light.spot");
    assertCapability(manifest, "rendering", "material.alpha.blend");
    assertCapability(manifest, "rendering", "material.emissive");
    assertCapability(manifest, "rendering", "material.specular");
    assertCapability(manifest, "rendering", "material.clearcoat");
    assertCapability(manifest, "rendering", "material.transmission");
    assertCapability(manifest, "rendering", "material.opacity");
    assertCapability(manifest, "rendering", "mesh-renderer.shadows");
    assertCapability(manifest, "rendering", "material.texture.base-color");
    assertCapability(manifest, "rendering", "mesh.primitive.plane");
    assertCapability(manifest, "rendering", "visibility");
    assertCapability(manifest, "scripting", "script-bundle");
    assertCapability(manifest, "scripting", "service.physics.raycast");
    assertCapability(manifest, "transform", "hierarchy");
    assertCapability(manifest, "ui", "node.button");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit root input map for scene bundle", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-root-input-"));
  try {
    const scene = makeScene();
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, {
      input: defineInputMap({
        actions: [action("MoveForward", [keyboard("KeyW")])],
        axes: [axis("LookX", { value: { axis: "deltaX", device: "pointer" } })],
      }),
      scene,
    });
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const input = JSON.parse(await readFile(join(bundlePath, "input.ir.json"), "utf8"));

    assert.equal(manifest.files.input, "input.ir.json");
    assert.deepEqual(input.actions, [{ bindings: [{ code: "KeyW", device: "keyboard" }], id: "MoveForward" }]);
    assert.deepEqual(input.axes, [{ id: "LookX", negative: [], positive: [], value: { axis: "deltaX", device: "pointer" } }]);
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
        accessors: [{ max: [1, 3, 1], min: [-1, 0, -1] }],
        asset: { version: "2.0" },
        buffers: [{ uri: "Tree_1.bin" }],
        images: [{ uri: "Tree_Bark.png" }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      }),
    );
    await writeFile(join(root, "assets-source/environment/glTF/Tree_1.bin"), "tree-binary");
    await writeFile(join(root, "assets-source/environment/glTF/Tree_Bark.png"), "tree-texture");
    await writeFile(
      join(root, "assets-source/environment/glTF/Tree_1_Low.gltf"),
      JSON.stringify({
        accessors: [{ max: [0.8, 2, 0.8], min: [-0.8, 0, -0.8] }],
        asset: { version: "2.0" },
        buffers: [{ uri: "Tree_1_Low.bin" }],
        meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      }),
    );
    await writeFile(join(root, "assets-source/environment/glTF/Tree_1_Low.bin"), "tree-low-binary");
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
          lod: {
            "env.Tree_1": [{ assetName: "Tree_1_Low.gltf", minDistance: 18, maxDistance: 60 }],
          },
          budgets: {
            maxAssetBytes: 300,
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
    assertCapability(manifest, "environment", "lod");
    assert.deepEqual(
      assets.assets
        .map((asset: { path?: string }) => asset.path)
        .filter(Boolean)
        .sort(),
      [
        "assets/environment/Tree_1.bin",
        "assets/environment/Tree_1.gltf",
        "assets/environment/Tree_1_Low.bin",
        "assets/environment/Tree_1_Low.gltf",
        "assets/environment/Tree_Bark.png",
        "assets/environment/reference/Preview_2.jpg",
        "assets/mesh.cube.main.generated",
      ]
        .filter((path) => path !== "assets/mesh.cube.main.generated")
        .sort(),
    );
    assert.equal(environment.referenceImage, "tex.env.reference.Preview_2");
    assert.equal(environment.sourceAssets[0].asset, "model.env.Tree_1");
    assert.deepEqual(environment.sourceAssets[0].lod, [{ asset: "model.env.Tree_1_Low", maxDistance: 60, minDistance: 18 }]);
    assert.deepEqual(
      assets.assets.find((asset: { id: string }) => asset.id === "model.env.Tree_1")?.bounds,
      { max: [1, 3, 1], min: [-1, 0, -1] },
    );
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
    assert.equal(environment.controller.camera, "camera.firstPerson");
    assert.equal(environment.walkability.blockers[0].instance, "tree.hero");
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

function assertCapability(manifest: { requiredCapabilities: Record<string, string[]> }, domain: string, capability: string): void {
  assert.ok(manifest.requiredCapabilities[domain]?.includes(capability), `${domain}:${capability}`);
}

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
  await writeFile(
    join(root, `assets-source/environment/glTF/${name}`),
    JSON.stringify({
      accessors: [{ max: [1, 3, 1], min: [-1, 0, -1] }],
      asset: { version: "2.0" },
      buffers: [{ uri: name.replace(/\.gltf$/, ".bin") }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    }),
  );
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
    controller: {
      acceleration: 18,
      camera: "camera.firstPerson",
      height: 1.7,
      input: {
        backward: "MoveBackward",
        forward: "MoveForward",
        left: "MoveLeft",
        lookX: "LookX",
        lookY: "LookY",
        right: "MoveRight",
      },
      maxSpeed: 4.5,
      pitch: { min: -75, max: 75 },
      pointerLock: "required",
      sensitivity: 0.0025,
    },
    terrain: { bounds: { min: [-8, 0, -8], max: [8, 0, 8] }, heightMode: "flat", id: "terrain.forest" },
    walkability: {
      blockers: [{ collider: { radius: 1, type: "cylinder" }, id: "blocker.tree", instance: "tree.hero" }],
      movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
      regions: [{ id: "path.walkable", points: [[-2, -6], [2, -6], [2, 6], [-2, 6]] }],
      terrain: { height: 0, surface: "terrain.forest" },
    },
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
