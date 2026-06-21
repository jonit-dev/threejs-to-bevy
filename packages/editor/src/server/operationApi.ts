import {
  addInputAction,
  addPrefab,
  addPrefabComponent,
  addUiText,
  authoringOperationResult,
  createMeshPrimitive,
  createPrefabDocument,
  createSystem,
  dispatchAuthoringOperation,
  validateAuthoringProject,
  type IAuthoringOperationResult,
} from "@threenative/authoring";

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
  const registryResult = await dispatchAuthoringOperation({ args, name, projectPath });
  if (registryResult.diagnostics[0]?.code !== "TN_AUTHORING_OPERATION_UNSUPPORTED") {
    return registryResult;
  }

  switch (name) {
    case "ui.add_text":
      return addUiText({ nodeId: stringArg(args, "nodeId"), projectPath, text: stringArg(args, "text"), uiDocId: stringArg(args, "uiDocId") });
    case "scene.add_prefab":
      return addPrefab({
        asset: optionalStringArg(args, "asset"),
        color: optionalStringArg(args, "color"),
        prefabId: stringArg(args, "prefabId"),
        primitive: optionalStringArg(args, "primitive"),
        projectPath,
        sceneId: stringArg(args, "sceneId"),
      });
    case "mesh.create_primitive":
      return createMeshPrimitive({ kind: stringArg(args, "kind"), meshId: stringArg(args, "meshId"), projectPath });
    case "prefab.create":
      return createPrefabDocument({ prefabId: stringArg(args, "prefabId"), projectPath });
    case "prefab.add_component":
      return addPrefabComponent({
        componentKind: stringArg(args, "componentKind"),
        prefabId: stringArg(args, "prefabId"),
        projectPath,
        value: recordArg(args, "value"),
      });
    case "input.add_action":
      return addInputAction({ actionId: stringArg(args, "actionId"), inputDocId: stringArg(args, "inputDocId"), keys: stringArrayArg(args, "keys"), projectPath });
    case "system.create":
      return createSystem({ projectPath, schedule: stringArg(args, "schedule"), systemId: stringArg(args, "systemId") });
    default:
      return registryResult;
  }
}

function withRevision(result: IAuthoringOperationResult, previousRevision: string | undefined): IEditorOperationApiResult {
  return {
    ...result,
    projectRevision: `${previousRevision ?? "rev"}:${result.filesWritten.join("|")}:${result.changed ? "changed" : "same"}`,
  };
}

function stringArg(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Editor operation argument '${key}' must be a non-empty string.`);
  }
  return value;
}

function optionalStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function stringArrayArg(args: Record<string, unknown>, key: string): string[] {
  const value = args[key];
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string" && entry.trim() !== "")) {
    throw new Error(`Editor operation argument '${key}' must be an array of strings.`);
  }
  return value;
}

function recordArg(args: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = args[key];
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`Editor operation argument '${key}' must be an object.`);
  }
  return value as Record<string, unknown>;
}
