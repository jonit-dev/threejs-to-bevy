import assert from "node:assert/strict";
import test from "node:test";

import { runPortableFeedbackGate } from "./portableFeedbackGate.js";

test("portable feedback gate accepts the shared fixture and paired runtime proof", async () => {
  const result = await runPortableFeedbackGate();

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});
