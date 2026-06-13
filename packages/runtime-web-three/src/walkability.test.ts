import assert from "node:assert/strict";
import test from "node:test";

import { resolveWalkableMovement } from "./walkability.js";

test("walkability should block movement outside walkable bounds", () => {
  const result = resolveWalkableMovement({
    desired: [4, 0, 0],
    start: [0, 0, 0],
    walkability: makeWalkability(),
  });

  assert.equal(result.blockedBy, "walkable-boundary");
  assert.deepEqual(result.position, [0, 1.7, 0]);
});

test("walkability should stop against blocking prop", () => {
  const result = resolveWalkableMovement({
    desired: [1, 0, 0],
    instances: [{ id: "rock", position: [1, 0, 0], sourceAsset: "env.Rock" }],
    start: [0, 0, 0],
    walkability: makeWalkability(),
  });

  assert.equal(result.blockedBy, "blocker.rock");
  assert.deepEqual(result.position, [0, 1.7, 0]);
});

function makeWalkability(): Parameters<typeof resolveWalkableMovement>[0]["walkability"] {
  return {
    blockers: [{ collider: { radius: 0.5, type: "cylinder" }, id: "blocker.rock", instance: "rock" }],
    movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
    regions: [{ id: "path", points: [[-2, -2], [2, -2], [2, 2], [-2, 2]] }],
    terrain: { height: 0, surface: "terrain" },
  };
}
