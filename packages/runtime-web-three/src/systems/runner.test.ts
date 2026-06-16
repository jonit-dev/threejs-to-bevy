import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { ISystemsIr, IWorldIr } from "@threenative/ir";

import { loadSystemModule, runSchedule } from "./runner.js";

test("should run systems move entity during fixed update", async () => {
  const world = makeWorld();
  const systems = makeSystems("fixedUpdate", "movePlayer");

  await runSchedule({
    module: {
      systems: {
        movePlayer(context: any) {
          for (const entity of context.query({ with: ["Transform"], without: [] })) {
            const transform = entity.get("Transform");
            entity.patch("Transform", { position: [transform.position[0] + 2, 0, 0] });
          }
        },
      },
    },
    schedule: "fixedUpdate",
    systems,
    world,
  });

  assert.deepEqual(world.entities[0]?.components.Transform, { position: [2, 0, 0] });
});

test("should provide declared query snapshots", async () => {
  const world = makeWorld();
  world.entities.push({ id: "hidden", components: { Health: { value: 1 } } });
  const systems = makeSystems("update", "readPlayers");
  const seen: string[] = [];

  await runSchedule({
    module: {
      systems: {
        readPlayers(context: any) {
          for (const entity of context.query()) {
            seen.push(entity.id);
            assert.throws(() => {
              entity.components.Transform.position[0] = 99;
            });
          }
        },
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.deepEqual(seen, ["player"]);
  assert.deepEqual(world.entities[0]?.components.Transform, { position: [0, 0, 0] });
});

test("should reject undeclared component patch", async () => {
  const world = makeWorld();
  const systems = makeSystems("update", "patchHealth");
  systems.systems[0]!.writes = ["Transform"];

  const result = await runSchedule({
    module: {
      systems: {
        patchHealth(context: any) {
          context.query()[0].patch("Health", { value: 1 });
        },
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.equal(result.diagnostics[0]?.code, "TN_WEB_SYSTEM_WRITE_UNDECLARED");
  assert.equal(world.entities[0]?.components.Health, undefined);
});

test("should run systems apply despawn command after schedule", async () => {
  const world = makeWorld();
  const systems = makeSystems("update", "removePlayer");
  systems.systems[0]!.commands = [{ entity: "player", kind: "despawn" }];

  await runSchedule({
    module: {
      systems: {
        removePlayer(context: any) {
          for (const entity of context.query({ with: ["Transform"], without: [] })) {
            context.commands.despawn(entity.id);
          }
        },
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.deepEqual(world.entities, []);
});

test("should run systems expose resources events and input context", async () => {
  const world = makeWorld();
  world.resources = { Score: { value: 1 } };
  world.events = { DamageEvent: [{ amount: 2 }] };
  const systems = makeSystems("update", "useContext");
  systems.systems[0]!.eventWrites = ["DamageEvent"];
  systems.systems[0]!.resourceWrites = ["Score"];

  await runSchedule({
    module: {
      systems: {
        useContext(context: any) {
          const score = context.resources.get("Score");
          context.resources.set("Score", { value: score.value + context.events.read("DamageEvent")[0].amount });
          context.events.emit("DamageEvent", { amount: context.input.axis("x") });
          assert.equal(context.input.action("fire"), false);
        },
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.deepEqual(world.resources.Score, { value: 3 });
  assert.deepEqual(world.events.DamageEvent, [{ amount: 2 }, { amount: 0 }]);
});

test("should run systems apply full command buffer semantics", async () => {
  const world = makeWorld();
  const systems = makeSystems("update", "useCommands");
  systems.systems[0]!.commands = [
    { components: ["Transform"], entity: "enemy", kind: "spawn" },
    { component: "Health", entity: "player", kind: "addComponent" },
    { component: "Transform", entity: "player", kind: "removeComponent" },
    { event: "Spawned", kind: "emitEvent" },
  ];

  await runSchedule({
    module: {
      systems: {
        useCommands(context: any) {
          context.commands.spawn("enemy", { Transform: { position: [5, 0, 0] } });
          context.commands.addComponent("player", "Health", { current: 10, max: 10 });
          context.commands.removeComponent("player", "Transform");
          context.commands.emitEvent("Spawned", { entity: "enemy" });
        },
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.deepEqual(world.entities, [
    {
      id: "player",
      components: {
        Health: { current: 10, max: 10 },
      },
    },
    {
      id: "enemy",
      components: {
        Transform: { position: [5, 0, 0] },
      },
    },
  ]);
  assert.deepEqual(world.events, { Spawned: [{ entity: "enemy" }] });
});

test("should reconcile spawned entities and events across later schedules", async () => {
  const world = makeWorld();
  world.resources = { Score: { value: 0 } };
  const systems = makeSystems("update", "placeholder");
  systems.systems = [
    {
      ...systems.systems[0]!,
      commands: [
        { components: ["Health"], entity: "marker", kind: "spawn" },
        { event: "Spawned", kind: "emitEvent" },
      ],
      eventWrites: ["Spawned"],
      name: "seedMarker",
      queries: [],
      reads: [],
      schedule: "startup",
      script: { bundle: "scripts.bundle.js", exportName: "seedMarker" },
      writes: [],
    },
    {
      ...systems.systems[0]!,
      commands: [{ entity: "marker", kind: "despawn" }],
      eventReads: ["Spawned"],
      name: "consumeMarker",
      queries: [{ with: ["Health"], without: [] }],
      reads: ["Health"],
      resourceWrites: ["Score"],
      schedule: "update",
      script: { bundle: "scripts.bundle.js", exportName: "consumeMarker" },
      writes: [],
    },
  ];

  const module = {
    systems: {
      seedMarker(context: any) {
        context.commands.spawn("marker", { Health: { current: 1 } });
        context.events.emit("Spawned", { via: "direct" });
        context.commands.emitEvent("Spawned", { via: "command" });
      },
      consumeMarker(context: any) {
        const marker = context.query({ with: ["Health"], without: [] })[0];
        context.resources.set("Score", {
          events: context.events.read("Spawned").length,
          health: marker.get("Health").current,
        });
        context.commands.despawn(marker.id);
      },
    },
  };

  await runSchedule({ module, schedule: "startup", systems, world });
  await runSchedule({ module, schedule: "update", systems, world });

  assert.equal(world.entities.find((entity) => entity.id === "marker"), undefined);
  assert.deepEqual(world.resources.Score, { events: 2, health: 1 });
  assert.deepEqual(world.events, { Spawned: [{ via: "direct" }, { via: "command" }] });
});

test("should run systems using before and after ordering constraints", async () => {
  const world = makeWorld();
  world.resources = { Order: { values: [] } };
  const systems = makeSystems("update", "placeholder");
  systems.systems = [
    { ...systems.systems[0]!, name: "score", resourceReads: ["Order"], resourceWrites: ["Order"], script: { bundle: "scripts.bundle.js", exportName: "score" } },
    {
      ...systems.systems[0]!,
      after: ["collectInput"],
      before: ["score"],
      name: "applyDamage",
      resourceReads: ["Order"],
      resourceWrites: ["Order"],
      script: { bundle: "scripts.bundle.js", exportName: "applyDamage" },
    },
    {
      ...systems.systems[0]!,
      before: ["applyDamage"],
      name: "collectInput",
      resourceReads: ["Order"],
      resourceWrites: ["Order"],
      script: { bundle: "scripts.bundle.js", exportName: "collectInput" },
    },
  ];

  const pushOrder = (context: any, value: string) => {
    const order = context.resources.get("Order");
    context.resources.set("Order", { values: [...order.values, value] });
  };

  await runSchedule({
    module: {
      systems: {
        applyDamage: (context: any) => pushOrder(context, "applyDamage"),
        collectInput: (context: any) => pushOrder(context, "collectInput"),
        score: (context: any) => pushOrder(context, "score"),
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.deepEqual(world.resources.Order, { values: ["collectInput", "applyDamage", "score"] });
});

test("should run systems expose v4 entity patch context", async () => {
  const world = makeWorld();
  const systems = makeSystems("fixedUpdate", "patchPlayer");

  await runSchedule({
    elapsed: 1,
    fixedDelta: 1 / 30,
    module: {
      systems: {
        patchPlayer(context: any) {
          for (const entity of context.query()) {
            assert.equal(entity.has("Transform"), true);
            const transform = entity.get("Transform");
            entity.patch("Transform", { position: [transform.position[0] + context.time.fixedDt, 0, 0] });
          }
        },
      },
    },
    schedule: "fixedUpdate",
    systems,
    world,
  });

  assert.deepEqual(world.entities[0]?.components.Transform, { position: [1 / 30, 0, 0] });
});

test("should run systems load scripts bundle module", async () => {
  const root = await mkdtemp(join(tmpdir(), "tn-web-systems-"));
  try {
    await writeFile(
      join(root, "scripts.bundle.js"),
      "export const systems = Object.freeze({ movePlayer: (context) => context.commands.despawn('player') });\n",
    );

    const module = await loadSystemModule(root, {
      schema: "threenative.bundle",
      version: "0.1.0",
      name: "systems-test",
      requiredCapabilities: {},
      entry: {
        scripts: "scripts.bundle.js",
        world: "world.ir.json",
      },
      files: {
        assets: "assets.manifest.json",
        materials: "materials.ir.json",
        targetProfile: "target.profile.json",
      },
    });

    assert.equal(typeof module.systems?.movePlayer, "function");
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});

function makeWorld(): IWorldIr {
  return {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "player",
        components: {
          Transform: { position: [0, 0, 0] },
        },
      },
    ],
  };
}

function makeSystems(schedule: "fixedUpdate" | "postUpdate" | "startup" | "update", exportName: string): ISystemsIr {
  return {
    schema: "threenative.systems",
    version: "0.1.0",
    systems: [
      {
        commands: [],
        eventReads: [],
        eventWrites: [],
        name: exportName,
        queries: [{ with: ["Transform"], without: [] }],
        reads: ["Transform"],
        resourceReads: [],
        resourceWrites: [],
        services: [],
        schedule,
        script: { bundle: "scripts.bundle.js", exportName },
        writes: ["Transform"],
      },
    ],
  };
}
