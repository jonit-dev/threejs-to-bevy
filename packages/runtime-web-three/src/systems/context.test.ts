import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { ISystemsIr, IUiIr, IWorldIr } from "@threenative/ir";
import * as THREE from "three";

import { applyCommands, channelEvent, componentHookObservations, createSystemContext, createWebSystemRuntimeState, evaluateStates, plugin, pluginGroup, propagateObserverEvent, taskChannel } from "./context.js";
import { applySystemEffects } from "./effects.js";
import { applyMaterialPatchEffects, mapWorld } from "../mapWorld.js";
import { createMemoryPersistenceStorage, createWebPersistenceService } from "./services/persistence.js";
import { createInputState } from "../input.js";
import { initializePhysicsRuntime } from "../physics.js";

const pendingWritesFixture = JSON.parse(readFileSync(new URL("../../../ir/fixtures/contracts/scripting/pending-writes.json", import.meta.url), "utf8")) as {
  entity: IWorldIr["entities"][number];
  expected: {
    componentReads: Array<Record<string, unknown>>;
    effectOrder: string[];
    inputTicks: Array<{ action: boolean; pressed: boolean; released: boolean }>;
    positionReads: number[][];
  };
};

test("should apply material patch command to entity material and log effect", () => {
  const world = makeWorld();
  world.entities.find((entity) => entity.id === "player")!.components.MeshRenderer = { material: "mat.player", mesh: "mesh.player" };
  const mapped = mapWorld({
    assets: { schema: "threenative.assets", version: "0.1.0", assets: [{ id: "mesh.player", kind: "mesh", format: "generated", primitive: "box", size: [1, 1, 1] }] },
    manifest: { schema: "threenative.bundle", version: "0.1.0", name: "patch", requiredCapabilities: {}, entry: { world: "world.ir.json" }, files: { assets: "assets.manifest.json", materials: "materials.ir.json", targetProfile: "target.profile.json" } },
    materials: { schema: "threenative.materials", version: "0.1.0", materials: [{ id: "mat.player", kind: "standard", color: "#ffffff" }] },
    targetProfile: { schema: "threenative.target-profile", version: "0.1.0", targets: ["web"] },
    world,
  });
  const queued = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });
  queued.context.commands.materialPatch("player", { emissive: "#ff3300", emissiveIntensity: 2 });
  const result = applySystemEffects(world, { commands: [{ entity: "player", kind: "material.patch" }], eventReads: [], eventWrites: [], name: "hover", queries: [], reads: [], resourceReads: [], resourceWrites: [], schedule: "update", services: [], writes: [] }, { commands: queued.commands, events: [], resources: [], services: [] }, { frame: 1, tick: 1 });
  applyMaterialPatchEffects(mapped, result.entries);
  const player = mapped.objectsById.get("player");
  assert.ok(player instanceof THREE.Mesh);
  assert.ok(player.material instanceof THREE.MeshStandardMaterial);
  assert.equal(player.material.emissive.getHexString(), "ff3300");
  assert.equal(player.material.emissiveIntensity, 2);
  assert.equal(result.entries.some((entry) => entry.command === "material.patch" && entry.entity === "player"), true);
});

test("should match entities on scene-declared custom components", () => {
  const world = makeWorld();
  world.entities[0]!.components.ChessPiece = { side: "white" };
  const { context, diagnostics } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, systemName: "selection" });

  assert.deepEqual(context.query({ with: ["ChessPiece"], without: [] }).map((entity) => entity.id), [world.entities[0]!.id]);
  assert.deepEqual(diagnostics, []);
});

test("should emit unknown-component diagnostic once when query names missing component", () => {
  const world = makeWorld();
  const runtimeState = createWebSystemRuntimeState(world, {});
  const first = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, runtimeState, systemName: "selection" });
  first.context.query({ with: ["Transforn"], without: [] });
  const second = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, runtimeState, systemName: "selection" });
  second.context.query({ with: ["Transforn"], without: [] });

  assert.equal(first.diagnostics.length, 1);
  assert.equal(first.diagnostics[0]?.code, "TN_RUNTIME_QUERY_UNKNOWN_COMPONENT");
  assert.match(first.diagnostics[0]?.suggestion ?? "", /Transform/);
  assert.deepEqual(second.diagnostics, []);
});

test("should retain novel spawned component names in the world runtime registry", () => {
  const world = makeWorld();
  const runtimeState = createWebSystemRuntimeState(world, {});
  const first = createSystemContext(world, { delta: 1 / 60, fixedDelta: 1 / 60, runtimeState, systemName: "spawn-test" });
  first.context.commands.spawn("special", { NovelComponent: { value: 1 } });
  const second = createSystemContext(world, { delta: 1 / 60, fixedDelta: 1 / 60, runtimeState, systemName: "query-test" });
  second.context.query({ with: ["NovelComponent"], without: [] });
  assert.equal(second.diagnostics.some((diagnostic) => diagnostic.code === "TN_RUNTIME_QUERY_UNKNOWN_COMPONENT"), false);
});

test("should expose fixed input trace", () => {
  const { context } = createSystemContext(makeWorld(), {
    delta: 0.016,
    fixedDelta: 0.016,
    input: {
      action: (name) => name === "MoveForward",
      axis: (name) => (name === "MoveX" ? 1 : 0),
      beginFrame: () => undefined,
      enqueueUiAction: () => undefined,
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
  assert.equal(context.input.getAxis("MoveX"), 1);
  assert.deepEqual(context.input.getAxis2("MoveX", "MoveZ", { normalize: true }), [1, 0]);
  assert.equal(context.input.axis1("MoveX", { negative: "Brake", positive: "MoveForward" }), 1);
  assert.equal(context.input.getButton("MoveForward"), true);
  assert.equal(context.input.getButtonDown("Jump"), true);
  assert.equal(context.input.getButtonUp("Jump"), false);
  assert.equal(context.input.pressed("Jump"), true);
  assert.equal(context.time.deltaTime, 0.016);
  assert.equal(context.time.fixedDt, 0.016);
  assert.equal(context.time.fixedDelta, 0.016);
  assert.equal(context.time.fixedDeltaTime, 0.016);
  assert.equal(context.time.time, 0);
});

test("should fire pressed once while key remains held", () => {
  const input = createInputState({
    actions: [{ bindings: [{ code: "Space", device: "keyboard" }], id: "Jump" }],
    axes: [],
    schema: "threenative.input",
    version: "0.1.0",
  });
  const observations: Array<{ action: boolean; pressed: boolean; released: boolean }> = [];
  const observe = () => observations.push({
    action: input.action("Jump"),
    pressed: input.pressed("Jump"),
    released: input.released("Jump"),
  });

  input.handleKeyDown({ code: "Space" });
  input.beginFrame();
  observe();
  input.beginFrame();
  observe();
  input.handleKeyUp({ code: "Space" });
  input.beginFrame();
  observe();

  assert.deepEqual(observations, pendingWritesFixture.expected.inputTicks);

  const world = makeWorld();
  const runtimeState = createWebSystemRuntimeState(world, {});
  const rawInput = { ...input, pressed: (name: string) => name === "Jump" };
  const firstTick = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, frame: 7, input: rawInput, runtimeState, tick: 10 }).context;
  const sameTick = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, frame: 7, input: rawInput, runtimeState, tick: 10 }).context;
  const accumulatedTick = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, frame: 7, input: rawInput, runtimeState, tick: 11 }).context;
  assert.equal(firstTick.input.pressed("Jump"), true);
  assert.equal(sameTick.input.pressed("Jump"), true);
  assert.equal(accumulatedTick.input.pressed("Jump"), false);
});

test("should return one sensor snapshot to every reader in a tick", () => {
  const world: IWorldIr = {
    entities: [
      {
        components: {
          Collider: { kind: "box", layer: "sensor", mask: ["player"], sensor: { phases: ["enter", "stay", "exit"], trackOccupants: true }, size: [2, 2, 2] },
          Transform: { position: [0, 0, 0] },
        },
        id: "zone",
      },
      {
        components: {
          Collider: { kind: "box", layer: "player", size: [1, 1, 1] },
          RigidBody: { kind: "kinematic", velocity: [1.1, 0, 0] },
          Transform: { position: [-1.5, 0, 0] },
        },
        id: "player",
      },
    ],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const runtimeState = createWebSystemRuntimeState(world, {});
  runtimeState.sensors.advance(world, { fixedDelta: 1, tick: 1 });
  const first = createSystemContext(world, { delta: 1, fixedDelta: 1, runtimeState, tick: 1 }).context.physics.sensor();
  const second = createSystemContext(world, { delta: 1, fixedDelta: 1, runtimeState, tick: 1 }).context.physics.sensor();
  runtimeState.sensors.advance(world, { fixedDelta: 1, tick: 2 });
  const next = createSystemContext(world, { delta: 1, fixedDelta: 1, runtimeState, tick: 2 }).context.physics.sensor();

  assert.deepEqual(first, second);
  assert.deepEqual(first.events.map((event) => event.phase), ["enter"]);
  assert.deepEqual(next.events.map((event) => event.phase), ["stay"]);
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

test("should query entities by tag in lexical order", () => {
  const world = makeWorld();
  world.entities[2]!.tags = ["player", "controllable"];
  world.entities[3]!.tags = ["collectible"];
  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });

  assert.deepEqual(context.entities.withTag("collectible").map((entity) => entity.id), ["crate"]);
  assert.deepEqual(context.entities.withTag("player").map((entity) => entity.tags), [["controllable", "player"]]);
  assert.equal(context.entities.countTag("player"), 1);
});

test("should expose successful spawn and despawn observations once per tick", () => {
  const world = makeWorld();
  const runtimeState = createWebSystemRuntimeState(world, {});
  runtimeState.lifecycle.beginTick(world, 4);
  const { commands } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, runtimeState, tick: 4 });
  const beforeSpawn = new Map(world.entities.map((entity) => [entity.id, entity.tags ?? []] as const));
  commands.push({ components: { Transform: { position: [0, 0, 0] } }, entity: "coin.01", kind: "spawn", source: "command", tags: ["coin"] });
  applyCommands(world, commands);
  runtimeState.lifecycle.observe(beforeSpawn, world);

  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016, runtimeState, tick: 4 });
  assert.deepEqual(context.entities.spawned(), ["coin.01"]);
  assert.deepEqual(context.entities.spawned({ tag: "coin" }), ["coin.01"]);
  assert.deepEqual(context.entities.spawned(), context.entities.spawned());

  const beforeDespawn = new Map(world.entities.map((entity) => [entity.id, entity.tags ?? []] as const));
  applyCommands(world, [{ entity: "coin.01", kind: "despawn", source: "command" }]);
  runtimeState.lifecycle.observe(beforeDespawn, world);
  assert.deepEqual(context.entities.despawned({ tag: "coin" }), ["coin.01"]);
  assert.deepEqual(context.entities.despawned({ tag: "coin" }), ["coin.01"]);
});

test("should expose state and transform helper facades through existing effects", () => {
  const world = makeWorld();
  world.resources = { RallyState: { lap: 1, message: "Go" } };
  const { commands, context, resources } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });
  const player = context.entity("player");
  assert.ok(player);

  const state = context.state("RallyState", { lap: 0, message: "Ready", speed: 0 });
  state.speed = 12;
  state.lap = 2;
  const transform = player.transform();
  transform.setPose([1, 2, 3], [0, 0.707107, 0, 0.707107]);

  assert.deepEqual(transform.position, [1, 2, 3]);
  assert.deepEqual(transform.positionOr([9, 9, 9]), [1, 2, 3]);
  assert.equal(Math.round(transform.yawOr(0) * 1000) / 1000, 1.571);
  assert.deepEqual(resources, [{ resource: "RallyState", value: { lap: 2, message: "Go", speed: 12 } }]);
  assert.deepEqual(commands, [
    {
      component: "Transform",
      entity: "player",
      kind: "setComponent",
      source: "entity",
      value: {
        position: [1, 2, 3],
        rotation: [0, 0.707107, 0, 0.707107],
        scale: [1, 1, 1],
      },
    },
  ]);
});

test("should keep cosmetic transform writes separate from the durable Transform pose", () => {
  const world = makeWorld();
  const { commands, context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });
  const transform = context.entity("player")!.transform();

  transform.setLocalOffset({ position: [0, 0.25, 0], rotation: [0, 0, 0.1, 0.995] });
  assert.deepEqual(transform.localOffsetOr(), {
    position: [0, 0.25, 0],
    rotation: [0, 0, 0.1, 0.995],
    scale: [1, 1, 1],
  });
  transform.resetLocalOffset();

  assert.deepEqual(commands.map((command) => command.component), ["CosmeticTransform", "CosmeticTransform"]);
  assert.deepEqual(commands.at(-1)?.value, {
    position: [0, 0, 0],
    rotation: [0, 0, 0, 1],
    scale: [1, 1, 1],
  });
  assert.deepEqual(world.entities.find((entity) => entity.id === "player")?.components.Transform, { position: [0, 1, 0] });
});

test("should merge defaults when reading entity components and resources", () => {
  const world = makeWorld();
  const playerSource = world.entities.find((entity) => entity.id === "player");
  assert.ok(playerSource);
  playerSource.components.Player = { hp: 3 };
  world.resources = { GameState: { score: 2 } };
  const { context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });
  const player = context.entity("player");
  assert.ok(player);

  assert.deepEqual(player.get("Player", { hp: 1, speed: 5 }), { hp: 3, speed: 5 });
  assert.deepEqual(context.resources.get("GameState", { lives: 3, score: 0 }), { lives: 3, score: 2 });
});

test("should patch resources with shallow merge semantics", () => {
  const world = makeWorld();
  world.resources = { GameState: { lives: 3, score: 1 } };
  const { context, resources } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });

  context.resources.patch("GameState", { score: 2 });

  assert.deepEqual(resources, [{ resource: "GameState", value: { lives: 3, score: 2 } }]);
});

test("should compose resource writes and expose them to later reads in the same system tick", () => {
  const world = makeWorld();
  world.resources = { GameState: { lives: 3, score: 1 } };
  const { context, resources } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });

  context.resources.patch("GameState", { score: 2 });
  assert.deepEqual(context.resources.get("GameState"), { lives: 3, score: 2 });
  context.resources.patch("GameState", { status: "playing" });

  assert.deepEqual(resources, [
    { resource: "GameState", value: { lives: 3, score: 2 } },
    { resource: "GameState", value: { lives: 3, score: 2, status: "playing" } },
  ]);
});

test("should apply property write when transform position is assigned", () => {
  const world = makeWorld();
  const { commands, context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });
  const player = context.entity("player");
  assert.ok(player);

  player.transform().position = [2, 3, 4];

  assert.deepEqual(commands, [
    {
      component: "Transform",
      entity: "player",
      kind: "setComponent",
      source: "entity",
      value: {
        position: [2, 3, 4],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
      },
    },
  ]);
});

test("should read pending transform after setting position", () => {
  const world: IWorldIr = {
    entities: [structuredClone(pendingWritesFixture.entity)],
    schema: "threenative.world",
    version: "0.1.0",
  };
  const { commands, context } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.016 });
  const player = context.entity("player");
  assert.ok(player);

  const positionReads = [player.transform().position];
  const componentReads = [player.get<Record<string, unknown>>("PlayerState")];
  player.transform().setPosition([2, 3, 4]);
  positionReads.push(context.entity("player")!.transform().position);
  player.patch("PlayerState", { hp: 2 });
  componentReads.push(player.get<Record<string, unknown>>("PlayerState"));
  player.patch("PlayerState", { status: "moving" });
  componentReads.push(player.components.PlayerState as Record<string, unknown>);

  assert.deepEqual(positionReads, pendingWritesFixture.expected.positionReads);
  assert.deepEqual(componentReads, pendingWritesFixture.expected.componentReads);
  assert.deepEqual(commands.map((command) => command.component), pendingWritesFixture.expected.effectOrder);
});

test("should raycast primitive floor", async () => {
  await initializePhysicsRuntime();
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

test("should log v7 physics query service calls", async () => {
  await initializePhysicsRuntime();
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

test("should reject missing and invalid force-at-point coordinates", () => {
  const { context, services } = createSystemContext(makeWorld(), { delta: 0.016, fixedDelta: 0.016 });
  const physics = context.physics as unknown as {
    addForceAtPoint(entity: string, force: [number, number, number], point?: [number, number, number]): unknown;
    applyImpulseAtPoint(entity: string, impulse: [number, number, number], point?: [number, number, number]): unknown;
  };

  assert.deepEqual(physics.addForceAtPoint("player", [1, 0, 0]), { accepted: false, entity: "player", status: "invalid-vector" });
  assert.deepEqual(physics.applyImpulseAtPoint("player", [1, 0, 0], [Number.NaN, 0, 0]), { accepted: false, entity: "player", status: "invalid-vector" });
  assert.equal(services.length, 2);
});

test("should validate and queue physics body commands", () => {
  const world = makeWorld();
  const player = world.entities.find((entity) => entity.id === "player");
  assert.ok(player);
  player.components.RigidBody = { kind: "dynamic", mass: 2 };
  const { context, services } = createSystemContext(world, { delta: 0.25, fixedDelta: 0.25 });

  assert.deepEqual(context.physics.applyImpulse("player", [2, 0, 0]), {
    accepted: true,
    entity: "player",
    status: "applied",
  });
  assert.deepEqual(context.physics.addForce("missing", [1, 0, 0]), {
    accepted: false,
    entity: "missing",
    status: "missing",
  });
  assert.deepEqual(services, [
    {
      payload: {
        request: { entity: "player", fixedDelta: 0.25, value: [2, 0, 0] },
        result: { accepted: true, entity: "player", status: "applied" },
      },
      service: "physics.applyImpulse",
    },
    {
      payload: {
        request: { entity: "missing", fixedDelta: 0.25, value: [1, 0, 0] },
        result: { accepted: false, entity: "missing", status: "missing" },
      },
      service: "physics.addForce",
    },
  ]);
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
  const update = context.audio.update(play.playbackId, { pitch: 1.25, rampSeconds: 0.1, volume: 0.5 });
  const stop = context.audio.stop(play.playbackId);

  assert.equal(play.playbackId, "sound.hit#1");
  assert.equal(update.pitch, 1.25);
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
        request: { options: { pitch: 1.25, rampSeconds: 0.1, volume: 0.5 }, playbackId: "sound.hit#1" },
        result: update,
      },
      service: "audio.update",
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

test("should execute bounded particle command services", () => {
  const { context, services } = createSystemContext(makeWorld(), { assets: makeAssets(), delta: 0.016, fixedDelta: 0.016 });

  const played = context.particles.play("model.hero", "dust", { seed: 7 });
  const emitted = context.particles.emit("model.hero", "dust", { count: 99, seed: "impact" });
  const cleared = context.particles.clear("model.hero", "dust");
  const started = context.particles.start("model.hero", "dust", { seed: 7 });
  const burst = context.particles.burst("model.hero", "dust", { count: 99, seed: "impact" });
  const stopped = context.particles.stop("model.hero", "dust");
  const reset = context.particles.reset("model.hero", "dust");

  assert.deepEqual(played, {
    accepted: true,
    active: true,
    asset: "model.hero",
    command: "play",
    count: 4,
    emitter: "dust",
    maxParticles: 8,
    seed: 7,
    status: "played",
  });
  assert.deepEqual(emitted, {
    accepted: true,
    active: true,
    asset: "model.hero",
    command: "emit",
    count: 8,
    emitter: "dust",
    maxParticles: 8,
    seed: 510767767,
    status: "emitted",
  });
  assert.equal(cleared.status, "cleared");
  assert.deepEqual(started, {
    accepted: true,
    active: true,
    asset: "model.hero",
    command: "start",
    count: 4,
    emitter: "dust",
    maxParticles: 8,
    seed: 7,
    status: "started",
  });
  assert.deepEqual(burst, {
    accepted: true,
    active: true,
    asset: "model.hero",
    command: "burst",
    count: 8,
    emitter: "dust",
    maxParticles: 8,
    seed: 510767767,
    status: "burst",
  });
  assert.equal(stopped.status, "stopped");
  assert.equal(reset.status, "reset");
  assert.deepEqual(services.map((service) => service.service), ["particles.play", "particles.emit", "particles.clear", "particles.start", "particles.burst", "particles.stop", "particles.reset"]);
  assert.deepEqual(services[1]?.payload, {
    request: { asset: "model.hero", emitter: "dust", options: { count: 99, seed: "impact" } },
    result: emitted,
  });
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

test("should expose character move speed and direction overrides", () => {
  const world = makeWorld();
  const player = world.entities.find((entity) => entity.id === "player");
  assert.ok(player);
  player.components.Collider = { kind: "box", layer: "player", mask: ["world"], size: [0.5, 1, 0.5] };
  player.components.CharacterController = {
    blocking: false,
    grounding: "none",
    moveXAxis: "MoveX",
    moveZAxis: "MoveZ",
    speed: 2,
  };
  const { context, services } = createSystemContext(world, { delta: 0.016, fixedDelta: 1 });

  const result = context.character.move("player", { direction: [0, -1], fixedDelta: 0.25, speed: 8 });

  assert.deepEqual(result, {
    desired: [0, 1, -2],
    entity: "player",
    grounded: false,
    resolved: [0, 1, -2],
    start: [0, 1, 0],
  });
  assert.deepEqual(services[0]?.payload, {
    request: { entity: "player", options: { direction: [0, -1], fixedDelta: 0.25, speed: 8 } },
    result,
  });
});

test("should log extended character move service payload", () => {
  const world = makeWorld();
  world.entities = world.entities.filter((entity) => entity.id !== "crate");
  const player = world.entities.find((entity) => entity.id === "player");
  const floor = world.entities.find((entity) => entity.id === "floor");
  assert.ok(player);
  assert.ok(floor);
  player.components.Collider = { contact: { phases: ["begin", "stay"] }, kind: "box", layer: "player", mask: ["pushable", "world"], size: [0.5, 1, 0.5] };
  player.components.Transform = { position: [0, 1.1666666666666665, 0] };
  player.components.CharacterController = {
    blocking: true,
    grounding: "raycast",
    moveXAxis: "MoveX",
    moveZAxis: "MoveZ",
    pushPolicy: { allowedLayers: ["pushable"], enabled: true, maxPushMass: 10 },
    slopeLimit: 25,
    speed: 2,
  };
  floor.id = "ramp";
  floor.components.Collider = {
    contact: { phases: ["stay"] },
    kind: "box",
    layer: "world",
    material: "stone",
    size: [6, 1, 6],
    slope: { axis: "x", direction: 1, rise: 1, run: 3 },
  };
  floor.components.Transform = { position: [0, 0.5, 0] };
  world.entities.push({
    id: "crate",
    components: {
      Collider: { contact: { phases: ["begin"] }, kind: "box", layer: "pushable", material: "wood", size: [1, 1, 1] },
      RigidBody: { kind: "dynamic", mass: 1 },
      Transform: { position: [1, 1.1666666666666665, 0] },
    },
  });
  const { context, services } = createSystemContext(world, { delta: 0.016, fixedDelta: 0.5 });

  const result = context.character.move("player", { axes: { MoveX: 1, MoveZ: 0 }, fixedDelta: 0.5 });

  assert.deepEqual(result, {
    contacts: [
      { material: "wood", normal: [-1, 0, 0], other: "crate", phase: "begin", point: [1, 1.166667, 0], pointIndex: 0, self: "player" },
      { material: "stone", normal: [0, 1, 0], other: "ramp", phase: "stay", point: [1, 0.666667, 0], pointIndex: 0, self: "player" },
    ],
    desired: [1, 1.1666666666666665, 0],
    entity: "player",
    groundEntity: "ramp",
    grounded: true,
    pushed: { entity: "crate", impulse: [1, 0, 0], position: [2, 1.1666666666666665, 0] },
    pushes: [{ entity: "crate", impulse: [1, 0, 0], position: [2, 1.1666666666666665, 0] }],
    resolved: [1, 1.1666666666666665, 0],
    slope: { angle: 18.434949, axis: "x", direction: 1, entity: "ramp", rise: 1, run: 3, walkable: true },
    start: [0, 1.1666666666666665, 0],
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
  const localData = {
    components: [],
    resources: [{ id: "Progress", schema: { fields: { level: { kind: "integer" as const } } } }],
    saveSlots: [{ appVersion: "1.0.0", id: "slot.auto", schemaVersion: 1 }],
    schema: "threenative.local-data" as const,
    settings: [{ defaultValue: 0.5, group: "audio" as const, key: "audio.master", kind: "number" as const, max: 1, min: 0 }],
    version: "0.1.0" as const,
  };
  const { context, services } = createSystemContext(world, {
    delta: 0.016,
    fixedDelta: 0.016,
    localData,
    persistence: createWebPersistenceService(localData, { storage: createMemoryPersistenceStorage() }),
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

test("should reject undeclared delayed command scheduling", () => {
  const world = makeWorld();
  const runtimeState = createWebSystemRuntimeState(world, {});
  const { context } = createSystemContext(world, {
    delayedCommands: [
      {
        cancelPolicy: "drop",
        command: { components: ["Transform"], entity: "marker", kind: "spawn" },
        id: "spawnMarker",
        maxDelayTicks: 2,
        ownership: { id: "arena", kind: "scene" },
      },
    ],
    delta: 0.016,
    fixedDelta: 0.016,
    runtimeState,
    schedule: "fixedUpdate",
    systemName: "spawner",
    tick: 3,
  });

  assert.deepEqual(context.schedule.afterTicks({ delayTicks: 1, id: "missing" }), {
    accepted: false,
    delayTicks: 1,
    id: "missing",
    status: "rejected",
  });
  assert.deepEqual(context.schedule.afterTicks({ delayTicks: 3, id: "spawnMarker" }), {
    accepted: false,
    delayTicks: 3,
    id: "spawnMarker",
    status: "rejected",
  });
  assert.deepEqual(runtimeState.delayedCommands, []);
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
      {
        format: "glb" as const,
        id: "model.hero",
        kind: "model" as const,
        particleEmitters: [{ id: "dust", lifetimeSeconds: 0.5, maxParticles: 8, ratePerSecond: 8, shape: "point" as const }],
        path: "assets/hero.glb",
      },
    ],
    schema: "threenative.assets" as const,
    version: "0.1.0" as const,
  };
}
