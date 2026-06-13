import assert from "node:assert/strict";
import test from "node:test";
import type { IWorldIr } from "@threenative/ir";

import { raycastPrimitive } from "./physics.js";

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

function makeWorld(): IWorldIr {
  return {
    entities: [
      { components: { Transform: { position: [0, 1, 0] } }, id: "player" },
      {
        components: {
          Collider: { kind: "box", size: [8, 0.1, 8] },
          Transform: { position: [0, 0, 0] },
        },
        id: "floor",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
}
