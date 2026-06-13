import assert from "node:assert/strict";
import test from "node:test";

import { reduceHealth } from "./gameplay.js";

test("should reduce health when damage event is handled", () => {
  const result = reduceHealth({ current: 25, max: 100 }, 30);

  assert.deepEqual(result.health, { current: 0, max: 100 });
  assert.equal(result.dead, true);
});
