import test from "node:test";
import assert from "node:assert/strict";

import type { IGameFlowIr } from "@threenative/ir";
import { traceGameFlow } from "./gameFlow.js";

test("game flow should run entry actions exactly once when state entered", () => {
  const trace = traceGameFlow(makeFlow(), { eventsByTick: { 1: ["start"] }, fixedDelta: 0.5, ticks: 4 });

  assert.deepEqual(trace.map((frame) => frame.state), ["ready", "playing", "playing", "playing"]);
  assert.deepEqual(
    trace.flatMap((frame) => frame.actions.map((action) => `${frame.tick}:${action.action}:${action.target ?? ""}`)),
    [
      "0:setResource:phase",
      "1:emitEvent:match.started",
      "1:setTimeScale:",
      "1:spawnerEnable:drone-spawner",
    ],
  );
});

function makeFlow(): IGameFlowIr {
  return {
    schema: "threenative.game-flow",
    version: "0.1.0",
    flows: [
      {
        id: "match",
        initial: "ready",
        states: [
          { id: "ready", actions: [{ kind: "setResource", resource: "phase", value: "ready" }] },
          { id: "playing", actions: [{ kind: "setTimeScale", timeScale: 1 }, { kind: "spawnerEnable", spawner: "drone-spawner", value: true }] },
        ],
        transitions: [
          {
            id: "start",
            from: "ready",
            to: "playing",
            trigger: { kind: "event", event: "start" },
            actions: [{ kind: "emitEvent", event: "match.started" }],
          },
        ],
      },
    ],
  };
}
