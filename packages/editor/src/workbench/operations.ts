import type { IEditorOperationApiResult, IEditorOperationRequest } from "../server/operationApi.js";
import { applyEditorOperationApi } from "../server/operationApi.js";

export type EditorOperationName =
  | "environment.set_map"
  | "environment.set_skybox"
  | "environment.set_terrain"
  | "input.add_action"
  | "input.add_axis"
  | "material.set"
  | "mesh.create_primitive"
  | "prefab.add_component"
  | "prefab.create"
  | "project.create"
  | "runtime.set_rendering"
  | "runtime.set_window"
  | "scene.add_prefab"
  | "scene.attach_script"
  | "scene.create_default"
  | "scene.set_camera"
  | "scene.set_component"
  | "scene.set_lifecycle"
  | "scene.set_transform"
  | "system.attach_script"
  | "system.create"
  | "ui.add_node"
  | "ui.add_text"
  | "ui.bind"
  | "ui.set_layout"
  | "ui.set_style";

export async function runEditorOperation(options: {
  args: Record<string, unknown>;
  name: EditorOperationName;
  projectPath: string;
  projectRevision?: string;
}): Promise<IEditorOperationApiResult> {
  const request: IEditorOperationRequest = {
    args: options.args,
    name: options.name,
    projectRevision: options.projectRevision,
  };
  return applyEditorOperationApi({ projectPath: options.projectPath, request });
}
