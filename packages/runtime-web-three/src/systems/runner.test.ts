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
            entity.components.Transform.position[0] += 2;
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

test("should run systems apply despawn command after schedule", async () => {
  const world = makeWorld();
  const systems = makeSystems("update", "removePlayer");

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

function makeSystems(schedule: "fixedUpdate" | "update", exportName: string): ISystemsIr {
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
        services: [],
        schedule,
        script: { bundle: "scripts.bundle.js", exportName },
        writes: ["Transform"],
      },
    ],
  };
}
