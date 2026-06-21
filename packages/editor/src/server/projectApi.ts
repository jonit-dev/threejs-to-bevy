import { relative, resolve } from "node:path";

import {
  loadAuthoringProject,
  validateAuthoringProject,
  type AuthoringDocumentKind,
  type IAuthoringDiagnostic,
  type IAuthoringDocument,
} from "@threenative/authoring";
import type { IEditorSceneObject, EditorScenePrimitive } from "../adapters/editorModel.js";

export interface IEditorProjectDocumentGroup {
  documents: Array<{
    id: string;
    kind: AuthoringDocumentKind;
    path: string;
  }>;
  kind: AuthoringDocumentKind;
}

export interface IEditorProjectApiResult {
  diagnostics: IAuthoringDiagnostic[];
  documents: IEditorProjectDocumentGroup[];
  ok: boolean;
  projectPath: string;
  projectRevision: string;
  sceneObjects: IEditorSceneObject[];
}

export async function loadEditorProjectApi(options: { projectPath: string; rootPath?: string }): Promise<IEditorProjectApiResult> {
  const guard = validateProjectRoot(options.projectPath, options.rootPath);
  if (guard !== undefined) {
    return emptyProjectResult(resolve(options.projectPath), [guard]);
  }

  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const validation = await validateAuthoringProject({ projectPath: project.projectPath });
  const diagnostics = [...project.diagnostics, ...validation.diagnostics];
  return {
    diagnostics,
    documents: groupDocuments(project.documents),
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    projectPath: project.projectPath,
    projectRevision: projectRevision(project.documents),
    sceneObjects: buildSceneObjects(project.documents),
  };
}

export async function validateEditorProjectApi(options: { projectPath: string; rootPath?: string }): Promise<IEditorProjectApiResult> {
  return loadEditorProjectApi(options);
}

export function validateProjectRoot(projectPath: string, rootPath: string | undefined): IAuthoringDiagnostic | undefined {
  if (rootPath === undefined) {
    return undefined;
  }
  const root = resolve(rootPath);
  const project = resolve(projectPath);
  const projectRelative = normalizeRelativePath(relative(root, project));
  if (projectRelative === ".." || projectRelative.startsWith("../")) {
    return {
      code: "TN_EDITOR_PROJECT_ROOT_REJECTED",
      message: "Editor project API cannot load projects outside the configured root.",
      severity: "error",
      suggestion: "Open a project under the boot configured project root.",
      value: projectPath,
    };
  }
  return undefined;
}

function groupDocuments(documents: readonly IAuthoringDocument[]): IEditorProjectDocumentGroup[] {
  const groups = new Map<AuthoringDocumentKind, IEditorProjectDocumentGroup>();
  for (const document of documents) {
    const group = groups.get(document.kind) ?? { documents: [], kind: document.kind };
    group.documents.push({
      id: readDocumentId(document.data) ?? document.projectRelativePath,
      kind: document.kind,
      path: document.projectRelativePath,
    });
    groups.set(document.kind, group);
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      documents: group.documents.sort((left, right) => left.path.localeCompare(right.path)),
    }))
    .sort((left, right) => left.kind.localeCompare(right.kind));
}

function emptyProjectResult(projectPath: string, diagnostics: IAuthoringDiagnostic[]): IEditorProjectApiResult {
  return {
    diagnostics,
    documents: [],
    ok: false,
    projectPath,
    projectRevision: "0:0",
    sceneObjects: [],
  };
}

function buildSceneObjects(documents: readonly IAuthoringDocument[]): IEditorSceneObject[] {
  return documents.flatMap((document) => {
    if (document.kind !== "scene" || !isRecord(document.data)) {
      return [];
    }
    const sceneId = readDocumentId(document.data) ?? document.projectRelativePath;
    const prefabById = new Map(readArray(document.data.prefabs).filter(isRecord).map((prefab) => [readString(prefab.id), prefab]));
    return readArray(document.data.entities).filter(isRecord).map((entity, index) => {
      const id = readString(entity.id) ?? `${sceneId}.entity.${index}`;
      const prefab = readString(entity.prefab);
      const prefabData = prefab === undefined ? undefined : prefabById.get(prefab);
      const components = isRecord(entity.components) ? entity.components : undefined;
      const isCamera = isRecord(components?.camera);
      return {
        color: readString(prefabData?.color),
        documentPath: document.projectRelativePath,
        id,
        kind: isCamera ? "camera" : "entity",
        label: id,
        position: readVector3(isRecord(entity.transform) ? entity.transform.position : undefined),
        primitive: isCamera ? "camera" : readPrimitive(prefabData?.primitive),
        rotation: readVector3(isRecord(entity.transform) ? entity.transform.rotation : undefined),
        rowId: `entity:${id}`,
        scale: readVector3(isRecord(entity.transform) ? entity.transform.scale : undefined),
        sourcePath: document.projectRelativePath,
      };
    });
  });
}

function projectRevision(documents: readonly IAuthoringDocument[]): string {
  const signature = documents.map((document) => `${document.kind}:${document.projectRelativePath}`).join("|");
  return `${documents.length}:${signature.length}`;
}

function readDocumentId(value: unknown): string | undefined {
  return typeof value === "object" && value !== null && "id" in value && typeof value.id === "string" ? value.id : undefined;
}

function normalizeRelativePath(path: string): string {
  return path.split("\\").join("/");
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readPrimitive(value: unknown): EditorScenePrimitive {
  switch (value) {
    case "box":
    case "capsule":
    case "cylinder":
    case "plane":
    case "sphere":
      return value;
    default:
      return "box";
  }
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function readVector3(value: unknown): [number, number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    return undefined;
  }
  return [value[0], value[1], value[2]];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
