import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { World } from "./World.js";
import { defineSystem, startup } from "./system.js";
import { defineComponent, defineEvent, defineResource } from "./schema.js";

test("should declare ecs entity components and resources", () => {
  const Player = defineComponent("Player");
  const Health = defineComponent("Health", {
    current: "number",
    max: "number",
  });
  const GameState = defineResource("GameState", {
    phase: "string",
  });
  const DamageEvent = defineEvent("DamageEvent", {
    amount: "number",
    target: "entity",
  });

  const world = new World()
    .spawn("player", Player(), Health({ current: 100, max: 100 }))
    .addResource(GameState({ phase: "playing" }))
    .addEvent(DamageEvent);

  assert.deepEqual(world.toJSON(), {
    componentSchemas: {
      Health: {
        fields: {
          current: { kind: "number", required: true },
          max: { kind: "number", required: true },
        },
        kind: "component",
        name: "Health",
      },
      Player: {
        fields: {},
        kind: "component",
        name: "Player",
      },
    },
    entities: [
      {
        components: {
          Health: { current: 100, max: 100 },
          Player: {},
        },
        id: "player",
      },
    ],
    eventSchemas: {
      DamageEvent: {
        fields: {
          amount: { kind: "number", required: true },
          target: { kind: "entity", required: true },
        },
        kind: "event",
        name: "DamageEvent",
      },
    },
    resources: {
      GameState: { phase: "playing" },
    },
    resourceSchemas: {
      GameState: {
        fields: {
          phase: { kind: "string", required: true },
        },
        kind: "resource",
        name: "GameState",
      },
    },
    systems: [],
  });
});

test("should reject duplicate ecs component schema names", () => {
  const FirstHealth = defineComponent("Health", {
    current: "number",
  });
  const SecondHealth = defineComponent("Health", {
    value: "number",
  });

  assert.throws(
    () => {
      new World().spawn("player", FirstHealth()).spawn("enemy", SecondHealth({ value: 50 }));
    },
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ECS_COMPONENT_SCHEMA_DUPLICATE",
  );
});

test("should capture v4 primitive system declarations", () => {
  const Transform = defineComponent("Transform", {
    position: "vec3",
    rotation: "quat",
  });
  const HitEvent = defineEvent("HitEvent", {
    target: "entity",
  });
  const system = defineSystem(
    {
      eventWrites: [HitEvent],
      id: "rotateCubes",
      reads: [Transform],
      services: ["physics.raycast"],
      stage: "fixedUpdate",
      writes: [Transform],
    },
    (ctx) => {
      for (const entity of ctx.query()) {
        entity.patch(Transform, { rotation: [0, 0, 0, 1] });
      }
      ctx.events.emit(HitEvent, { target: "cube.1" });
      return ctx.physics.raycast({ direction: [0, -1, 0], maxDistance: 2, origin: [0, 1, 0] });
    },
  );

  assert.equal(system.name, "rotateCubes");
  assert.equal(system.schedule, "fixedUpdate");
  assert.deepEqual(system.eventWrites, ["HitEvent"]);
  assert.deepEqual(system.resourceReads, []);
  assert.deepEqual(system.resourceWrites, []);
  assert.deepEqual(system.services, ["physics.raycast"]);
  assert.deepEqual(system.writes, ["Transform"]);
});

test("should serialize startup system schedule", () => {
  const world = new World();

  world.addSystem(startup("loadLevel"));

  assert.equal(world.toJSON().systems[0]?.schedule, "startup");
});

test("should expose stable entity context API", () => {
  const Transform = defineComponent("Transform", {
    position: "vec3",
  });
  const system = defineSystem({ id: "moveTarget", stage: "update", writes: [Transform] }, (ctx) => {
    const entity = ctx.query()[0];
    if (entity?.has(Transform)) {
      const transform = entity.get<{ position: [number, number, number] }>(Transform);
      entity.set(Transform, { position: [transform.position[0] + ctx.time.dt, 0, 0] });
      ctx.commands.despawn(entity.id, { recursive: true });
      ctx.animation.play(entity, "move");
    }
  });

  assert.equal(system.name, "moveTarget");
  assert.equal(typeof system.run, "function");
});
