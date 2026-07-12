import assert from "node:assert/strict";
import test from "node:test";
import { commands, defineComponent, defineEvent, defineQuery, defineResource, fixedUpdate, startup, update } from "@threenative/sdk";

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

test("should emit system ordering constraints", () => {
  const first = fixedUpdate("first", { before: ["second"] });
  const second = fixedUpdate("second", { after: ["first"] });

  assert.deepEqual(systemsToIr([second, first]).systems.map((system) => ({ after: system.after, before: system.before, name: system.name })), [
    { after: undefined, before: ["second"], name: "first" },
    { after: ["first"], before: undefined, name: "second" },
  ]);
});

test("should emit prefab and hierarchy command declarations", () => {
  const system = update("spawnCrate", {
    commands: [
      commands.instantiate("prefab.crate", "runtime.crate"),
      commands.setParent("runtime.crate.root", "anchor"),
      commands.clearParent("runtime.crate.child"),
    ],
  });

  assert.deepEqual(systemsToIr([system]).systems[0]?.commands, [
    { kind: "instantiate", prefab: "prefab.crate", prefix: "runtime.crate" },
    { child: "runtime.crate.root", kind: "setParent", parent: "anchor" },
    { child: "runtime.crate.child", kind: "clearParent" },
  ]);
});

test("should emit material patch command declarations without a component field", () => {
  const system = update("hover", {
    commands: [{ entity: "piece.e4", kind: "material.patch" } as never],
  });
  assert.deepEqual(systemsToIr([system]).systems[0]?.commands, [
    { entity: "piece.e4", kind: "material.patch" },
  ]);
});

test("should emit bounded delayed command declarations", () => {
  const Health = defineComponent("Health", {
    current: "number",
  });
  const system = fixedUpdate("spawnDelayed", {
    delayedCommands: [
      {
        cancelPolicy: "drop",
        command: commands.spawn("marker", [Health]),
        id: "spawnMarker",
        maxDelayTicks: 6,
        ownership: { id: "arena", kind: "scene" },
      },
    ],
    writes: [Health],
  });

  assert.deepEqual(systemsToIr([system]).systems[0]?.delayedCommands, [
    {
      cancelPolicy: "drop",
      command: { components: ["Health"], entity: "marker", kind: "spawn" },
      id: "spawnMarker",
      maxDelayTicks: 6,
      ownership: { id: "arena", kind: "scene" },
    },
  ]);
});

test("should emit scene service declaration", () => {
  const system = update("menuActions", { services: ["scene.change", "scene.push", "scene.pop"] });

  assert.deepEqual(systemsToIr([system]).systems[0]?.services, ["scene.change", "scene.pop", "scene.push"]);
});
