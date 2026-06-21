import type { IMaterialRow } from "../../workbench/materialModel.js";

export interface IMaterialPanelProps {
  rows: readonly IMaterialRow[];
}

export function MaterialPanel({ rows }: IMaterialPanelProps) {
  return (
    <ul className="tn-editor-list" aria-label="Materials">
      {rows.map((row) => (
        <li key={row.id}>
          <span>{row.id}</span>
          <small>{row.documentPath}</small>
        </li>
      ))}
    </ul>
  );
}
