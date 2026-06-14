import assert from "node:assert/strict";
import test from "node:test";

import { compareV4EffectLogs, type IV4EffectLog } from "./v4LogCompare.js";

test("v4LogCompare should pass identical logs", () => {
  const log = effectLog([
    { frame: 1, kind: "patch", schedule: "fixedUpdate", system: "rotate", tick: 1, command: "setComponent", component: "Transform", entity: "cube", value: { x: 1.1234567 } },
  ]);

  const comparison = compareV4EffectLogs(log, log);

  assert.equal(comparison.status, "pass");
  assert.deepEqual(comparison.diagnostics, []);
  assert.equal(comparison.summary.webEntries, 1);
});

test("v4LogCompare should report first mismatched command", () => {
  const web = effectLog([
    { frame: 1, kind: "command", schedule: "fixedUpdate", system: "spawnProjectileCommand", tick: 1, command: "spawn", entity: "projectile.spawned" },
  ]);
  const native = effectLog([
    { frame: 1, kind: "command", schedule: "fixedUpdate", system: "spawnProjectileCommand", tick: 1, command: "despawn", entity: "projectile.spawned" },
  ]);

  const comparison = compareV4EffectLogs(web, native);

  assert.equal(comparison.status, "fail");
  assert.equal(comparison.diagnostics[0]?.code, "TN_V4_EFFECT_LOG_COMMAND_MISMATCH");
  assert.match(comparison.diagnostics[0]?.message ?? "", /spawnProjectileCommand|command/);
  assert.equal(comparison.firstMismatch?.path, "entries/0/command");
});

test("v4LogCompare should compare resource entries deterministically", () => {
  const log = effectLog([
    { frame: 1, kind: "resource", schedule: "update", system: "resourceEventProbe", tick: 1, resource: "Score", value: { value: 5 } },
    { frame: 1, kind: "event", schedule: "update", system: "resourceEventProbe", tick: 1, event: "DamageEvent", payload: { amount: 3 } },
  ]);

  const comparison = compareV4EffectLogs(log, effectLog([...log.entries].reverse()));

  assert.equal(comparison.status, "pass");
  assert.deepEqual(comparison.diagnostics, []);
});

function effectLog(entries: IV4EffectLog["entries"]): IV4EffectLog {
  return { entries, schema: "threenative.web-system-effects", version: 1 };
}
