import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEditorDocumentClassifications,
  buildEditorInspectorSnapshot,
  buildEditorToolSnapshot,
  buildEditorVisualPanelSnapshot,
  classifyEditorDocumentPath,
  diffEditorProjectSnapshots,
  type IEditorProjectSnapshot,
  normalizeEditorSourcePatches,
  validateEditorDocumentKindTransition,
  validateEditorPropertyEdit,
  validateEditorProjectSnapshot,
  validateEditorSourcePatch,
  validateEditorSourcePatchSet,
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

test("should classify editor documents by source generated runtime and derived kind", () => {
  assert.deepEqual(buildEditorDocumentClassifications({
    "authoring.provenance.json": {},
    "preview/session.json": {},
    "src/scenes/arena.scene.json": {},
    "world.ir.json": {},
  }), {
    "authoring.provenance.json": { access: "derivedView", kind: "derived" },
    "preview/session.json": { access: "runtimeOnly", kind: "runtime" },
    "src/scenes/arena.scene.json": { access: "sourcePersistable", kind: "source", sourcePath: "src/scenes/arena.scene.json" },
    "world.ir.json": { access: "inspectableOnly", kind: "generated" },
  });
  assert.deepEqual(classifyEditorDocumentPath("runtime/entity-state.json"), { access: "runtimeOnly", kind: "runtime" });
});

test("should validate editor document classification access policies", () => {
  const snapshot = makeSnapshot({
    "authoring.provenance.json": {},
    "preview/session.json": {},
    "src/scenes/arena.scene.json": {},
    "world.ir.json": {},
  });
  snapshot.documentKinds = {
    "authoring.provenance.json": { access: "sourcePersistable", kind: "derived" },
    "missing.json": { access: "inspectableOnly", kind: "generated" },
    "preview/session.json": { access: "inspectableOnly", kind: "runtime" },
    "src/scenes/arena.scene.json": { access: "inspectableOnly", kind: "source" },
    "world.ir.json": { access: "sourcePersistable", kind: "generated" },
  };

  assert.deepEqual(
    validateEditorProjectSnapshot(snapshot).map((diagnostic) => diagnostic.code),
    [
      "TN_IR_EDITOR_DERIVED_DOCUMENT_ACCESS_INVALID",
      "TN_IR_EDITOR_DOCUMENT_KIND_UNKNOWN_DOCUMENT",
      "TN_IR_EDITOR_RUNTIME_DOCUMENT_ACCESS_INVALID",
      "TN_IR_EDITOR_SOURCE_DOCUMENT_ACCESS_INVALID",
      "TN_IR_EDITOR_GENERATED_DOCUMENT_ACCESS_INVALID",
    ],
  );
});

test("should reject unsafe editor document kind transitions", () => {
  assert.deepEqual(
    validateEditorDocumentKindTransition(
      { access: "inspectableOnly", kind: "generated" },
      { access: "sourcePersistable", kind: "source" },
      "world.ir.json",
    ).map((diagnostic) => diagnostic.code),
    ["TN_IR_EDITOR_DOCUMENT_GENERATED_TO_SOURCE"],
  );
  assert.deepEqual(
    validateEditorDocumentKindTransition(
      { access: "runtimeOnly", kind: "runtime" },
      { access: "derivedView", kind: "derived" },
      "runtime/entity-state.json",
    ).map((diagnostic) => diagnostic.code),
    ["TN_IR_EDITOR_DOCUMENT_RUNTIME_TO_SOURCE"],
  );
  assert.deepEqual(
    validateEditorDocumentKindTransition(
      { access: "inspectableOnly", kind: "generated" },
      { access: "sourcePersistable", bridgedFrom: "world.ir.json", kind: "source", sourcePath: "src/scenes/arena.scene.json" },
      "world.ir.json",
    ),
    [],
  );
});

test("should validate structured editor source patches", () => {
  assert.deepEqual(validateEditorSourcePatch({
    declarationId: "player",
    id: "patch.player.position",
    operation: "replace",
    reloadPolicy: "hotReload",
    sourceDocument: "src/scenes/arena.scene.json",
    targetPath: "/entities/player/components/Transform/position",
    value: [1, 0, 0],
  }), []);

  assert.deepEqual(normalizeEditorSourcePatches([
    {
      declarationId: "goal",
      id: "patch.goal",
      operation: "replace",
      reloadPolicy: "fullReload",
      sourceDocument: "src/scenes/arena.scene.json",
      targetPath: "/entities/goal",
      value: { z: 2, x: 1 },
    },
    {
      declarationId: "player",
      id: "patch.player",
      operation: "replace",
      reloadPolicy: "hotReload",
      sourceDocument: "src/scenes/arena.scene.json",
      targetPath: "/entities/player",
      value: { b: 2, a: 1 },
    },
  ]).map((patch) => [patch.id, patch.value]), [
    ["patch.goal", { x: 1, z: 2 }],
    ["patch.player", { a: 1, b: 2 }],
  ]);
});

test("should reject unsafe editor source patches", () => {
  const diagnostics = validateEditorSourcePatchSet([
    {
      declarationId: "player",
      id: "patch.player",
      operation: "replace",
      reloadPolicy: "hotReload",
      sourceDocument: "dist/game.bundle/world.ir.json",
      targetPath: "/entities/player/runtimeHandle",
      value: { runtimeHandle: "three-object" },
    },
    {
      declarationId: "player",
      id: "patch.script",
      operation: "replace",
      reloadPolicy: "fullReload",
      sourceDocument: "src/scripts/player.ts",
      targetPath: "/systems/player/generatedScript",
      value: "const system_player = () => undefined; // Generated by ThreeNative",
    },
  ]);

  assert.deepEqual(diagnostics.map((diagnostic) => diagnostic.code), [
    "TN_IR_EDITOR_SOURCE_PATCH_DOCUMENT_INVALID",
    "TN_IR_EDITOR_SOURCE_PATCH_RUNTIME_TARGET",
    "TN_IR_EDITOR_SOURCE_PATCH_RUNTIME_HANDLE",
    "TN_IR_EDITOR_SOURCE_PATCH_GENERATED_TARGET",
    "TN_IR_EDITOR_SOURCE_PATCH_GENERATED_SCRIPT",
  ]);
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
