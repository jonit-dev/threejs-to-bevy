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

