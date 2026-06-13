import assert from "node:assert/strict";
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
