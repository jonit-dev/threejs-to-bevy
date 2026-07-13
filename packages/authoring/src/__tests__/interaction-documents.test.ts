import assert from "node:assert/strict";
import test from "node:test";

import { classifyAuthoringDocument, classifyAuthoringDocumentPath } from "../documents.js";

test("classifies dedicated interaction documents by suffix and schema", () => {
  assert.equal(classifyAuthoringDocumentPath("content/interactions/arena.interactions.json"), "interaction");
  assert.equal(classifyAuthoringDocument("content/gameplay/arena.json", { schema: "threenative.interactions", version: 1, id: "arena", interactions: [] }), "interaction");
});
