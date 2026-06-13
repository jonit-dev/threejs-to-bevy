import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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
