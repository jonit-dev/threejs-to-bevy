import assert from "node:assert/strict";
import test from "node:test";
import type { IStateMachineComponent, IWorldIr } from "@threenative/ir";

import { resetStateMachines, stepStateMachines } from "./stateMachines.js";

test("should transition once when a sensor enter fires", () => {
  const world = machineWorld({
    initial: "idle",
    states: ["idle", "chase"],
    transitions: [{ from: "idle", to: "chase", trigger: { kind: "sensor", phase: "enter", sensor: "vision" } }],
  });
  const event = { filteredOut: [], occupants: ["guard"], phase: "enter" as const, sensor: "vision", step: 1 };
  assert.deepEqual(stepStateMachines(world, 1, [event]), [{ entity: "guard", from: "idle", tick: 1, to: "chase", trigger: "sensor" }]);
  assert.deepEqual(stepStateMachines(world, 2, [event]), []);
  assert.equal(world.entities[0]?.components.StateMachine?.current, "chase");
  resetStateMachines(world);
});

test("should resolve simultaneous transitions by declaration order", () => {
  const world = machineWorld({
    initial: "idle",
    states: ["idle", "first", "second"],
    transitions: [
      { from: "idle", to: "first", trigger: { event: "Go", kind: "event" } },
      { from: "idle", to: "second", trigger: { event: "Go", kind: "event" } },
    ],
  });
  world.events = { Go: [{}] };
  assert.deepEqual(stepStateMachines(world, 3), [{ entity: "guard", from: "idle", tick: 3, to: "first", trigger: "event" }]);
  resetStateMachines(world);
});

test("should advance fixed timer transitions deterministically", () => {
  const world = machineWorld({
    initial: "idle",
    states: ["idle", "done"],
    transitions: [{ from: "idle", to: "done", trigger: { kind: "timer", ticks: 2 } }],
  });
  assert.deepEqual(stepStateMachines(world, 0), []);
  assert.deepEqual(stepStateMachines(world, 1), [{ entity: "guard", from: "idle", tick: 1, to: "done", trigger: "timer" }]);
  resetStateMachines(world);
});

function machineWorld(machine: IStateMachineComponent): IWorldIr {
  return {
    entities: [{ components: { StateMachine: machine }, id: "guard" }],
    schema: "threenative.world",
    version: "0.1.0",
  };
}
