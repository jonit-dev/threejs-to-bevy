import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEditorInspectorSnapshot,
  buildEditorToolSnapshot,
  buildEditorVisualPanelSnapshot,
  diffEditorProjectSnapshots,
  type IEditorProjectSnapshot,
  validateEditorPropertyEdit,
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
      "../world.ir.json": { schema: "threenative.world" },
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

test("should reject property edit when path targets runtime-only data", () => {
  assert.deepEqual(validateEditorPropertyEdit("/documents/world.ir.json/entities/0/components/Runtime/runtimeHandle").map((diagnostic) => diagnostic.code), [
    "TN_IR_EDITOR_PROPERTY_RUNTIME_ONLY",
  ]);
});

test("should build inspector metadata from structured bundle documents", () => {
  const inspector = buildEditorInspectorSnapshot({
    "assets.manifest.json": { assets: [{ id: "model.player" }] },
    "world.ir.json": {
      entities: [{ components: { MeshRenderer: { mesh: "model.player" }, Transform: { position: [0, 1, 0] } }, id: "player" }],
    },
  });

  assert.deepEqual(inspector.hierarchy[0], {
    children: [],
    components: ["MeshRenderer", "Transform"],
    id: "player",
    label: "player",
    path: "/documents/world.ir.json/entities/0",
  });
  assert.equal(inspector.assetRefs[0], "model.player");
  assert.equal(inspector.editableProperties.some((property) => property.path.endsWith("/Transform/position/1")), true);
  assert.equal(inspector.hotReload.some((entry) => entry.policy === "reloadRejected"), true);
});

test("should build visual editor panel metadata from inspector data", () => {
  const inspector = buildEditorInspectorSnapshot({
    "assets.manifest.json": { assets: [{ id: "model.player" }] },
    "world.ir.json": {
      entities: [{ components: { MeshRenderer: { mesh: "model.player" }, Transform: { position: [0, 1, 0] } }, id: "player" }],
    },
  });
  inspector.diagnostics.push({
    code: "TN_TEST",
    message: "Example diagnostic.",
    path: "world.ir.json/entities/0",
    severity: "warning",
  });

  const panels = buildEditorVisualPanelSnapshot(inspector);

  assert.equal(panels.schema, "threenative.editor-visual-panels");
  assert.equal(panels.selectedNode, "player");
  assert.deepEqual(panels.summary, {
    assets: 1,
    diagnostics: 1,
    editableProperties: inspector.editableProperties.length,
    rootNodes: 1,
  });
  assert.equal(panels.panels.map((panel) => panel.id).join(","), "scene-hierarchy,properties,assets,diagnostics,hot-reload");
  assert.equal(panels.panels[0]?.rows[0]?.label, "player");
  assert.equal(panels.panels[1]?.rows.some((row) => row.path?.endsWith("/Transform/position/1")), true);
  assert.equal(panels.panels[2]?.rows[0]?.label, "model.player");
  assert.equal(panels.panels[3]?.rows[0]?.badge, "TN_TEST");
  assert.equal(panels.panels[4]?.rows.some((row) => row.badge === "reloadRejected"), true);
});

test("should build scene viewer asset preview and gamepad tool metadata", () => {
  const tools = buildEditorToolSnapshot({
    "assets.manifest.json": {
      assets: [
        { format: "gltf", id: "model.player", kind: "model", path: "assets/player.gltf", sourceMode: "bundle" },
        { format: "png", id: "tex.ui", kind: "texture", path: "assets/ui.png" },
      ],
    },
    "input.ir.json": {
      actions: [{ bindings: [{ control: "buttonSouth", device: "gamepad", required: false }], id: "Jump" }],
      axes: [{ id: "MoveX", value: { control: "leftStickX", device: "gamepad", required: false } }],
    },
    "world.ir.json": {
      entities: [
        { components: { Camera: {}, Transform: { position: [0, 2, 6] } }, id: "camera" },
        { components: { MeshRenderer: { mesh: "model.player" }, Transform: { position: [3, 0, -1] } }, id: "player" },
      ],
    },
  });

  assert.equal(tools.schema, "threenative.editor-tools");
  assert.deepEqual(tools.sceneViewer.cameras, ["camera"]);
  assert.deepEqual(tools.sceneViewer.renderables, ["player"]);
  assert.deepEqual(tools.sceneViewer.bounds, { max: [3, 2, 6], min: [0, 0, -1] });
  assert.equal(tools.assetPreview.selectedAsset, "model.player");
  assert.deepEqual(tools.assetPreview.assets.map((asset) => asset.id), ["model.player", "tex.ui"]);
  assert.deepEqual(
    tools.gamepadViewer.controls.map((control) => `${control.owner}:${control.control}:${control.kind}`),
    ["Jump:buttonSouth:button", "MoveX:leftStickX:axis"],
  );
  assert.deepEqual(tools.gamepadViewer.devices, [{ id: "declared-gamepad", status: "declared" }]);
});

function makeSnapshot(documents: Record<string, unknown>): IEditorProjectSnapshot {
  return {
    documents,
    name: "editor-test",
    schema: "threenative.editor-project",
    version: "0.1.0",
  };
}
