import assert from "node:assert/strict";
import test from "node:test";

import type { ISystemsIr, IWorldIr } from "@threenative/ir";

import { createCountdownRuntimeState, stepCountdowns } from "./countdowns.js";

test("should fire a down countdown limit event once per cycle", () => {
  const world: IWorldIr = {
    entities: [],
    resources: { Race: { remaining: 0.1, restartToken: 0, running: true } },
    schema: "threenative.world",
    version: "0.1.0",
  };
  const systems = systemsWithCountdown({ direction: "down", field: "remaining", limit: 0.1, resource: "Race" });
  const runtime = createCountdownRuntimeState();

  assert.equal(stepCountdowns(world, systems, 0.1, runtime, 0)[0]?.fired, true);
  assert.equal(stepCountdowns(world, systems, 0.1, runtime, 1)[0]?.fired, false);
  const firstEvents = world.events?.["Race.limit"];
  assert.equal(Array.isArray(firstEvents) ? firstEvents.length : 0, 1);

  world.resources!.Race = { remaining: 0, restartToken: 1, running: true };
  assert.equal(stepCountdowns(world, systems, 0.1, runtime, 2)[0]?.fired, true);
  const secondEvents = world.events?.["Race.limit"];
  assert.equal(Array.isArray(secondEvents) ? secondEvents.length : 0, 2);
});

test("should advance an up countdown only while running", () => {
  const world: IWorldIr = {
    entities: [],
    resources: { Race: { elapsed: 0, running: false } },
    schema: "threenative.world",
    version: "0.1.0",
  };
  const systems = systemsWithCountdown({ direction: "up", field: "elapsed", limit: 0.2, resource: "Race", autostart: false });
  const runtime = createCountdownRuntimeState();

  stepCountdowns(world, systems, 0.1, runtime, 0);
  assert.equal(world.resources?.Race && (world.resources.Race as { elapsed: number }).elapsed, 0);
  (world.resources!.Race as { running: boolean }).running = true;
  stepCountdowns(world, systems, 0.1, runtime, 1);
  assert.equal((world.resources!.Race as { elapsed: number }).elapsed, 0.1);
});

function systemsWithCountdown(overrides: Partial<NonNullable<ISystemsIr["countdowns"]>[number]>): ISystemsIr {
  return {
    countdowns: [{ autostart: true, direction: "down", event: "Race.limit", field: "remaining", id: "race", limit: 1, resource: "Race", ...overrides }],
    schema: "threenative.systems",
    systems: [],
    version: "0.1.0",
  };
}
