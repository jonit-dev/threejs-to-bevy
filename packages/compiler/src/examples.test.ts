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
  assert.equal(systems.systems[0]?.name, "rotatePrimitiveCubes");
  assert.deepEqual(systems.systems[0]?.writes, ["Transform"]);
  assert.match(scripts, /const Transform = Object\.freeze/);
});
