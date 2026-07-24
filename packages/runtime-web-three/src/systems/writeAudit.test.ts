import assert from "node:assert/strict";
import test from "node:test";

import { createRuntimeWriteLedger } from "./writeAudit.js";

test("normal write ledger does not inspect or retain detailed write values", () => {
  let valueReads = 0;
  const value = Object.defineProperty({}, "expensive", {
    enumerable: true,
    get() {
      valueReads += 1;
      return [1, 2, 3];
    },
  });
  const ledger = createRuntimeWriteLedger();

  ledger.record({
    newValue: value,
    path: "State/value",
    targetId: "runtime",
    targetKind: "state",
    tick: 1,
    writer: "script",
  });

  assert.equal(valueReads, 0);
  assert.deepEqual(ledger.observations(), []);
});

test("normal write ledger preserves transform conflict diagnostics", () => {
  const ledger = createRuntimeWriteLedger();
  ledger.beginTick(3);
  ledger.record({
    path: "Transform/position",
    system: "physics",
    targetId: "player",
    targetKind: "component",
    tick: 3,
    writer: "physics",
  });
  ledger.record({
    path: "Transform/position",
    system: "flight",
    targetId: "player",
    targetKind: "component",
    tick: 3,
    writer: "script",
  });

  assert.equal(ledger.diagnostics(3)[0]?.code, "TN_RUNTIME_WRITE_CONFLICT");
  assert.match(ledger.diagnostics(3)[0]?.message ?? "", /physics \(physics\) and script \(flight\)/);
});

test("detailed write ledger retains deterministic observations when requested", () => {
  const ledger = createRuntimeWriteLedger({ captureObservations: true });
  ledger.record({
    newValue: [1, 2, 3],
    path: "Transform/position",
    system: "flight",
    targetId: "player",
    targetKind: "component",
    tick: 1,
    writer: "script",
  });

  assert.equal(ledger.observations().length, 1);
  assert.equal(ledger.observations()[0]?.fingerprint, "fnv1a:e0f965d9");
});

test("write ledger snapshots serialize the retained observations once at the boundary", () => {
  const ledger = createRuntimeWriteLedger({ captureObservations: true });
  ledger.record({
    newValue: [1, 2, 3],
    path: "Transform/position",
    system: "flight",
    targetId: "player",
    targetKind: "component",
    tick: 1,
    writer: "script",
  });

  const snapshot = ledger.snapshot();

  assert.equal(snapshot.schema, "threenative.runtime-write-audit");
  assert.equal(snapshot.version, "0.1.0");
  assert.equal(snapshot.observations.length, 1);
  assert.notEqual(snapshot.observations, ledger.observations());
});

test("normal and detailed ledgers make identical conflict decisions", () => {
  const signatures = (captureObservations: boolean) => {
    const ledger = createRuntimeWriteLedger({ captureObservations });
    ledger.record({ path: "Transform/position", system: "physics", targetId: "player", targetKind: "component", tick: 4, writer: "physics" });
    ledger.record({ path: "Transform/position", system: "flight", targetId: "player", targetKind: "component", tick: 4, writer: "script" });
    return ledger.diagnostics(4).map((diagnostic) => `${diagnostic.code}:${diagnostic.path}:${diagnostic.message}`);
  };

  assert.deepEqual(signatures(false), signatures(true));
});
