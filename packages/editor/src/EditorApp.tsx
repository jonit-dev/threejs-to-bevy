import { useEffect, type ReactNode } from "react";
import { Box, Camera, FolderOpen, Image, Lightbulb, MessageSquare, Mountain, PackagePlus, Pause, Play, Save, Settings, Square, Trash2 } from "lucide-react";

import type { IEditorAdapterInput, IEditorAddComponentDefinition, IEditorModalActionDefinition, IEditorPropertyRow, IEditorShellModel } from "./adapters/editorModel.js";
import { createEditorShellModel, EDITOR_MODAL_ACTION_DEFINITIONS } from "./adapters/editorModel.js";
import { PanelShell } from "./components/layout/PanelShell.js";
import { HierarchyPanel } from "./components/panels/HierarchyPanel.js";
import { InspectorPanel } from "./components/panels/InspectorPanel.js";
import { EditorViewport3d, type EditorViewportGizmoMode, type IViewportTransform } from "./preview/EditorViewport3d.js";
import { useEditorStore, type EditorModal } from "./state/editorStore.js";

export interface IEditorAppProps {
  model?: IEditorAdapterInput | IEditorShellModel;
  onAddComponent?: (definition: IEditorAddComponentDefinition) => void;
  onAddObject?: (action: IEditorModalActionDefinition) => void;
  onBuildPreview?: () => void;
  onCreateScene?: () => void;
  onEditProperty?: (row: IEditorPropertyRow, value: unknown) => void;
  onMoveRow?: (draggedId: string, targetId: string) => void;
  onSaveScene?: () => void;
  onSelectRow?: (id: string) => void;
  onTransformObject?: (rowId: string, transform: IViewportTransform) => void;
  toolbarSlot?: ReactNode;
}

const EDITOR_GIZMO_MODE_BUTTONS: Array<{ key: "E" | "R" | "W"; label: string; mode: EditorViewportGizmoMode }> = [
  { key: "W", label: "Move", mode: "translate" },
  { key: "E", label: "Rotate", mode: "rotate" },
  { key: "R", label: "Scale", mode: "scale" },
];

export function EditorApp({ model: input, onAddComponent, onAddObject, onBuildPreview, onCreateScene, onEditProperty, onMoveRow, onSaveScene, onSelectRow, onTransformObject, toolbarSlot }: IEditorAppProps) {
  const modal = useEditorStore((state) => state.modal);
  const gizmoMode = useEditorStore((state) => state.gizmoMode);
  const setGizmoMode = useEditorStore((state) => state.setGizmoMode);
  const openModal = useEditorStore((state) => state.openModal);
  const closeModal = useEditorStore((state) => state.closeModal);
  const model = createEditorShellModel(input);
  const objectCount = countTreeRows(model.hierarchy);
  const statusMessage = model.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "Needs attention" : "Ready";
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTextInputTarget(event.target)) {
        return;
      }
      const mode = gizmoModeFromKey(event.key);
      if (mode === undefined) {
        return;
      }
      event.preventDefault();
      setGizmoMode(mode);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setGizmoMode]);
  return (
    <main className="tn-editor-shell">
      <header className="tn-editor-menubar" aria-label="Main menu">
        {["File", "Edit", "GameObject", "Window", "Settings"].map((item) => (
          <button key={item} type="button">{item}</button>
        ))}
      </header>

      <header className="tn-editor-topbar">
        <div className="tn-editor-brand">
          <div className="tn-editor-brand__mark" aria-hidden="true"><Box size={15} /></div>
          <div>
            <strong>ThreeNative</strong>
            <span>Editor v0.1.0</span>
          </div>
        </div>
        <div className="tn-editor-topbar__divider" />
        <div className="tn-editor-badges" aria-label="Project status">
          <span className="tn-editor-badge tn-editor-badge--cyan">{objectCount} Objects</span>
          <span className={`tn-editor-badge tn-editor-badge--${model.status === "error" ? "red" : "green"}`}>{statusMessage}</span>
          <span className="tn-editor-badge tn-editor-badge--purple">Scene: {model.projectName}</span>
        </div>
        <div className="tn-editor-playback" aria-label="Playback controls">
          <button className="tn-editor-icon-button tn-editor-icon-button--play" title="Play" type="button"><Play size={16} /></button>
          <button className="tn-editor-icon-button" title="Pause" type="button"><Pause size={15} /></button>
          <button className="tn-editor-icon-button tn-editor-icon-button--stop" title="Stop" type="button"><Square size={14} /></button>
        </div>
        <div className="tn-editor-topbar__actions">
          {toolbarSlot}
          <div className="tn-editor-action-icons" aria-label="Editor actions">
            <button className="tn-editor-action-icons__add" onClick={() => openModal("addObject")} title="Add" type="button"><Box size={15} /> <span>Add</span></button>
            <button onClick={() => openModal("save")} title="Save" type="button"><Save size={16} /></button>
            <button onClick={() => openModal("newScene")} title="New scene" type="button"><FolderOpen size={16} /></button>
            <button onClick={() => openModal("delete")} title="Delete" type="button"><Trash2 size={16} /></button>
            <button onClick={() => openModal("settings")} title="Settings" type="button"><Settings size={16} /></button>
            <button onClick={() => openModal("build")} title="Build preview" type="button"><Image size={16} /></button>
          </div>
        </div>
      </header>

      <div className="tn-editor-workspace">
        <aside className="tn-editor-left-rail">
          <PanelShell title="Hierarchy" meta={`${model.hierarchy.length}`}>
            <HierarchyPanel rows={model.hierarchy} selectedRowId={model.selectedRowId} onMoveRow={onMoveRow} onSelectRow={onSelectRow} />
          </PanelShell>
          <PanelShell title="Inspector" meta={`${model.inspector.length}`}>
            <InspectorPanel onAddComponent={() => openModal("addComponent")} onEditProperty={onEditProperty} rows={model.inspector} />
          </PanelShell>
        </aside>
        <section className="tn-editor-preview" aria-label="Preview">
          <EditorViewport3d gizmoMode={gizmoMode} objects={model.sceneObjects} selectedRowId={model.selectedRowId} onSelectObject={onSelectRow} onTransformObject={onTransformObject} />
          <div className="tn-editor-viewport-label">
            <span />
            <strong>Viewport</strong>
            <small>Entity {model.selectedRowId === undefined ? "-" : model.selectedRowId.split(":").pop()}</small>
          </div>
          <div className="tn-editor-gizmo-switcher" aria-label="Gizmo mode">
            {EDITOR_GIZMO_MODE_BUTTONS.map((button) => (
              <button
                aria-pressed={gizmoMode === button.mode}
                className={gizmoMode === button.mode ? "tn-editor-gizmo-switcher__active" : undefined}
                key={button.mode}
                onClick={() => setGizmoMode(button.mode)}
                title={`${button.label} gizmo mode`}
                type="button"
              >
                {button.label} <kbd>{button.key}</kbd>
              </button>
            ))}
          </div>
          {model.status === "empty" ? (
            <div className="tn-editor-preview__message">
              <h1>Preview</h1>
              <p>No project data loaded.</p>
            </div>
          ) : null}
        </section>
        <aside className="tn-editor-right-rail">
          <div className="tn-editor-ai-channel" aria-label="AI chat channel">
            <button className="tn-editor-ai-channel__toggle" title="Collapse AI chat" type="button">&lt;</button>
            <button className="tn-editor-ai-channel__tab" onClick={() => openModal("chat")} title="AI chat" type="button">
              <MessageSquare aria-hidden="true" size={16} />
              <span>AI</span>
            </button>
          </div>
          <PanelShell title="Assets" meta={`${model.assets.length}`}>
            {model.assets.length === 0 ? (
              <p className="tn-editor-empty">No assets loaded.</p>
            ) : (
              <ul className="tn-editor-list">
                {model.assets.map((asset) => (
                  <li key={asset.id}>
                    <span>{asset.label}</span>
                    <small>{asset.kind ?? asset.access}</small>
                  </li>
                ))}
              </ul>
            )}
          </PanelShell>
          <PanelShell title="Diagnostics" meta={`${model.diagnostics.length}`}>
            {model.diagnostics.length === 0 ? (
              <p className="tn-editor-empty">No diagnostics.</p>
            ) : (
              <ul className="tn-editor-list">
                {model.diagnostics.map((diagnostic) => (
                  <li key={`${diagnostic.code}:${diagnostic.path ?? diagnostic.file ?? diagnostic.message}`}>
                    <span>{diagnostic.message}</span>
                    <small>{diagnostic.code}</small>
                  </li>
                ))}
              </ul>
            )}
          </PanelShell>
        </aside>
      </div>
      <footer className="tn-editor-statusbar">
        <span><i className="tn-editor-status-dot" /> {statusMessage}</span>
        <span>60 FPS</span>
        <span>128MB</span>
        <span>WebGL</span>
        <span className="tn-editor-statusbar__spacer" />
        <span>{model.lod.mode.toUpperCase()}</span>
        <span>TERRAIN</span>
        <span>LOD: <strong>{model.lod.selected}</strong></span>
        <span>Triangles: <strong>{formatNumber(model.lod.loadedTriangles)}</strong> / {formatNumber(model.lod.triangleCount)} / {formatNumber(model.lod.budget)} {model.lod.loading ? "(Loading)" : "(Good)"}</span>
        <span>{objectCount} Entities</span>
        {model.statusItems.map((item) => <span key={item.id}>{item.label}: {item.value}</span>)}
      </footer>
      <EditorModalView
        addComponentDefinitions={model.addComponentDefinitions}
        attachedComponents={[...new Set(model.inspector.map((row) => row.component).filter((component): component is string => component !== undefined))]}
        modal={modal}
        onAddObject={(action) => {
          closeModal();
          onAddObject?.(action);
        }}
        onAddComponent={(definition) => {
          closeModal();
          onAddComponent?.(definition);
        }}
        onBuildPreview={() => {
          closeModal();
          onBuildPreview?.();
        }}
        onClose={closeModal}
        onCreateScene={() => {
          closeModal();
          onCreateScene?.();
        }}
        onSaveScene={() => {
          closeModal();
          onSaveScene?.();
        }}
      />
    </main>
  );
}

function gizmoModeFromKey(key: string): EditorViewportGizmoMode | undefined {
  switch (key.toLowerCase()) {
    case "e":
      return "rotate";
    case "r":
      return "scale";
    case "w":
      return "translate";
    default:
      return undefined;
  }
}

function isTextInputTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
}

export function EditorModalView({
  addComponentDefinitions,
  attachedComponents,
  modal,
  onAddComponent,
  onAddObject,
  onBuildPreview,
  onClose,
  onCreateScene,
  onSaveScene,
}: {
  addComponentDefinitions: IEditorShellModel["addComponentDefinitions"];
  attachedComponents: readonly string[];
  modal: EditorModal;
  onAddComponent: (definition: IEditorAddComponentDefinition) => void;
  onAddObject: (action: IEditorModalActionDefinition) => void;
  onBuildPreview: () => void;
  onClose: () => void;
  onCreateScene: () => void;
  onSaveScene: () => void;
}) {
  if (modal === undefined) {
    return null;
  }
  if (modal === "addObject") {
    const actionById = new Map(EDITOR_MODAL_ACTION_DEFINITIONS.map((action) => [action.id, action]));
    const primitive = actionById.get("add.primitive_sphere");
    const empty = actionById.get("add.empty_entity");
    const camera = actionById.get("add.camera");
    const light = actionById.get("add.light");
    const terrain = actionById.get("add.terrain");
    const customGlb = actionById.get("add.custom_glb");
    return (
      <ModalFrame onClose={onClose} title="Add Object">
        <div className="tn-editor-modal-grid">
          {primitive === undefined ? null : <button onClick={() => onAddObject(primitive)} title={primitive.operationName} type="button"><PackagePlus size={16} /> Primitive Sphere</button>}
          {empty === undefined ? null : <button disabled={empty.readOnly} onClick={() => onAddObject(empty)} title={empty.readOnly ? empty.readOnlyReason : empty.operationName} type="button"><Box size={16} /> Empty Entity</button>}
          {camera === undefined ? null : <button disabled={camera.readOnly} onClick={() => onAddObject(camera)} title={camera.readOnly ? camera.readOnlyReason : camera.operationName} type="button"><Camera size={16} /> Camera</button>}
          {light === undefined ? null : <button disabled={light.readOnly} onClick={() => onAddObject(light)} title={light.readOnly ? light.readOnlyReason : light.operationName} type="button"><Lightbulb size={16} /> Light</button>}
          {terrain === undefined ? null : <button disabled title={terrain.readOnlyReason} type="button"><Mountain size={16} /> Terrain</button>}
          {customGlb === undefined ? null : <button disabled title={customGlb.readOnlyReason} type="button"><FolderOpen size={16} /> Custom GLB</button>}
        </div>
      </ModalFrame>
    );
  }
  if (modal === "addComponent") {
    return (
      <ModalFrame onClose={onClose} title="Add Component">
        <div className="tn-editor-modal-grid">
          {addComponentDefinitions.map((definition) => (
            <button
              disabled={attachedComponents.includes(definition.component) || definition.incompatibleWith.some((component) => attachedComponents.includes(component))}
              key={definition.component}
              onClick={() => onAddComponent(definition)}
              title={`Pack: ${definition.pack}; defaults: ${JSON.stringify(definition.defaults)}${definition.readOnlyReason === undefined ? "" : `; ${definition.readOnlyReason}`}`}
              type="button"
            >
              <PackagePlus size={16} /> {definition.component}
            </button>
          ))}
        </div>
      </ModalFrame>
    );
  }
  if (modal === "save") {
    return (
      <ModalFrame onClose={onClose} title="Save Scene">
        <p>Persist structured source documents for the current project.</p>
        <button className="tn-editor-modal-primary" onClick={onSaveScene} type="button">Save</button>
      </ModalFrame>
    );
  }
  if (modal === "newScene") {
    return (
      <ModalFrame onClose={onClose} title="New Scene">
        <p>Create a source-backed scene seeded with Main Camera, Directional Light, and Ambient Light.</p>
        <button className="tn-editor-modal-primary" onClick={onCreateScene} type="button">Create Scene</button>
      </ModalFrame>
    );
  }
  if (modal === "build") {
    return (
      <ModalFrame onClose={onClose} title="Build Preview">
        <p>Build the current source project into the editor preview bundle.</p>
        <button className="tn-editor-modal-primary" onClick={onBuildPreview} type="button">Build</button>
      </ModalFrame>
    );
  }
  if (modal === "chat") {
    return (
      <ModalFrame onClose={onClose} title="AI Chat">
        <textarea aria-label="AI chat message" placeholder="Ask the editor agent..." readOnly />
      </ModalFrame>
    );
  }
  return (
    <ModalFrame onClose={onClose} title={modal === "settings" ? "Settings" : "Delete"}>
      <p>{modal === "settings" ? "Editor settings are inspect-only in this slice." : "Delete requires a promoted source operation before it is enabled."}</p>
    </ModalFrame>
  );
}

function ModalFrame({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="tn-editor-modal-backdrop" role="presentation">
      <section aria-label={title} className="tn-editor-modal" role="dialog">
        <header>
          <strong>{title}</strong>
          <button aria-label={`Close ${title}`} onClick={onClose} type="button">x</button>
        </header>
        <div className="tn-editor-modal__body">{children}</div>
      </section>
    </div>
  );
}

function countTreeRows(rows: readonly { children?: readonly unknown[] }[]): number {
  return rows.reduce((total, row) => total + 1 + countTreeRows((row.children ?? []) as readonly { children?: readonly unknown[] }[]), 0);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
