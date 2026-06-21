import type { IEditorPropertyRow } from "../../adapters/editorModel.js";

export interface IInspectorPanelProps {
  rows: readonly IEditorPropertyRow[];
}

export function InspectorPanel({ rows }: IInspectorPanelProps) {
  if (rows.length === 0) {
    return <p className="tn-editor-empty">Select a source document or inspected row to view properties.</p>;
  }
  return (
    <div className="tn-editor-fields">
      {rows.map((row) => (
        <label className="tn-editor-field" data-readonly={row.readOnly ? "true" : "false"} key={row.id}>
          <span>{row.label}</span>
          <input readOnly value={row.value ?? row.path ?? ""} />
        </label>
      ))}
    </div>
  );
}
