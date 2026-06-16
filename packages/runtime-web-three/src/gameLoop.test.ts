import assert from "node:assert/strict";
import test from "node:test";
import type { ISystemsIr, IWorldIr } from "@threenative/ir";

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

function makeWorld(): IWorldIr {
  return { schema: "threenative.world", version: "0.1.0", entities: [] };
}

function makeMapped(): IThreeWorld {
  return {
    camera: {} as IThreeWorld["camera"],
    cameras: new Map(),
    cameraViews: [],
    diagnostics: [],
    layerAllocation: new Map([["default", 0]]),
    objectsById: new Map(),
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

function system(name: string, schedule: "fixedUpdate" | "postUpdate" | "startup" | "update"): ISystemsIr["systems"][number] {
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
    writes: [],
  };
}
