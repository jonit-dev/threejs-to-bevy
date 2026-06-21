import type { IMaterialRow } from "../../workbench/materialModel.js";

export interface IMaterialInspectorProps {
  row?: IMaterialRow;
}

export function MaterialInspector({ row }: IMaterialInspectorProps) {
  return (
    <div className="tn-editor-fields" aria-label="Material inspector">
      <label className="tn-editor-field">
        <span>Color</span>
        <input readOnly value={row?.color ?? ""} />
      </label>
      <label className="tn-editor-field">
        <span>Roughness</span>
        <input readOnly value={row?.roughness?.toString() ?? ""} />
      </label>
    </div>
  );
}
