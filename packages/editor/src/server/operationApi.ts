import {
  authoringDiagnostic,
  authoringOperationResult,
  dispatchAuthoringOperation,
  validateAuthoringProject,
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

export async function applyEditorOperationApi(options: {
  projectPath: string;
  request: IEditorOperationRequest;
  rootPath?: string;
}): Promise<IEditorOperationApiResult> {
  const guard = validateProjectRoot(options.projectPath, options.rootPath);
  if (guard !== undefined) {
    return withRevision(authoringOperationResult({ diagnostics: [guard], projectPath: options.projectPath }), options.request.projectRevision);
  }

  const operation = await dispatchEditorOperation(options.projectPath, options.request.name, options.request.args);
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

async function dispatchEditorOperation(projectPath: string, name: string, args: Record<string, unknown>): Promise<IAuthoringOperationResult> {
  try {
    const registryResult = await dispatchAuthoringOperation({ args, name, projectPath });
    if (registryResult.diagnostics[0]?.code !== "TN_AUTHORING_OPERATION_UNSUPPORTED") {
      return registryResult;
    }

    const recipe = buildServerCompositeRecipePlan(name, args);
    if (recipe !== undefined) {
      return runCompositeRecipe(projectPath, recipe.operations);
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

async function runCompositeRecipe(projectPath: string, steps: Array<{ args: Record<string, unknown>; name: string }>): Promise<IAuthoringOperationResult> {
  const operations: IAuthoringOperationResult[] = [];
  for (const step of steps) {
    const operation = await dispatchAuthoringOperation({ args: step.args, name: step.name, projectPath });
    operations.push(operation);
    if (!operation.ok) {
      break;
    }
  }
  return authoringOperationResult({
    changed: operations.some((operation) => operation.changed),
    diagnostics: operations.flatMap((operation) => operation.diagnostics),
    filesWritten: [...new Set(operations.flatMap((operation) => operation.filesWritten))],
    projectPath,
  });
}

function withRevision(result: IAuthoringOperationResult, previousRevision: string | undefined): IEditorOperationApiResult {
  return {
    ...result,
    projectRevision: `${previousRevision ?? "rev"}:${result.filesWritten.join("|")}:${result.changed ? "changed" : "same"}`,
  };
}
