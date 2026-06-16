import assert from "node:assert/strict";
import test from "node:test";
import type { IWorldIr } from "@threenative/ir";

import { overlapPrimitive, raycastPrimitive, shapeCastPrimitive } from "./physics.js";

test("should raycast primitive floor", () => {
  const result = raycastPrimitive(makeWorld(), {
    direction: [0, -1, 0],
    ignore: ["player"],
    maxDistance: 2,
    origin: [0, 1, 0],
  });

  assert.deepEqual(result, {
    distance: 0.95,
    entity: "floor",
    hit: true,
    normal: [0, 1, 0],
    point: [0, 0.05, 0],
  });
});

test("should overlap primitive colliders with portable filters", () => {
  const result = overlapPrimitive(makeWorld(), {
    layer: "player",
    mask: ["world", "pickup"],
    position: [0, 0.5, 0],
    shape: { kind: "sphere", radius: 0.75 },
  });

  assert.deepEqual(result, { entities: ["crate", "floor"] });
});

test("should shape cast primitive colliders deterministically", () => {
  const result = shapeCastPrimitive(makeWorld(), {
    direction: [0, -1, 0],
    ignore: ["player"],
    mask: ["world"],
    maxDistance: 2,
    origin: [0, 1, 0],
    shape: { halfExtents: [0.25, 0.25, 0.25], kind: "box" },
  });

  assert.deepEqual(result, {
    distance: 0.7,
    entity: "floor",
    hit: true,
    normal: [0, 1, 0],
    point: [0, 0.3, 0],
  });
});

function makeWorld(): IWorldIr {
  return {
    entities: [
      { components: { Transform: { position: [0, 1, 0] } }, id: "player" },
      {
        components: {
          Collider: { kind: "box", layer: "world", mask: ["player"], size: [8, 0.1, 8] },
          Transform: { position: [0, 0, 0] },
        },
        id: "floor",
      },
      {
        components: {
          Collider: { kind: "box", layer: "pickup", mask: ["player"], size: [1, 1, 1] },
          Transform: { position: [0.5, 0.5, 0] },
        },
        id: "crate",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
}
