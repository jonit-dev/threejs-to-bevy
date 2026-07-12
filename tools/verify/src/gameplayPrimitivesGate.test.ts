import assert from "node:assert/strict";
import test from "node:test";

import { runGameplayPrimitivesGate } from "./gameplayPrimitivesGate.js";

test("gameplay primitives gate accepts the shared fixture and proof enrollment", async () => {
  const result = await runGameplayPrimitivesGate();

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});
