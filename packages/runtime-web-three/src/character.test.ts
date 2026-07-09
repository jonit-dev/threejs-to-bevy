import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { traceCharacterControllers } from "./character.js";
import { loadBundle } from "./loadBundle.js";

test("character trace should match V7 conformance fixture", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/advanced-physics-character/game.bundle"));
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

test("character trace should honor direct direction and speed overrides", () => {
  const trace = traceCharacterControllers(makeCharacterWorld(), {
    axes: { MoveX: 1, MoveZ: 0 },
    direction: [0, 1],
    fixedDelta: 0.5,
    speed: 6,
  });

  assert.deepEqual(trace, [
    {
      desired: [0, 1, 3],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      resolved: [0, 1.05, 3],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should honor collider center offsets on feet-origin characters", () => {
  const world = makeCharacterWorld();
  const player = world.entities.find((entity) => entity.id === "player");
  const floor = world.entities.find((entity) => entity.id === "floor");
  if (floor !== undefined) {
    floor.components.Collider = { kind: "box", size: [6, 1, 6] };
  }
  if (player !== undefined) {
    // Feet-origin character: transform at the floor surface, capsule raised by center.
    player.components.Collider = { center: [0, 1, 0], height: 2, kind: "capsule", radius: 0.34 };
    player.components.Transform = { position: [0, 0.5, 0] };
  }

  const trace = traceCharacterControllers(world, {
    axes: { MoveX: 0.5, MoveZ: 0 },
    fixedDelta: 1,
  });

  assert.deepEqual(trace, [
    {
      desired: [1, 0.5, 0],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      resolved: [1, 0.5, 0],
      start: [0, 0.5, 0],
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

test("character trace should climb sequential risers within step offset", () => {
  const world = makeCharacterWorld();
  world.entities = world.entities.filter((entity) => entity.id !== "wall");
  const floor = world.entities.find((entity) => entity.id === "floor");
  if (floor !== undefined) {
    floor.components.Collider = { kind: "box", size: [12, 0.1, 6] };
  }
  world.entities.push(
    stepEntity("step.01", [2, 0.2, 0], [1, 0.4, 1]),
    stepEntity("step.02", [4, 0.4, 0], [1, 0.8, 1]),
    stepEntity("step.03", [6, 0.6, 0], [1, 1.2, 1]),
  );
  const player = world.entities.find((entity) => entity.id === "player");
  if (player?.components.CharacterController !== undefined) {
    player.components.CharacterController.stepOffset = 0.5;
  }

  const groundedSteps: Array<string | undefined> = [];
  const resolvedY: number[] = [];
  for (let tick = 0; tick < 3; tick += 1) {
    const trace = traceCharacterControllers(world, {
      axes: { MoveX: 1, MoveZ: 0 },
      fixedDelta: 1,
    });
    groundedSteps.push(trace[0]?.groundEntity);
    resolvedY.push(trace[0]?.resolved[1] ?? 0);
    if (player !== undefined && trace[0] !== undefined) {
      player.components.Transform = { position: trace[0].resolved };
    }
  }

  assert.deepEqual(groundedSteps, ["step.01", "step.02", "step.03"]);
  assert.deepEqual(resolvedY.map((value) => Number(value.toFixed(4))), [1.4, 1.8, 2.2]);
});

test("character trace should enter low step contacts before the center is over the tread", () => {
  const world = makeCharacterWorld();
  const wall = world.entities.find((entity) => entity.id === "wall");
  const player = world.entities.find((entity) => entity.id === "player");
  if (wall !== undefined) {
    wall.id = "step";
    wall.components.Collider = { kind: "box", size: [1, 0.4, 1] };
    wall.components.Transform = { position: [1.2, 0.2, 0] };
  }
  if (player?.components.CharacterController !== undefined) {
    player.components.CharacterController.stepOffset = 0.5;
  }

  const trace = traceCharacterControllers(world, {
    axes: { MoveX: 1, MoveZ: 0 },
    fixedDelta: 0.3,
  });

  assert.deepEqual(trace, [
    {
      desired: [0.6, 1, 0],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      resolved: [0.6, 1.05, 0],
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
      slope: { angle: 26.565051, axis: "x", direction: 1, entity: "ramp", rise: 1, run: 2, walkable: true },
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

test("character trace should enter walkable slope contacts before the center is on the ramp", () => {
  const world = makeCharacterWorld();
  const wall = world.entities.find((entity) => entity.id === "wall");
  const player = world.entities.find((entity) => entity.id === "player");
  if (wall !== undefined) {
    wall.id = "ramp";
    wall.components.Collider = { kind: "box", size: [1, 1, 1], slope: { axis: "x", direction: 1, rise: 0.25, run: 1 } };
    wall.components.Transform = { position: [1.2, 0.5, 0] };
  }
  if (player?.components.CharacterController !== undefined) {
    player.components.CharacterController.slopeLimit = 45;
  }

  const trace = traceCharacterControllers(world, {
    axes: { MoveX: 1, MoveZ: 0 },
    fixedDelta: 0.3,
  });

  assert.deepEqual(trace, [
    {
      desired: [0.6, 1, 0],
      entity: "player",
      groundEntity: "floor",
      grounded: true,
      resolved: [0.6, 1.05, 0],
      start: [0, 1, 0],
    },
  ]);
});

test("character trace should walk the humanoid course ramp dimensions", () => {
  const world = makeCharacterWorld();
  world.entities = world.entities.filter((entity) => entity.id !== "floor");
  const ramp = world.entities.find((entity) => entity.id === "wall");
  const player = world.entities.find((entity) => entity.id === "player");
  if (ramp !== undefined) {
    ramp.id = "ramp.main";
    ramp.components.Collider = { kind: "box", layer: "world", size: [2.5, 0.28, 2.4], slope: { axis: "z", direction: -1, rise: 0.48, run: 2.4 } };
    ramp.components.Transform = { position: [2.15, 0.28, 2.6] };
  }
  if (player !== undefined) {
    player.components.Collider = { center: [0, 0.9, 0], height: 1.8, kind: "capsule", layer: "player", radius: 0.34 };
    player.components.Transform = { position: [2.15, 0, 3.95] };
  }
  if (player?.components.CharacterController !== undefined) {
    player.components.CharacterController.speed = 2;
    player.components.CharacterController.slopeLimit = 28;
  }

  const trace = traceCharacterControllers(world, {
    direction: [0, -1],
    fixedDelta: 1,
    speed: 2,
  });

  assert.equal(trace.length, 1);
  assert.equal(trace[0]?.entity, "player");
  assert.equal(trace[0]?.blockedBy, undefined);
  assert.equal(trace[0]?.groundEntity, "ramp.main");
  assert.equal(trace[0]?.grounded, true);
  assert.deepEqual(trace[0]?.start, [2.15, 0, 3.95]);
  assert.ok((trace[0]?.resolved[1] ?? 0) > 0.4, `expected resolved Y to rise on ramp, got ${trace[0]?.resolved[1]}`);
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
      pushes: [{ entity: "light-crate", impulse: [2, 0, 0], position: [4, 1, 0] }],
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

test("character trace should report slope and push observations", () => {
  const world = makeCharacterWorld();
  world.entities = world.entities.filter((entity) => entity.id !== "wall");
  const floor = world.entities.find((entity) => entity.id === "floor");
  const player = world.entities.find((entity) => entity.id === "player");
  if (floor !== undefined) {
    floor.id = "ramp";
    floor.components.Collider = {
      contact: { phases: ["stay"] },
      kind: "box",
      layer: "world",
      material: "stone",
      size: [6, 1, 6],
      slope: { axis: "x", direction: 1, rise: 1, run: 3 },
    };
    floor.components.Transform = { position: [0, 0.5, 0] };
  }
  world.entities.push({
    id: "crate",
    components: {
      Collider: { contact: { phases: ["begin"] }, kind: "box", layer: "pushable", material: "wood", size: [1, 1, 1] },
      RigidBody: { kind: "dynamic", mass: 1 },
      Transform: { position: [2, 2.333333333333333, 0] },
    },
  });
  if (player !== undefined) {
    player.components.Collider = { contact: { phases: ["begin", "stay"] }, kind: "box", layer: "player", mask: ["pushable", "world"], size: [1, 2, 1] };
    player.components.Transform = { position: [0, 2.333333333333333, 0] };
  }
  if (player?.components.CharacterController !== undefined) {
    player.components.CharacterController.pushPolicy = { allowedLayers: ["pushable"], enabled: true, maxPushMass: 5 };
    player.components.CharacterController.slopeLimit = 30;
  }

  assert.deepEqual(traceCharacterControllers(world, { axes: { MoveX: 1 }, fixedDelta: 1 }), [
    {
      contacts: [
        { material: "wood", normal: [-1, 0, 0], other: "crate", phase: "begin", point: [2, 2.333333, 0], pointIndex: 0, self: "player" },
        { material: "stone", normal: [0, 1, 0], other: "ramp", phase: "stay", point: [2, 0.833333, 0], pointIndex: 0, self: "player" },
      ],
      desired: [2, 2.333333333333333, 0],
      entity: "player",
      groundEntity: "ramp",
      grounded: true,
      pushed: { entity: "crate", impulse: [2, 0, 0], position: [4, 2.333333333333333, 0] },
      pushes: [{ entity: "crate", impulse: [2, 0, 0], position: [4, 2.333333333333333, 0] }],
      resolved: [2, 1.8333333333333335, 0],
      slope: { angle: 18.434949, axis: "x", direction: 1, entity: "ramp", rise: 1, run: 3, walkable: true },
      start: [0, 2.333333333333333, 0],
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

function stepEntity(id: string, position: [number, number, number], size: [number, number, number]): IWorldIr["entities"][number] {
  return {
    id,
    components: {
      Collider: { kind: "box", size },
      RigidBody: { kind: "static" },
      Transform: { position },
    },
  };
}
