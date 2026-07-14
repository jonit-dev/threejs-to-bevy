import assert from "node:assert/strict";
import test from "node:test";

import type { IWorldIr } from "@threenative/ir";

import { createPhysicsSensorRuntimeState, tracePhysicsSensors } from "./sensors.js";

test("physics sensors should emit enter stay and exit phases with occupants", () => {
  const world = sensorWorld();

  assert.deepEqual(tracePhysicsSensors(world, { fixedDelta: 1, steps: 3 }), [
    { filteredOut: [], interactionKind: "pickup", occupants: ["player"], phase: "enter", sensor: "zone", step: 1 },
    { filteredOut: [], interactionKind: "pickup", occupants: ["player"], phase: "stay", sensor: "zone", step: 2 },
    { filteredOut: [], interactionKind: "pickup", occupants: ["player"], phase: "exit", sensor: "zone", step: 3 },
  ]);
});

test("physics sensor runtime should emit enter once and stay on later ticks", () => {
  const world = sensorWorld();
  const runtime = createPhysicsSensorRuntimeState();

  assert.deepEqual(runtime.advance(world, { fixedDelta: 1, tick: 1 }).map((event) => event.phase), ["enter"]);
  assert.deepEqual(runtime.advance(world, { fixedDelta: 1, tick: 1 }).map((event) => event.phase), ["enter"]);
  assert.deepEqual(runtime.advance(world, { fixedDelta: 1, tick: 2 }).map((event) => event.phase), ["stay"]);
  const player = world.entities.find((entity) => entity.id === "player");
  assert.ok(player?.components.Transform);
  player.components.Transform.position = [2, 0, 0];
  assert.deepEqual(runtime.advance(world, { fixedDelta: 1, tick: 3 }).map((event) => event.phase), ["exit"]);
});

test("physics sensors should ignore transform-only occupants", () => {
  const world = sensorWorld();
  world.entities.push({ id: "camera", components: { Transform: { position: [0, 0, 0] } } });

  const events = tracePhysicsSensors(world, { fixedDelta: 0, steps: 1 });

  assert.deepEqual(events.flatMap((event) => event.occupants), ["player"]);
});

test("physics sensors should apply rotated local collider centers", () => {
  const world = sensorWorld();
  const zone = world.entities.find((entity) => entity.id === "zone");
  const player = world.entities.find((entity) => entity.id === "player");
  assert.ok(zone?.components.Collider);
  assert.ok(zone.components.Transform);
  assert.ok(player?.components.Transform);
  zone.components.Collider.center = [1, 0, 0];
  zone.components.Collider.size = [0.5, 0.5, 0.5];
  zone.components.Transform.rotation = [0, 0, Math.SQRT1_2, Math.SQRT1_2];
  player.components.RigidBody = { kind: "kinematic" };
  player.components.Transform.position = [0, 1, 0];

  const events = tracePhysicsSensors(world, { fixedDelta: 0, steps: 1 });

  assert.deepEqual(events.map((event) => [event.phase, event.occupants]), [["enter", ["player"]]]);
});

test("physics sensor startup sampling should not reuse the fixed tick cache", () => {
  const world = sensorWorld();
  const runtime = createPhysicsSensorRuntimeState();
  const player = world.entities.find((entity) => entity.id === "player");
  assert.ok(player?.components.Transform);
  player.components.Transform.position = [3, 0, 0];
  assert.deepEqual(runtime.advance(world, { phase: "startup", tick: 0 }), []);

  player.components.Transform.position = [0, 0, 0];

  assert.deepEqual(runtime.advance(world, { phase: "fixed", tick: 0 }).map((event) => event.phase), ["enter"]);
});

function sensorWorld(): IWorldIr {
  return {
    schema: "threenative.world" as const,
    version: "0.1.0" as const,
    entities: [
      {
        id: "zone",
        components: {
          Collider: { kind: "box" as const, layer: "sensor", mask: ["player"], sensor: { interactionKind: "pickup", occupantLimit: 2, phases: ["enter", "stay", "exit"], trackOccupants: true }, size: [2, 2, 2] as const },
          RigidBody: { kind: "static" as const },
          Transform: { position: [0, 0, 0] as const },
        },
      },
      {
        id: "player",
        components: {
          Collider: { kind: "box" as const, layer: "player", size: [1, 1, 1] as const },
          RigidBody: { kind: "kinematic" as const, velocity: [1.1, 0, 0] as const },
          Transform: { position: [-1.5, 0, 0] as const },
        },
      },
    ],
  };
}
