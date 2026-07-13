import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import type { ISystemsIr, IUiIr, IWorldIr } from "@threenative/ir";
import * as THREE from "three";

import { createGameLoopState, runGameFrame } from "./gameLoop.js";
import { createInputState } from "./input.js";
import type { IThreeWorld } from "./mapWorld.js";
import { renderUi } from "./ui/renderUi.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const loopExpectationsPath = resolve(repoRoot, "packages/ir/fixtures/contracts/loop-scheduling/expectations.json");

interface ILoopSchedulingExpectations {
  interpolation: {
    expectedCameraX: number;
    expectedRenderedMoverX: number;
    expectedWorldMoverX: number;
    firstDelta: number;
    fixedDelta: number;
    partialDelta: number;
  };
  ordering: {
    postUpdateSeesUpdateWrites: boolean;
    schedules: string[];
  };
  scenarios: Array<{
    delta: number;
    expected: {
      accumulator: number;
      fixed: number;
      frame: number;
      postUpdate: number;
      startup: number;
      tick: number;
      update: number;
    };
    fixedDelta: number;
    id: string;
    paused: boolean;
  }>;
}

test("gameLoop should satisfy shared loop fixture expectations", async () => {
  const fixture = await readLoopExpectations();

  for (const scenario of fixture.scenarios) {
    const state = createGameLoopState({
      schema: "threenative.runtime-config",
      version: "0.1.0",
      time: { fixedDelta: scenario.fixedDelta, paused: scenario.paused },
      window: { height: 720, width: 1280 },
    });
    const counts = { fixed: 0, postUpdate: 0, startup: 0, update: 0 };

    await runGameFrame({
      delta: scenario.delta,
      fixedDelta: scenario.fixedDelta,
      mapped: makeMapped(),
      module: {
        systems: {
          boot: () => counts.startup += 1,
          post: () => counts.postUpdate += 1,
          tick: () => counts.fixed += 1,
          update: () => counts.update += 1,
        },
      },
      state,
      systems: makeSystems([
        system("boot", "startup"),
        system("tick", "fixedUpdate"),
        system("update", "update"),
        system("post", "postUpdate"),
      ]),
      world: makeWorld(),
    });

    assert.deepEqual(counts, {
      fixed: scenario.expected.fixed,
      postUpdate: scenario.expected.postUpdate,
      startup: scenario.expected.startup,
      update: scenario.expected.update,
    }, scenario.id);
    assert.equal(state.frame, scenario.expected.frame, scenario.id);
    assert.equal(state.tick, scenario.expected.tick, scenario.id);
    assert.ok(Math.abs(state.accumulator - scenario.expected.accumulator) < 1e-10, scenario.id);
  }

  assert.deepEqual(fixture.ordering.schedules, ["update", "postUpdate"]);
  assert.equal(fixture.ordering.postUpdateSeesUpdateWrites, true);
});

test("gameLoop should run fixed update at configured timestep", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.1, paused: false },
    window: { height: 720, width: 1280 },
  });
  const world = makeWorld();
  let ticks = 0;

  await runGameFrame({
    delta: 0.2,
    mapped: makeMapped(),
    module: { systems: { tick: () => ticks++ } },
    runtimeConfig: {
      schema: "threenative.runtime-config",
      version: "0.1.0",
      time: { fixedDelta: 0.1, paused: false },
      window: { height: 720, width: 1280 },
    },
    state,
    systems: makeSystems(),
    world,
  });

  assert.equal(ticks, 2);
  assert.ok(Math.abs(state.accumulator) < 1e-10);
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
  assert.equal(state.elapsed, 0.25);
  assert.equal(state.accumulator, 0);
});

test("gameLoop should preserve input pressed while paused until gameplay resumes", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 1 / 60, paused: true },
    window: { height: 720, width: 1280 },
  });
  const input = createInputState({
    schema: "threenative.input",
    version: "0.1.0",
    actions: [{ id: "Select", bindings: [{ code: "Enter", device: "keyboard" }] }],
    axes: [],
  });
  let pressed = false;
  const options = {
    delta: 1 / 60,
    input,
    mapped: makeMapped(),
    module: { systems: { update: (context: any) => pressed = context.input.pressed("Select") } },
    state,
    systems: makeSystems([system("update", "update")]),
    world: makeWorld(),
  };

  input.handleKeyDown({ code: "Enter" });
  await runGameFrame(options);
  state.paused = false;
  await runGameFrame(options);

  assert.equal(pressed, true);
});

test("gameLoop should clamp suspended-frame deltas", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 0.1, paused: false },
    window: { height: 720, width: 1280 },
  });
  let ticks = 0;

  await runGameFrame({
    delta: 60,
    fixedDelta: 0.1,
    mapped: makeMapped(),
    module: { systems: { tick: () => ticks++ } },
    state,
    systems: makeSystems(),
    world: makeWorld(),
  });

  assert.equal(ticks, 2);
  assert.equal(state.elapsed, 0.25);
  assert.ok(Math.abs(state.accumulator - 0.05) < 1e-10);
});

test("gameLoop should cap fixed updates per long frame", async () => {
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: 1 / 60, paused: false },
    window: { height: 720, width: 1280 },
  });
  let ticks = 0;

  await runGameFrame({
    delta: 0.25,
    fixedDelta: 1 / 60,
    mapped: makeMapped(),
    module: { systems: { tick: () => ticks++ } },
    state,
    systems: makeSystems(),
    world: makeWorld(),
  });

  assert.equal(ticks, 5);
  assert.equal(state.tick, 5);
  assert.ok(Math.abs(state.accumulator) < 1e-10);
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

test("gameLoop should apply shared interpolation and variable ordering expectations", async () => {
  const fixture = await readLoopExpectations();
  const state = createGameLoopState({
    schema: "threenative.runtime-config",
    version: "0.1.0",
    time: { fixedDelta: fixture.interpolation.fixedDelta, paused: false },
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
    delta: fixture.interpolation.firstDelta,
    fixedDelta: fixture.interpolation.fixedDelta,
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
    delta: fixture.interpolation.partialDelta,
    fixedDelta: fixture.interpolation.fixedDelta,
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

  assert.equal(world.entities[0]?.components.Transform?.position?.[0], fixture.interpolation.expectedWorldMoverX);
  assert.equal(world.entities[1]?.components.Transform?.position?.[0], fixture.interpolation.expectedCameraX);
  assert.equal(mover.position.x, fixture.interpolation.expectedRenderedMoverX);

  const orderedWorld = makeWorld([
    { id: "mover", position: [0, 0, 0] },
    { id: "camera", position: [0, 0, 0] },
  ]);
  await runGameFrame({
    delta: fixture.interpolation.fixedDelta,
    fixedDelta: fixture.interpolation.fixedDelta,
    mapped: makeMapped(),
    module: {
      systems: {
        post: copyMoverXToCamera(),
        update: setMoverPosition([20, 0, 0]),
      },
    },
    state: createGameLoopState(),
    systems: makeSystems([
      system("update", "update", ["Transform"]),
      system("post", "postUpdate", ["Transform"]),
    ]),
    world: orderedWorld,
  });

  assert.equal(orderedWorld.entities[1]?.components.Transform?.position?.[0], 20);
});

test("gameLoop should expose drained UI actions and values to scripts for one frame", async () => {
  const state = createGameLoopState();
  const input = createInputState();
  const ui = makeUi();
  const rendered = renderUi(ui, makeWorld());
  const observations: unknown[] = [];
  rendered.trigger("start");
  rendered.trigger("volume", 0.75);
  for (const action of rendered.drainActions()) {
    input.enqueueUiAction(action.action);
  }

  await runGameFrame({
    delta: 1 / 60,
    input,
    mapped: makeMapped(),
    module: {
      systems: {
        update: (context: any) => {
          observations.push({
            actions: context.ui.actions(),
            pressedStart: context.input.pressed("StartGame"),
            pressedVolume: context.input.pressed("SetVolume"),
          });
        },
      },
    },
    state,
    systems: makeSystems([system("update", "update")]),
    ui,
    uiState: rendered,
    world: makeWorld(),
  });
  for (const action of rendered.drainActions()) {
    input.enqueueUiAction(action.action);
  }
  await runGameFrame({
    delta: 1 / 60,
    input,
    mapped: makeMapped(),
    module: {
      systems: {
        update: (context: any) => {
          observations.push({
            actions: context.ui.actions(),
            pressedStart: context.input.pressed("StartGame"),
            pressedVolume: context.input.pressed("SetVolume"),
          });
        },
      },
    },
    state,
    systems: makeSystems([system("update", "update")]),
    ui,
    uiState: rendered,
    world: makeWorld(),
  });

  assert.deepEqual(observations, [
    {
      actions: [
        { action: "StartGame", node: "start" },
        { action: "SetVolume", node: "volume", value: 0.75 },
      ],
      pressedStart: true,
      pressedVolume: true,
    },
    { actions: [], pressedStart: false, pressedVolume: false },
  ]);
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

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "hud",
      kind: "column",
      children: [
        { id: "start", kind: "button", label: "Start", action: "StartGame" },
        { id: "volume", kind: "slider", label: "Volume", action: "SetVolume", min: 0, max: 1, value: 0.25 },
      ],
    },
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

async function readLoopExpectations(): Promise<ILoopSchedulingExpectations> {
  return JSON.parse(await readFile(loopExpectationsPath, "utf8")) as ILoopSchedulingExpectations;
}
