import assert from "node:assert/strict";
import test from "node:test";

import { resolvePreviewSelection } from "./selectionBridge.js";

test("should map source entity to runtime metadata", () => {
  assert.deepEqual(resolvePreviewSelection("player", { entities: [{ runtimeId: "world:0", sourceEntityId: "player" }] }), {
    runtimeId: "world:0",
    sourceEntityId: "player",
  });
  assert.equal(resolvePreviewSelection("missing", { entities: [{ runtimeId: "world:0", sourceEntityId: "player" }] }), undefined);
});
