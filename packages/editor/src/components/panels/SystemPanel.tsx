import type { IUiInputSystemRow } from "../../workbench/uiInputSystemModel.js";

export function SystemPanel({ rows }: { rows: readonly IUiInputSystemRow[] }) {
  return (
    <ul className="tn-editor-list" aria-label="System documents">
      {rows.filter((row) => row.kind === "system").map((row) => (
        <li key={row.id}>
          <span>{row.id}</span>
          <small>{row.documentPath}</small>
        </li>
      ))}
    </ul>
  );
}
