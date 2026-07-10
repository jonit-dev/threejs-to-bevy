import assert from "node:assert/strict";
import test from "node:test";

import { componentRegistry, supportedComponentKinds } from "./schemas.js";

test("component registry should own ContactShadows fields and enrollment", () => {
  assert.equal(supportedComponentKinds.has("ContactShadows"), true);
  assert.deepEqual([...componentRegistry.ContactShadows.keys], [
    "height",
    "opacity",
    "resolution",
    "size",
    "softness",
    "updateMode",
  ]);
});
