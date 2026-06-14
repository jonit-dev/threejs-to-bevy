import assert from "node:assert/strict";
import test from "node:test";

import { diagnosePortableSystem } from "./diagnostics.js";

test("should reject scripts browser api in portable system", () => {
  const diagnostics = diagnosePortableSystem({
    source: "() => document.querySelector('canvas')",
    systemName: "badDom",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_DOM_API_UNSUPPORTED");
  assert.equal(diagnostics[0]?.severity, "error");
  assert.equal(diagnostics[0]?.path, "systems/badDom");
  assert.match(diagnostics[0]?.suggestion ?? "", /portable system context/);
});

test("should reject direct DOM access in v4 system", () => {
  const diagnostics = diagnosePortableSystem({
    source: "() => window.requestAnimationFrame(() => undefined)",
    systemName: "badDom",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_DOM_API_UNSUPPORTED");
  assert.equal(diagnostics[0]?.severity, "error");
});

test("should reject undeclared transform write", () => {
  const diagnostics = diagnosePortableSystem({
    source: "(ctx) => ctx.query()[0].patch(Transform, { position: [1, 0, 0] })",
    systemName: "badWrite",
    writes: [],
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_WRITE_UNDECLARED");
  assert.equal(diagnostics[0]?.path, "systems/badWrite/writes/Transform");
  assert.match(diagnostics[0]?.suggestion ?? "", /writes/);
});

test("should validate resource writes against resourceWrites", () => {
  const missing = diagnosePortableSystem({
    resourceWrites: [],
    source: "(ctx) => ctx.resources.set(GameState, { score: 1 })",
    systemName: "badResourceWrite",
    writes: [],
  });

  assert.equal(missing[0]?.code, "TN_SCRIPT_RESOURCE_WRITE_UNDECLARED");
  assert.equal(missing[0]?.path, "systems/badResourceWrite/resourceWrites/GameState");

  const valid = diagnosePortableSystem({
    resourceWrites: ["GameState"],
    source: "(ctx) => ctx.resources.set(GameState, { score: 1 })",
    systemName: "goodResourceWrite",
    writes: [],
  });

  assert.deepEqual(valid, []);
});

test("should reject undeclared service command and event access", () => {
  const diagnostics = diagnosePortableSystem({
    commands: [],
    eventWrites: [],
    services: [],
    source:
      "(ctx) => { ctx.commands.spawn('marker', {}); ctx.events.emit(HitEvent, {}); ctx.physics.raycast({ origin: [0,0,0], direction: [0,-1,0], maxDistance: 1 }); }",
    systemName: "badAccess",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["TN_SCRIPT_COMMAND_UNDECLARED", "TN_SCRIPT_EVENT_WRITE_UNDECLARED", "TN_SCRIPT_SERVICE_UNDECLARED"],
  );
});

test("should reject undeclared v7 physics query services", () => {
  const diagnostics = diagnosePortableSystem({
    services: ["physics.raycast"],
    source:
      "(ctx) => { ctx.physics.raycast({ origin: [0,0,0], direction: [0,-1,0], maxDistance: 1 }); ctx.physics.overlap({ position: [0,0,0], shape: { kind: 'sphere', radius: 1 } }); ctx.physics.shapeCast({ origin: [0,0,0], direction: [1,0,0], maxDistance: 1, shape: { kind: 'sphere', radius: 1 } }); }",
    systemName: "badV7Access",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.path),
    ["systems/badV7Access/services/physics.overlap", "systems/badV7Access/services/physics.shapeCast"],
  );
});

test("should reject node fs import", () => {
  const diagnostics = diagnosePortableSystem({
    source: "() => require('fs').readFileSync('save.json')",
    systemName: "badFs",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_NODE_API_UNSUPPORTED");
  assert.equal(diagnostics[0]?.severity, "error");
  assert.match(diagnostics[0]?.suggestion ?? "", /filesystem/);
});

test("should reject timer and worker APIs", () => {
  const diagnostics = diagnosePortableSystem({
    source: "() => { setTimeout(() => undefined, 1); new Worker('worker.js'); }",
    systemName: "badTimer",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["TN_SCRIPT_DOM_API_UNSUPPORTED", "TN_SCRIPT_TIMER_API_UNSUPPORTED"],
  );
});
