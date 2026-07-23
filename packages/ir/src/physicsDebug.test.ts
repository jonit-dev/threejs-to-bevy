import assert from "node:assert/strict";
import test from "node:test";

import { PHYSICS_DEBUG_CATEGORIES, PHYSICS_DEBUG_DEFAULTS, PHYSICS_DEBUG_LIMITS, PHYSICS_DEBUG_PRIMITIVE_KINDS } from "./physicsDebug.js";

test("physics debug registry should own stable sorted categories, kinds, and output caps", () => {
  assert.deepEqual(PHYSICS_DEBUG_CATEGORIES, [...PHYSICS_DEBUG_CATEGORIES].sort());
  assert.equal(new Set(PHYSICS_DEBUG_CATEGORIES).size, PHYSICS_DEBUG_CATEGORIES.length);
  assert.deepEqual(PHYSICS_DEBUG_PRIMITIVE_KINDS, [...PHYSICS_DEBUG_PRIMITIVE_KINDS].sort());
  assert.equal(PHYSICS_DEBUG_LIMITS.summaryPrimitives, 512);
  assert.equal(PHYSICS_DEBUG_LIMITS.artifactPrimitives, 16_384);
  assert.equal(PHYSICS_DEBUG_LIMITS.timings, 256);
  assert.deepEqual(PHYSICS_DEBUG_DEFAULTS, { artifactPrimitives: 4096, summaryPrimitives: 128, timings: 64 });
});
