import assert from "node:assert/strict";
import test from "node:test";
import type { ISystemsIr, IWorldIr } from "@threenative/ir";

import { createSystemContext, evaluateStates } from "./context.js";

test("should expose fixed input trace", () => {
  const { context } = createSystemContext(makeWorld(), {
    delta: 0.016,
    fixedDelta: 0.016,
    input: {
      action: (name) => name === "MoveForward",
      axis: (name) => (name === "MoveX" ? 1 : 0),
      beginFrame: () => undefined,
      handleKeyDown: () => undefined,
      handleKeyUp: () => undefined,
      handlePointerDown: () => undefined,
      handlePointerMove: () => undefined,
      handlePointerUp: () => undefined,
      pressed: (name) => name === "Jump",
      released: () => false,
    },
  });

  assert.equal(context.input.action("MoveForward"), true);
  assert.equal(context.input.axis("MoveX"), 1);
  assert.equal(context.input.pressed("Jump"), true);
  assert.equal(context.time.fixedDt, 0.016);
});

test("should raycast primitive floor", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  const result = context.physics.raycast({
    direction: [0, -1, 0],
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
  assert.deepEqual(services[0], {
    payload: {
      request: { direction: [0, -1, 0], maxDistance: 2, origin: [0, 1, 0] },
      result,
    },
    service: "physics.raycast",
  });
});

test("should log v7 physics query service calls", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  const overlap = context.physics.overlap({
    layer: "player",
    mask: ["world"],
    position: [0, 0.5, 0],
    shape: { kind: "sphere", radius: 0.75 },
  });
  const shapeCast = context.physics.shapeCast({
    direction: [0, -1, 0],
    maxDistance: 2,
    origin: [0, 1, 0],
    shape: { halfExtents: [0.25, 0.25, 0.25], kind: "box" },
  });

  assert.deepEqual(overlap, { entities: ["floor"] });
  assert.equal(shapeCast.hit, true);
  assert.deepEqual(services.map((service) => service.service), ["physics.overlap", "physics.shapeCast"]);
  assert.deepEqual(services[0]?.payload, {
    request: { layer: "player", mask: ["world"], position: [0, 0.5, 0], shape: { kind: "sphere", radius: 0.75 } },
    result: overlap,
  });
});

test("should log animation play service call", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  context.animation.play("player", "run", { loop: true });

  assert.deepEqual(services[0], {
    payload: {
      request: { clip: "run", entity: "player", options: { loop: true } },
      result: { accepted: true },
    },
    service: "animation.play",
  });
});

test("should expose resource-derived app states, computed states, and substates", () => {
  const world: IWorldIr = {
    entities: [],
    resources: {
      GameState: { difficulty: "danger", locomotion: "airborne", phase: "playing" },
    },
    schema: "threenative.world",
    version: "0.1.0",
  };
  const systems: ISystemsIr = {
    lifecycle: {
      appStates: [{ id: "Game", initial: "boot", source: { field: "phase", resource: "GameState" }, values: ["boot", "playing"] }],
      computedStates: [{ fallback: "safe", id: "Difficulty", source: { field: "difficulty", resource: "GameState" }, values: ["safe", "danger"] }],
      hotReload: "invalidate",
      replay: "fixed-trace",
      state: "system-local-disallowed",
      substates: [{ fallback: "grounded", id: "Locomotion", parent: "Game", parentValue: "playing", source: { field: "locomotion", resource: "GameState" }, values: ["grounded", "airborne"] }],
    },
    schema: "threenative.systems",
    systems: [],
    version: "0.1.0",
  };

  assert.deepEqual(evaluateStates(world, systems), {
    Difficulty: "danger",
    Game: "playing",
    Locomotion: "airborne",
  });

  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, systems });

  assert.equal(context.states.get("Game"), "playing");
  assert.equal(context.states.get("Difficulty"), "danger");
  assert.equal(context.states.get("Locomotion"), "airborne");
  assert.equal(context.states.get("Missing"), null);
});

function makeWorld(): IWorldIr {
  return {
    entities: [
      {
        components: {
          Collider: { kind: "box", layer: "world", mask: ["player"], size: [8, 0.1, 8] },
          Transform: { position: [0, 0, 0] },
        },
        id: "floor",
      },
      {
        components: {
          Transform: { position: [0, 1, 0] },
        },
        id: "player",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
}
