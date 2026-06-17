import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { stepPhysics, tracePhysicsJoints, traceRigidBodyPrimitive } from "./physics.js";

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

test("physics should apply portable contact filters before emitting events", () => {
  const world = makePhysicsWorld();
  const pickup = world.entities.find((entity) => entity.id === "pickup");
  const player = world.entities.find((entity) => entity.id === "player");
  if (pickup?.components.Collider !== undefined && player?.components.Collider !== undefined) {
    pickup.components.Collider.layer = "pickup";
    pickup.components.Collider.mask = ["enemy"];
    player.components.Collider.layer = "player";
    player.components.Collider.mask = ["pickup"];
  }

  assert.deepEqual(stepPhysics(world), []);
  assert.deepEqual(world.events?.TriggerEvent, []);
});

test("physics should emit deterministic contact ordering across simultaneous pairs", () => {
  const world = makeUnorderedContactWorld();

  assert.deepEqual(stepPhysics(world), [
    { a: "alpha", b: "middle", phase: "enter" },
    { a: "alpha", b: "zeta", phase: "enter" },
    { a: "middle", b: "zeta", phase: "enter" },
    { a: "middle", b: "sensor", phase: "enter" },
  ]);
  assert.deepEqual(world.events?.CollisionEvent, [
    { a: "alpha", b: "middle", phase: "enter" },
    { a: "alpha", b: "zeta", phase: "enter" },
    { a: "middle", b: "zeta", phase: "enter" },
  ]);
  assert.deepEqual(world.events?.TriggerEvent, [{ a: "middle", b: "sensor", phase: "enter" }]);
});

test("physics should trace dynamic box falling onto a static floor", () => {
  const world = makeFallingBoxWorld();

  assert.deepEqual(traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 4 }), [
    {
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 1.386875, 0],
      restitution: 0,
      step: 1,
      velocity: [0, -2.4525, 0],
    },
    {
      contact: "floor",
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 0.55, 0],
      restitution: 0,
      step: 2,
      velocity: [0, 0, 0],
    },
    {
      contact: "floor",
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 0.55, 0],
      restitution: 0,
      step: 3,
      velocity: [0, 0, 0],
    },
    {
      contact: "floor",
      damping: 0,
      entity: "box",
      friction: 0.5,
      gravityScale: 1,
      position: [0, 0.55, 0],
      restitution: 0,
      step: 4,
      velocity: [0, 0, 0],
    },
  ]);
});

test("physics should apply gravity scale, damping, restitution, and friction in primitive trace", () => {
  const world = makeFallingBoxWorld();
  const box = world.entities.find((entity) => entity.id === "box");
  const floor = world.entities.find((entity) => entity.id === "floor");
  if (box?.components.RigidBody !== undefined && box.components.Collider !== undefined && floor?.components.Collider !== undefined) {
    box.components.RigidBody.damping = 0.4;
    box.components.RigidBody.gravityScale = 0.5;
    box.components.RigidBody.velocity = [1, 0, 0];
    box.components.Collider.friction = 0.25;
    box.components.Collider.restitution = 0.5;
    floor.components.Collider.friction = 0.75;
  }

  const observations = traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 4 });

  assert.deepEqual(observations[2], {
    contact: "floor",
    damping: 0.4,
    entity: "box",
    friction: 0.25,
    gravityScale: 0.5,
    position: [0.60975, 0.55, 0],
    restitution: 0.5,
    step: 3,
    velocity: [0.3645, 1.495412, 0],
  });
});

test("physics should settle stacked primitive bodies with deterministic contact order", () => {
  const world = makeStackedBoxWorld();

  const observations = traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 2 });

  assert.deepEqual(observations.filter((observation) => observation.step === 2).map((observation) => ({ contact: observation.contact, contacts: observation.contacts, entity: observation.entity, position: observation.position })), [
    { contact: "floor", contacts: undefined, entity: "lower", position: [0, 0.55, 0] },
    { contact: "lower", contacts: undefined, entity: "upper", position: [0, 1.55, 0] },
  ]);
});

test("physics should use bounded mesh collider metadata and CCD for high-speed track contacts", () => {
  const world = makeDynamicMeshCcdWorld();

  const observations = traceRigidBodyPrimitive(world, { fixedDelta: 0.25, steps: 1 });

  assert.deepEqual(observations, [
    {
      ccd: true,
      contact: "track",
      damping: 0,
      entity: "car",
      friction: 0.4,
      gravityScale: 0,
      position: [0, 0.35, 0],
      restitution: 0,
      step: 1,
      velocity: [0, 0, 0],
    },
  ]);
});

test("physics should report portable suspension joint metadata", () => {
  const world = makeDynamicMeshCcdWorld();
  world.entities.push({
    id: "wheel.fl",
    components: {
      Collider: { kind: "sphere" as const, radius: 0.35 },
      PhysicsJoint: { axis: [0, 1, 0] as const, connectedEntity: "car", damping: 0.6, kind: "suspension" as const, stiffness: 12, travel: 0.4 },
      RigidBody: { kind: "dynamic" as const },
      Transform: { position: [-0.8, 1.2, 1.2] as const },
    },
  });

  assert.deepEqual(tracePhysicsJoints(world), [{ axis: [0, 1, 0], connectedEntity: "car", entity: "wheel.fl", kind: "suspension" }]);
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

function makeStackedBoxWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "floor",
        components: {
          Collider: { kind: "box" as const, size: [4, 0.1, 4] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "lower",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "dynamic" as const, velocity: [0, 0, 0] as const },
          Transform: { position: [0, 0.8, 0] as const },
        },
      },
      {
        id: "upper",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "dynamic" as const, velocity: [0, 0, 0] as const },
          Transform: { position: [0, 1.9, 0] as const },
        },
      },
    ],
  };
}

function makeUnorderedContactWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "zeta",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "sensor",
        components: {
          Collider: { kind: "sphere" as const, radius: 0.5, trigger: true },
          RigidBody: { kind: "static" as const },
          Transform: { position: [1.05, 0, 0] as const },
        },
      },
      {
        id: "middle",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0.1, 0, 0] as const },
        },
      },
      {
        id: "alpha",
        components: {
          Collider: { kind: "box" as const, size: [1, 1, 1] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [-0.1, 0, 0] as const },
        },
      },
    ],
  };
}

function makeFallingBoxWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "floor",
        components: {
          Collider: { friction: 0.5, kind: "box" as const, restitution: 0, size: [4, 0.1, 4] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "box",
        components: {
          Collider: { friction: 0.5, kind: "box" as const, restitution: 0, size: [1, 1, 1] as const },
          RigidBody: { gravityScale: 1, kind: "dynamic" as const, velocity: [0, 0, 0] as const },
          Transform: { position: [0, 2, 0] as const },
        },
      },
    ],
  };
}

function makeDynamicMeshCcdWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "track",
        components: {
          Collider: { friction: 0.4, kind: "mesh" as const, mesh: { bounds: { size: [8, 0.2, 16] as const }, source: "mesh.track", triangleCount: 256 }, restitution: 0 },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "car",
        components: {
          Collider: { friction: 0.4, kind: "mesh" as const, mesh: { bounds: { size: [2, 0.5, 4] as const }, source: "mesh.car", triangleCount: 128 }, restitution: 0 },
          RigidBody: { ccd: { enabled: true, maxSubsteps: 4, mode: "swept-aabb" as const }, gravityScale: 0, kind: "dynamic" as const, velocity: [0, -20, 0] as const },
          Transform: { position: [0, 3, 0] as const },
        },
      },
    ],
  };
}
