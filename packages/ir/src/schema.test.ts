import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { validateBundle } from "./validate.js";

const fixtureRoot = resolve(process.cwd(), "fixtures");

test("should validate empty v1 bundle", async () => {
  const result = await validateBundle(join(fixtureRoot, "empty-world/game.bundle"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

test("should reject duplicate entity ids", async () => {
  const bundlePath = join(fixtureRoot, "cube-scene/game.bundle");
  const root = await mkdtemp(join(tmpdir(), "tn-ir-"));

  try {
    await copyFixtureWithDuplicateWorld(bundlePath, root);
    const result = await validateBundle(root);

    assert.equal(result.ok, false);
    assert.equal(result.diagnostics[0]?.code, "TN_IR_DUPLICATE_ENTITY_ID");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

test("should validate cube scene fixture", async () => {
  const result = await validateBundle(join(fixtureRoot, "cube-scene/game.bundle"));

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

async function copyFixtureWithDuplicateWorld(source: string, target: string): Promise<void> {
  const { cp, readFile } = await import("node:fs/promises");
  await cp(source, target, { recursive: true });

  const worldPath = join(target, "world.ir.json");
  const world = JSON.parse(await readFile(worldPath, "utf8")) as {
    entities: Array<{ id: string }>;
  };
  const firstEntity = world.entities[0];
  if (firstEntity === undefined) {
    throw new Error("Cube fixture must contain at least one entity.");
  }
  world.entities.push({ ...firstEntity });
  await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);
}
