import assert from "node:assert/strict";
import test from "node:test";
import type { ISystemsIr, IUiIr, IWorldIr } from "@threenative/ir";

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
  assert.equal(context.input.axis1("MoveX", { negative: "Brake", positive: "MoveForward" }), 1);
  assert.equal(context.input.pressed("Jump"), true);
  assert.equal(context.time.fixedDt, 0.016);
  assert.equal(context.time.fixedDelta({ fallback: 0.02, max: 0.01, min: 0.001 }), 0.01);
});

test("should look up entities by id deterministically", () => {
  const { context } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  const player = context.entity("player");
  const mapped = context.entities.byId({ camera: "camera.main", missing: "missing", player: "player" });

  assert.equal(player?.id, "player");
  assert.equal(mapped.player?.id, "player");
  assert.equal(mapped.camera?.id, "camera.main");
  assert.equal(mapped.missing, undefined);
});

test("should expose state and transform helper facades through existing effects", () => {
  const world = makeWorld();
  world.resources = { RallyState: { lap: 1, message: "Go" } };
  const { commands, context, resources } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });
  const player = context.entity("player");
  assert.ok(player);

  const state = context.state("RallyState", { lap: 0, message: "Ready", speed: 0 });
  state.speed = 12;
  const transform = player.transform();
  transform.setPose([1, 2, 3], [0, 0.707107, 0, 0.707107]);

  assert.deepEqual(transform.positionOr([9, 9, 9]), [0, 1, 0]);
  assert.equal(Math.round(transform.yawOr(0) * 1000) / 1000, 0);
  assert.deepEqual(resources, [{ resource: "RallyState", value: { lap: 1, message: "Go", speed: 12 } }]);
  assert.deepEqual(commands, [
    {
      component: "Transform",
      entity: "player",
      kind: "setComponent",
      source: "entity",
      value: {
        position: [1, 2, 3],
        rotation: [0, 0.707107, 0, 0.707107],
      },
    },
  ]);
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

test("should log pointer ray service call", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  const result = context.picking.pointerRay({ pointer: [0.5, 0.5] });

  assert.deepEqual(result, {
    direction: [0, 0, -1],
    hit: true,
    maxDistance: 100,
    origin: [0, 0, 4],
  });
  assert.deepEqual(services[0], {
    payload: {
      request: { pointer: [0.5, 0.5] },
      result,
    },
    service: "picking.pointerRay",
  });
});

test("should log animation play service call", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  const result = context.animation.play("player", "run", { activeState: "run", durationSeconds: 2, loop: true, sourceClip: "Armature|Run", speed: 1.25 });

  assert.deepEqual(result, {
    accepted: true,
    active: true,
    activeState: "run",
    clip: "run",
    entity: "player",
    loop: true,
    normalizedTime: 0,
    sourceClip: "Armature|Run",
    speed: 1.25,
    stopped: false,
    timeSeconds: 0,
  });
  assert.deepEqual(services[0], {
    payload: {
      request: { clip: "run", entity: "player", options: { activeState: "run", durationSeconds: 2, loop: true, sourceClip: "Armature|Run", speed: 1.25 } },
      result,
    },
    service: "animation.play",
  });
});

test("should log animation query and stop service calls", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });
  const player = context.query({ with: ["Transform"], without: [] }).find((entity) => entity.id === "player");

  assert.ok(player);
  assert.deepEqual(context.animation.query(player, "run"), {
    active: false,
    activeState: "run",
    clip: "run",
    entity: "player",
    loop: false,
    normalizedTime: 0,
    sourceClip: "run",
    speed: 0,
    stopped: true,
    stopReason: "not-found",
    timeSeconds: 0,
  });
  assert.deepEqual(context.animation.stop(player), {
    accepted: true,
    active: false,
    activeState: "",
    clip: "",
    entity: "player",
    loop: false,
    normalizedTime: 0,
    sourceClip: "",
    speed: 0,
    stopped: true,
    stopReason: "requested",
    timeSeconds: 0,
  });
  assert.deepEqual(services, [
    {
      payload: {
        request: { clip: "run", entity: "player" },
        result: { active: false, activeState: "run", clip: "run", entity: "player", loop: false, normalizedTime: 0, sourceClip: "run", speed: 0, stopped: true, stopReason: "not-found", timeSeconds: 0 },
      },
      service: "animation.query",
    },
    {
      payload: {
        request: { entity: "player" },
        result: { accepted: true, active: false, activeState: "", clip: "", entity: "player", loop: false, normalizedTime: 0, sourceClip: "", speed: 0, stopped: true, stopReason: "requested", timeSeconds: 0 },
      },
      service: "animation.stop",
    },
  ]);
});

test("should log script audio service calls", () => {
  const { context, services } = createSystemContext(makeWorld(), {
    audio: {
      schema: "threenative.audio",
      version: "0.1.0",
      music: [],
      oneShots: [{ id: "sound.hit", asset: "hit.sound", event: "DamageEvent", volume: 0.75 }],
    },
    delta: 0.016,
    fixedDelta: 0.016,
  });

  const play = context.audio.play("sound.hit", { entity: "player" });
  const stop = context.audio.stop(play.playbackId);

  assert.equal(play.playbackId, "sound.hit#1");
  assert.equal(stop.status, "stopped");
  assert.deepEqual(services, [
    {
      payload: {
        request: { options: { entity: "player" }, soundId: "sound.hit" },
        result: play,
      },
      service: "audio.play",
    },
    {
      payload: {
        request: { playbackId: "sound.hit#1" },
        result: stop,
      },
      service: "audio.stop",
    },
  ]);
});

test("should stop animation state when stop service is called", () => {
  const { context } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });

  context.animation.play("player", "run", { durationSeconds: 2, loop: true, speed: 1.5 });
  const stopped = context.animation.stop("player", "run");
  const query = context.animation.query("player", "run");

  assert.equal(stopped.accepted, true);
  assert.deepEqual(query, {
    active: false,
    activeState: "run",
    clip: "run",
    entity: "player",
    loop: true,
    normalizedTime: 0,
    sourceClip: "run",
    speed: 1.5,
    stopped: true,
    stopReason: "requested",
    timeSeconds: 0,
  });
});

test("should expose character move service call", () => {
  const world = makeWorld();
  const player = world.entities.find((entity) => entity.id === "player");
  assert.ok(player);
  player.components.Collider = { kind: "box", layer: "player", mask: ["world"], size: [0.5, 1, 0.5] };
  player.components.CharacterController = {
    blocking: true,
    grounding: "raycast",
    moveXAxis: "MoveX",
    moveZAxis: "MoveZ",
    speed: 2,
    stepOffset: 0.25,
  };
  const { context, services } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.5 });

  const result = context.character.move("player", { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta: 0.5 });

  assert.deepEqual(result, {
    desired: [1, 1, 0],
    entity: "player",
    groundEntity: "floor",
    grounded: true,
    resolved: [1, 0.55, 0],
    start: [0, 1, 0],
  });
  assert.deepEqual(services[0], {
    payload: {
      request: { entity: "player", options: { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta: 0.5 } },
      result,
    },
    service: "character.move",
  });
});

test("should expose bundle asset metadata and log asset load service calls", () => {
  const { context, services } = createSystemContext(makeWorld(), { assets: makeAssets(), delta: 0.016, fixedDelta: 0.016 });

  assert.deepEqual(context.assets.get("mesh.crate"), makeAssets().assets[0]);
  assert.deepEqual(context.assets.list(), makeAssets().assets);

  const ready = context.assets.load("mesh.crate");
  const missing = context.assets.load("mesh.missing");

  assert.deepEqual(ready, {
    accepted: true,
    asset: makeAssets().assets[0],
    id: "mesh.crate",
    status: "ready",
  });
  assert.deepEqual(missing, {
    accepted: false,
    asset: null,
    id: "mesh.missing",
    status: "missing",
  });
  assert.deepEqual(services.map((service) => service.service), ["assets.load", "assets.load"]);
  assert.deepEqual(services[0], {
    payload: {
      request: { id: "mesh.crate" },
      result: ready,
    },
    service: "assets.load",
  });
});

test("should request scene push from system", () => {
  const { context, services } = createSystemContext(makeWorld(), { currentScene: "level", delta: 0.016, fixedDelta: 0.016 });

  const current = context.scenes.current();
  const result = context.scenes.push("pause", { transition: "default" });

  assert.equal(current, "level");
  assert.deepEqual(result, { accepted: true, operation: "push", scene: "pause" });
  assert.deepEqual(services, [
    { payload: { request: {}, result: "level" }, service: "scene.current" },
    {
      payload: {
        request: { options: { transition: "default" }, scene: "pause" },
        result: { accepted: true, operation: "push", scene: "pause" },
      },
      service: "scene.push",
    },
  ]);
});

test("should expose deterministic random helpers from world seed", () => {
  const seededWorld = makeWorld();
  seededWorld.resources = { Random: { seed: "arena-1" } };
  const first = createSystemContext(seededWorld, { delta: 0.016, fixedDelta: 0.016 }).context;
  const second = createSystemContext(seededWorld, { delta: 0.016, fixedDelta: 0.016 }).context;
  const otherWorld = makeWorld();
  otherWorld.resources = { Random: { seed: "arena-2" } };
  const other = createSystemContext(otherWorld, { delta: 0.016, fixedDelta: 0.016 }).context;

  const sample = (context: typeof first) => [
    context.random.float(),
    context.random.range(10, 20),
    context.random.int(1, 6),
    context.random.bool(0.75),
    context.random.pick(["a", "b", "c"]),
  ];

  assert.deepEqual(sample(first), sample(second));
  assert.notDeepEqual(sample(createSystemContext(seededWorld, { delta: 0.016, fixedDelta: 0.016 }).context), sample(other));
});

test("should expose deterministic timer helpers from elapsed time", () => {
  const { context } = createSystemContext(makeWorld(), { delta: 0.016, elapsed: 12, fixedDelta: 0.016 });

  assert.equal(context.timers.elapsed(9.5), 2.5);
  assert.equal(context.timers.remaining(9.5, 4), 1.5);
  assert.equal(context.timers.progress(9.5, 5), 0.5);
  assert.equal(context.timers.done(9.5, 2), true);
  assert.equal(context.timers.done(9.5, 3), false);
  assert.equal(context.timers.ready(7, 5), true);
  assert.equal(context.timers.ready(8, 5), false);
  assert.equal(context.timers.progress(12, 0), 1);
});

test("should apply query ordering pagination and changed filters", () => {
  const world = makeWorld();
  world.resources = { __changed: { entities: { "enemy.b": ["Transform"], player: ["Transform"] } } };
  world.entities = [
    { components: { Transform: { position: [0, 0, 0] } }, id: "enemy.b" },
    { components: { Health: { current: 1 }, Transform: { position: [0, 0, 0] } }, id: "enemy.a" },
    { components: { Transform: { position: [0, 0, 0] } }, id: "player" },
    { components: { Transform: { position: [0, 0, 0] } }, id: "enemy.c" },
  ];
  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });

  assert.deepEqual(
    context.query({ changed: ["Transform"], limit: 1, offset: 1, orderBy: "id", with: ["Transform"], without: ["Health"] }).map((entity) => entity.id),
    ["player"],
  );
});

test("should expose persistence and settings facades over declared local data", () => {
  const world = makeWorld();
  world.resources = { Progress: { level: 2 } };
  const { context, services } = createSystemContext(world, {
    delta: 0.016,
    fixedDelta: 0.016,
    localData: {
      components: [],
      resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" } } } }],
      saveSlots: [{ appVersion: "1.0.0", id: "slot.auto", schemaVersion: 1 }],
      schema: "threenative.local-data",
      settings: [{ defaultValue: 0.5, group: "audio", key: "audio.master", kind: "number", max: 1, min: 0 }],
      version: "0.1.0",
    },
  });

  assert.deepEqual(context.persistence.listSlots(), ["slot.auto"]);
  assert.equal(context.settings.get("audio.master"), 0.5);
  assert.equal(context.settings.set("audio.master", 0.25), true);
  const saved = context.persistence.save("slot.auto");
  assert.equal(saved.accepted, true);
  assert.deepEqual(saved.record?.resources, { Progress: { level: 2 } });
  assert.equal(context.persistence.load("slot.auto").status, "loaded");
  assert.deepEqual(context.settings.export(), { "audio.master": 0.25 });

  assert.deepEqual(services.map((service) => service.service), [
    "persistence.listSlots",
    "settings.get",
    "settings.set",
    "persistence.save",
    "persistence.load",
    "settings.export",
  ]);
});

test("should expose retained UI facade over stable node IDs", () => {
  const ui = makeUi();
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016, ui });

  assert.deepEqual(context.ui.focus("settings.volume"), {
    accepted: true,
    current: "settings.volume",
    previous: "play",
    status: "focused",
  });
  assert.deepEqual(context.ui.activate("play"), {
    accepted: true,
    action: "StartGame",
    node: "play",
    status: "activated",
  });
  assert.deepEqual(context.ui.setDisabled("play", true), {
    accepted: true,
    disabled: true,
    node: "play",
    status: "updated",
  });
  assert.equal(context.ui.activate("play").status, "disabled");
  assert.deepEqual(context.ui.setValue("settings.volume", 0.75), {
    accepted: true,
    node: "settings.volume",
    status: "updated",
    value: 0.75,
  });
  assert.deepEqual(context.ui.read("settings.volume"), {
    disabled: false,
    focusable: true,
    focused: true,
    kind: "bar",
    node: "settings.volume",
    status: "found",
    value: 0.75,
  });

  assert.deepEqual(services.map((service) => service.service), [
    "ui.focus",
    "ui.activate",
    "ui.setDisabled",
    "ui.activate",
    "ui.setValue",
    "ui.read",
  ]);
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
          Camera: { far: 100, fovY: 60, kind: "perspective", near: 0.1 },
          Transform: { position: [0, 0, 4] },
        },
        id: "camera.main",
      },
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
    resources: { ActiveCamera: { entity: "camera.main" } },
    schema: "threenative.world",
    version: "0.1.0",
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

function makeAssets() {
  return {
    assets: [
      { format: "generated" as const, id: "mesh.crate", kind: "mesh" as const, primitive: "box" as const, size: [1, 1, 1] },
    ],
    schema: "threenative.assets" as const,
    version: "0.1.0" as const,
  };
}
