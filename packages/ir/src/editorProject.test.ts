import assert from "node:assert/strict";
import test from "node:test";

import {
  diffEditorProjectSnapshots,
  type IEditorProjectSnapshot,
  validateEditorProjectSnapshot,
} from "./editorProject.js";

test("should validate structured editor project snapshots", () => {
  const snapshot = makeSnapshot({
    "world.ir.json": {
      entities: [{ components: { Transform: { position: [0, 0, 0] } }, id: "player" }],
      schema: "threenative.world",
      version: "0.1.0",
    },
  });

  assert.deepEqual(validateEditorProjectSnapshot(snapshot), []);
});

test("should reject invalid editor snapshot shape", () => {
  const diagnostics = validateEditorProjectSnapshot({
    documents: {
      "world.ir": { schema: "threenative.world" },
      "world.ir.json": () => undefined,
    },
    metadata: [],
    name: "",
    schema: "wrong",
    version: "9.9.9",
  });

  assert.deepEqual(
    diagnostics.map((diagnostic) => diagnostic.code),
    [
      "TN_IR_EDITOR_PROJECT_SCHEMA_INVALID",
      "TN_IR_EDITOR_PROJECT_VERSION_UNSUPPORTED",
      "TN_IR_EDITOR_PROJECT_NAME_INVALID",
      "TN_IR_EDITOR_PROJECT_DOCUMENT_PATH_INVALID",
      "TN_IR_EDITOR_PROJECT_DOCUMENT_INVALID",
      "TN_IR_EDITOR_PROJECT_METADATA_INVALID",
    ],
  );
});

test("should produce deterministic structured editor diffs", () => {
  const before = makeSnapshot({
    "materials.ir.json": { materials: [{ color: "#fff", id: "mat.floor", kind: "standard" }] },
    "world.ir.json": {
      entities: [{ components: { Transform: { position: [0, 0, 0] } }, id: "player" }],
    },
  });
  const after = makeSnapshot({
    "audio.ir.json": { music: [], oneShots: [] },
    "world.ir.json": {
      entities: [{ components: { Transform: { position: [1, 0, 0] } }, id: "player" }],
    },
  });

  assert.deepEqual(diffEditorProjectSnapshots(before, after), [
    {
      after: { music: [], oneShots: [] },
      op: "add",
      path: "/documents/audio.ir.json",
    },
    {
      before: { materials: [{ color: "#fff", id: "mat.floor", kind: "standard" }] },
      op: "remove",
      path: "/documents/materials.ir.json",
    },
    {
      after: 1,
      before: 0,
      op: "replace",
      path: "/documents/world.ir.json/entities/0/components/Transform/position/0",
    },
  ]);
});

function makeSnapshot(documents: Record<string, unknown>): IEditorProjectSnapshot {
  return {
    documents,
    name: "editor-test",
    schema: "threenative.editor-project",
    version: "0.1.0",
  };
}
