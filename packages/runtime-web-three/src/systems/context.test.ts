import assert from "node:assert/strict";
import test from "node:test";
import type { ISystemsIr, IWorldIr } from "@threenative/ir";

import { channelEvent, componentHookObservations, createSystemContext, evaluateStates, plugin, pluginGroup, propagateObserverEvent, taskChannel } from "./context.js";

test("should expose fixed input trace", () => {
  const { context } = createSystemContext(makeWorld(), {
    delta: 0.016,
    fixedDelta: 0.016,
    input: {
      action: (name) => name === "MoveForward",
      axis: (name) => (name === "MoveX" ? 1 : 0),
      beginFrame: () => undefined,
      handleGamepadAxis: () => undefined,
      handleGamepadButton: () => undefined,
      handleKeyDown: () => undefined,
      handleKeyUp: () => undefined,
      handlePointerDown: () => undefined,
      handlePointerMove: () => undefined,
      handlePointerUp: () => undefined,
      handleTouchAxis: () => undefined,
      handleTouchControl: () => undefined,
      pressed: (name) => name === "Jump",
      released: () => false,
    },
  });

  assert.equal(context.input.action("MoveForward"), true);
  assert.equal(context.input.axis("MoveX"), 1);
  assert.equal(context.input.pressed("Jump"), true);
  assert.equal(context.time.fixedDt, 0.016);
});

test("should raycast primitive floor", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  const result = context.physics.raycast({
    direction: [0, -1, 0],
    maxDistance: 2,
    origin: [0, 1, 0],
  });

  assert.deepEqual(result, {
    distance: 0.95,
    entity: "floor",
    hit: true,
    normal: [0, 1, 0],
    point: [0, 0.05, 0],
  });
  assert.deepEqual(services[0], {
    payload: {
      request: { direction: [0, -1, 0], maxDistance: 2, origin: [0, 1, 0] },
      result,
    },
    service: "physics.raycast",
  });
});

test("should log v7 physics query service calls", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  const overlap = context.physics.overlap({
    layer: "player",
    mask: ["world"],
    position: [0, 0.5, 0],
    shape: { kind: "sphere", radius: 0.75 },
  });
  const shapeCast = context.physics.shapeCast({
    direction: [0, -1, 0],
    maxDistance: 2,
    origin: [0, 1, 0],
    shape: { halfExtents: [0.25, 0.25, 0.25], kind: "box" },
  });

  assert.deepEqual(overlap, { entities: ["floor"] });
  assert.equal(shapeCast.hit, true);
  assert.deepEqual(services.map((service) => service.service), ["physics.overlap", "physics.shapeCast"]);
  assert.deepEqual(services[0]?.payload, {
    request: { layer: "player", mask: ["world"], position: [0, 0.5, 0], shape: { kind: "sphere", radius: 0.75 } },
    result: overlap,
  });
});

test("should log mesh picking service call", () => {
  const { context, services } = createSystemContext(makeWorld(), { assets: makeAssets(), delta: 0.016, fixedDelta: 0.016 });

  const result = context.picking.mesh({
    direction: [0, 0, -1],
    maxDistance: 10,
    origin: [0, 0, 2],
  });

  assert.deepEqual(result, {
    distance: 1.5,
    entity: "crate",
    hit: true,
    normal: [0, 0, 1],
    point: [0, 0, 0.5],
  });
  assert.deepEqual(services[0], {
    payload: {
      request: { direction: [0, 0, -1], maxDistance: 10, origin: [0, 0, 2] },
      result,
    },
    service: "picking.mesh",
  });
});

test("should log animation play service call", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  context.animation.play("player", "run", { loop: true });

  assert.deepEqual(services[0], {
    payload: {
      request: { clip: "run", entity: "player", options: { loop: true } },
      result: { accepted: true },
    },
    service: "animation.play",
  });
});

test("should expose resource-derived app states, computed states, and substates", () => {
  const world: IWorldIr = {
    entities: [],
    resources: {
      GameState: { difficulty: "danger", locomotion: "airborne", phase: "playing" },
    },
    schema: "threenative.world",
    version: "0.1.0",
  };
  const systems: ISystemsIr = {
    lifecycle: {
      appStates: [{ id: "Game", initial: "boot", source: { field: "phase", resource: "GameState" }, values: ["boot", "playing"] }],
      computedStates: [{ fallback: "safe", id: "Difficulty", source: { field: "difficulty", resource: "GameState" }, values: ["safe", "danger"] }],
      hotReload: "invalidate",
      replay: "fixed-trace",
      state: "system-local-disallowed",
      substates: [{ fallback: "grounded", id: "Locomotion", parent: "Game", parentValue: "playing", source: { field: "locomotion", resource: "GameState" }, values: ["grounded", "airborne"] }],
    },
    schema: "threenative.systems",
    systems: [],
    version: "0.1.0",
  };

  assert.deepEqual(evaluateStates(world, systems), {
    Difficulty: "danger",
    Game: "playing",
    Locomotion: "airborne",
  });

  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, systems });

  assert.equal(context.states.get("Game"), "playing");
  assert.equal(context.states.get("Difficulty"), "danger");
  assert.equal(context.states.get("Locomotion"), "airborne");
  assert.equal(context.states.get("Missing"), null);
});

test("should expose deterministic observer propagation routes", () => {
  const world: IWorldIr = {
    entities: [
      { components: {}, id: "root" },
      { components: { Hierarchy: { parent: "root" } }, id: "player" },
      { components: { Hierarchy: { parent: "player" } }, id: "weapon" },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const systems: ISystemsIr = {
    observers: [{ event: "DamageEvent", phases: ["target", "bubble"], propagation: "target-ancestors" }],
    schema: "threenative.systems",
    systems: [],
    version: "0.1.0",
  };

  assert.deepEqual(propagateObserverEvent(world, systems, "DamageEvent", "weapon"), [
    { entity: "weapon", phase: "target" },
    { entity: "player", phase: "bubble" },
    { entity: "root", phase: "bubble" },
  ]);
  assert.deepEqual(propagateObserverEvent(world, systems, "MissingEvent", "weapon"), []);

  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, systems });

  assert.deepEqual(context.observers.propagate("DamageEvent", "weapon"), [
    { entity: "weapon", phase: "target" },
    { entity: "player", phase: "bubble" },
    { entity: "root", phase: "bubble" },
  ]);
});

test("should expose deterministic component hook observations", () => {
  const world: IWorldIr = {
    entities: [
      { components: { Health: { current: 10 } }, id: "player" },
      { components: { Transform: { position: [0, 0, 0] } }, id: "light" },
      { components: { Health: { current: 3 } }, id: "enemy" },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const systems: ISystemsIr = {
    componentHooks: [{ component: "Health", hooks: ["onAdd", "onInsert"] }],
    schema: "threenative.systems",
    systems: [],
    version: "0.1.0",
  };

  assert.deepEqual(componentHookObservations(world, systems, "Health"), [
    { component: "Health", entity: "player", hook: "onAdd" },
    { component: "Health", entity: "player", hook: "onInsert" },
    { component: "Health", entity: "enemy", hook: "onAdd" },
    { component: "Health", entity: "enemy", hook: "onInsert" },
  ]);
  assert.deepEqual(componentHookObservations(world, systems, "Missing"), []);

  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, systems });

  assert.deepEqual(context.components.hooks("Health"), [
    { component: "Health", entity: "player", hook: "onAdd" },
    { component: "Health", entity: "player", hook: "onInsert" },
    { component: "Health", entity: "enemy", hook: "onAdd" },
    { component: "Health", entity: "enemy", hook: "onInsert" },
  ]);
});

test("should expose component reflection metadata", () => {
  const { context } = createSystemContext(makeWorld(), {
    componentSchemas: {
      schema: "threenative.component-schemas",
      schemas: {
        Transform: {
          fields: {
            position: { default: [0, 0, 0], kind: "vec3", required: false },
          },
        },
        Health: {
          fields: {
            current: { kind: "number", required: true },
          },
        },
      },
      version: "0.1.0",
    },
    delta: 0.016,
    fixedDelta: 0.016,
  });

  assert.deepEqual(context.components.types().components.map((type) => type.id), ["Health", "Transform"]);
  assert.deepEqual(context.components.type("Health"), {
    fields: [{ kind: "number", name: "current", required: true }],
    id: "Health",
  });
  assert.equal(context.components.type("Missing"), null);
});

test("should expose fixed-trace task metadata and event-backed channels", () => {
  const world: IWorldIr = {
    entities: [],
    events: {
      LifecycleEvent: [{ phase: "booted" }],
    },
    schema: "threenative.world",
    version: "0.1.0",
  };
  const systems: ISystemsIr = {
    channels: [{ delivery: "fixed-trace", event: "LifecycleEvent", id: "lifecycle" }],
    schema: "threenative.systems",
    systems: [],
    tasks: [{ channel: "lifecycle", id: "handoff", mode: "fixed-trace", schedule: "update" }],
    version: "0.1.0",
  };

  assert.equal(channelEvent(systems, "lifecycle"), "LifecycleEvent");
  assert.equal(taskChannel(systems, "handoff"), "lifecycle");

  const { context, events } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, systems });

  assert.deepEqual(context.channels.read("lifecycle"), [{ phase: "booted" }]);
  assert.deepEqual(context.channels.read("missing"), []);
  assert.equal(context.tasks.has("handoff"), true);
  assert.equal(context.tasks.channel("handoff"), "lifecycle");
  assert.deepEqual(context.tasks.list(), [{ channel: "lifecycle", id: "handoff", mode: "fixed-trace", schedule: "update" }]);

  context.channels.send("lifecycle", { phase: "updated" });
  context.channels.send("missing", { ignored: true });

  assert.deepEqual(events, [{ event: "LifecycleEvent", payload: { phase: "updated" } }]);
});

test("should expose portable plugin composition metadata", () => {
  const systems: ISystemsIr = {
    pluginGroups: [{ id: "gameplay", plugins: ["core"] }],
    plugins: [{ id: "core", systems: ["boot", "update"] }],
    schema: "threenative.systems",
    systems: [],
    version: "0.1.0",
  };

  assert.deepEqual(plugin(systems, "core"), { id: "core", systems: ["boot", "update"] });
  assert.deepEqual(pluginGroup(systems, "gameplay"), { id: "gameplay", plugins: ["core"] });

  const { context } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016, systems });

  assert.equal(context.plugins.has("core"), true);
  assert.equal(context.plugins.has("missing"), false);
  assert.deepEqual(context.plugins.list(), [{ id: "core", systems: ["boot", "update"] }]);
  assert.deepEqual(context.plugins.group("gameplay"), { id: "gameplay", plugins: ["core"] });
  assert.equal(context.plugins.group("missing"), null);
});

function makeWorld(): IWorldIr {
  return {
    entities: [
      {
        components: {
          Collider: { kind: "box", layer: "world", mask: ["player"], size: [8, 0.1, 8] },
          Transform: { position: [0, 0, 0] },
        },
        id: "floor",
      },
      {
        components: {
          Transform: { position: [0, 1, 0] },
        },
        id: "player",
      },
      {
        components: {
          MeshRenderer: { material: "mat.crate", mesh: "mesh.crate" },
          Transform: { position: [0, 0, 0] },
        },
        id: "crate",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
}

function makeAssets() {
  return {
    assets: [
      { format: "generated" as const, id: "mesh.crate", kind: "mesh" as const, primitive: "box" as const, size: [1, 1, 1] },
    ],
    schema: "threenative.assets" as const,
    version: "0.1.0" as const,
  };
}
