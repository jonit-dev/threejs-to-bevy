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

test("should preserve source path for non-portable platform API usage", () => {
  const diagnostics = diagnosePortableSystem({
    exportName: "badPlatform",
    file: "src/systems/platform.ts",
    source: "() => fetch('/state').then(() => setTimeout(() => undefined, 1))",
    systemName: "badPlatform",
  });

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_SCRIPT_NETWORK_API_UNSUPPORTED"), true);
  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_SCRIPT_TIMER_API_UNSUPPORTED"), true);
  assert.equal(diagnostics[0]?.file, "src/systems/platform.ts");
  assert.equal(diagnostics[0]?.target, "badPlatform");
  assert.match(diagnostics[0]?.suggestion ?? "", /resources|events|schedule|timers/);
});

test("should reject direct DOM access in v4 system", () => {
  const diagnostics = diagnosePortableSystem({
    source: "() => window.requestAnimationFrame(() => undefined)",
    systemName: "badDom",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_DOM_API_UNSUPPORTED");
  assert.equal(diagnostics[0]?.severity, "error");
});

test("should ignore unsupported global names inside strings and comments", () => {
  const diagnostics = diagnosePortableSystem({
    resourceWrites: ["GameState"],
    source:
      "(ctx) => { // window and document are prose here\nconst state = ctx.state('GameState', { status: '' }); state.status = \"The relay window closed. Press Space to retry.\"; }",
    systemName: "goodNarrativeText",
  });

  assert.deepEqual(diagnostics, []);
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

test("should reject undeclared string component patch", () => {
  const diagnostics = diagnosePortableSystem({
    source: '(ctx) => ctx.entity("pickup")?.patch("MeshRenderer", { visible: false })',
    systemName: "badStringWrite",
    writes: ["Transform"],
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_WRITE_UNDECLARED");
  assert.equal(diagnostics[0]?.path, "systems/badStringWrite/writes/MeshRenderer");
  assert.match(diagnostics[0]?.suggestion ?? "", /MeshRenderer/);
});

test("should reject legacy script context idioms with fix snippets", () => {
  const diagnostics = diagnosePortableSystem({
    exportName: "movePlayer",
    file: "src/scripts/player.ts",
    resourceWrites: ["GameState"],
    source:
      '(context) => { const entity = context.query()[0]; const position = entity.transform().positionOr([0, 0, 0]); const axis = context.input.axis1("MoveX", { negative: "left", positive: "right" }); const dt = context.time.fixedDelta({ fallback: 1 / 60 }); const state = context.state("GameState", { axis, dt, x: 0 }); state.x = position[0] + axis * dt; }',
    systemName: "movePlayer",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["TN_SCRIPT_LEGACY_AXIS1", "TN_SCRIPT_LEGACY_POSITION_OR", "TN_SCRIPT_LEGACY_FIXED_DELTA_OPTIONS"],
  );
  assert.match(diagnostics[0]?.fix?.snippet ?? "", /getAxis/);
  assert.match(diagnostics[1]?.fix?.snippet ?? "", /transform\(\)\.position/);
  assert.match(diagnostics[2]?.fix?.snippet ?? "", /time\.fixedDelta/);
});

test("should validate resource writes against resourceWrites", () => {
  const missing = diagnosePortableSystem({
    resourceWrites: [],
    source: '(ctx) => ctx.resources.set("GameState", { score: 1 })',
    systemName: "badResourceWrite",
    writes: [],
  });

  assert.equal(missing[0]?.code, "TN_SCRIPT_RESOURCE_WRITE_UNDECLARED");
  assert.equal(missing[0]?.path, "systems/badResourceWrite/resourceWrites/GameState");

  const valid = diagnosePortableSystem({
    resourceWrites: ["GameState"],
    source: '(ctx) => ctx.resources.patch("GameState", { score: 1 })',
    systemName: "goodResourceWrite",
    writes: [],
  });

  assert.deepEqual(valid, []);
});

test("should validate resource reads against resourceReads", () => {
  const missing = diagnosePortableSystem({
    resourceReads: [],
    source: '(ctx) => ctx.resources.get("GameState", { score: 0 })',
    systemName: "badResourceRead",
  });

  assert.equal(missing[0]?.code, "TN_SCRIPT_RESOURCE_READ_UNDECLARED");
  assert.equal(missing[0]?.path, "systems/badResourceRead/resourceReads/GameState");

  const valid = diagnosePortableSystem({
    resourceReads: ["GameState"],
    source: '(ctx) => ctx.resources.get("GameState", { score: 0 })',
    systemName: "goodResourceRead",
  });

  assert.deepEqual(valid, []);
});

test("should reject dynamic resource helper ids", () => {
  const diagnostics = diagnosePortableSystem({
    source: '(ctx) => { const id = "GameState"; ctx.resources.patch(id, { score: 1 }); }',
    systemName: "dynamicResourceWrite",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_DYNAMIC_RESOURCE_ID_UNSUPPORTED");
  assert.equal(diagnostics[0]?.path, "systems/dynamicResourceWrite/resourceWrites");
  assert.match(diagnostics[0]?.fix?.snippet ?? "", /resources\.patch/);
});

test("should reject helper resource writes without declared access", () => {
  const missing = diagnosePortableSystem({
    resourceWrites: [],
    source: '(ctx) => { const state = ctx.state("GameState", { score: 0 }); state.score += 1; }',
    systemName: "badHelperResourceWrite",
  });

  assert.equal(missing[0]?.code, "TN_SCRIPT_RESOURCE_WRITE_UNDECLARED");
  assert.equal(missing[0]?.path, "systems/badHelperResourceWrite/resourceWrites/GameState");

  const valid = diagnosePortableSystem({
    resourceWrites: ["GameState"],
    source: '(context) => { const state = context.state("GameState", { score: 0 }); state.score += 1; }',
    systemName: "goodHelperResourceWrite",
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

test("should reject literal context query that is not declared", () => {
  const diagnostics = diagnosePortableSystem({
    queries: [{ with: ["VehiclePhysics"], without: [] }],
    source: '(ctx) => ctx.query({ with: ["Transform"], without: ["VehiclePhysics"] })',
    systemName: "badQuery",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_QUERY_UNDECLARED");
  assert.equal(diagnostics[0]?.path, 'systems/badQuery/queries/{ with: ["Transform"], without: ["VehiclePhysics"] }');
  assert.match(diagnostics[0]?.suggestion ?? "", /defineQuery/);
});

test("should allow declared literal context query and default query", () => {
  const diagnostics = diagnosePortableSystem({
    queries: [{ with: ["Transform"], without: ["VehiclePhysics"] }],
    source: '(ctx) => { ctx.query(); ctx.query({ with: ["Transform"], without: ["VehiclePhysics"] }); }',
    systemName: "goodQuery",
  });

  assert.deepEqual(diagnostics, []);
});

test("should reject undeclared v7 physics and picking query services", () => {
  const diagnostics = diagnosePortableSystem({
    services: ["physics.raycast"],
    source:
      "(ctx) => { ctx.physics.raycast({ origin: [0,0,0], direction: [0,-1,0], maxDistance: 1 }); ctx.physics.overlap({ position: [0,0,0], shape: { kind: 'sphere', radius: 1 } }); ctx.physics.shapeCast({ origin: [0,0,0], direction: [1,0,0], maxDistance: 1, shape: { kind: 'sphere', radius: 1 } }); ctx.picking.pointerRay({ pointer: [0.5, 0.5] }); ctx.picking.mesh({ origin: [0,0,0], direction: [0,0,-1], maxDistance: 5 }); }",
    systemName: "badV7Access",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.path),
    [
      "systems/badV7Access/services/physics.overlap",
      "systems/badV7Access/services/physics.shapeCast",
      "systems/badV7Access/services/picking.mesh",
      "systems/badV7Access/services/picking.pointerRay",
    ],
  );
});

test("should reject undeclared asset load service while allowing metadata lookup", () => {
  const diagnostics = diagnosePortableSystem({
    services: [],
    source: "(ctx) => { ctx.assets.get('mesh.crate'); ctx.assets.list(); ctx.assets.load('mesh.crate'); }",
    systemName: "badAssetLoad",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.path),
    ["systems/badAssetLoad/services/assets.load"],
  );
});

test("should reject undeclared character move service", () => {
  const missing = diagnosePortableSystem({
    services: [],
    source: "(ctx) => ctx.character.move('player', { axes: { MoveX: 1 } })",
    systemName: "badCharacterMove",
  });

  assert.deepEqual(
    missing.map((diagnostic) => diagnostic.path),
    ["systems/badCharacterMove/services/character.move"],
  );

  const declared = diagnosePortableSystem({
    services: ["character.move"],
    source: "(ctx) => ctx.character.move('player', { axes: { MoveX: 1 } })",
    systemName: "goodCharacterMove",
  });

  assert.deepEqual(declared, []);
});

test("should reject undeclared animation control services", () => {
  const missing = diagnosePortableSystem({
    services: ["animation.play"],
    source: "(ctx) => { ctx.animation.play('player', 'run'); ctx.animation.query('player', 'run'); ctx.animation.stop('player'); }",
    systemName: "badAnimationControls",
  });

  assert.deepEqual(
    missing.map((diagnostic) => diagnostic.path),
    ["systems/badAnimationControls/services/animation.query", "systems/badAnimationControls/services/animation.stop"],
  );

  const declared = diagnosePortableSystem({
    services: ["animation.play", "animation.query", "animation.stop"],
    source: "(ctx) => { ctx.animation.play('player', 'run'); ctx.animation.query('player', 'run'); ctx.animation.stop('player'); }",
    systemName: "goodAnimationControls",
  });

  assert.deepEqual(declared, []);
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

test("should reject node protocol imports", () => {
  const diagnostics = diagnosePortableSystem({
    source: 'import { readFileSync } from "node:fs"; export const system = () => readFileSync("save.json");',
    systemName: "badNodeImport",
  });

  assert.equal(diagnostics[0]?.code, "TN_SCRIPT_NODE_API_UNSUPPORTED");
  assert.equal(diagnostics[0]?.severity, "error");
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

test("should reject async and dynamic script code", () => {
  const diagnostics = diagnosePortableSystem({
    source: "async (ctx) => { await Promise.resolve(); return eval('ctx'); }",
    systemName: "badDynamic",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    ["TN_SCRIPT_DYNAMIC_CODE_UNSUPPORTED", "TN_SCRIPT_ASYNC_UNSUPPORTED"],
  );
  assert.match(diagnostics[0]?.suggestion ?? "", /eval|Function|dynamic imports/);
});
