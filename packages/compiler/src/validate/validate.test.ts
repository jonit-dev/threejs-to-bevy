import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { validateBundle } from "./index.js";

const cubeFixture = resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle");

test("validate should return TN-IR-2104 when material is missing", async () => {
  const bundle = await copyCubeFixture();
  try {
    const materialsPath = join(bundle, "materials.ir.json");
    const materials = JSON.parse(await readFile(materialsPath, "utf8")) as { materials: unknown[] };
    materials.materials = [];
    await writeFile(materialsPath, `${JSON.stringify(materials, null, 2)}\n`);

    const report = await validateBundle(bundle);

    assert.equal(report.ok, false);
    assert.equal(report.diagnostics[0]?.code, "TN-IR-2104");
    assert.equal(report.diagnostics[0]?.severity, "error");
    assert.equal(report.diagnostics[0]?.value, "mat.cube");
    assert.match(report.diagnostics[0]?.suggestion ?? "", /materials\.ir\.json/);
  } finally {
    await rm(bundle, { force: true, recursive: true });
  }
});

test("validate should reject duplicate entity ids", async () => {
  const bundle = await copyCubeFixture();
  try {
    const worldPath = join(bundle, "world.ir.json");
    const world = JSON.parse(await readFile(worldPath, "utf8")) as {
      entities: Array<Record<string, unknown>>;
    };
    const firstEntity = world.entities[0];
    if (firstEntity === undefined) {
      throw new Error("Cube fixture must contain an entity.");
    }
    world.entities.push({ ...firstEntity });
    await writeFile(worldPath, `${JSON.stringify(world, null, 2)}\n`);

    const report = await validateBundle(bundle);

    assert.equal(report.ok, false);
    assert.equal(report.diagnostics[0]?.code, "TN_IR_DUPLICATE_ENTITY_ID");
    assert.equal(report.diagnostics[0]?.severity, "error");
    assert.match(report.diagnostics[0]?.suggestion ?? "", /duplicate/);
  } finally {
    await rm(bundle, { force: true, recursive: true });
  }
});

async function copyCubeFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "tn-validate-bundle-"));
  const bundle = join(root, "game.bundle");
  await cp(cubeFixture, bundle, { recursive: true });
  return bundle;
}
