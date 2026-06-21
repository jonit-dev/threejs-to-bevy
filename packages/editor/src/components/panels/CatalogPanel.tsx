import type { ICatalogRow } from "../../workbench/catalogModel.js";

export interface ICatalogPanelProps {
  rows: readonly ICatalogRow[];
}

export function CatalogPanel({ rows }: ICatalogPanelProps) {
  return (
    <ul className="tn-editor-list" aria-label="Catalog">
      {rows.map((row) => (
        <li key={`${row.kind}:${row.id}`}>
          <span>{row.id}</span>
          <small>{row.mutation}</small>
        </li>
      ))}
    </ul>
  );
}
