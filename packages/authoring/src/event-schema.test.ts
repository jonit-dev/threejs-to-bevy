import assert from "node:assert/strict";
import test from "node:test";

import { validateAuthoringDocument } from "./operations/sharedA.js";

test("accepts canonical colon-delimited event schema ids", async () => {
  const diagnostics = await validateAuthoringDocument("/project", "content/schemas/events.schema.json", "schema", {
    schema: "threenative.schema",
    version: "0.1.0",
    id: "events",
    kind: "event",
    schemas: [{ id: "inventory:use-item", fields: { itemId: { kind: "string" } } }],
  }, {} as never);

  assert.deepEqual(diagnostics, []);
});
