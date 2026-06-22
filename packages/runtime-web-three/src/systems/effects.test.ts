import assert from "node:assert/strict";
import test from "node:test";
import type { IIrSystemDeclaration, IWorldIr } from "@threenative/ir";

import { applySystemEffects } from "./effects.js";

test("should apply transform patch after system", () => {
  const world = makeWorld();
  world.entities[0]!.components.Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [2, 2, 2] };
  const result = applySystemEffects(
    world,
    makeSystem({ writes: ["Transform"] }),
    {
      commands: [{ component: "Transform", entity: "player", kind: "setComponent", source: "entity", value: { position: [1, 0, 0] } }],
      events: [],
      resources: [],
      services: [],
    },
    { frame: 0, tick: 0 },
  );

  assert.equal(result.diagnostics[0]?.code, "TN_WEB_TRANSFORM_PARTIAL_PATCH_MERGED");
  assert.equal(result.diagnostics[0]?.severity, "warning");
  assert.deepEqual(world.entities[0]?.components.Transform, { position: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [2, 2, 2] });
  assert.equal(result.entries[0]?.kind, "patch");
});

test("should flush spawn command after stage", () => {
  const world = makeWorld();
  const result = applySystemEffects(
    world,
    makeSystem({ commands: [{ components: ["Transform"], entity: "marker", kind: "spawn" }] }),
    {
      commands: [{ components: { Transform: { position: [0, 1, 0] } }, entity: "marker", kind: "spawn", source: "command" }],
      events: [],
      resources: [],
      services: [],
    },
    { frame: 0, tick: 0 },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(world.entities.find((entity) => entity.id === "marker")?.components.Transform, { position: [0, 1, 0] });
});

test("should reject undeclared command before applying effects", () => {
  const world = makeWorld();
  const result = applySystemEffects(
    world,
    makeSystem(),
    {
      commands: [{ components: { Transform: { position: [0, 1, 0] } }, entity: "marker", kind: "spawn", source: "command" }],
      events: [],
      resources: [],
      services: [],
    },
    { frame: 0, tick: 0 },
  );

  assert.equal(result.diagnostics[0]?.code, "TN_WEB_SYSTEM_COMMAND_UNDECLARED");
  assert.equal(world.entities.find((entity) => entity.id === "marker"), undefined);
});

test("should log declared service and reject undeclared service", () => {
  const world = makeWorld();
  const allowed = applySystemEffects(
    world,
    makeSystem({ services: ["animation.play", "animation.query", "animation.stop"] }),
    {
      commands: [],
      events: [],
      resources: [],
      services: [
        { payload: { request: { clip: "run", entity: "player", options: {} }, result: { accepted: true, active: true, activeState: "run", clip: "run", entity: "player", loop: true, normalizedTime: 0, sourceClip: "run", speed: 1, stopped: false, timeSeconds: 0 } }, service: "animation.play" },
        { payload: { request: { clip: "run", entity: "player" }, result: { active: true, activeState: "run", clip: "run", entity: "player", loop: true, normalizedTime: 0, sourceClip: "run", speed: 1, stopped: false, timeSeconds: 0 } }, service: "animation.query" },
        { payload: { request: { entity: "player" }, result: { accepted: true, active: false, activeState: "run", clip: "run", entity: "player", loop: true, normalizedTime: 0, sourceClip: "run", speed: 1, stopped: true, stopReason: "requested", timeSeconds: 0 } }, service: "animation.stop" },
      ],
    },
    { frame: 1, tick: 2 },
  );

  assert.deepEqual(allowed.diagnostics, []);
  assert.deepEqual(allowed.entries[0], {
    frame: 1,
    kind: "service",
    payload: { request: { clip: "run", entity: "player", options: {} }, result: { accepted: true, active: true, activeState: "run", clip: "run", entity: "player", loop: true, normalizedTime: 0, sourceClip: "run", speed: 1, stopped: false, timeSeconds: 0 } },
    schedule: "fixedUpdate",
    service: "animation.play",
    system: "move",
    tick: 2,
  });
  assert.equal(allowed.entries[1]?.service, "animation.query");
  assert.equal(allowed.entries[2]?.service, "animation.stop");

  const rejected = applySystemEffects(
    world,
    makeSystem(),
    {
      commands: [],
      events: [],
      resources: [],
      services: [{ payload: { request: {}, result: { hit: false } }, service: "physics.raycast" }],
    },
    { frame: 1, tick: 2 },
  );

  assert.equal(rejected.diagnostics[0]?.code, "TN_WEB_SYSTEM_SERVICE_UNDECLARED");
});

test("should log declared asset load service", () => {
  const world = makeWorld();
  const result = applySystemEffects(
    world,
    makeSystem({ services: ["assets.load"] }),
    {
      commands: [],
      events: [],
      resources: [],
      services: [
        {
          payload: {
            request: { id: "mesh.crate" },
            result: { accepted: true, asset: { format: "generated", id: "mesh.crate", kind: "mesh", primitive: "box" }, id: "mesh.crate", status: "ready" },
          },
          service: "assets.load",
        },
      ],
    },
    { frame: 1, tick: 2 },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.entries[0]?.kind, "service");
  assert.equal(result.entries[0]?.service, "assets.load");
});

test("should log declared scene service", () => {
  const world = makeWorld();
  const result = applySystemEffects(
    world,
    makeSystem({ services: ["scene.change"] }),
    {
      commands: [],
      events: [],
      resources: [],
      services: [
        {
          payload: {
            request: { scene: "level" },
            result: { accepted: true, operation: "change", scene: "level" },
          },
          service: "scene.change",
        },
      ],
    },
    { frame: 1, tick: 2 },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.equal(result.entries[0]?.kind, "service");
  assert.equal(result.entries[0]?.service, "scene.change");
});

test("should apply and log declared resource writes", () => {
  const world = makeWorld();
  world.resources = { Score: { value: 1 } };

  const result = applySystemEffects(
    world,
    makeSystem({ resourceWrites: ["Score"] }),
    {
      commands: [],
      events: [],
      resources: [{ resource: "Score", value: { value: 2 } }],
      services: [],
    },
    { frame: 3, tick: 4 },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(world.resources.Score, { value: 2 });
  assert.deepEqual(result.entries[0], {
    frame: 3,
    kind: "resource",
    resource: "Score",
    schedule: "fixedUpdate",
    system: "move",
    tick: 4,
    value: { value: 2 },
  });
});

test("should reject undeclared resource writes before applying effects", () => {
  const world = makeWorld();
  world.resources = { Score: { value: 1 } };

  const result = applySystemEffects(
    world,
    makeSystem(),
    {
      commands: [],
      events: [],
      resources: [{ resource: "Score", value: { value: 2 } }],
      services: [],
    },
    { frame: 0, tick: 0 },
  );

  assert.equal(result.diagnostics[0]?.code, "TN_WEB_SYSTEM_RESOURCE_WRITE_UNDECLARED");
  assert.deepEqual(world.resources.Score, { value: 1 });
});

test("should reject undeclared mixed effects before applying any mutation", () => {
  const world = makeWorld();
  world.resources = { Score: { value: 1 } };

  const result = applySystemEffects(
    world,
    makeSystem(),
    {
      commands: [
        { component: "Transform", entity: "player", kind: "setComponent", source: "entity", value: { position: [9, 0, 0] } },
        { components: { Transform: { position: [0, 1, 0] } }, entity: "marker", kind: "spawn", source: "command" },
      ],
      events: [{ event: "DamageEvent", payload: { amount: 3 } }],
      resources: [{ resource: "Score", value: { value: 2 } }],
      services: [{ payload: { request: {}, result: { hit: false } }, service: "physics.raycast" }],
    },
    { frame: 0, tick: 0 },
  );

  assert.deepEqual(result.diagnostics.map((diagnostic) => diagnostic.code).sort(), [
    "TN_WEB_SYSTEM_COMMAND_UNDECLARED",
    "TN_WEB_SYSTEM_EVENT_WRITE_UNDECLARED",
    "TN_WEB_SYSTEM_RESOURCE_WRITE_UNDECLARED",
    "TN_WEB_SYSTEM_SERVICE_UNDECLARED",
    "TN_WEB_SYSTEM_WRITE_UNDECLARED",
  ]);
  assert.deepEqual(world.entities[0]?.components.Transform, { position: [0, 0, 0] });
  assert.equal(world.entities.find((entity) => entity.id === "marker"), undefined);
  assert.equal(world.events?.DamageEvent, undefined);
  assert.deepEqual(world.resources.Score, { value: 1 });
});

test("should produce canonical effect log ordering", () => {
  const world = makeWorld();
  world.resources = { Score: { value: 1 } };

  const result = applySystemEffects(
    world,
    makeSystem({
      commands: [{ components: ["Transform"], entity: "marker", kind: "spawn" }],
      eventWrites: ["DamageEvent"],
      resourceWrites: ["Score"],
      services: ["physics.raycast"],
      writes: ["Transform"],
    }),
    {
      commands: [
        { component: "Transform", entity: "player", kind: "setComponent", source: "entity", value: { position: [1, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } },
        { components: { Transform: { position: [0, 1, 0] } }, entity: "marker", kind: "spawn", source: "command" },
      ],
      events: [{ event: "DamageEvent", payload: { amount: 3 } }],
      resources: [{ resource: "Score", value: { value: 2 } }],
      services: [{ payload: { request: {}, result: { hit: false } }, service: "physics.raycast" }],
    },
    { frame: 3, tick: 4 },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(result.entries.map((entry) => entry.kind), ["command", "event", "patch", "resource", "service"]);
});

function makeWorld(): IWorldIr {
  return {
    entities: [{ components: { Transform: { position: [0, 0, 0] } }, id: "player" }],
    schema: "threenative.world",
    version: "0.1.0",
  };
}

function makeSystem(overrides: Partial<IIrSystemDeclaration> = {}): IIrSystemDeclaration {
  return {
    commands: [],
    eventReads: [],
    eventWrites: [],
    name: "move",
    queries: [{ with: ["Transform"], without: [] }],
    reads: ["Transform"],
    resourceReads: [],
    resourceWrites: [],
    schedule: "fixedUpdate",
    script: { bundle: "scripts.bundle.js", exportName: "move" },
    services: [],
    writes: [],
    ...overrides,
  };
}
