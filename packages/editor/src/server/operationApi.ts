import {
  applyAuthoringBatch,
  AUTHORING_BATCH_SCHEMA,
  AUTHORING_BATCH_VERSION,
  authoringDiagnostic,
  authoringOperationResult,
  dispatchAuthoringOperation,
  validateAuthoringProject,
  type AuthoringOperationName,
  type IAuthoringOperationResult,
} from "@threenative/authoring";

import { buildServerCompositeRecipePlan } from "../operations/editorOperationMetadata.js";
import { validateProjectRoot } from "./projectApi.js";

export interface IEditorOperationRequest {
  args: Record<string, unknown>;
  name: string;
  projectRevision?: string;
}

export interface IEditorOperationApiResult extends IAuthoringOperationResult {
  projectRevision: string;
}

export interface IEditorOperationBatchRequest {
  id: string;
  operations: Array<{ args: Record<string, unknown>; name: string }>;
  projectRevision?: string;
}

export async function applyEditorOperationApi(options: {
  projectPath: string;
  request: IEditorOperationRequest;
  rootPath?: string;
}): Promise<IEditorOperationApiResult> {
  const guard = validateProjectRoot(options.projectPath, options.rootPath);
  if (guard !== undefined) {
    return withRevision(authoringOperationResult({ diagnostics: [guard], projectPath: options.projectPath }), options.request.projectRevision);
  }

  const recipe = buildServerCompositeRecipePlan(options.request.name, options.request.args);
  const operation = recipe === undefined
    ? await dispatchEditorOperation(options.projectPath, options.request.name, options.request.args)
    : await runOperationBatch(options.projectPath, `editor-${options.request.name}`, recipe.operations);
  if (operation.ok) {
    const validation = await validateAuthoringProject({ projectPath: operation.projectPath });
    return withRevision({
      ...operation,
      diagnostics: [...operation.diagnostics, ...validation.diagnostics],
      ok: validation.ok,
    }, options.request.projectRevision);
  }
  return withRevision(operation, options.request.projectRevision);
}

export async function applyEditorOperationBatchApi(options: {
  projectPath: string;
  request: IEditorOperationBatchRequest;
  rootPath?: string;
}): Promise<IEditorOperationApiResult> {
  const guard = validateProjectRoot(options.projectPath, options.rootPath);
  if (guard !== undefined) {
    return withRevision(authoringOperationResult({ diagnostics: [guard], projectPath: options.projectPath }), options.request.projectRevision);
  }
  const operation = await runOperationBatch(options.projectPath, options.request.id, options.request.operations);
  return withRevision(operation, options.request.projectRevision);
}

async function dispatchEditorOperation(projectPath: string, name: string, args: Record<string, unknown>): Promise<IAuthoringOperationResult> {
  try {
    const registryResult = await dispatchAuthoringOperation({ args, name, projectPath });
    if (registryResult.diagnostics[0]?.code !== "TN_AUTHORING_OPERATION_UNSUPPORTED") {
      return registryResult;
    }

    return registryResult;
  } catch (error) {
    return authoringOperationResult({
      diagnostics: [
        authoringDiagnostic({
          code: "TN_EDITOR_OPERATION_ARG_INVALID",
          message: error instanceof Error ? error.message : String(error),
          path: "/args",
          suggestion: "Send the operation arguments described by the editor row metadata.",
          value: name,
        }),
      ],
      projectPath,
    });
  }
}

async function runOperationBatch(projectPath: string, id: string, operations: Array<{ args: Record<string, unknown>; name: string }>): Promise<IAuthoringOperationResult> {
  const result = await applyAuthoringBatch({
    batch: {
      id,
      operations: operations.map((operation) => ({ ...operation, name: operation.name as AuthoringOperationName })),
      schema: AUTHORING_BATCH_SCHEMA,
      version: AUTHORING_BATCH_VERSION,
    },
    projectPath,
  });
  return authoringOperationResult({
    changed: result.changed,
    diagnostics: result.diagnostics,
    filesWritten: result.filesWritten,
    projectPath,
  });
}

function withRevision(result: IAuthoringOperationResult, previousRevision: string | undefined): IEditorOperationApiResult {
  return {
    ...result,
    projectRevision: `${previousRevision ?? "rev"}:${result.filesWritten.join("|")}:${result.changed ? "changed" : "same"}`,
  };
}
