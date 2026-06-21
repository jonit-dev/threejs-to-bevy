import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorApp, EditorModalView } from "./EditorApp.js";
import { EDITOR_ADD_COMPONENT_DEFINITIONS, type IEditorShellModel } from "./adapters/editorModel.js";
import { useEditorStore } from "./state/editorStore.js";

test("should render shell sections from adapter data", () => {
  useEditorStore.getState().reset();
  const html = renderToStaticMarkup(<EditorApp model={modelFixture()} />);

  assert.match(html, /ThreeNative/);
  assert.match(html, /Editor v0.1.0/);
  assert.match(html, /Hierarchy/);
  assert.match(html, /Inspector/);
  assert.match(html, /Assets/);
  assert.match(html, /Diagnostics/);
  assert.match(html, /Documents: 1/);
  assert.match(html, /player/);
  assert.match(html, /material.player/);
});

test("should render empty project state", () => {
  useEditorStore.getState().reset();
  const html = renderToStaticMarkup(<EditorApp model={{ projectName: "empty" }} />);

  assert.match(html, /No source or inspection hierarchy loaded/);
  assert.match(html, /Select a source document or inspected row/);
  assert.match(html, /No assets loaded/);
  assert.match(html, /No diagnostics/);
  assert.match(html, /No project data loaded/);
});

test("should render modal actions from modal view", () => {
  useEditorStore.getState().reset();

  const html = renderToStaticMarkup(
    <EditorModalView
      addComponentDefinitions={[]}
      attachedComponents={[]}
      modal="addObject"
      onAddComponent={() => {}}
      onAddObject={() => {}}
      onBuildPreview={() => {}}
      onClose={() => {}}
      onCreateScene={() => {}}
      onSaveScene={() => {}}
    />,
  );

  assert.match(html, /Add Object/);
  assert.match(html, /Primitive Sphere/);
  assert.match(html, /Custom GLB/);
});

function modelFixture(): IEditorShellModel {
  return {
    addComponentDefinitions: [...EDITOR_ADD_COMPONENT_DEFINITIONS],
    assets: [{ access: "inspectableOnly", id: "asset:material.player", kind: "material", label: "material.player" }],
    diagnostics: [{ code: "TN_TEST", message: "fixture diagnostic", severity: "info" }],
    hierarchy: [{ access: "sourcePersistable", badge: "entity", id: "entity:player", label: "player" }],
    inspector: [{ access: "sourcePersistable", id: "property:transform", label: "Transform", readOnly: false, value: "[0, 1, 0]" }],
    lod: { budget: 200000, loadedTriangles: 12, loading: false, mode: "auto", selected: "original", triangleCount: 12 },
    projectName: "fixture",
    sceneObjects: [{ id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:player" }],
    status: "ready",
    statusItems: [],
  };
}
