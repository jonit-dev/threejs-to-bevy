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

test("world 0.1 additive component migration should preserve a pre-compound bundle unchanged", async () => {
  const bundlePath = join(fixtureRoot, "compatibility/pre-compound-world-0.1.0/game.bundle");
  const root = await mkdtemp(join(tmpdir(), "tn-ir-additive-compound-"));

  try {
    const { cp, readFile } = await import("node:fs/promises");
    await cp(bundlePath, root, { recursive: true });
    const oldResult = await validateBundle(root);
    assert.equal(oldResult.ok, true);
    assert.deepEqual(oldResult.diagnostics, []);

    const worldPath = join(root, "world.ir.json");
    const world = JSON.parse(await readFile(worldPath, "utf8")) as {
      entities: Array<{ components: Record<string, unknown>; id: string }>;
      version: string;
    };
    const legacyEntity = structuredClone(world.entities[0]);
    world.entities.push({
      id: "additive.compound",
      components: {
        CompoundCollider: { children: [{ id: "body", localPose: { position: [0, 0, 0] }, shape: { kind: "box", size: [1, 1, 1] } }] },
        RigidBody: { kind: "static" },
        Transform: { position: [2, 1, 0] },
      },
    });
    await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);

    const migratedResult = await validateBundle(root);
    assert.equal(migratedResult.ok, true);
    assert.deepEqual(migratedResult.diagnostics, []);
    assert.equal(world.version, "0.1.0", "the additive component does not change the World IR version");
    assert.deepEqual(world.entities[0], legacyEntity, "the identity migration must not rewrite legacy entities");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
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
