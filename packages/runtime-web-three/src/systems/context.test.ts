import assert from "node:assert/strict";
import test from "node:test";
import type { IWorldIr } from "@threenative/ir";

import { createSystemContext } from "./context.js";

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

function makeWorld(): IWorldIr {
  return {
    entities: [
      {
        components: {
          Collider: { kind: "box", size: [8, 0.1, 8] },
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
