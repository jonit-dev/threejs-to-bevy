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
      <label className="tn-editor-field">
        <span>Metalness</span>
        <input readOnly value={row?.metalness?.toString() ?? ""} />
      </label>
      <label className="tn-editor-field">
        <span>Base Color Texture</span>
        <input readOnly value={row?.baseColorTexture ?? ""} />
      </label>
      <label className="tn-editor-field">
        <span>Normal Texture</span>
        <input readOnly value={row?.normalTexture ?? ""} />
      </label>
      <label className="tn-editor-field">
        <span>Emissive</span>
        <input readOnly value={row?.emissive ?? ""} />
      </label>
      <label className="tn-editor-field">
        <span>Alpha Mode</span>
        <input readOnly value={row?.alphaMode ?? ""} />
      </label>
    </div>
  );
}
