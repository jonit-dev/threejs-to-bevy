import type { IEditorTreeRow } from "../../adapters/editorModel.js";

export interface IHierarchyPanelProps {
  onMoveRow?: (draggedId: string, targetId: string) => void;
  rows: readonly IEditorTreeRow[];
  selectedRowId?: string;
  onSelectRow?: (id: string) => void;
}

export function HierarchyPanel({ onMoveRow, onSelectRow, rows, selectedRowId }: IHierarchyPanelProps) {
  if (rows.length === 0) {
    return <p className="tn-editor-empty">No source or inspection hierarchy loaded.</p>;
  }
  return <div className="tn-editor-tree">{rows.map((row) => renderRow(row, selectedRowId, onSelectRow, onMoveRow))}</div>;
}

function renderRow(
  row: IEditorTreeRow,
  selectedRowId: string | undefined,
  onSelectRow: ((id: string) => void) | undefined,
  onMoveRow: ((draggedId: string, targetId: string) => void) | undefined,
) {
  const selected = row.id === selectedRowId;
  return (
    <div className="tn-editor-tree__group" key={row.id}>
      <button
        aria-label={`${row.label} ${row.badge ?? row.access}`}
        className="tn-editor-tree__row"
        data-selected={selected ? "true" : "false"}
        draggable={onMoveRow !== undefined}
        onDragOver={(event) => {
          if (onMoveRow !== undefined) {
            event.preventDefault();
          }
        }}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("application/x-threenative-row", row.id);
        }}
        onDrop={(event) => {
          const draggedId = event.dataTransfer.getData("application/x-threenative-row");
          if (draggedId.length > 0 && draggedId !== row.id) {
            event.preventDefault();
            onMoveRow?.(draggedId, row.id);
          }
        }}
        onClick={() => onSelectRow?.(row.id)}
        type="button"
      >
        <i aria-hidden="true" />
        <span>{row.label}</span>
        <small>{row.badge ?? row.access}</small>
      </button>
      {row.children === undefined || row.children.length === 0 ? null : (
        <div className="tn-editor-tree__children">{row.children.map((child) => renderRow(child, selectedRowId, onSelectRow, onMoveRow))}</div>
      )}
    </div>
  );
}
