import assert from "node:assert/strict";
import test from "node:test";

import { useEditorStore } from "./editorStore.js";

test("should manage modal and selection state through editor store", () => {
  useEditorStore.getState().reset();

  useEditorStore.getState().openModal("addObject");
  useEditorStore.getState().selectRow("entity:content/scenes/arena.scene.json:player");
  useEditorStore.getState().setStatus("Selecting player");

  assert.equal(useEditorStore.getState().modal, "addObject");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:content/scenes/arena.scene.json:player");
  assert.equal(useEditorStore.getState().status, "Selecting player");

  useEditorStore.getState().closeModal();
  assert.equal(useEditorStore.getState().modal, undefined);
});

test("should reset editor store session state", () => {
  useEditorStore.getState().reset({
    modal: "build",
    selectedRowId: "entity:player",
    status: "Building",
  });

  assert.equal(useEditorStore.getState().modal, "build");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:player");
  assert.equal(useEditorStore.getState().status, "Building");

  useEditorStore.getState().reset();
  assert.equal(useEditorStore.getState().modal, undefined);
  assert.equal(useEditorStore.getState().selectedRowId, undefined);
  assert.equal(useEditorStore.getState().status, "Ready");
});

test("should reject recursive hierarchy nesting", () => {
  useEditorStore.getState().reset();

  assert.equal(useEditorStore.getState().setParent("child", "parent"), true);
  assert.equal(useEditorStore.getState().setParent("parent", "child"), false);
  assert.equal(useEditorStore.getState().parentByRowId.parent, undefined);
  assert.equal(useEditorStore.getState().parentByRowId.child, "parent");
});

test("should apply and clear viewport transform overrides", () => {
  useEditorStore.getState().reset();

  useEditorStore.getState().setTransformOverride("entity:player", {
    position: [1, 2, 3],
    rotation: [0, 0.5, 0],
    scale: [1, 1, 1],
  });

  assert.deepEqual(useEditorStore.getState().transformByRowId["entity:player"]?.position, [1, 2, 3]);
  useEditorStore.getState().clearTransformOverride("entity:player");
  assert.equal(useEditorStore.getState().transformByRowId["entity:player"], undefined);
});

test("should store project payload and selected row together", () => {
  useEditorStore.getState().reset();

  useEditorStore.getState().setProject({
    ok: true,
    projectPath: "/tmp/project",
    sceneObjects: [{ id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:player" }],
  });
  useEditorStore.getState().selectRow("entity:player");

  assert.equal(useEditorStore.getState().project?.projectPath, "/tmp/project");
  assert.equal(useEditorStore.getState().project?.sceneObjects?.[0]?.id, "player");
  assert.equal(useEditorStore.getState().selectedRowId, "entity:player");
});
