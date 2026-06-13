import assert from "node:assert/strict";
import test from "node:test";

import { createSystemEffectLog, serializeSystemEffectLog } from "./log.js";

test("should produce deterministic patch log", () => {
  const first = createSystemEffectLog();
  const second = createSystemEffectLog();
  first.entries.push(
    { component: "Transform", entity: "cube.b", frame: 0, kind: "patch", schedule: "fixedUpdate", system: "rotate", tick: 1, value: { z: 2, x: 1.1234567 } },
    { event: "HitEvent", frame: 0, kind: "event", payload: { target: "floor", source: "cube" }, schedule: "fixedUpdate", system: "rotate", tick: 1 },
  );
  second.entries.push(
    { event: "HitEvent", frame: 0, kind: "event", payload: { source: "cube", target: "floor" }, schedule: "fixedUpdate", system: "rotate", tick: 1 },
    { component: "Transform", entity: "cube.b", frame: 0, kind: "patch", schedule: "fixedUpdate", system: "rotate", tick: 1, value: { x: 1.123456789, z: 2 } },
  );

  assert.equal(serializeSystemEffectLog(first), serializeSystemEffectLog(second));
  assert.match(serializeSystemEffectLog(first), /"schema": "threenative.web-system-effects"/);
});
