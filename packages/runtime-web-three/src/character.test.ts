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
      groundEntity: "floor",
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
      groundEntity: "floor",
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
      groundEntity: "floor",
      grounded: true,
      resolved: [0, 1.05, 0],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should step onto low blockers within step offset", () => {
  const world = makeCharacterWorld();
  const wall = world.entities.find((entity) => entity.id === "wall");
  const player = world.entities.find((entity) => entity.id === "player");
  if (wall !== undefined) {
    wall.id = "step";
    wall.components.Collider = { kind: "box", size: [1, 0.4, 1] };
    wall.components.Transform = { position: [2, 0.2, 0] };
  }
  if (player?.components.CharacterController !== undefined) {
    player.components.CharacterController.stepOffset = 0.5;
  }

  const trace = traceCharacterControllers(world, {
    axes: { MoveX: 1, MoveZ: 0 },
    fixedDelta: 1,
  });

  assert.deepEqual(trace, [
    {
      desired: [2, 1, 0],
      entity: "player",
      groundEntity: "step",
      grounded: true,
      resolved: [2, 1.4, 0],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should report ungrounded past ledges", () => {
  const world = makeCharacterWorld();
  const wall = world.entities.find((entity) => entity.id === "wall");
  const floor = world.entities.find((entity) => entity.id === "floor");
  if (wall?.components.Collider !== undefined) {
    wall.components.Collider.trigger = true;
  }
  if (floor !== undefined) {
    floor.components.Collider = { kind: "box", size: [1, 0.1, 6] };
  }

  const trace = traceCharacterControllers(world, {
    axes: { MoveX: 1, MoveZ: 0 },
    fixedDelta: 1,
  });

  assert.deepEqual(trace, [
    {
      desired: [2, 1, 0],
      entity: "player",
      grounded: false,
      resolved: [2, 1, 0],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should carry grounded controllers on moving platforms", () => {
  const world = makeCharacterWorld();
  const floor = world.entities.find((entity) => entity.id === "floor");
  if (floor !== undefined) {
    floor.components.RigidBody = { kind: "kinematic", velocity: [0.25, 0, 0] };
  }

  const trace = traceCharacterControllers(world, {
    axes: { MoveX: 0, MoveZ: 0 },
    fixedDelta: 2,
  });

  assert.deepEqual(trace, [
    {
      desired: [0, 1, 0],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      platformDelta: [0.5, 0, 0],
      resolved: [0.5, 1.05, 0],
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
