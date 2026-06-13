import assert from "node:assert/strict";
import test from "node:test";

import { reduceLifetime } from "./gameplay.js";

test("should reduce lifetime deterministically", () => {
  assert.deepEqual(reduceLifetime(0.02, 0.016), { expired: false, remaining: 0.004 });
  assert.deepEqual(reduceLifetime(0.004, 0.016), { expired: true, remaining: 0 });
});
