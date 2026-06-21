import type { IUiInputSystemRow } from "../../workbench/uiInputSystemModel.js";

export function UiPanel({ rows }: { rows: readonly IUiInputSystemRow[] }) {
  return <WorkbenchList label="UI documents" rows={rows.filter((row) => row.kind === "ui")} />;
}

function WorkbenchList({ label, rows }: { label: string; rows: readonly IUiInputSystemRow[] }) {
  return (
    <ul className="tn-editor-list" aria-label={label}>
      {rows.map((row) => (
        <li key={row.id}>
          <span>{row.id}</span>
          <small>{row.documentPath}</small>
        </li>
      ))}
    </ul>
  );
}
