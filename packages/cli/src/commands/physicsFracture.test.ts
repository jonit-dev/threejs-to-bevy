import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { physicsFractureCommand } from "./physicsFracture.js";

test("physics fracture should generate inspect and validate byte-stable manifests", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-fracture-"));
  try {
    const recipe = { bondHealth: 100, cells: [2, 1, 1], dimensions: [2, 1, 1], impulseThreshold: 25, kind: "primitive" };
    await writeFile(join(root, "recipe.json"), JSON.stringify(recipe));
    const first = await physicsFractureCommand(["generate", "wall.main", "--recipe", "recipe.json", "--seed", "9", "--json"], { cwd: root });
    assert.equal(first.exitCode, 0);
    const firstPayload = JSON.parse(first.stdout) as { hash: string; manifest: string };
    const bytes = await readFile(join(root, firstPayload.manifest), "utf8");
    const second = await physicsFractureCommand(["generate", "wall.main", "--recipe", "recipe.json", "--seed", "9", "--json"], { cwd: root });
    assert.equal((JSON.parse(second.stdout) as { hash: string }).hash, firstPayload.hash);
    assert.equal(await readFile(join(root, firstPayload.manifest), "utf8"), bytes);
    const inspect = await physicsFractureCommand(["inspect", firstPayload.manifest, "--json"], { cwd: root });
    assert.equal(inspect.exitCode, 0);
    assert.equal((JSON.parse(inspect.stdout) as { manifest: { id: string } }).manifest.id, "wall.main");
    assert.equal((await physicsFractureCommand(["validate", firstPayload.manifest, "--json"], { cwd: root })).exitCode, 0);
  } finally { await rm(root, { force: true, recursive: true }); }
});

test("physics fracture should reject paths outside the project", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-fracture-"));
  try {
    const result = await physicsFractureCommand(["inspect", "../outside.json", "--json"], { cwd: root });
    assert.equal(result.exitCode, 1);
    assert.match(result.stdout, /TN_PHYSICS_FRACTURE_FAILED/u);
  } finally { await rm(root, { force: true, recursive: true }); }
});
