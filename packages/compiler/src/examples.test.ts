import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { buildProject, validateBundle } from "./index.js";

const execFileAsync = promisify(execFile);

test("should build canonical v1 example", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v1-canonical");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);

  assert.equal(bundlePath, resolve(projectPath, "dist/game.bundle"));
  assert.equal(report.ok, true);
});

test("should build v3 environment example", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v3-environment");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);

  assert.equal(bundlePath, resolve(projectPath, "dist/forest.bundle"));
  assert.equal(report.ok, true);
});

test("should build v4 scripting example", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v4-scripting");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const systems = JSON.parse(await readFile(resolve(bundlePath, "systems.ir.json"), "utf8"));
  const scripts = await readFile(resolve(bundlePath, "scripts.bundle.js"), "utf8");

  assert.equal(bundlePath, resolve(projectPath, "dist/v4-scripting.bundle"));
  assert.equal(report.ok, true);
  assert.deepEqual(
    systems.systems.map((system: { name: string }) => system.name).sort(),
    [
      "animationServiceProof",
      "expireProjectile",
      "hitEventHandoff",
      "moveTargetPlatform",
      "raycastHitProbe",
      "rotatePrimitiveCubes",
      "spawnProjectileCommand",
    ],
  );
  assert.deepEqual(
    systems.systems.find((system: { name: string }) => system.name === "rotatePrimitiveCubes")?.writes,
    ["Transform"],
  );
  assert.match(scripts, /const Transform = Object\.freeze/);
});

test("should build v5 game starter template", async () => {
  const projectPath = resolve(process.cwd(), "../../templates/v5-game-starter");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const systems = JSON.parse(await readFile(resolve(bundlePath, "systems.ir.json"), "utf8"));
  const runtimeConfig = JSON.parse(await readFile(resolve(bundlePath, "runtime.config.json"), "utf8"));

  assert.equal(bundlePath, resolve(projectPath, "dist/v5-game-starter.bundle"));
  assert.equal(report.ok, true);
  assert.deepEqual(
    systems.systems.map((system: { name: string }) => system.name),
    ["movePlayerToGoal"],
  );
  assert.equal(runtimeConfig.window.title, "ThreeNative V5 Game Starter");
});

test("should build v6 functional example", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v6-functional");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8"));
  const assets = JSON.parse(await readFile(resolve(bundlePath, "assets.manifest.json"), "utf8"));
  const systems = JSON.parse(await readFile(resolve(bundlePath, "systems.ir.json"), "utf8"));
  const runtimeConfig = JSON.parse(await readFile(resolve(bundlePath, "runtime.config.json"), "utf8"));

  assert.equal(bundlePath, resolve(projectPath, "dist/v6-functional.bundle"));
  assert.equal(report.ok, true);
  assert.deepEqual(
    systems.systems.map((system: { name: string }) => system.name),
    ["seedDamageEvent", "v6ProofLoop"],
  );
  assert.ok(manifest.requiredCapabilities.animation.includes("clip-metadata"));
  assert.ok(manifest.requiredCapabilities.audio.includes("music"));
  assert.ok(manifest.requiredCapabilities.character.includes("controller"));
  assert.ok(manifest.requiredCapabilities.input.includes("device.pointer"));
  assert.ok(manifest.requiredCapabilities.physics.includes("collider.box"));
  assert.ok(manifest.requiredCapabilities.scripting.includes("service.animation.play"));
  assert.ok(manifest.requiredCapabilities.scripting.includes("service.physics.raycast"));
  assert.deepEqual(assets.assets.find((asset: { id: string }) => asset.id === "model.hero")?.animations, [
    { id: "idle", loop: true },
    { id: "run", loop: true, sourceClip: "Armature|Run", speed: 1.1 },
  ]);
  assert.equal(runtimeConfig.window.title, "ThreeNative V6 Functional");
});

test("should build v7 functional example", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v7-functional");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8"));
  const systems = JSON.parse(await readFile(resolve(bundlePath, "systems.ir.json"), "utf8"));
  const runtimeConfig = JSON.parse(await readFile(resolve(bundlePath, "runtime.config.json"), "utf8"));

  assert.equal(bundlePath, resolve(projectPath, "dist/v7-functional.bundle"));
  assert.equal(report.ok, true);
  assert.deepEqual(
    systems.systems.map((system: { name: string }) => system.name),
    ["seedV7DamageEvent", "v7ProofLoop"],
  );
  assert.ok(manifest.requiredCapabilities.audio.includes("music"));
  assert.ok(manifest.requiredCapabilities.character.includes("controller"));
  assert.ok(manifest.requiredCapabilities.ecs.includes("resources"));
  assert.ok(manifest.requiredCapabilities.scripting.includes("command.emitEvent"));
  assert.ok(manifest.requiredCapabilities.scripting.includes("event-writes"));
  assert.ok(manifest.requiredCapabilities.scripting.includes("service.animation.play"));
  assert.ok(manifest.requiredCapabilities.ui.includes("node.touchControl"));
  assert.equal(runtimeConfig.window.title, "ThreeNative V7 Functional");
});

test("builds v8 overlay example", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v8-overlay-webview");
  await execFileAsync(process.execPath, [resolve(process.cwd(), "../../scripts/build-v8-overlay-webview-overlay.mjs")], {
    cwd: resolve(process.cwd(), "../.."),
  });

  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8"));
  const overlays = JSON.parse(await readFile(resolve(bundlePath, "overlays.ir.json"), "utf8"));

  assert.equal(bundlePath, resolve(projectPath, "dist/v8-overlay-webview.bundle"));
  assert.equal(report.ok, true);
  assert.equal(manifest.entry.overlays, "overlays.ir.json");
  assert.ok(manifest.requiredCapabilities.overlay.includes("webview"));
  assert.ok(manifest.requiredCapabilities.overlay.includes("bridge"));
  assert.ok(manifest.requiredCapabilities.overlay.includes("input.pointer"));
  assert.equal(overlays.overlays[0].id, "inventory");
});

test("should build the V9 support example without nonportable fields", async () => {
  const projectPath = resolve(process.cwd(), "../../examples/v9-support");
  const { bundlePath } = await buildProject(projectPath);
  const report = await validateBundle(bundlePath);
  const manifest = JSON.parse(await readFile(resolve(bundlePath, "manifest.json"), "utf8"));
  const audio = JSON.parse(await readFile(resolve(bundlePath, "audio.ir.json"), "utf8"));
  const localData = JSON.parse(await readFile(resolve(bundlePath, "local-data.ir.json"), "utf8"));

  assert.equal(bundlePath, resolve(projectPath, "dist/v9-support.bundle"));
  assert.equal(report.ok, true);
  assert.equal(manifest.entry.audio, "audio.ir.json");
  assert.equal(manifest.entry.localData, "local-data.ir.json");
  assert.ok(manifest.requiredCapabilities.audio.includes("spatial-emitter"));
  assert.ok(manifest.requiredCapabilities.localData.includes("save-slots"));
  assert.equal(audio.emitters[0]?.attenuation.curve, "inverse");
  assert.equal(audio.musicTransitions[0]?.kind, "crossfade");
  assert.equal(localData.resources[0]?.id, "SupportProgress");
  assert.equal(JSON.stringify(localData).includes("runtimeHandle"), false);
  assert.equal(JSON.stringify(localData).includes("nativeHandle"), false);
});
