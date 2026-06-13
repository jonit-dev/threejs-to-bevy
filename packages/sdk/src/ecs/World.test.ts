import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { World } from "./World.js";
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
