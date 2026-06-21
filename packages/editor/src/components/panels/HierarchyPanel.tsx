import type { IEditorTreeRow } from "../../adapters/editorModel.js";

export interface IHierarchyPanelProps {
  rows: readonly IEditorTreeRow[];
  selectedRowId?: string;
  onSelectRow?: (id: string) => void;
}

export function HierarchyPanel({ onSelectRow, rows, selectedRowId }: IHierarchyPanelProps) {
  if (rows.length === 0) {
    return <p className="tn-editor-empty">No source or inspection hierarchy loaded.</p>;
  }
  return <div className="tn-editor-tree">{rows.map((row) => renderRow(row, selectedRowId, onSelectRow))}</div>;
}

function renderRow(row: IEditorTreeRow, selectedRowId: string | undefined, onSelectRow: ((id: string) => void) | undefined) {
  const selected = row.id === selectedRowId;
  return (
    <div className="tn-editor-tree__group" key={row.id}>
      <button
        className="tn-editor-tree__row"
        data-selected={selected ? "true" : "false"}
        onClick={() => onSelectRow?.(row.id)}
        type="button"
      >
        <span>{row.label}</span>
        <small>{row.badge ?? row.access}</small>
      </button>
      {row.children === undefined || row.children.length === 0 ? null : (
        <div className="tn-editor-tree__children">{row.children.map((child) => renderRow(child, selectedRowId, onSelectRow))}</div>
      )}
    </div>
  );
}
