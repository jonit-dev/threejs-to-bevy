import assert from "node:assert/strict";
import test from "node:test";
import { World, defineComponent, defineEvent, defineResource } from "@threenative/sdk";

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
