import assert from "node:assert/strict";
import test from "node:test";

import { animationPlayPayload, animationQueryPayload, animationStopPayload } from "./animation.js";

test("should log animation play service call", () => {
  assert.deepEqual(animationPlayPayload({ clip: "run", entity: "player", options: { loop: true } }), {
    request: { clip: "run", entity: "player", options: { loop: true } },
    result: { accepted: true },
  });
});

test("should log animation stop service call", () => {
  assert.deepEqual(animationStopPayload({ clip: "run", entity: "player" }), {
    request: { clip: "run", entity: "player" },
    result: { accepted: true, stopped: true },
  });
});

test("should log animation query service call", () => {
  assert.deepEqual(animationQueryPayload({ entity: "player" }), {
    request: { entity: "player" },
    result: {
      active: false,
      entity: "player",
      paused: false,
      stopped: true,
      timeSeconds: 0,
    },
  });
});
