import type { ISceneHierarchyRow } from "../../workbench/sceneModel.js";

export interface ITransformInspectorProps {
  row?: ISceneHierarchyRow;
}

export function TransformInspector({ row }: ITransformInspectorProps) {
  const disabled = row === undefined || !row.sourcePersistable || row.kind !== "entity";
  return (
    <fieldset className="tn-editor-fields" disabled={disabled}>
      <label className="tn-editor-field">
        <span>Position</span>
        <input readOnly value={row?.label ?? ""} />
      </label>
    </fieldset>
  );
}
