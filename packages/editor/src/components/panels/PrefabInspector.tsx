import type { ICatalogRow } from "../../workbench/catalogModel.js";

export interface IPrefabInspectorProps {
  row?: ICatalogRow;
}

export function PrefabInspector({ row }: IPrefabInspectorProps) {
  return (
    <div className="tn-editor-fields" aria-label="Prefab inspector">
      <label className="tn-editor-field" data-readonly={row?.mutation === "inspect-only" ? "true" : "false"}>
        <span>Prefab</span>
        <input readOnly value={row?.id ?? ""} />
      </label>
    </div>
  );
}
