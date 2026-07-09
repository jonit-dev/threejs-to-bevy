import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  AmbientLight,
  BoxGeometry,
  CustomMeshGeometry,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Scene,
  ShaderMaterial,
  SpotLight,
  World,
  action,
  axis,
  defineAnimations,
  audioAsset,
  boxCollider,
  characterController,
  commands,
  defineAssetModule,
  defineAudio,
  defineInputMap,
  defineRuntimeConfig,
  defineComponent,
  defineEvent,
  defineQuery,
  defineScene,
  fixedUpdate,
  gamepad,
  keyboard,
  loopingMusic,
  oneShotSound,
  overlay,
  pointerButton,
  pointerAxis,
  physics,
  rigidBody,
  textureAsset,
  touchControl,
  transformAnimationClip,
  sceneTransition,
  shaderLiteral,
  shaderUniform,
  shaderUniformRef,
  update,
} from "@threenative/sdk";
import { IR_DOCUMENTS, validateBundle } from "@threenative/ir";
import { Bar, Button, Column, Image, Text, Ui } from "@threenative/ui";

import { AUTHORING_PROVENANCE_FILE } from "../authoring/provenance.js";
import { emitBundle, planBundle } from "./bundle.js";
import { writeBundlePlan } from "./bundle-writer.js";

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

test("should plan bundle documents before writing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-plan-bundle-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const plan = await planBundle(config, makeScene());

    assert.equal(plan.manifest.entry.world, IR_DOCUMENTS.world.fileName);
    assert.equal(plan.manifest.files.assets, IR_DOCUMENTS.assets.fileName);
    assert.deepEqual(Object.keys(plan.documents).sort(), ["assetsManifest", "materials", "targetProfile", "world"]);
    assert.equal(plan.documents.assetsManifest.assets.length, plan.assets.length);
    assert.equal(plan.extraAssetFiles.length, 0);
    assert.equal(plan.generatedMeshPayloads.length, 0);
    assert.equal(JSON.stringify(plan).includes(".tn-emit-"), false);
    await assert.rejects(() => readFile(join(root, "dist/game.bundle/manifest.json"), "utf8"));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should write a planned bundle through the writer", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-write-plan-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const plan = await planBundle(config, makeScene());
    const bundlePath = await writeBundlePlan(plan, config.projectPath, join(root, config.outDir));

    assert.deepEqual(JSON.parse(await readFile(join(bundlePath, IR_DOCUMENTS.manifest.fileName), "utf8")), plan.manifest);
    assert.deepEqual(JSON.parse(await readFile(join(bundlePath, IR_DOCUMENTS.world.fileName), "utf8")), plan.documents.world);
    assert.deepEqual(JSON.parse(await readFile(join(bundlePath, IR_DOCUMENTS.assets.fileName), "utf8")), plan.documents.assetsManifest);
    const validation = await validateBundle(bundlePath);
    assert.equal(validation.ok, true, JSON.stringify(validation.diagnostics, null, 2));
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should preserve previous bundle when asset copy fails", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-preserve-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/albedo.png"), "texture");
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };
    const first = await emitBundle(config, texturedScene("assets/albedo.png"));
    const originalManifest = await readFile(join(first, "manifest.json"), "utf8");

    await assert.rejects(() => emitBundle(config, texturedScene("assets/missing.png")), /ENOENT|no such file/i);

    assert.equal(await readFile(join(first, "manifest.json"), "utf8"), originalManifest);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should clean temporary emit directory after failure", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-clean-temp-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    await assert.rejects(() => emitBundle(config, texturedScene("assets/missing.png")), /ENOENT|no such file/i);
    const distEntries = await readFileOrEmptyDir(join(root, "dist"));

    assert.equal(distEntries.some((entry) => entry.startsWith(".tn-emit-")), false);
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

test("should emit canonical manifest paths from IR document metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-metadata-paths-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, makeScene());
    const manifest = JSON.parse(await readFile(join(bundlePath, IR_DOCUMENTS.manifest.fileName), "utf8"));

    assert.equal(manifest.entry.world, IR_DOCUMENTS.world.fileName);
    assert.equal(manifest.files.assets, IR_DOCUMENTS.assets.fileName);
    assert.equal(manifest.files.materials, IR_DOCUMENTS.materials.fileName);
    assert.equal(manifest.files.targetProfile, IR_DOCUMENTS.targetProfile.fileName);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit optional authoring provenance sidecar without changing runtime manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-authoring-provenance-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, makeScene(), {
      authoringGraph: {
        declarations: [
          {
            id: "scene",
            kind: "scene",
            provenance: {
              declarationId: "scene",
              kind: "scene",
              source: { modulePath: "src/game.ts" },
            },
            references: [],
          },
        ],
        diagnostics: [],
        entryPath: "src/game.ts",
        modules: [{ declarations: ["scene"], path: "src/game.ts" }],
        projectRoot: root,
        schema: "threenative.authoring-graph",
        version: "0.1.0",
      },
    });
    const manifest = JSON.parse(await readFile(join(bundlePath, IR_DOCUMENTS.manifest.fileName), "utf8"));
    const provenance = JSON.parse(await readFile(join(bundlePath, AUTHORING_PROVENANCE_FILE), "utf8"));
    const validation = await validateBundle(bundlePath);

    assert.equal(manifest.files.authoringProvenance, undefined);
    assert.equal(provenance.schema, "threenative.authoring-provenance");
    assert.equal(provenance.projectRoot, undefined);
    assert.equal(provenance.declarations[0].provenance.source.modulePath, "src/game.ts");
    assert.equal(validation.ok, true);
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

test("should emit transform animation bundle document and capabilities", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-transform-animation-"));
  try {
    const scene = new Scene({ id: "scene" });
    scene.add(
      new Mesh({
        geometry: new BoxGeometry({ size: [1, 1, 1] }),
        id: "cube",
        material: new MeshStandardMaterial({ color: "#ffffff" }),
      }),
    );
    const animations = defineAnimations({
      transformClips: [
        transformAnimationClip("move", {
          loop: "repeat",
          tracks: [
            {
              channel: "position",
              easing: "linear",
              keyframes: [
                { timeSeconds: 0, value: [0, 0, 0] },
                { timeSeconds: 1, value: [2, 0, 0] },
              ],
              target: "cube",
            },
          ],
        }),
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
      { animations, scene },
    );
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const emittedAnimations = JSON.parse(await readFile(join(bundlePath, "animations.ir.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.equal(manifest.entry.animations, "animations.ir.json");
    assert.equal(manifest.files.animations, "animations.ir.json");
    assert.deepEqual(emittedAnimations.transformClips[0].tracks[0].target, "cube");
    assertCapability(manifest, "animation", "transform-tracks");
    assertCapability(manifest, "animation", "transform.position");
    assertCapability(manifest, "animation", "loop-repeat");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit scene lifecycle document from composed game scenes", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-scenes-"));
  try {
    const menuVisual = new Scene({ id: "scene.menu.visual" });
    menuVisual.add(
      new Mesh({
        geometry: new BoxGeometry({ size: [1, 1, 1] }),
        id: "menu.logo",
        material: new MeshStandardMaterial({ color: "#44aa88" }),
      }),
    );
    const levelVisual = new Scene({ id: "scene.level.visual" });
    levelVisual.add(
      new Mesh({
        geometry: new BoxGeometry({ size: [1, 1, 1] }),
        id: "level.player",
        material: new MeshStandardMaterial({ color: "#f4d35e" }),
      }),
    );
    const menu = defineScene({
      id: "menu",
      kind: "menu",
      preload: { assetGroups: ["bundle.requiredAssets"] },
      transitions: { enter: sceneTransition.fade({ color: "#000000", durationMs: 250 }) },
      visual: menuVisual,
    });
    const level = defineScene({ id: "level.forest", kind: "level", visual: levelVisual });

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      { initialScene: "menu", scenes: [menu, level] },
    );
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const scenes = JSON.parse(await readFile(join(bundlePath, "scenes.ir.json"), "utf8"));
    const world = JSON.parse(await readFile(join(bundlePath, "world.ir.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.equal(manifest.entry.scenes, "scenes.ir.json");
    assert.deepEqual(scenes.scenes.map((scene: { id: string }) => scene.id), ["menu", "level.forest"]);
    assert.deepEqual(scenes.scenes[0].entities, ["menu.logo"]);
    assert.equal(scenes.scenes[0].transitions.enter.kind, "fade");
    assert.ok(world.entities.some((entity: { id: string }) => entity.id === "level.player"));
    assertCapability(manifest, "scene", "lifecycle");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit scene-scoped lifecycle input systems and ui", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-scene-scopes-"));
  try {
    const menuWorld = new World().addSystem(update("menuLoop", { run: (context) => context }));
    const menuInput = defineInputMap({ actions: [action("Start", [keyboard("Enter")])] });
    const menuUi = Ui({
      children: [Button({ action: "Start", id: "ui.menu.start", label: "Start" })],
      id: "ui.menu",
    });
    const menu = defineScene({
      id: "menu",
      input: menuInput,
      kind: "menu",
      ui: menuUi,
      world: menuWorld,
    });

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      { initialScene: "menu", scenes: [menu] },
    );
    const scenes = JSON.parse(await readFile(join(bundlePath, "scenes.ir.json"), "utf8"));
    const input = JSON.parse(await readFile(join(bundlePath, "input.ir.json"), "utf8"));
    const systems = JSON.parse(await readFile(join(bundlePath, "systems.ir.json"), "utf8"));
    const ui = JSON.parse(await readFile(join(bundlePath, "ui.ir.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.equal(scenes.scenes[0].input, "Start");
    assert.deepEqual(scenes.scenes[0].systems, ["menuLoop"]);
    assert.deepEqual(scenes.scenes[0].ui, ["ui.menu"]);
    assert.deepEqual(input.actions.map((item: { id: string }) => item.id), ["Start"]);
    assert.deepEqual(systems.systems.map((item: { name: string }) => item.name), ["menuLoop"]);
    assert.equal(ui.root.id, "ui.menu");
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
      .setRuntimeConfig(defineRuntimeConfig({
        fixedDelta: 1 / 30,
        renderer: { antialias: "msaa8", bloom: { enabled: true, intensity: 0.35, threshold: 0.8 } },
        window: { height: 720, width: 1280 },
      }))
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
    const scriptsManifest = JSON.parse(await readFile(join(bundlePath, "scripts.manifest.json"), "utf8"));

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
    assert.equal(runtimeConfig.renderer.antialias, "msaa8");
    assert.deepEqual(runtimeConfig.renderer.bloom, { enabled: true, intensity: 0.35, threshold: 0.8 });
    assert.equal(runtimeConfig.time.fixedDelta, 1 / 30);
    assert.match(scripts, /system_applyDamage/);
    assert.deepEqual(scriptsManifest.artifacts, [{ generated: true, path: "scripts.bundle.js", source: false }]);
    assert.deepEqual(scriptsManifest.systems, [
      {
        generated: { bundle: "scripts.bundle.js", exportName: "system_applyDamage" },
        systemId: "applyDamage",
      },
    ]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit reusable authoring schema documents without ecs systems", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-authoring-schemas-"));
  try {
    await mkdir(join(root, "content", "schemas"), { recursive: true });
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };
    const bundlePath = await emitBundle(config, makeScene(), {
      authoringDocuments: [
        {
          data: {
            schema: "threenative.schema",
            version: "0.1.0",
            id: "component-schemas",
            kind: "component",
            schemas: [{ id: "RaceTelemetry", fields: { lap: { kind: "number", required: true } } }],
          },
          file: join(root, "content", "schemas", "components.schema.json"),
          kind: "schema",
          projectRelativePath: "content/schemas/components.schema.json",
        },
        {
          data: {
            schema: "threenative.schema",
            version: "0.1.0",
            id: "resource-schemas",
            kind: "resource",
            schemas: [{ id: "RaceState", fields: { status: { kind: "string" } } }],
          },
          file: join(root, "content", "schemas", "resources.schema.json"),
          kind: "schema",
          projectRelativePath: "content/schemas/resources.schema.json",
        },
      ],
    });

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const components = JSON.parse(await readFile(join(bundlePath, "schemas/components.schema.json"), "utf8"));
    const resources = JSON.parse(await readFile(join(bundlePath, "schemas/resources.schema.json"), "utf8"));

    assert.equal(manifest.files.componentSchemas, "schemas/components.schema.json");
    assert.equal(manifest.files.resourceSchemas, "schemas/resources.schema.json");
    assert.equal(manifest.files.eventSchemas, undefined);
    assert.equal(manifest.entry.systems, undefined);
    assert.deepEqual(components.schemas.RaceTelemetry.fields, { lap: { kind: "number", required: true } });
    assert.deepEqual(resources.schemas.RaceState.fields, { status: { kind: "string" } });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit resolved script module references and manifest provenance", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-script-source-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/kart.ts"), `export function kartArcadePhysics(context: unknown) {\n  return context;\n}\n`);
    const world = new World().addSystem(
      update("kartArcadePhysics", {
        script: {
          export: "kartArcadePhysics",
          module: "src/scripts/kart.ts",
        },
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
    const report = await validateBundle(bundlePath);
    const systems = JSON.parse(await readFile(join(bundlePath, "systems.ir.json"), "utf8"));
    const scripts = await readFile(join(bundlePath, "scripts.bundle.js"), "utf8");
    const scriptsManifest = JSON.parse(await readFile(join(bundlePath, "scripts.manifest.json"), "utf8"));

    assert.equal(report.ok, true);
    assert.deepEqual(systems.systems[0]?.script, { bundle: "scripts.bundle.js", exportName: "system_kartArcadePhysics" });
    assert.match(scripts, /const system_kartArcadePhysics = function kartArcadePhysics\(context\)/);
    assert.deepEqual(scriptsManifest.systems[0]?.source.module, "src/scripts/kart.ts");
    assert.deepEqual(scriptsManifest.systems[0]?.source.export, "kartArcadePhysics");
    assert.match(scriptsManifest.systems[0]?.source.hash, /^sha256-[0-9a-f]{64}$/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit script modules with info-only context diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-script-source-info-"));
  try {
    await mkdir(join(root, "src/scripts"), { recursive: true });
    await writeFile(join(root, "src/scripts/kart.ts"), `type ScriptContext = any;\nexport function kartArcadePhysics(context: ScriptContext) {\n  return context;\n}\n`);
    const world = new World().addSystem(
      update("kartArcadePhysics", {
        script: {
          export: "kartArcadePhysics",
          module: "src/scripts/kart.ts",
        },
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
    const report = await validateBundle(bundlePath);
    const scripts = await readFile(join(bundlePath, "scripts.bundle.js"), "utf8");

    assert.equal(report.ok, true);
    assert.match(scripts, /const system_kartArcadePhysics = function kartArcadePhysics\(context\)/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("emits overlay ir and manifest entry", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-overlay-"));
  try {
    await mkdir(join(root, "overlay"), { recursive: true });
    await writeFile(join(root, "overlay/index.html"), "<!doctype html><button>Use potion</button>");
    await writeFile(join(root, "overlay/inventory.css"), ".item{width:32px;height:32px}");

    const bundlePath = await emitBundle(
      {
        entry: "src/game.ts",
        outDir: "dist/game.bundle",
        projectPath: root,
        schema: "threenative.project" as const,
        version: "0.1.0" as const,
      },
      {
        overlay: overlay.mount({
          assets: ["overlay/inventory.css"],
          entry: "overlay/index.html",
          id: "inventory",
          input: "pointer",
          messages: {
            gameToOverlay: [{ name: "inventory:snapshot", schema: { kind: "object", fields: { gold: "integer" }, required: ["gold"] } }],
            overlayToGame: [{ name: "inventory:use-item", schema: { kind: "object", fields: { itemId: "string" }, required: ["itemId"] } }],
          },
          zIndex: 25,
        }),
        scene: makeScene(),
      },
    );
    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const overlays = JSON.parse(await readFile(join(bundlePath, "overlays.ir.json"), "utf8"));
    const copiedHtml = await readFile(join(bundlePath, "overlay/index.html"), "utf8");
    const copiedCss = await readFile(join(bundlePath, "overlay/inventory.css"), "utf8");
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.equal(manifest.entry.overlays, "overlays.ir.json");
    assert.deepEqual(manifest.requiredCapabilities.overlay, ["bridge", "input.pointer", "target.desktop", "target.web", "transparent", "webview"]);
    assert.equal(overlays.overlays[0].id, "inventory");
    assert.equal(overlays.overlays[0].input, "pointer");
    assert.match(copiedHtml, /Use potion/);
    assert.match(copiedCss, /item/);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("rejects undeclared overlay assets", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-overlay-missing-"));
  try {
    await mkdir(join(root, "overlay"), { recursive: true });
    await writeFile(join(root, "overlay/index.html"), "<!doctype html>");

    await assert.rejects(
      () => emitBundle(
        {
          entry: "src/game.ts",
          outDir: "dist/game.bundle",
          projectPath: root,
          schema: "threenative.project" as const,
          version: "0.1.0" as const,
        },
        {
          overlay: overlay.mount({ assets: ["overlay/missing.css"], entry: "overlay/index.html", id: "inventory" }),
          scene: makeScene(),
        },
      ),
      /TN_COMPILER_OVERLAY_ASSET_MISSING/,
    );
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
    parent.add(
      new Mesh({
        geometry: new CustomMeshGeometry({
          attributes: [
            { itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] },
            { itemSize: 2, name: "uv1", values: [0, 0, 1, 0, 0, 1] },
            { itemSize: 4, name: "color", values: [1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 1, 1] },
          ],
          indices: [0, 1, 2],
        }),
        id: "custom.surface",
        material: new MeshStandardMaterial({ color: "#ffffff" }),
      }),
    );
    const camera = new OrthographicCamera({ far: 50, id: "camera.ortho", near: 0.1, size: 5 });
    scene.add(parent);
    scene.add(camera);
    scene.add(new AmbientLight({ id: "light.ambient" }));
    scene.add(new PointLight({ id: "light.point", range: 12, shadowBias: 0.001, shadowNormalBias: 0.03 }));
    scene.add(new SpotLight({ angle: 0.65, id: "light.spot", range: 16, shadowBias: 0.002, shadowNormalBias: 0.04 }));
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
          children: [
            Button({
              accessibilityLabel: "Jump action",
              action: "Jump",
              focusable: true,
              id: "hud.jump",
              label: "Jump",
              layout: { grid: { autoFlow: "row", columns: 2 }, height: 48, overflow: "scroll" },
              style: { backgroundColor: "#101820cc", borderColor: "#ffffff", borderRadius: 8, borderWidth: 2, color: "#ffcc00", fontSize: 18, fontWeight: "bold", gradient: { angle: 90, from: "#101820", kind: "linear", to: "#203040" }, opacity: 0.75, shadow: { blur: 12, color: "#00000080", offsetX: 0, offsetY: 4 }, textAlign: "center", textDecoration: "underline", wrap: "word" },
            }),
            Image({ accessibilityLabel: "Hero portrait", id: "hud.hero", role: "image", src: "assets/hero.png" }),
          ],
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
    assertCapability(manifest, "rendering", "light.shadow-bias");
    assertCapability(manifest, "rendering", "light.spot");
    assertCapability(manifest, "rendering", "material.alpha.blend");
    assertCapability(manifest, "rendering", "material.emissive");
    assertCapability(manifest, "rendering", "material.specular");
    assertCapability(manifest, "rendering", "material.clearcoat");
    assertCapability(manifest, "rendering", "material.transmission");
    assertCapability(manifest, "rendering", "material.opacity");
    assertCapability(manifest, "rendering", "mesh-renderer.shadows");
    assertCapability(manifest, "rendering", "material.texture.base-color");
    assertCapability(manifest, "rendering", "mesh.attribute.color");
    assertCapability(manifest, "rendering", "mesh.attribute.uv1");
    assertCapability(manifest, "rendering", "mesh.primitive.plane");
    assertCapability(manifest, "rendering", "visibility");
    assertCapability(manifest, "scripting", "script-bundle");
    assertCapability(manifest, "scripting", "service.physics.raycast");
    assertCapability(manifest, "transform", "hierarchy");
    assertCapability(manifest, "ui", "accessibility");
    assertCapability(manifest, "ui", "accessibility.label");
    assertCapability(manifest, "ui", "accessibility.role");
    assertCapability(manifest, "ui", "node.button");
    assertCapability(manifest, "ui", "node.image");
    assertCapability(manifest, "ui", "image");
    assertCapability(manifest, "ui", "grid-layout");
    assertCapability(manifest, "ui", "scroll-container");
    assertCapability(manifest, "ui", "style");
    assertCapability(manifest, "ui", "style.background");
    assertCapability(manifest, "ui", "style.border");
    assertCapability(manifest, "ui", "style.color");
    assertCapability(manifest, "ui", "style.gradient");
    assertCapability(manifest, "ui", "style.opacity");
    assertCapability(manifest, "ui", "style.radius");
    assertCapability(manifest, "ui", "style.shadow");
    assertCapability(manifest, "ui", "style.text");
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

test("should emit structured material documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-source-materials-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, makeScene(), {
      authoringDocuments: [{
        data: {
          schema: "threenative.materials",
          version: "0.1.0",
          id: "lane-materials",
          materials: [
            { id: "mat.ball", color: "#295d8f", roughness: 0.28 },
            { id: "mat.lamp", color: "#ffd37a", emissive: "#ffc766", emissiveIntensity: 0.7 },
          ],
        },
        file: join(root, "content", "materials", "lane.materials.json"),
        kind: "material",
        projectRelativePath: "content/materials/lane.materials.json",
      }],
    });

    const materials = JSON.parse(await readFile(join(bundlePath, "materials.ir.json"), "utf8"));
    const validation = await validateBundle(bundlePath);

    assert.equal(validation.ok, true);
    assert.deepEqual(materials.materials.find((item: { id: string }) => item.id === "mat.ball"), {
      color: "#295d8f",
      id: "mat.ball",
      kind: "standard",
      roughness: 0.28,
    });
    assert.deepEqual(materials.materials.find((item: { id: string }) => item.id === "mat.lamp"), {
      color: "#ffd37a",
      emissive: "#ffc766",
      emissiveIntensity: 0.7,
      id: "mat.lamp",
      kind: "standard",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit shader materials from structured source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-source-shader-materials-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, makeScene(), {
      authoringDocuments: [{
        data: {
          schema: "threenative.materials",
          version: "0.1.0",
          id: "shader-materials",
          materials: [
            {
              id: "mat.shader",
              inputs: ["normal", "uv0"],
              kind: "shader",
              outputs: ["baseColor"],
              program: {
                language: "threenative-shader-v1",
                fragment: {
                  outputs: {
                    baseColor: { kind: "uniform", uniform: "tint" },
                  },
                },
              },
              uniforms: [{ name: "tint", type: "color", default: "#33ccff" }],
            },
          ],
        },
        file: join(root, "content", "materials", "shader.materials.json"),
        kind: "material",
        projectRelativePath: "content/materials/shader.materials.json",
      }],
    });

    const materials = JSON.parse(await readFile(join(bundlePath, "materials.ir.json"), "utf8"));
    const validation = await validateBundle(bundlePath);

    assert.equal(validation.ok, true);
    assert.deepEqual(materials.materials.find((item: { id: string }) => item.id === "mat.shader"), {
      id: "mat.shader",
      inputs: ["normal", "uv0"],
      kind: "shader",
      outputs: ["baseColor"],
      program: {
        fragment: {
          outputs: {
            baseColor: { kind: "uniform", uniform: "tint" },
          },
        },
        language: "threenative-shader-v1",
      },
      uniforms: [{ default: "#33ccff", name: "tint", type: "color" }],
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit shader materials from SDK declarations", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-sdk-shader-materials-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };
    const scene = new Scene();
    scene.add(
      new Mesh({
        geometry: new BoxGeometry({ size: [1, 1, 1] }),
        id: "shader-cube",
        material: new ShaderMaterial({
          program: {
            fragment: {
              outputs: {
                alpha: shaderLiteral(0.9),
                baseColor: shaderUniformRef("tint"),
              },
            },
          },
          uniforms: [shaderUniform("tint", "color", "#33ccff")],
        }),
      }),
    );

    const bundlePath = await emitBundle(config, scene);
    const materials = JSON.parse(await readFile(join(bundlePath, "materials.ir.json"), "utf8"));
    const validation = await validateBundle(bundlePath);

    assert.equal(validation.ok, true);
    assert.deepEqual(materials.materials.find((item: { id: string }) => item.id === "mat.shader-cube"), {
      id: "mat.shader-cube",
      kind: "shader",
      program: {
        fragment: {
          outputs: {
            alpha: { kind: "literal", value: 0.9 },
            baseColor: { kind: "uniform", uniform: "tint" },
          },
        },
        language: "threenative-shader-v1",
      },
      uniforms: [{ default: "#33ccff", name: "tint", type: "color" }],
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should normalize structured keyboard aliases before emitting input ir", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-source-input-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, makeScene(), {
      authoringDocuments: [{
        data: {
          schema: "threenative.input",
          version: "0.1.0",
          id: "kart-input",
          actions: [{ id: "accelerate", bindings: ["keyboard.w"] }],
          axes: [{ id: "MoveX", negative: ["keyboard.a"], positive: ["keyboard.arrow-right"], value: "pointer.deltaX" }],
          controlsSettings: {
            profileId: "default",
            rows: [{ actionOrAxisId: "accelerate", defaultBindings: ["keyboard.space"], kind: "action", uiNodeId: "settings.accelerate" }],
          },
          persistedBindingOverrides: [{ actionOrAxisId: "accelerate", control: "arrow-up", device: "keyboard", profileId: "default", updatedAt: "2026-06-23T00:00:00.000Z" }],
        },
        file: join(root, "content", "input", "kart.input.json"),
        kind: "input",
        projectRelativePath: "content/input/kart.input.json",
      }],
    });

    const manifest = JSON.parse(await readFile(join(bundlePath, "manifest.json"), "utf8"));
    const input = JSON.parse(await readFile(join(bundlePath, "input.ir.json"), "utf8"));
    const validation = await validateBundle(bundlePath);

    assert.equal(manifest.files.input, "input.ir.json");
    assert.equal(validation.ok, true);
    assert.deepEqual(input.actions, [{ bindings: [{ code: "KeyW", device: "keyboard" }], id: "accelerate" }]);
    assert.deepEqual(input.axes, [{ id: "MoveX", negative: [{ code: "KeyA", device: "keyboard" }], positive: [{ code: "ArrowRight", device: "keyboard" }], value: { axis: "deltaX", device: "pointer" } }]);
    assert.deepEqual(input.controlsSettings.rows, [{ actionOrAxisId: "accelerate", defaultBindings: [{ code: "Space", device: "keyboard" }], kind: "action", uiNodeId: "settings.accelerate" }]);
    assert.deepEqual(input.persistedBindingOverrides, [{ actionOrAxisId: "accelerate", control: "ArrowUp", device: "keyboard", profileId: "default", updatedAt: "2026-06-23T00:00:00.000Z" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit standalone SDK asset modules in bundle manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-root-assets-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/logo.png"), "texture");
    const scene = makeScene();
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, {
      assets: [defineAssetModule({ asset: textureAsset("tex.logo", "assets/logo.png") })],
      scene,
    });
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8"));
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.deepEqual(
      assets.assets.find((asset: { id: string }) => asset.id === "tex.logo"),
      { format: "png", id: "tex.logo", kind: "texture", path: "assets/logo.png", sourceMode: "bundle" },
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit structured model animation and particle source metadata", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-source-animation-particles-"));
  try {
    await mkdir(join(root, "assets"), { recursive: true });
    await writeFile(join(root, "assets/hero.glb"), "model");
    const scene = new Scene({ id: "scene" });
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, { scene }, {
      authoringDocuments: [{
        data: {
          schema: "threenative.assets",
          version: "0.1.0",
          id: "model.hero",
          assets: [{
            animationGraph: { initialState: "run", states: [{ clip: "run", id: "run" }] },
            animations: [{ id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.25 }],
            id: "model.hero",
            particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 64, ratePerSecond: 12, shape: "point" }],
            path: "assets/hero.glb",
            type: "model",
          }],
        },
        file: join(root, "content/assets/model.hero.assets.json"),
        kind: "asset",
        projectRelativePath: "content/assets/model.hero.assets.json",
      }],
    });
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8")) as {
      assets: Array<Record<string, unknown>>;
    };
    const result = await validateBundle(bundlePath);
    const model = assets.assets.find((asset) => asset.id === "model.hero");

    assert.equal(result.ok, true);
    assert.deepEqual(model?.animations, [{ id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.25 }]);
    assert.deepEqual(model?.animationGraph, { initialState: "run", states: [{ clip: "run", id: "run" }] });
    assert.deepEqual(model?.particleEmitters, [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 64, ratePerSecond: 12, shape: "point" }]);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should include glb texture dependencies in planned asset copy list", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-plan-glb-deps-"));
  try {
    await mkdir(join(root, "assets/Textures"), { recursive: true });
    await writeFile(join(root, "assets/hero.glb"), minimalBundleGlbWithImages(["Textures/hero.png"]));
    await writeFile(join(root, "assets/Textures/hero.png"), "png-bytes");
    const scene = new Scene({ id: "scene" });
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const plan = await planBundle(config, { scene }, {
      authoringDocuments: [{
        data: {
          schema: "threenative.assets",
          version: "0.1.0",
          id: "model.hero",
          assets: [{
            id: "model.hero",
            path: "assets/hero.glb",
            type: "model",
          }],
        },
        file: join(root, "content/assets/model.hero.assets.json"),
        kind: "asset",
        projectRelativePath: "content/assets/model.hero.assets.json",
      }],
    });

    assert.deepEqual(
      plan.assetFiles.filter((file) => file.path.startsWith("assets/hero") || file.path.includes("Textures/hero")),
      [
        { path: "assets/hero.glb", sourcePath: "assets/hero.glb" },
        { path: "assets/Textures/hero.png", sourcePath: "assets/Textures/hero.png" },
      ],
    );
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit structured render target asset source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-source-render-target-"));
  try {
    const scene = new Scene({ id: "scene" });
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, { scene }, {
      authoringDocuments: [{
        data: {
          schema: "threenative.assets",
          version: "0.1.0",
          id: "render-targets",
          assets: [
            { format: "rgba16f", height: 256, id: "rt.minimap", type: "render-target", usage: "color", width: 512 },
            { height: 128, id: "rt.depth", type: "render-target", usage: "depth", width: 128 },
          ],
        },
        file: join(root, "content/assets/render-targets.assets.json"),
        kind: "asset",
        projectRelativePath: "content/assets/render-targets.assets.json",
      }],
    });
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8")) as {
      assets: Array<Record<string, unknown>>;
    };
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.deepEqual(assets.assets.find((asset) => asset.id === "rt.minimap"), { format: "rgba16f", height: 256, id: "rt.minimap", kind: "render-target", usage: "color", width: 512 });
    assert.deepEqual(assets.assets.find((asset) => asset.id === "rt.depth"), { format: "depth24plus", height: 128, id: "rt.depth", kind: "render-target", usage: "depth", width: 128 });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit structured target profile source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-source-target-profile-"));
  try {
    const scene = new Scene({ id: "scene" });
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, { scene }, {
      authoringDocuments: [{
        data: {
          schema: "threenative.target-profile",
          version: "0.1.0",
          id: "desktop",
          targets: ["desktop"],
          budgets: { maxBundleBytes: 1048576, supportedTextureFormats: ["png"] },
        },
        file: join(root, "content/targets/desktop.target.json"),
        kind: "target",
        projectRelativePath: "content/targets/desktop.target.json",
      }],
    });
    const targetProfile = JSON.parse(await readFile(join(bundlePath, "target.profile.json"), "utf8")) as Record<string, unknown>;
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.deepEqual(targetProfile.targets, ["desktop"]);
    assert.deepEqual(targetProfile.budgets, { maxBundleBytes: 1048576, supportedTextureFormats: ["png"] });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit structured mesh source documents into asset manifest", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-source-meshes-"));
  try {
    const scene = new Scene({ id: "scene" });
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, { scene }, {
      authoringDocuments: [{
        data: {
          schema: "threenative.meshes",
          version: "0.1.0",
          id: "meshes",
          meshes: [
            { id: "mesh.source.box", kind: "primitive", primitive: "box" },
            { id: "mesh.source.torus", kind: "primitive", primitive: "torus", size: [0.25, 0.75] },
            {
              attributes: [{ itemSize: 3, name: "position", values: [0, 0, 0, 1, 0, 0, 0, 1, 0] }],
              id: "mesh.source.triangle",
              indices: [0, 1, 2],
              kind: "custom",
              primitive: "custom",
              storage: "binary",
            },
          ],
        },
        file: join(root, "content/meshes/meshes.meshes.json"),
        kind: "mesh",
        projectRelativePath: "content/meshes/meshes.meshes.json",
      }],
    });
    const assets = JSON.parse(await readFile(join(bundlePath, "assets.manifest.json"), "utf8")) as {
      assets: Array<{ binaryAttributes?: Array<{ name: string; path: string }>; binaryIndices?: { path: string }; id: string; primitive: string }>;
    };
    const result = await validateBundle(bundlePath);

    assert.equal(result.ok, true);
    assert.deepEqual(assets.assets.find((asset) => asset.id === "mesh.source.box"), {
      format: "generated",
      id: "mesh.source.box",
      kind: "mesh",
      primitive: "box",
    });
    assert.deepEqual(assets.assets.find((asset) => asset.id === "mesh.source.torus"), {
      format: "generated",
      id: "mesh.source.torus",
      kind: "mesh",
      primitive: "torus",
      size: [0.25, 0.75],
    });
    const custom = assets.assets.find((asset) => asset.id === "mesh.source.triangle");
    assert.equal(custom?.primitive, "custom");
    assert.deepEqual(custom?.binaryAttributes?.map((attribute) => attribute.name), ["position"]);
    assert.match(custom?.binaryAttributes?.[0]?.path ?? "", /^generated\/meshes\/mesh\.source\.triangle\.00\.position\.bin$/);
    assert.match(custom?.binaryIndices?.path ?? "", /^generated\/meshes\/mesh\.source\.triangle\.indices\.uint16\.bin$/);
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
            Bar({ accessibilityLabel: "Health", binding: { field: "current", kind: "resource", name: "Health" }, id: "hud.health", max: 100 }),
            Button({ action: "Pause", focusable: true, id: "hud.pause", label: "Pause" }),
          ],
          id: "hud.stack",
          layout: { inset: { left: 24, top: 16 }, maxWidth: 480, minHeight: 24, overflow: "hidden", position: "absolute", zIndex: 5 },
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
    assert.deepEqual(ui.root.children[0].layout, { inset: { left: 24, top: 16 }, maxWidth: 480, minHeight: 24, overflow: "hidden", position: "absolute", zIndex: 5 });
    assertCapability(manifest, "ui", "anchors");
    assertCapability(manifest, "ui", "overflow");
    assertCapability(manifest, "ui", "size-constraints");
    assertCapability(manifest, "ui", "z-index");
    assert.equal(result.ok, true);
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should emit structured ui bindings from retained source documents", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-structured-ui-"));
  try {
    const config = {
      entry: "src/game.ts",
      outDir: "dist/game.bundle",
      projectPath: root,
      schema: "threenative.project" as const,
      version: "0.1.0" as const,
    };

    const bundlePath = await emitBundle(config, makeScene(), {
      authoringDocuments: [
        {
          data: {
            schema: "threenative.ui",
            version: "0.1.0",
            id: "hud",
            nodes: [
              { id: "score", type: "text", text: "Score 0" },
              {
                id: "panel",
                type: "column",
                children: [{ id: "coins", type: "text", text: "Coins 0/12" }],
              },
            ],
            bindings: [
              { node: "score", resource: "GameState.scoreText" },
              {
                node: "coins",
                resource: "GameState",
                fields: ["coins", "total"],
                format: "Coins {coins}/{total}",
              },
            ],
          },
          file: join(root, "content", "ui", "hud.ui.json"),
          kind: "ui",
          projectRelativePath: "content/ui/hud.ui.json",
        },
      ],
    });
    const ui = JSON.parse(await readFile(join(bundlePath, "ui.ir.json"), "utf8"));
    const score = ui.root.children.find((node: { id: string }) => node.id === "score");
    const panel = ui.root.children.find((node: { id: string }) => node.id === "panel");

    assert.deepEqual(score.binding, { field: "scoreText", kind: "resource", name: "GameState" });
    assert.deepEqual(panel.children[0].binding, { fields: ["coins", "total"], format: "Coins {coins}/{total}", kind: "resource", name: "GameState" });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should reject unsafe asset copy destinations before writing files", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-emit-unsafe-asset-"));
  try {
    const scene = new Scene({ id: "scene" });
    scene.add(
      new Mesh({
        geometry: new PlaneGeometry(),
        id: "unsafe.mesh",
        material: new MeshStandardMaterial({
          baseColorTexture: { format: "png", id: "tex.unsafe", kind: "texture", path: "../escape.png" } as never,
        }),
      }),
    );

    await assert.rejects(
      () =>
        emitBundle(
          {
            entry: "src/game.ts",
            outDir: "dist/game.bundle",
            projectPath: root,
            schema: "threenative.project" as const,
            version: "0.1.0" as const,
          },
          { scene },
        ),
      /must be relative and must not contain parent traversal/,
    );
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

function texturedScene(texturePath: string): Scene {
  const scene = new Scene({ id: "scene" });
  const mesh = new Mesh({
    id: "cube.textured",
    geometry: new BoxGeometry(),
    material: new MeshStandardMaterial({
      baseColorTexture: textureAsset("tex.albedo", texturePath),
      color: "#ffffff",
    }),
  });
  scene.add(mesh);
  scene.add(new PerspectiveCamera({ id: "camera.main", fovY: 60, near: 0.1, far: 100 }));
  return scene;
}

async function readFileOrEmptyDir(path: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    return await readdir(path);
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") {
      return [];
    }
    throw error;
  }
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

function minimalBundleGlbWithImages(uris: string[]): Buffer {
  const json = JSON.stringify({
    asset: { version: "2.0" },
    buffers: [{ byteLength: 0 }],
    images: uris.map((uri) => ({ uri })),
  });
  const jsonChunk = paddedBundleBuffer(Buffer.from(json, "utf8"), 0x20);
  const totalLength = 12 + 8 + jsonChunk.length;
  const glb = Buffer.alloc(totalLength);
  glb.write("glTF", 0, "ascii");
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);
  glb.writeUInt32LE(jsonChunk.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  jsonChunk.copy(glb, 20);
  return glb;
}

function paddedBundleBuffer(buffer: Buffer, padByte: number): Buffer {
  const padding = (4 - (buffer.length % 4)) % 4;
  if (padding === 0) return buffer;
  return Buffer.concat([buffer, Buffer.alloc(padding, padByte)]);
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
