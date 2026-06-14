import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { stepPhysics } from "./physics.js";

test("physics should detect trigger overlap", () => {
  const world = makePhysicsWorld();

  const events = stepPhysics(world);

  assert.deepEqual(events, [{ a: "pickup", b: "player", phase: "enter" }]);
  assert.deepEqual(world.events?.TriggerEvent, [{ a: "pickup", b: "player", phase: "enter" }]);
});

test("physics should emit deterministic enter stay and exit phases", () => {
  const world = makePhysicsWorld();

  assert.deepEqual(stepPhysics(world), [{ a: "pickup", b: "player", phase: "enter" }]);
  assert.deepEqual(stepPhysics(world), [{ a: "pickup", b: "player", phase: "stay" }]);

  const player = world.entities.find((entity) => entity.id === "player");
  if (player?.components.Transform !== undefined) {
    player.components.Transform.position = [4, 0, 0];
  }

  assert.deepEqual(stepPhysics(world), [{ a: "pickup", b: "player", phase: "exit" }]);
  assert.deepEqual(world.events?.TriggerEvent, [{ a: "pickup", b: "player", phase: "exit" }]);
});

function makePhysicsWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "player",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "kinematic" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "pickup",
        components: {
          Collider: { kind: "sphere" as const, radius: 0.5, trigger: true },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0.25, 0, 0] as const },
        },
      },
    ],
  };
}
