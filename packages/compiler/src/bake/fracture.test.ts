import assert from "node:assert/strict";
import test from "node:test";
import { bakeFractureManifest } from "./fracture.js";

const input = {
  id: "wall.main",
  maxActivePieces: 8,
  overflowPolicy: "sleep-oldest" as const,
  recipe: { bondHealth: 100, cells: [2, 2, 2] as [number, number, number], dimensions: [4, 2, 1] as [number, number, number], impulseThreshold: 40, kind: "primitive" as const },
  seed: 42,
};

test("should bake byte-stable fracture manifests from the same source and seed", () => {
  const first = bakeFractureManifest(input);
  const second = bakeFractureManifest(input);
  assert.equal(first.json, second.json);
  assert.equal(first.hash, second.hash);
  assert.equal(first.manifest.pieces.length, 8);
  assert.equal(first.manifest.bonds.length, 12);
  assert.deepEqual(first.diagnostics, []);
});

test("should preserve stable imported piece and bond ids", () => {
  const primitive = bakeFractureManifest(input).manifest;
  const imported = bakeFractureManifest({ id: "wall.imported", recipe: { asset: "wall.glb", bonds: [...primitive.bonds].reverse(), kind: "imported", pieces: [...primitive.pieces].reverse() }, seed: 3 });
  assert.deepEqual(imported.manifest.pieces.map(({ id }) => id), [...primitive.pieces.map(({ id }) => id)].sort());
  assert.deepEqual(imported.manifest.bonds.map(({ id }) => id), [...primitive.bonds.map(({ id }) => id)].sort());
  assert.equal(imported.manifest.source.asset, "wall.glb");
});

test("should reject primitive recipes above the portable piece budget", () => {
  assert.throws(() => bakeFractureManifest({ ...input, recipe: { ...input.recipe, cells: [9, 9, 4] } }), /TN_COMPILER_FRACTURE_RECIPE_BUDGET/u);
});
