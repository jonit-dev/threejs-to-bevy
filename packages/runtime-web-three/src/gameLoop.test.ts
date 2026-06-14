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

function makeWorld(): IWorldIr {
  return { schema: "threenative.world", version: "0.1.0", entities: [] };
}

function makeMapped(): IThreeWorld {
  return { camera: {} as IThreeWorld["camera"], diagnostics: [], objectsById: new Map(), scene: {} as IThreeWorld["scene"] };
}

function makeSystems(): ISystemsIr {
  return {
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [
      {
        commands: [],
        eventReads: [],
        eventWrites: [],
        name: "tick",
        queries: [],
        reads: [],
        resourceReads: [],
        resourceWrites: [],
        services: [],
        schedule: "fixedUpdate",
        script: { bundle: "scripts.bundle.js", exportName: "tick" },
        writes: [],
      },
    ],
  };
}
