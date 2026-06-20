import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "../errors.js";
import { World } from "./World.js";
import { defineQuery } from "./query.js";
import { defineSystem, startup, update } from "./system.js";
import { defineComponent, defineEvent, defineResource, defineTag } from "./schema.js";

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

test("should declare tag components as zero-field component factories", () => {
  const Enemy = defineTag("Enemy");
  const query = defineQuery({ with: [Enemy] });
  const world = new World().spawn("enemy.1", Enemy());
  const snapshot = world.toJSON();

  assert.equal(Enemy.kind, "component");
  assert.equal(Enemy.name, "Enemy");
  assert.deepEqual(Enemy.fields, {});
  assert.deepEqual(Enemy(), { data: {}, schema: { fields: {}, kind: "component", name: "Enemy" } });
  assert.deepEqual(query.with, ["Enemy"]);
  assert.deepEqual(snapshot.componentSchemas.Enemy?.fields, {});
  assert.deepEqual(snapshot.entities[0]?.components.Enemy, {});
});

test("should reject empty tag schema names", () => {
  assert.throws(
    () => {
      defineTag(" ");
    },
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ECS_SCHEMA_NAME_EMPTY",
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

test("should serialize system ordering constraints", () => {
  const world = new World();

  world.addSystem(update("applyDamage", { after: ["collectInput"], before: ["score"] }));

  assert.deepEqual(world.toJSON().systems[0], {
    after: ["collectInput"],
    before: ["score"],
    commands: [],
    eventReads: [],
    eventWrites: [],
    name: "applyDamage",
    queries: [],
    reads: [],
    resourceReads: [],
    resourceWrites: [],
    script: undefined,
    services: [],
    schedule: "update",
    writes: [],
  });
});

test("should serialize query ordering pagination and changed filters", () => {
  const Transform = defineComponent("Transform", { position: "vec3" });
  const Health = defineComponent("Health", { current: "number" });
  const world = new World();

  world.addSystem(defineSystem({
    id: "queryChanged",
    queries: [defineQuery({ changed: [Transform], limit: 2, offset: 1, orderBy: "id", with: [Transform], without: [Health] })],
    reads: [Transform],
    stage: "update",
  }));

  assert.deepEqual(world.toJSON().systems[0]?.queries, [
    {
      changed: ["Transform"],
      limit: 2,
      offset: 1,
      orderBy: "id",
      with: ["Transform"],
      without: ["Health"],
    },
  ]);
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

test("should serialize system script source metadata", () => {
  const world = new World().addSystem(
    update("kartArcadePhysics", {
      script: {
        export: "kartArcadePhysics",
        hash: "sha256-deadbeef",
        module: "src/scripts/kartArcadePhysics.ts",
      },
      services: ["ui.read", "audio.play"],
    }),
  );

  assert.deepEqual(world.toJSON().systems[0]?.script, {
    exportName: "system_kartArcadePhysics",
    sourceRef: {
      export: "kartArcadePhysics",
      hash: "sha256-deadbeef",
      module: "src/scripts/kartArcadePhysics.ts",
      systemId: "kartArcadePhysics",
    },
  });
});

test("should reject ambiguous and invalid system script metadata", () => {
  assert.throws(
    () => update("ambiguous", { run: () => undefined, script: { export: "run", module: "src/run.ts" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ECS_SYSTEM_SCRIPT_AMBIGUOUS",
  );
  assert.throws(
    () => update("absolute", { script: { export: "run", module: "/tmp/run.ts" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ECS_SYSTEM_SCRIPT_MODULE_INVALID",
  );
  assert.throws(
    () => update("invalidExport", { script: { export: "not-valid", module: "src/run.ts" } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_ECS_SYSTEM_SCRIPT_EXPORT_INVALID",
  );
});
