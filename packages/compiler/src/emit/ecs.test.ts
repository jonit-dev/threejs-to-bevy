import assert from "node:assert/strict";
import test from "node:test";
import { World, defineComponent, defineEvent, defineResource } from "@threenative/sdk";

import { CompilerError } from "../errors.js";
import { ecsToIr } from "./ecs.js";

test("should emit ecs health and damage schemas", () => {
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

  const emitted = ecsToIr(
    new World()
      .spawn("player", Health({ current: 100, max: 100 }))
      .addResource(GameState({ phase: "playing" }))
      .addEvent(DamageEvent),
  );

  assert.deepEqual(Object.keys(emitted.componentSchemas.schemas), ["Health"]);
  assert.deepEqual(Object.keys(emitted.eventSchemas.schemas), ["DamageEvent"]);
  assert.deepEqual(Object.keys(emitted.resourceSchemas.schemas), ["GameState"]);
  assert.deepEqual(emitted.world.entities[0]?.components.Health, { current: 100, max: 100 });
});

test("should preserve authored resource field kinds when inferred script access is less specific", () => {
  const emitted = ecsToIr({
    toJSON: () => ({
      componentSchemas: {},
      entities: [],
      eventSchemas: {},
      resources: { RallyState: { hud: "Ready", speed: 0 } },
      resourceSchemas: { RallyState: { fields: { hud: { kind: "string" }, speed: { kind: "number" } } } },
      systems: [{
        commands: [],
        eventReads: [],
        eventWrites: [],
        name: "rally",
        queries: [],
        reads: [],
        resourceReads: ["RallyState"],
        resourceWrites: ["RallyState"],
        services: [],
        script: {
          exportName: "updateRally",
          source: `export function updateRally(context: any) {\n  const state = context.resources.get("RallyState", { hud: "Ready", speed: 0 });\n  context.resources.patch("RallyState", { hud: buildHud(state.speed), speed: Math.round(state.speed) });\n}\nfunction buildHud(value: number): string { return String(value); }`,
        },
        schedule: "fixedUpdate",
        writes: [],
      }],
    }),
  });

  assert.deepEqual(emitted.resourceSchemas.schemas.RallyState, {
    fields: { hud: { kind: "string" }, speed: { kind: "number" } },
  });
});

test("should expand tag selectors against authored world entities", () => {
  const emitted = ecsToIr({
    toJSON: () => ({
      componentSchemas: {},
      entities: [
        { components: {}, id: "orb.02", tags: ["orb"] },
        { components: {}, id: "orb.01", tags: ["orb"] },
        { components: {}, id: "player", tags: ["player"] },
      ],
      eventSchemas: {},
      resources: {},
      resourceSchemas: {},
      systems: [{
        commands: [{ kind: "despawn", tag: "orb" }],
        eventReads: [],
        eventWrites: [],
        name: "collect",
        queries: [],
        reads: [],
        resourceReads: [],
        resourceWrites: [],
        services: [],
        schedule: "fixedUpdate",
        writes: [],
      }],
    }),
  });

  assert.deepEqual(emitted.systems.systems[0]?.commands, [
    { entity: "orb.01", kind: "despawn" },
    { entity: "orb.02", kind: "despawn" },
  ]);
  assert.deepEqual(emitted.world.entities.find((entity) => entity.id === "orb.01")?.tags, ["orb"]);

  assert.throws(
    () => ecsToIr({
      toJSON: () => ({
        componentSchemas: {},
        entities: [{ components: {}, id: "player" }],
        eventSchemas: {},
        resources: {},
        resourceSchemas: {},
        systems: [{
          commands: [{ kind: "despawn", tag: "orb" }],
          eventReads: [],
          eventWrites: [],
          name: "collect",
          queries: [],
          reads: [],
          resourceReads: [],
          resourceWrites: [],
          services: [],
          schedule: "fixedUpdate",
          writes: [],
        }],
      }),
    }),
    (error: unknown) => error instanceof CompilerError && error.code === "TN_IR_SYSTEM_COMMAND_SELECTOR_INVALID",
  );
});

test("should allow exact lifecycle commands for an entity produced by the same system", () => {
  const emitted = ecsToIr({
    toJSON: () => ({
      componentSchemas: {},
      entities: [],
      eventSchemas: {},
      resources: {},
      resourceSchemas: {},
      systems: [{
        commands: [
          { kind: "instantiate", prefab: "projectile.prefab", prefix: "projectile.runtime.0001" },
          { entity: "projectile.runtime.0001.root", kind: "despawn" },
        ],
        eventReads: [],
        eventWrites: [],
        name: "projectile",
        queries: [],
        reads: [],
        resourceReads: [],
        resourceWrites: [],
        services: [],
        schedule: "fixedUpdate",
        writes: [],
      }],
    }),
  });

  assert.deepEqual(emitted.systems.systems[0]?.commands, [
    { kind: "instantiate", prefab: "projectile.prefab", prefix: "projectile.runtime.0001" },
    { entity: "projectile.runtime.0001.root", kind: "despawn" },
  ]);
});

test("should reject dynamic lifecycle commands outside the same system's exact instantiate prefixes", () => {
  assert.throws(
    () => ecsToIr({
      toJSON: () => ({
        componentSchemas: {},
        entities: [],
        eventSchemas: {},
        resources: {},
        resourceSchemas: {},
        systems: [{
          commands: [
            { kind: "instantiate", prefab: "projectile.prefab", prefix: "projectile.runtime.0001" },
            { entity: "projectile.runtime.other.root", kind: "despawn" },
          ],
          eventReads: [],
          eventWrites: [],
          name: "projectile",
          queries: [],
          reads: [],
          resourceReads: [],
          resourceWrites: [],
          services: [],
          schedule: "fixedUpdate",
          writes: [],
        }],
      }),
    }),
    (error: unknown) => error instanceof CompilerError && error.code === "TN_IR_SYSTEM_COMMAND_SELECTOR_INVALID",
  );
});
