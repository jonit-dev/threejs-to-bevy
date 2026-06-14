import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { traceCharacterControllers } from "./character.js";
import { loadBundle } from "./loadBundle.js";

test("character trace should match V7 conformance fixture", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/v7-advanced-physics-character/game.bundle"));
  const trace = traceCharacterControllers(bundle.world, {
    axes: { MoveX: 1, MoveZ: 0 },
    fixedDelta: 1,
  });

  assert.deepEqual(trace, [
    {
      blockedBy: "wall",
      desired: [3, 1, 0],
      entity: "player",
      grounded: true,
      resolved: [0, 1.05, 0],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should move and ground a controller from declared axes", () => {
  const trace = traceCharacterControllers(makeCharacterWorld(), {
    axes: { MoveX: 0.5, MoveZ: 0 },
    fixedDelta: 1,
  });

  assert.deepEqual(trace, [
    {
      desired: [1, 1, 0],
      entity: "player",
      grounded: true,
      resolved: [1, 1.05, 0],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should stop before a blocking collider", () => {
  const trace = traceCharacterControllers(makeCharacterWorld(), {
    axes: { MoveX: 1, MoveZ: 0 },
    fixedDelta: 1,
  });

  assert.deepEqual(trace, [
    {
      blockedBy: "wall",
      desired: [2, 1, 0],
      entity: "player",
      grounded: true,
      resolved: [0, 1.05, 0],
      start: [0, 1, 0],
    },
  ]);
});

function makeCharacterWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "wall",
        components: {
          Collider: { kind: "box", size: [1, 2, 1] },
          RigidBody: { kind: "static" },
          Transform: { position: [2, 1, 0] },
        },
      },
      {
        id: "floor",
        components: {
          Collider: { kind: "box", size: [6, 0.1, 6] },
          RigidBody: { kind: "static" },
          Transform: { position: [0, 0, 0] },
        },
      },
      {
        id: "player",
        components: {
          CharacterController: {
            blocking: true,
            grounding: "raycast",
            moveXAxis: "MoveX",
            moveZAxis: "MoveZ",
            speed: 2,
          },
          Collider: { kind: "box", size: [1, 2, 1] },
          RigidBody: { kind: "kinematic" },
          Transform: { position: [0, 1, 0] },
        },
      },
      {
        id: "pickup",
        components: {
          Collider: { kind: "sphere", radius: 0.5, trigger: true },
          RigidBody: { kind: "static" },
          Transform: { position: [1, 1, 0] },
        },
      },
    ],
  };
}
