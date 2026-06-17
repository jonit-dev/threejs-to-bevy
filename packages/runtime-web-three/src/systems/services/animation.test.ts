import assert from "node:assert/strict";
import test from "node:test";

import { animationPlayPayload, animationQueryPayload, animationStopPayload } from "./animation.js";

const runningState = {
  active: true,
  activeState: "run",
  clip: "run",
  entity: "player",
  loop: true,
  normalizedTime: 0,
  sourceClip: "run",
  speed: 1,
  stopped: false,
  timeSeconds: 0,
};

const stoppedState = {
  ...runningState,
  active: false,
  stopped: true,
  stopReason: "requested",
};

test("should log animation play service call", () => {
  assert.deepEqual(animationPlayPayload({ clip: "run", entity: "player", options: { loop: true } }, runningState), {
    request: { clip: "run", entity: "player", options: { loop: true } },
    result: { ...runningState, accepted: true },
  });
});

test("should log animation stop service call", () => {
  assert.deepEqual(animationStopPayload({ clip: "run", entity: "player" }, stoppedState), {
    request: { clip: "run", entity: "player" },
    result: { ...stoppedState, accepted: true },
  });
});

test("should log animation query service call", () => {
  assert.deepEqual(animationQueryPayload({ entity: "player" }, runningState), {
    request: { entity: "player" },
    result: runningState,
  });
});
