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

test("character trace should walk shallow slopes and reject steep slopes", () => {
  const shallow = makeCharacterWorld();
  const wall = shallow.entities.find((entity) => entity.id === "wall");
  const player = shallow.entities.find((entity) => entity.id === "player");
  if (wall !== undefined) {
    wall.id = "ramp";
    wall.components.Collider = { kind: "box", size: [4, 1, 2], slope: { axis: "x", direction: 1, rise: 1, run: 2 } };
    wall.components.Transform = { position: [2, 0.5, 0] };
  }
  if (player?.components.CharacterController !== undefined) {
    player.components.CharacterController.slopeLimit = 45;
  }

  assert.deepEqual(traceCharacterControllers(shallow, { axes: { MoveX: 1 }, fixedDelta: 1 }), [
    {
      desired: [2, 1, 0],
      entity: "player",
      groundEntity: "ramp",
      grounded: true,
      resolved: [2, 1.5, 0],
      start: [0, 1, 0],
    },
  ]);

  const steep = makeCharacterWorld();
  const steepWall = steep.entities.find((entity) => entity.id === "wall");
  const steepPlayer = steep.entities.find((entity) => entity.id === "player");
  if (steepWall !== undefined) {
    steepWall.id = "steep-ramp";
    steepWall.components.Collider = { kind: "box", size: [4, 2, 2], slope: { axis: "x", direction: 1, rise: 2, run: 1 } };
    steepWall.components.Transform = { position: [2, 1, 0] };
  }
  if (steepPlayer?.components.CharacterController !== undefined) {
    steepPlayer.components.CharacterController.slopeLimit = 35;
  }

  assert.deepEqual(traceCharacterControllers(steep, { axes: { MoveX: 1 }, fixedDelta: 1 }), [
    {
      blockedBy: "steep-ramp",
      desired: [2, 1, 0],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      resolved: [0, 1.05, 0],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should push light dynamic bodies and block heavy bodies", () => {
  const light = makeCharacterWorld();
  const lightCrate = light.entities.find((entity) => entity.id === "wall");
  const lightPlayer = light.entities.find((entity) => entity.id === "player");
  if (lightCrate !== undefined) {
    lightCrate.id = "light-crate";
    lightCrate.components.Collider = { kind: "box", layer: "pushable", size: [1, 2, 1] };
    lightCrate.components.RigidBody = { kind: "dynamic", mass: 2 };
  }
  if (lightPlayer?.components.CharacterController !== undefined) {
    lightPlayer.components.CharacterController.pushPolicy = { allowedLayers: ["pushable"], blockedWhenTooHeavy: true, enabled: true, impulseScale: 1, maxPushMass: 10, minMoveSpeed: 0.1 };
  }

  assert.deepEqual(traceCharacterControllers(light, { axes: { MoveX: 1 }, fixedDelta: 1 }), [
    {
      desired: [2, 1, 0],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      pushed: { entity: "light-crate", impulse: [2, 0, 0], position: [4, 1, 0] },
      resolved: [2, 1.05, 0],
      start: [0, 1, 0],
    },
  ]);

  const heavy = makeCharacterWorld();
  const heavyCrate = heavy.entities.find((entity) => entity.id === "wall");
  const heavyPlayer = heavy.entities.find((entity) => entity.id === "player");
  if (heavyCrate !== undefined) {
    heavyCrate.id = "heavy-crate";
    heavyCrate.components.Collider = { kind: "box", layer: "pushable", size: [1, 2, 1] };
    heavyCrate.components.RigidBody = { kind: "dynamic", mass: 50 };
  }
  if (heavyPlayer?.components.CharacterController !== undefined) {
    heavyPlayer.components.CharacterController.pushPolicy = { allowedLayers: ["pushable"], blockedWhenTooHeavy: true, enabled: true, maxPushMass: 10 };
  }

  assert.deepEqual(traceCharacterControllers(heavy, { axes: { MoveX: 1 }, fixedDelta: 1 }), [
    {
      blockedBy: "heavy-crate",
      desired: [2, 1, 0],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      resolved: [0, 1.05, 0],
      start: [0, 1, 0],
      tooHeavy: "heavy-crate",
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
