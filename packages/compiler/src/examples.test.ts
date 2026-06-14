import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import { buildProject, validateBundle } from "./index.js";

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
