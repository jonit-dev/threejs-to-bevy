import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { IPrefabsIr, ISystemsIr, IUiIr, IWorldIr } from "@threenative/ir";

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

test("should preserve transform scale when a system patches only position", async () => {
  const world: IWorldIr = {
    schema: "threenative.world",
    version: "0.1.0",
    entities: [
      {
        id: "player",
        components: {
          Transform: { position: [0, 0, 0], rotation: [0, 0.25, 0, 0.968912], scale: [2, 2, 2] },
        },
      },
    ],
  };
  const systems = makeSystems("fixedUpdate", "movePlayer");

  await runSchedule({
    module: {
      systems: {
        movePlayer(context: any) {
          for (const entity of context.query({ with: ["Transform"], without: [] })) {
            entity.patch("Transform", { position: [1, 0, 0] });
          }
        },
      },
    },
    schedule: "fixedUpdate",
    systems,
    world,
  });

  assert.deepEqual(world.entities[0]?.components.Transform, { position: [1, 0, 0], rotation: [0, 0.25, 0, 0.968912], scale: [2, 2, 2] });
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

test("should reject transform facade writes without declared Transform access", async () => {
  const world = makeWorld();
  const systems = makeSystems("update", "movePlayer");
  systems.systems[0]!.writes = [];

  const result = await runSchedule({
    module: {
      systems: {
        movePlayer(context: any) {
          context.entity("player")?.transform().setPosition([1, 0, 0]);
        },
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.equal(result.diagnostics[0]?.code, "TN_WEB_SYSTEM_WRITE_UNDECLARED");
  assert.deepEqual(world.entities[0]?.components.Transform, { position: [0, 0, 0] });
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

test("should instantiate prefab hierarchy at command flush", async () => {
  const world = makeWorld();
  world.entities[0]!.id = "anchor";
  const systems = makeSystems("update", "spawnPrefab");
  systems.systems[0]!.writes = ["Hierarchy", "Transform"];
  systems.systems[0]!.commands = [
    { kind: "instantiate", prefab: "prefab.crate", prefix: "runtime.crate" },
    { child: "runtime.crate.root", kind: "setParent", parent: "anchor" },
    { child: "runtime.crate.child", kind: "clearParent" },
  ];

  await runSchedule({
    module: {
      systems: {
        spawnPrefab(context: any) {
          context.commands.instantiate("prefab.crate", "runtime.crate");
          context.commands.setParent("runtime.crate.root", "anchor");
          context.commands.clearParent("runtime.crate.child");
        },
      },
    },
    prefabs: makePrefabs(),
    schedule: "update",
    systems,
    world,
  });

  assert.deepEqual(
    world.entities.map((entity) => ({ id: entity.id, parent: (entity.components.Hierarchy as { parent?: string } | undefined)?.parent ?? null })).sort((left, right) => left.id.localeCompare(right.id)),
    [
      { id: "anchor", parent: null },
      { id: "runtime.crate.child", parent: null },
      { id: "runtime.crate.root", parent: "anchor" },
    ],
  );
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

test("should share persistence and settings facade state across scheduled systems", async () => {
  const world = makeWorld();
  world.resources = { Progress: { level: 7 }, Report: {} };
  const systems = makeSystems("update", "saveProgress");
  systems.systems.push({
    ...systems.systems[0]!,
    after: ["saveProgress"],
    before: [],
    name: "loadProgress",
    resourceWrites: ["Report"],
    services: ["persistence.load", "settings.get"],
    script: { bundle: "scripts.bundle.js", exportName: "loadProgress" },
  });
  systems.systems[0] = {
    ...systems.systems[0]!,
    before: ["loadProgress"],
    resourceWrites: [],
    services: ["persistence.save", "settings.set"],
    script: { bundle: "scripts.bundle.js", exportName: "saveProgress" },
  };

  await runSchedule({
    localData: {
      components: [],
      resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
      saveSlots: [{ appVersion: "1.0.0", id: "slot.auto", schemaVersion: 1 }],
      schema: "threenative.local-data",
      settings: [{ defaultValue: 0.5, group: "audio", key: "audio.master", kind: "number", max: 1, min: 0 }],
      version: "0.1.0",
    },
    module: {
      systems: {
        saveProgress(context: any) {
          context.settings.set("audio.master", 0.25);
          context.persistence.save("slot.auto");
        },
        loadProgress(context: any) {
          const loaded = context.persistence.load("slot.auto");
          context.resources.set("Report", {
            level: loaded.record.resources.Progress.level,
            volume: context.settings.get("audio.master"),
          });
        },
      },
    },
    schedule: "update",
    systems,
    world,
  });

  assert.deepEqual(world.resources?.Report, { level: 7, volume: 0.25 });
});

test("should expose retained UI facade to scheduled systems", async () => {
  const world = makeWorld();
  world.resources = { UiReport: {} };
  const systems = makeSystems("update", "driveUi");
  systems.systems[0] = {
    ...systems.systems[0]!,
    resourceWrites: ["UiReport"],
    services: ["ui.activate", "ui.focus", "ui.read", "ui.setDisabled", "ui.setValue"],
    script: { bundle: "scripts.bundle.js", exportName: "driveUi" },
  };

  await runSchedule({
    module: {
      systems: {
        driveUi(context: any) {
          context.ui.focus("settings.volume");
          context.ui.setValue("settings.volume", 0.75);
          context.ui.setDisabled("play", true);
          context.resources.set("UiReport", {
            play: context.ui.activate("play").status,
            volume: context.ui.read("settings.volume").value,
          });
        },
      },
    },
    schedule: "update",
    systems,
    ui: makeUi(),
    world,
  });

  assert.deepEqual(world.resources?.UiReport, { play: "disabled", volume: 0.75 });
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

function makeUi(): IUiIr {
  return {
    focusOrder: ["play", "settings.volume"],
    root: {
      children: [
        { action: "StartGame", id: "play", kind: "button", label: "Play" },
        { focusable: true, id: "settings.volume", kind: "bar", max: 1, min: 0, value: 0.5 },
      ],
      id: "menu",
      kind: "column",
    },
    schema: "threenative.ui",
    version: "0.1.0",
  };
}

function makePrefabs(): IPrefabsIr {
  return {
    prefabs: [
      {
        entities: [
          { components: { Transform: { position: [1, 0, 0] } }, id: "root" },
          { components: { Hierarchy: { parent: "root" }, Transform: { position: [0, 1, 0] } }, id: "child" },
        ],
        id: "prefab.crate",
        root: "root",
      },
    ],
    schema: "threenative.prefabs",
    version: "0.1.0",
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
