import assert from "node:assert/strict";
import test from "node:test";
import type { ISystemsIr, IWorldIr } from "@threenative/ir";
import * as THREE from "three";

import { createGameLoopState, runGameFrame } from "./gameLoop.js";
import type { IThreeWorld } from "./mapWorld.js";

test("gameLoop should run fixed update at configured timestep", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.25, paused: false },
    window: { height: 720, width: 1280 },
  });
  const world = makeWorld();
  let ticks = 0;

  await runGameFrame({
    delta: 0.6,
    mapped: makeMapped(),
    module: { systems: { tick: () => ticks++ } },
    runtimeConfig: {
      schema: "threenative.runtime-config",
      version: "0.1.0",
      time: { fixedDelta: 0.25, paused: false },
      window: { height: 720, width: 1280 },
    },
    state,
    systems: makeSystems(),
    world,
  });

  assert.equal(ticks, 2);
  assert.equal(state.accumulator, 0.09999999999999998);
});

test("gameLoop should skip gameplay schedules while paused", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.25, paused: true },
    window: { height: 720, width: 1280 },
  });
  let ticks = 0;

  await runGameFrame({
    delta: 1,
    mapped: makeMapped(),
    module: { systems: { tick: () => ticks++ } },
    runtimeConfig: {
      schema: "threenative.runtime-config",
      version: "0.1.0",
      time: { fixedDelta: 0.25, paused: true },
      window: { height: 720, width: 1280 },
    },
    state,
    systems: makeSystems(),
    world: makeWorld(),
  });

  assert.equal(ticks, 0);
  assert.equal(state.elapsed, 1);
});

test("gameLoop should run startup once before gameplay schedules", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.25, paused: false },
    window: { height: 720, width: 1280 },
  });
  const order: string[] = [];

  await runGameFrame({
    delta: 0.25,
    fixedDelta: 0.25,
    mapped: makeMapped(),
    module: {
      systems: {
        boot: () => order.push("startup"),
        tick: () => order.push("fixedUpdate"),
      },
    },
    state,
    systems: makeSystems([
      system("tick", "fixedUpdate"),
      system("boot", "startup"),
    ]),
    world: makeWorld(),
  });
  await runGameFrame({
    delta: 0.25,
    fixedDelta: 0.25,
    mapped: makeMapped(),
    module: {
      systems: {
        boot: () => order.push("startup"),
        tick: () => order.push("fixedUpdate"),
      },
    },
    state,
    systems: makeSystems([
      system("tick", "fixedUpdate"),
      system("boot", "startup"),
    ]),
    world: makeWorld(),
  });

  assert.deepEqual(order, ["startup", "fixedUpdate", "fixedUpdate"]);
  assert.equal(state.startupComplete, true);
});

test("gameLoop should interpolate fixed-update transform poses for rendering", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.25, paused: false },
    window: { height: 720, width: 1280 },
  });
  const world = makeWorld([{ id: "mover", position: [0, 0, 0] }]);
  const mover = new THREE.Object3D();
  const mapped = makeMapped(new Map([["mover", mover]]));

  await runGameFrame({
    delta: 0.25,
    fixedDelta: 0.25,
    mapped,
    module: { systems: { tick: moveMoverBy(10) } },
    state,
    systems: makeSystems([system("tick", "fixedUpdate", ["Transform"])]),
    world,
  });
  assert.deepEqual(world.entities[0]?.components.Transform?.position, [10, 0, 0]);
  assert.equal(mover.position.x, 0);

  await runGameFrame({
    delta: 0.125,
    fixedDelta: 0.25,
    mapped,
    module: { systems: { tick: moveMoverBy(10) } },
    state,
    systems: makeSystems([system("tick", "fixedUpdate", ["Transform"])]),
    world,
  });

  assert.deepEqual(world.entities[0]?.components.Transform?.position, [10, 0, 0]);
  assert.equal(mover.position.x, 5);
});

test("gameLoop should keep variable-update transform writes authoritative over fixed interpolation", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.25, paused: false },
    window: { height: 720, width: 1280 },
  });
  const world = makeWorld([{ id: "mover", position: [0, 0, 0] }]);
  const mover = new THREE.Object3D();

  await runGameFrame({
    delta: 0.25,
    fixedDelta: 0.25,
    mapped: makeMapped(new Map([["mover", mover]])),
    module: {
      systems: {
        tick: moveMoverBy(10),
        update: setMoverPosition([20, 0, 0]),
      },
    },
    state,
    systems: makeSystems([
      system("tick", "fixedUpdate", ["Transform"]),
      system("update", "update", ["Transform"]),
    ]),
    world,
  });

  assert.deepEqual(world.entities[0]?.components.Transform?.position, [20, 0, 0]);
  assert.equal(mover.position.x, 20);
});

test("gameLoop should expose interpolated fixed transforms to variable-update reads", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.25, paused: false },
    window: { height: 720, width: 1280 },
  });
  const world = makeWorld([
    { id: "mover", position: [0, 0, 0] },
    { id: "camera", position: [0, 0, 0] },
  ]);
  const mover = new THREE.Object3D();
  const camera = new THREE.Object3D();
  const mapped = makeMapped(new Map([
    ["mover", mover],
    ["camera", camera],
  ]));

  await runGameFrame({
    delta: 0.25,
    fixedDelta: 0.25,
    mapped,
    module: {
      systems: {
        tick: moveMoverBy(10),
        update: copyMoverXToCamera(),
      },
    },
    state,
    systems: makeSystems([
      system("tick", "fixedUpdate", ["Transform"]),
      system("update", "update", ["Transform"]),
    ]),
    world,
  });
  await runGameFrame({
    delta: 0.125,
    fixedDelta: 0.25,
    mapped,
    module: {
      systems: {
        tick: moveMoverBy(10),
        update: copyMoverXToCamera(),
      },
    },
    state,
    systems: makeSystems([
      system("tick", "fixedUpdate", ["Transform"]),
      system("update", "update", ["Transform"]),
    ]),
    world,
  });

  assert.deepEqual(world.entities[0]?.components.Transform?.position, [10, 0, 0]);
  assert.deepEqual(world.entities[1]?.components.Transform?.position, [5, 0, 0]);
  assert.equal(mover.position.x, 5);
  assert.equal(camera.position.x, 5);
});

function makeWorld(entities: Array<{ id: string; position: [number, number, number] }> = []): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: entities.map((entity) => ({
      id: entity.id,
      components: { Transform: { position: entity.position } },
    })),
  };
}

function makeMapped(objectsById: Map<string, THREE.Object3D> = new Map()): IThreeWorld {
  return {
    camera: {} as IThreeWorld["camera"],
    cameras: new Map(),
    cameraViews: [],
    diagnostics: [],
    layerAllocation: new Map([["default", 0]]),
    objectsById,
    scene: {} as IThreeWorld["scene"],
  };
}

function makeSystems(systems = [system("tick", "fixedUpdate")]): ISystemsIr {
  return {
    schema: "threenative.systems",
    version: "0.1.0",
    systems,
  };
}

function system(name: string, schedule: "fixedUpdate" | "postUpdate" | "startup" | "update", writes: string[] = []): ISystemsIr["systems"][number] {
  return {
    commands: [],
    eventReads: [],
    eventWrites: [],
    name,
    queries: [],
    reads: [],
    resourceReads: [],
    resourceWrites: [],
    services: [],
    schedule,
    script: { bundle: "scripts.bundle.js", exportName: name },
    writes,
  };
}

function moveMoverBy(distance: number): (context: any) => void {
  return (context: any) => {
    const transform = context.entity("mover")?.transform();
    const position = transform?.positionOr([0, 0, 0]) ?? [0, 0, 0];
    transform?.setPosition([position[0] + distance, position[1], position[2]]);
  };
}

function setMoverPosition(position: [number, number, number]): (context: any) => void {
  return (context: any) => {
    context.entity("mover")?.transform().setPosition(position);
  };
}

function copyMoverXToCamera(): (context: any) => void {
  return (context: any) => {
    const position = context.entity("mover")?.transform().positionOr([0, 0, 0]) ?? [0, 0, 0];
    context.entity("camera")?.transform().setPosition([position[0], 0, 0]);
  };
}
