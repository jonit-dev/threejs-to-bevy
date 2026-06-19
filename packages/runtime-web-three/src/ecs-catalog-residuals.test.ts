import assert from "node:assert/strict";
import test from "node:test";
import type { IWorldIr } from "@threenative/ir";

import { traceWebQueryCombinations } from "./bevyCatalogResiduals.js";

test("should iterate query combinations in deterministic entity order", () => {
  const world: IWorldIr = {
    entities: [
      { components: { Health: { current: 1 } }, id: "enemy.z" },
      { components: { Transform: {} }, id: "prop" },
      { components: { Health: { current: 1 } }, id: "enemy.a" },
      { components: { Health: { current: 1 } }, id: "enemy.m" },
    ],
    events: {},
    prefabs: [],
    resources: {},
    schema: "threenative.world",
    version: "0.1.0",
  };

  assert.deepEqual(traceWebQueryCombinations(world, "Health"), [
    { a: "enemy.a", b: "enemy.m", order: 1 },
    { a: "enemy.a", b: "enemy.z", order: 2 },
    { a: "enemy.m", b: "enemy.z", order: 3 },
  ]);
});
