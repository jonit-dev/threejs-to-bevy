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
