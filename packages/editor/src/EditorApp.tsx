import type { IEditorAdapterInput, IEditorShellModel } from "./adapters/editorModel.js";
import { createEditorShellModel } from "./adapters/editorModel.js";
import { PanelShell } from "./components/layout/PanelShell.js";
import { TopBar } from "./components/layout/TopBar.js";
import { HierarchyPanel } from "./components/panels/HierarchyPanel.js";
import { InspectorPanel } from "./components/panels/InspectorPanel.js";

export interface IEditorAppProps {
  model?: IEditorAdapterInput | IEditorShellModel;
  onSelectRow?: (id: string) => void;
}

export function EditorApp({ model: input, onSelectRow }: IEditorAppProps) {
  const model = createEditorShellModel(input);
  return (
    <main className="tn-editor-shell">
      <TopBar projectName={model.projectName} status={model.status} />
      <div className="tn-editor-workspace">
        <aside className="tn-editor-sidebar tn-editor-sidebar--left">
          <PanelShell title="Hierarchy" meta={`${model.hierarchy.length}`}>
            <HierarchyPanel rows={model.hierarchy} selectedRowId={model.selectedRowId} onSelectRow={onSelectRow} />
          </PanelShell>
          <PanelShell title="Inspector" meta={`${model.inspector.length}`}>
            <InspectorPanel rows={model.inspector} />
          </PanelShell>
        </aside>
        <section className="tn-editor-preview" aria-label="Preview">
          <div>
            <h1>Preview</h1>
            <p>{model.status === "empty" ? "No project data loaded." : "Runtime preview is not connected in this shell slice."}</p>
          </div>
        </section>
        <aside className="tn-editor-sidebar tn-editor-sidebar--right">
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
        {model.statusItems.map((item) => (
          <span key={item.id}>
            {item.label}: {item.value}
          </span>
        ))}
      </footer>
    </main>
  );
}
