import type { IEditorProjectApiResult, IEditorProjectDocumentGroup } from "../server/projectApi.js";

export interface IWorkbenchProjectState {
  diagnostics: IEditorProjectApiResult["diagnostics"];
  documentCount: number;
  groups: IEditorProjectDocumentGroup[];
  ok: boolean;
  projectPath: string;
  projectRevision: string;
}

export function createWorkbenchProjectState(result: IEditorProjectApiResult): IWorkbenchProjectState {
  return {
    diagnostics: result.diagnostics,
    documentCount: result.documents.reduce((total, group) => total + group.documents.length, 0),
    groups: result.documents,
    ok: result.ok,
    projectPath: result.projectPath,
    projectRevision: result.projectRevision,
  };
}
