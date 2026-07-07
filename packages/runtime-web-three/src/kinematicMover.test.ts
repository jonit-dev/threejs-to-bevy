import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { hasKinematicMovers, stepKinematicMovers } from "./kinematicMover.js";
import { stepPhysics } from "./physics.js";

test("kinematic mover should write sine position and derivative velocity", () => {
  const world = makeWorld();

  const observations = stepKinematicMovers(world, 0.5);

  assert.equal(hasKinematicMovers(world), true);
  assert.deepEqual(roundVec(observations[0]?.position), [2.682942, 0, 2]);
  assert.deepEqual(roundVec(observations[0]?.velocity), [2.161209, 0, 0]);
  assert.deepEqual(roundVec(world.entities[0]!.components.Transform!.position!), [2.682942, 0, 2]);
  assert.deepEqual(roundVec(world.entities[0]!.components.RigidBody!.velocity!), [2.161209, 0, 0]);
});

test("kinematic mover should keep initial authored origin instead of drifting", () => {
  const world = makeWorld();

  stepKinematicMovers(world, 0.5);
  stepKinematicMovers(world, 1);

  assert.deepEqual(roundVec(world.entities[0]!.components.Transform!.position!), [2.818595, 0, 2]);
  assert.deepEqual(roundVec(world.entities[0]!.components.RigidBody!.velocity!), [-1.664587, 0, 0]);
});

test("kinematic mover should not be integrated again by same-tick physics", () => {
  const world = makeWorld();

  stepKinematicMovers(world, 0.5);
  const movedPosition = world.entities[0]!.components.Transform!.position;
  stepPhysics(world, 1);

  assert.deepEqual(roundVec(world.entities[0]!.components.Transform!.position!), roundVec(movedPosition));
  assert.deepEqual(roundVec(world.entities[0]!.components.RigidBody!.velocity!), [2.161209, 0, 0]);
});

function makeWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "hazard",
        components: {
          KinematicMover: { direction: [1, 0, 0], mode: "sine", radius: 2, speed: 2 },
          RigidBody: { kind: "kinematic" },
          Transform: { position: [1, 0, 2] },
        },
      },
    ],
  };
}

function roundVec(value: readonly number[] | undefined): number[] {
  return [...(value ?? [])].map((item) => {
    const rounded = Math.round(item * 1_000_000) / 1_000_000;
    return Object.is(rounded, -0) ? 0 : rounded;
  });
}
