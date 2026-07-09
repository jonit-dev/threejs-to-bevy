import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorApp, EditorModalView } from "./EditorApp.js";
import { EDITOR_ADD_COMPONENT_DEFINITIONS, EDITOR_MODAL_ACTION_DEFINITIONS, type IEditorShellModel } from "./adapters/editorModel.js";
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
  assert.match(html, /Gamepad: <strong>1 Connected<\/strong>/);
  assert.match(html, /Xbox Wireless Controller/);
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
      assets={[]}
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

test("should disable modal actions without source operations", () => {
  useEditorStore.getState().reset();

  const html = renderToStaticMarkup(
    <EditorModalView
      addComponentDefinitions={[]}
      assets={[]}
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

  assert.match(html, /Empty Entity/);
  assert.match(html, /Camera/);
  assert.match(html, /Light/);
  assert.match(html, /title="scene.add_entity"/);
  assert.match(html, /title="environment.add_flat_terrain"/);
  assert.match(html, /Custom GLB import needs a promoted asset and prefab operation before it can be enabled/);
});

test("should enable custom GLB modal actions for project model assets", () => {
  useEditorStore.getState().reset();

  const html = renderToStaticMarkup(
    <EditorModalView
      addComponentDefinitions={[]}
      assets={[{ access: "sourcePersistable", id: "asset:model.house", kind: "model", label: "model.house", path: "assets/models/house.glb" }]}
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

  assert.match(html, /model.house/);
  assert.match(html, /title="assets\/models\/house.glb"/);
});

test("should expose accessible gizmo mode controls", () => {
  useEditorStore.getState().reset();

  const html = renderToStaticMarkup(<EditorApp model={modelFixture()} />);

  assert.match(html, /aria-label="Gizmo mode"/);
  assert.match(html, /aria-pressed="true"[^>]*title="Move gizmo mode"/);
  assert.match(html, /title="Rotate gizmo mode"/);
  assert.match(html, /title="Scale gizmo mode"/);
});

test("should disable playback controls with a stable source-backed reason", () => {
  useEditorStore.getState().reset();

  const html = renderToStaticMarkup(<EditorApp model={modelFixture()} />);

  assert.match(html, /aria-label="Playback controls"/);
  assert.equal((html.match(/Playback controls require a promoted preview runtime state operation before they are enabled\./g) ?? []).length, 3);
  assert.match(html, /tn-editor-icon-button--play" disabled=""/);
});

test("should render disabled toolbar workflows with modal reasons", () => {
  useEditorStore.getState().reset();
  const deleteReason = modalReason("delete.selection");
  const settingsReason = modalReason("settings.editor");

  const toolbarHtml = renderToStaticMarkup(<EditorApp model={modelFixture()} />);
  assert.match(toolbarHtml, new RegExp(`aria-label="Delete"[^>]*title="${escapeRegExp(deleteReason)}"`));
  assert.match(toolbarHtml, new RegExp(`aria-label="Settings"[^>]*title="${escapeRegExp(settingsReason)}"`));

  useEditorStore.getState().openModal("delete");
  const deleteHtml = renderToStaticMarkup(<EditorApp model={modelFixture()} />);
  assert.match(deleteHtml, new RegExp(escapeRegExp(deleteReason)));

  useEditorStore.getState().openModal("settings");
  const settingsHtml = renderToStaticMarkup(<EditorApp model={modelFixture()} />);
  assert.match(settingsHtml, new RegExp(escapeRegExp(settingsReason)));
});

test("should render read-only retained UI preview over the viewport", () => {
  useEditorStore.getState().reset();

  const html = renderToStaticMarkup(<EditorApp model={modelFixture()} />);

  assert.match(html, /aria-label="Read-only UI preview"/);
  assert.match(html, /UI Preview/);
  assert.match(html, /Read-only source preview/);
  assert.match(html, /data-ui-document="hud"/);
  assert.match(html, /data-ui-node="score-label"[^>]*>Score 3/);
  assert.match(html, /Preview interaction is read-only in the editor/);
});

test("should omit UI preview chrome when no retained UI source is loaded", () => {
  useEditorStore.getState().reset();

  const html = renderToStaticMarkup(<EditorApp model={{ ...modelFixture(), uiPreview: [] }} />);

  assert.doesNotMatch(html, /Read-only UI preview/);
});

test("should render chat input and plan controls", () => {
  useEditorStore.getState().reset({
    chat: {
      draft: "add cube",
      pendingPlan: {
        affectedFiles: ["content/scenes/arena.scene.json"],
        approvalToken: "approve:1",
        diagnostics: [],
        id: "plan:1",
        message: "add cube",
        ok: true,
        operations: [{ args: { entityId: "chat-cube", sceneId: "arena" }, description: "Add cube", name: "scene.add_entity" }],
        projectRevision: "rev:1",
        risks: [],
        summary: "Add chat-cube.",
      },
      status: "planned",
      transcript: [{ id: "user:0", role: "user", text: "add cube" }],
    },
    modal: "chat",
    project: { projectRevision: "rev:1" },
  });

  const html = renderToStaticMarkup(
    <EditorModalView
      addComponentDefinitions={[]}
      assets={[]}
      attachedComponents={[]}
      modal="chat"
      onAddComponent={() => {}}
      onAddObject={() => {}}
      onBuildPreview={() => {}}
      onClose={() => {}}
      onCreateScene={() => {}}
      onSaveScene={() => {}}
    />,
  );

  assert.match(html, /AI Chat/);
  assert.match(html, /aria-label="AI chat message"/);
  assert.doesNotMatch(html, /readOnly/);
  assert.match(html, /Plan/);
  assert.match(html, /Plan source-backed ECS operations/);
});

test("should render script code mode without mixing script references", () => {
  useEditorStore.getState().reset({
    modal: "script",
    scriptSource: {
      body: "export function editorSpin(ctx: unknown): void { void ctx; }\n",
      diagnostics: [],
      dirty: false,
      loading: false,
      path: "src/scripts/editor-spin.ts",
    },
  });

  const html = renderToStaticMarkup(
    <EditorModalView
      addComponentDefinitions={[]}
      assets={[]}
      attachedComponents={[]}
      modal="script"
      onAddComponent={() => {}}
      onAddObject={() => {}}
      onBuildPreview={() => {}}
      onClose={() => {}}
      onCreateScene={() => {}}
      onSaveScene={() => {}}
      scriptSource={useEditorStore.getState().scriptSource}
    />,
  );

  assert.match(html, /Script Code/);
  assert.match(html, /src\/scripts\/editor-spin.ts/);
  assert.match(html, /aria-label="Script source"/);
  assert.doesNotMatch(html, /modulePath/);
});

function modalReason(id: string): string {
  const action = EDITOR_MODAL_ACTION_DEFINITIONS.find((candidate) => candidate.id === id);
  assert.ok(action?.readOnlyReason, `Missing read-only reason for ${id}`);
  return action.readOnlyReason;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function modelFixture(): IEditorShellModel {
  return {
    addComponentDefinitions: [...EDITOR_ADD_COMPONENT_DEFINITIONS],
    assets: [{ access: "inspectableOnly", id: "asset:material.player", kind: "material", label: "material.player" }],
    diagnostics: [{ code: "TN_TEST", message: "fixture diagnostic", severity: "info" }],
    gamepadViewer: {
      controls: [
        { control: "buttonSouth", kind: "button", owner: "Interact" },
        { control: "leftStickX", kind: "axis", owner: "MoveX" },
      ],
      devices: [{ axes: 4, buttons: 17, id: "Xbox Wireless Controller", index: 0, mapping: "standard", status: "connected" }],
      requiredControls: [],
    },
    hierarchy: [{ access: "sourcePersistable", badge: "entity", id: "entity:player", label: "player" }],
    inspector: [{ access: "sourcePersistable", id: "property:transform", label: "Transform", readOnly: false, value: "[0, 1, 0]" }],
    lod: { budget: 200000, loadedTriangles: 12, loading: false, mode: "auto", precision: "estimate", selected: "original", triangleCount: 12 },
    projectName: "fixture",
    sceneObjects: [{ id: "player", kind: "entity", label: "player", primitive: "box", rowId: "entity:player" }],
    status: "ready",
    statusItems: [],
    uiPreview: [
      {
        documentPath: "content/ui/hud.ui.json",
        id: "hud",
        nodes: [
          { backgroundColor: "#101820", color: "#ffffff", fontSize: 18, id: "score-label", kind: "text", text: "Score 3" },
          { action: "Pause", id: "pause", kind: "button", label: "Pause", text: "Pause" },
        ],
        readOnlyReason: "Editor UI preview is read-only; edits go through source-backed UI operations.",
      },
    ],
  };
}
