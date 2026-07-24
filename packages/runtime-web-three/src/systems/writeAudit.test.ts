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
