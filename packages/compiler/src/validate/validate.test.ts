import assert from "node:assert/strict";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

import { validateBundle } from "./index.js";
import { copyFixtureBundle } from "../testFixtures.js";

const cubeFixture = resolve(process.cwd(), "../ir/fixtures/cube-scene/game.bundle");
const audioFixture = resolve(process.cwd(), "../ir/fixtures/conformance/audio-playback/game.bundle");

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

test("validate should preserve IR diagnostic limits and values", async () => {
  const bundle = await copyFixtureBundle(audioFixture, "tn-validate-audio-budget-");
  try {
    const targetPath = join(bundle, "target.profile.json");
    const targetProfile = JSON.parse(await readFile(targetPath, "utf8")) as { budgets?: Record<string, unknown> };
    targetProfile.budgets = { maxBundleBytes: 1 };
    await writeFile(targetPath, `${JSON.stringify(targetProfile, null, 2)}\n`);

    const report = await validateBundle(bundle);
    const diagnostic = report.diagnostics.find((item) => item.code === "TN_IR_BUDGET_BUNDLE_BYTES_EXCEEDED");

    assert.equal(report.ok, false);
    assert.equal(diagnostic?.severity, "error");
    assert.equal(diagnostic?.limit, 1);
    assert.equal(typeof diagnostic?.value, "number");
    assert.match(diagnostic?.suggestion ?? "", /Reduce copied assets/);
  } finally {
    await rm(bundle, { force: true, recursive: true });
  }
});

async function copyCubeFixture(): Promise<string> {
  return copyFixtureBundle(cubeFixture, "tn-validate-bundle-");
}
