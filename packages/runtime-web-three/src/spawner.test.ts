import assert from "node:assert/strict";
import test from "node:test";

import type { IPrefabsIr, IWorldIr } from "@threenative/ir";

import { hasSpawners, stepSpawners } from "./spawner.js";

test("spawner should produce deterministic prefab spawn trace", () => {
  const world = makeWorld();
  const prefabs = makePrefabs();

  const first = stepSpawners(world, { fixedDelta: 0.5, prefabs, tick: 0 });
  const second = stepSpawners(world, { fixedDelta: 0.5, prefabs, tick: 1 });

  assert.equal(hasSpawners(world), true);
  assert.deepEqual(first.map((item) => item.root), ["spawner.spawn.0.enemy", "spawner.spawn.1.enemy"]);
  assert.deepEqual(second, []);
  assert.deepEqual(roundPositions(world), [
    ["spawner.spawn.0.enemy", [-1.044877, 0, 0.449967]],
    ["spawner.spawn.1.enemy", [0.525486, 0, -1.112114]],
  ]);
  assert.deepEqual(world.events?.["spawner.spawned"], [
    { entity: "spawner", prefab: "prefab.enemy", root: "spawner.spawn.0.enemy", tick: 0 },
    { entity: "spawner", prefab: "prefab.enemy", root: "spawner.spawn.1.enemy", tick: 0 },
  ]);
});

test("spawner should cap alive entities", () => {
  const world = makeWorld({ maxAlive: 1, maxTotal: 3, mode: "wave", waveSize: 3 });
  const prefabs = makePrefabs();

  const first = stepSpawners(world, { prefabs, tick: 0 });
  const second = stepSpawners(world, { prefabs, tick: 1 });

  assert.equal(first.length, 1);
  assert.equal(second.length, 0);
  assert.equal(world.entities.filter((entity) => entity.id.startsWith("spawner.spawn.")).length, 1);
});

function makeWorld(spawner: Record<string, unknown> = {}): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "spawner",
        components: {
          Spawner: {
            area: { shape: "box", size: [4, 0, 4] },
            enabled: true,
            jitterSeed: 7,
            maxAlive: 4,
            maxTotal: 2,
            mode: "wave",
            prefab: "prefab.enemy",
            waveSize: 2,
            ...spawner,
          },
          Transform: { position: [0, 0, 0] },
        },
      },
    ],
  };
}

function makePrefabs(): IPrefabsIr {
  return {
    schema: "threenative.prefabs",
    version: "0.1.0",
    prefabs: [
      {
        id: "prefab.enemy",
        root: "enemy",
        entities: [
          {
            id: "enemy",
            components: {
              MeshRenderer: { material: "mat.enemy", mesh: "mesh.enemy" },
              Transform: { position: [0, 0, 0] },
            },
          },
        ],
      },
    ],
  };
}

function roundPositions(world: IWorldIr): Array<[string, number[]]> {
  return world.entities
    .filter((entity) => entity.id.startsWith("spawner.spawn."))
    .map((entity) => [entity.id, [...(entity.components.Transform?.position ?? [])].map((value) => Math.round(value * 1_000_000) / 1_000_000)]);
}
