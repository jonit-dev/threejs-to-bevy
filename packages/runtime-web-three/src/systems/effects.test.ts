import assert from "node:assert/strict";
import test from "node:test";
import type { IIrSystemDeclaration, IWorldIr } from "@threenative/ir";

import { applySystemEffects } from "./effects.js";

test("should apply transform patch after system", () => {
  const world = makeWorld();
  const result = applySystemEffects(
    world,
    makeSystem({ writes: ["Transform"] }),
    {
      commands: [{ component: "Transform", entity: "player", kind: "setComponent", source: "entity", value: { position: [1, 0, 0] } }],
      events: [],
      services: [],
    },
    { frame: 0, tick: 0 },
  );

  assert.deepEqual(result.diagnostics, []);
  assert.deepEqual(world.entities[0]?.components.Transform, { position: [1, 0, 0] });
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
    makeSystem({ services: ["animation.play"] }),
    {
      commands: [],
      events: [],
      services: [{ payload: { request: { clip: "run", entity: "player", options: {} }, result: { accepted: true } }, service: "animation.play" }],
    },
    { frame: 1, tick: 2 },
  );

  assert.deepEqual(allowed.diagnostics, []);
  assert.deepEqual(allowed.entries[0], {
    frame: 1,
    kind: "service",
    payload: { request: { clip: "run", entity: "player", options: {} }, result: { accepted: true } },
    schedule: "fixedUpdate",
    service: "animation.play",
    system: "move",
    tick: 2,
  });

  const rejected = applySystemEffects(
    world,
    makeSystem(),
    {
      commands: [],
      events: [],
      services: [{ payload: { request: {}, result: { hit: false } }, service: "physics.raycast" }],
    },
    { frame: 1, tick: 2 },
  );

  assert.equal(rejected.diagnostics[0]?.code, "TN_WEB_SYSTEM_SERVICE_UNDECLARED");
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
    schedule: "fixedUpdate",
    script: { bundle: "scripts.bundle.js", exportName: "move" },
    services: [],
    writes: [],
    ...overrides,
  };
}
