import { Box, Camera, Circle, FileJson, GripVertical, Home, Layers3, Lightbulb, Mountain } from "lucide-react";

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
        <GripVertical aria-hidden="true" className="tn-editor-tree__grip" size={13} />
        <RowIcon badge={row.badge} label={row.label} />
        <span>{row.label}</span>
        <small>{row.badge ?? row.access}</small>
      </button>
      {row.children === undefined || row.children.length === 0 ? null : (
        <div className="tn-editor-tree__children">{row.children.map((child) => renderRow(child, selectedRowId, onSelectRow, onMoveRow))}</div>
      )}
    </div>
  );
}

function RowIcon({ badge, label }: { badge?: string; label: string }) {
  const normalized = `${badge ?? ""} ${label}`.toLowerCase();
  const Icon = normalized.includes("camera")
    ? Camera
    : normalized.includes("light")
      ? Lightbulb
      : normalized.includes("terrain")
        ? Mountain
        : normalized.includes("farm_house")
          ? Home
          : normalized.includes("sphere") || normalized.includes("base_basic")
            ? Circle
            : badge === "scene" || badge === undefined
              ? Layers3
              : badge === "entity"
                ? Box
                : FileJson;
  return <Icon aria-hidden="true" className="tn-editor-tree__icon" size={15} />;
}
