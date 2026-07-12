import assert from "node:assert/strict";
import test from "node:test";
import type { IPatrolComponent, IWorldIr } from "@threenative/ir";

import { resetPatrolState, stepPatrols } from "./patrol.js";

test("should traverse loop waypoints without overshoot", () => {
  const world = patrolWorld({ mode: "loop", speed: 1, waypoints: [[0, 0, 0], [1, 0, 0], [1, 0, 1]] });
  assert.deepEqual(stepPatrols(world, 0.5)[0]?.position, [0.5, 0, 0]);
  assert.deepEqual(stepPatrols(world, 0.5)[0]?.position, [1, 0, 0]);
  assert.deepEqual(stepPatrols(world, 1)[0]?.position, [1, 0, 1]);
  assert.deepEqual(stepPatrols(world, Math.SQRT2)[0]?.position, [0, 0, 0]);
  resetPatrolState(world);
});

test("should reverse and pause in ping-pong mode", () => {
  const world = patrolWorld({ mode: "ping-pong", pauseAtWaypoint: 0.5, speed: 1, waypoints: [[0, 0, 0], [1, 0, 0]] });
  const reached = stepPatrols(world, 1)[0];
  assert.deepEqual(reached?.position, [1, 0, 0]);
  assert.equal(reached?.direction, -1);
  assert.equal(reached?.segment, 0);
  assert.deepEqual(stepPatrols(world, 0.25)[0]?.position, [1, 0, 0]);
  assert.deepEqual(stepPatrols(world, 0.5)[0]?.position, [0.75, 0, 0]);
  resetPatrolState(world);
});

function patrolWorld(patrol: IPatrolComponent): IWorldIr {
  return {
    entities: [{ components: { Patrol: patrol, Transform: { position: [0, 0, 0] } }, id: "guard" }],
    schema: "threenative.world",
    version: "0.1.0",
  };
}
