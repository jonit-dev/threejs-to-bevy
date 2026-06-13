import assert from "node:assert/strict";
import test from "node:test";

import { animationPlayPayload } from "./animation.js";

test("should log animation play service call", () => {
  assert.deepEqual(animationPlayPayload({ clip: "run", entity: "player", options: { loop: true } }), {
    request: { clip: "run", entity: "player", options: { loop: true } },
    result: { accepted: true },
  });
});
