import {
  addInputAction,
  addEntity,
  addPrefab,
  addPrefabComponent,
  authoringDiagnostic,
  addUiText,
  authoringOperationResult,
  createMeshPrimitive,
  createPrefabDocument,
  createScene,
  setComponent,
  setEnvironmentTerrain,
  setEnvironmentWalkability,
  setTransform,
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
  try {
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
      case "environment.add_flat_terrain":
        return addFlatTerrain({
          color: optionalStringArg(args, "color"),
          entityId: stringArg(args, "entityId"),
          environmentId: stringArg(args, "environmentId"),
          prefabId: stringArg(args, "prefabId"),
          projectPath,
          sceneId: stringArg(args, "sceneId"),
          terrainId: stringArg(args, "terrainId"),
        });
      case "scene.create_default":
        return createDefaultScene({
          file: optionalStringArg(args, "file"),
          projectPath,
          sceneId: stringArg(args, "sceneId"),
        });
      case "scene.set_component":
        return setComponent({
          componentKind: stringArg(args, "componentKind"),
          entityId: stringArg(args, "entityId"),
          projectPath,
          sceneId: stringArg(args, "sceneId"),
          value: recordArg(args, "value"),
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

async function addFlatTerrain(options: { color?: string; entityId: string; environmentId: string; prefabId: string; projectPath: string; sceneId: string; terrainId: string }): Promise<IAuthoringOperationResult> {
  const operations = [
    await setEnvironmentTerrain({ environmentId: options.environmentId, heightMode: "flat", projectPath: options.projectPath, terrainId: options.terrainId }),
    await setEnvironmentWalkability({
      environmentId: options.environmentId,
      projectPath: options.projectPath,
      walkability: {
        blockers: [],
        movementProfile: { boundary: "block", eyeHeight: 1.7, height: 1.8, maxStep: 0.35, radius: 0.35 },
        regions: [],
        terrain: { height: 0, surface: options.terrainId },
      },
    }),
    await addPrefab({ color: options.color ?? "#284f32", prefabId: options.prefabId, primitive: "plane", projectPath: options.projectPath, sceneId: options.sceneId }),
    await addEntity({ entityId: options.entityId, prefabId: options.prefabId, projectPath: options.projectPath, sceneId: options.sceneId }),
    await setTransform({ entityId: options.entityId, position: [0, -0.05, 0], projectPath: options.projectPath, rotation: [-1.570796, 0, 0], scale: [6, 6, 1], sceneId: options.sceneId }),
  ];
  return authoringOperationResult({
    changed: operations.some((operation) => operation.changed),
    diagnostics: operations.flatMap((operation) => operation.diagnostics),
    filesWritten: [...new Set(operations.flatMap((operation) => operation.filesWritten))],
    projectPath: options.projectPath,
  });
}

async function createDefaultScene(options: { file?: string; projectPath: string; sceneId: string }): Promise<IAuthoringOperationResult> {
  const create = await createScene({ file: options.file, projectPath: options.projectPath, sceneId: options.sceneId });
  if (!create.ok) {
    return create;
  }
  const operations = [
    await addEntity({ entityId: "main-camera", projectPath: options.projectPath, sceneId: options.sceneId }),
    await setTransform({ entityId: "main-camera", position: [0, 1.8, 6], projectPath: options.projectPath, rotation: [-0.25, 0, 0], sceneId: options.sceneId }),
    await setComponent({ componentKind: "camera", entityId: "main-camera", projectPath: options.projectPath, sceneId: options.sceneId, value: { mode: "perspective" } }),
    await addEntity({ entityId: "directional-light", projectPath: options.projectPath, sceneId: options.sceneId }),
    await setTransform({ entityId: "directional-light", position: [2, 4, 3], projectPath: options.projectPath, sceneId: options.sceneId }),
    await setComponent({ componentKind: "Light", entityId: "directional-light", projectPath: options.projectPath, sceneId: options.sceneId, value: { color: "#ffffff", intensity: 1, kind: "directional" } }),
    await addEntity({ entityId: "ambient-light", projectPath: options.projectPath, sceneId: options.sceneId }),
    await setComponent({ componentKind: "Light", entityId: "ambient-light", projectPath: options.projectPath, sceneId: options.sceneId, value: { color: "#ffffff", intensity: 0.4, kind: "ambient" } }),
  ];
  const diagnostics = [...create.diagnostics, ...operations.flatMap((operation) => operation.diagnostics)];
  const filesWritten = [...new Set([create.file, ...operations.flatMap((operation) => operation.filesWritten)])];
  return authoringOperationResult({
    changed: operations.every((operation) => operation.ok),
    diagnostics,
    filesWritten,
    projectPath: options.projectPath,
  });
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
