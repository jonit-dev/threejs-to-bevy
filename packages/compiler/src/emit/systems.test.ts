import assert from "node:assert/strict";
import test from "node:test";
import { commands, defineComponent, defineEvent, defineQuery, defineResource, fixedUpdate, startup } from "@threenative/sdk";

import { systemsToIr } from "./systems.js";

test("should emit ecs fixed update system access", () => {
  const Health = defineComponent("Health", {
    current: "number",
  });
  const DamageEvent = defineEvent("DamageEvent", {
    amount: "number",
    target: "entity",
  });
  const Score = defineResource("Score", {
    value: "number",
  });
  const system = fixedUpdate("applyDamage", {
    commands: [commands.setComponent("target", Health), commands.emitEvent(DamageEvent)],
    eventReads: [DamageEvent],
    eventWrites: [DamageEvent],
    queries: [defineQuery({ with: [Health] })],
    reads: [Health],
    resourceReads: [Score],
    resourceWrites: [Score],
    writes: [Health],
  });

  assert.deepEqual(systemsToIr([system]), {
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [
      {
        commands: [
          {
            component: "Health",
            entity: "target",
            kind: "setComponent",
          },
          {
            event: "DamageEvent",
            kind: "emitEvent",
          },
        ],
        eventReads: ["DamageEvent"],
        eventWrites: ["DamageEvent"],
        name: "applyDamage",
        queries: [{ with: ["Health"], without: [] }],
        reads: ["Health"],
        resourceReads: ["Score"],
        resourceWrites: ["Score"],
        services: [],
        schedule: "fixedUpdate",
        writes: ["Health"],
      },
    ],
  });
});

test("should emit ecs startup system schedule", () => {
  const system = startup("loadLevel");

  assert.deepEqual(systemsToIr([system]).systems[0]?.schedule, "startup");
});
