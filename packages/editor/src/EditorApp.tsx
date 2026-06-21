import type { ReactNode } from "react";

import type { IEditorAdapterInput, IEditorShellModel } from "./adapters/editorModel.js";
import { createEditorShellModel } from "./adapters/editorModel.js";
import { PanelShell } from "./components/layout/PanelShell.js";
import { HierarchyPanel } from "./components/panels/HierarchyPanel.js";
import { InspectorPanel } from "./components/panels/InspectorPanel.js";
import { EditorViewport3d } from "./preview/EditorViewport3d.js";

export interface IEditorAppProps {
  model?: IEditorAdapterInput | IEditorShellModel;
  onMoveRow?: (draggedId: string, targetId: string) => void;
  onSelectRow?: (id: string) => void;
  toolbarSlot?: ReactNode;
}

export function EditorApp({ model: input, onMoveRow, onSelectRow, toolbarSlot }: IEditorAppProps) {
  const model = createEditorShellModel(input);
  const objectCount = countTreeRows(model.hierarchy);
  const statusMessage = model.diagnostics.some((diagnostic) => diagnostic.severity === "error") ? "Needs attention" : "Ready";
  return (
    <main className="tn-editor-shell">
      <header className="tn-editor-menubar" aria-label="Main menu">
        {["File", "Edit", "GameObject", "Window", "Settings"].map((item) => (
          <button key={item} type="button">{item}</button>
        ))}
      </header>

      <header className="tn-editor-topbar">
        <div className="tn-editor-brand">
          <div className="tn-editor-brand__mark" aria-hidden="true">TN</div>
          <div>
            <strong>VibeEngine</strong>
            <span>ThreeNative editor</span>
          </div>
        </div>
        <div className="tn-editor-topbar__divider" />
        <div className="tn-editor-badges" aria-label="Project status">
          <span className="tn-editor-badge tn-editor-badge--cyan">Objects: {objectCount}</span>
          <span className={`tn-editor-badge tn-editor-badge--${model.status === "error" ? "red" : "green"}`}>{statusMessage}</span>
          <span className="tn-editor-badge tn-editor-badge--purple">Scene: {model.projectName}</span>
        </div>
        <div className="tn-editor-playback" aria-label="Playback controls">
          <button className="tn-editor-icon-button tn-editor-icon-button--play" title="Play" type="button">&gt;</button>
          <button className="tn-editor-icon-button" title="Pause" type="button">||</button>
          <button className="tn-editor-icon-button tn-editor-icon-button--stop" title="Stop" type="button">[]</button>
        </div>
        <div className="tn-editor-topbar__actions">
          {toolbarSlot}
        </div>
      </header>

      <div className="tn-editor-workspace">
        <aside className="tn-editor-left-rail">
          <PanelShell title="Hierarchy" meta={`${model.hierarchy.length}`}>
            <HierarchyPanel rows={model.hierarchy} selectedRowId={model.selectedRowId} onMoveRow={onMoveRow} onSelectRow={onSelectRow} />
          </PanelShell>
          <PanelShell title="Inspector" meta={`${model.inspector.length}`}>
            <InspectorPanel rows={model.inspector} />
          </PanelShell>
        </aside>
        <section className="tn-editor-preview" aria-label="Preview">
          <EditorViewport3d objects={model.sceneObjects} selectedRowId={model.selectedRowId} onSelectObject={onSelectRow} />
          <div className="tn-editor-viewport-label">
            <span />
            <strong>Viewport</strong>
            <small>Entity {model.selectedRowId === undefined ? "-" : model.selectedRowId.split(":").pop()}</small>
          </div>
          <div className="tn-editor-gizmo-switcher" aria-label="Gizmo mode">
            <button className="tn-editor-gizmo-switcher__active" type="button">Move <kbd>W</kbd></button>
            <button type="button">Rotate <kbd>E</kbd></button>
            <button type="button">Scale <kbd>R</kbd></button>
          </div>
          {model.status === "empty" ? (
            <div className="tn-editor-preview__message">
              <h1>Preview</h1>
              <p>No project data loaded.</p>
            </div>
          ) : null}
        </section>
        <aside className="tn-editor-right-rail">
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
        <span>{objectCount} Entities</span>
        <span>WebGL</span>
        <span className="tn-editor-statusbar__spacer" />
        {model.statusItems.map((item) => <span key={item.id}>{item.label}: {item.value}</span>)}
      </footer>
    </main>
  );
}

function countTreeRows(rows: readonly { children?: readonly unknown[] }[]): number {
  return rows.reduce((total, row) => total + 1 + countTreeRows((row.children ?? []) as readonly { children?: readonly unknown[] }[]), 0);
}
