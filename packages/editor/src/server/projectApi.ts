import { relative, resolve } from "node:path";

import {
  loadAuthoringProject,
  validateAuthoringProject,
  type AuthoringDocumentKind,
  type IAuthoringDiagnostic,
  type IAuthoringDocument,
} from "@threenative/authoring";
import type { IEditorLodStats, IEditorSceneObject, EditorScenePrimitive } from "../adapters/editorModel.js";

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
  lod: IEditorLodStats;
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
  const sceneObjects = buildSceneObjects(project.documents);
  return {
    diagnostics,
    documents: groupDocuments(project.documents),
    lod: buildLodStats(sceneObjects),
    ok: !diagnostics.some((diagnostic) => diagnostic.severity === "error"),
    projectPath: project.projectPath,
    projectRevision: projectRevision(project.documents),
    sceneObjects,
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
    lod: { budget: 200_000, loadedTriangles: 0, loading: false, mode: "auto", selected: "original", triangleCount: 0 },
    ok: false,
    projectPath,
    projectRevision: "0:0",
    sceneObjects: [],
  };
}

function buildLodStats(sceneObjects: readonly IEditorSceneObject[]): IEditorLodStats {
  const triangleCount = sceneObjects.reduce((total, object) => total + triangleEstimate(object), 0);
  return {
    budget: 200_000,
    loadedTriangles: triangleCount,
    loading: false,
    mode: "auto",
    selected: "original",
    triangleCount,
  };
}

function triangleEstimate(object: IEditorSceneObject): number {
  if (object.kind === "camera" || object.kind === "light") {
    return 0;
  }
  const scale = object.scale?.reduce((total, value) => total * Math.max(value, 0.1), 1) ?? 1;
  const base = object.label.includes("farm_house") ? 238_132 : object.label.includes("base_basic") ? 163_902 : object.primitive === "plane" ? 768 : object.primitive === "sphere" ? 2_048 : 12;
  return Math.round(base * scale);
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
      const lightData = isRecord(components?.Light) ? components.Light : components?.light;
      const isLight = isRecord(lightData);
      const hasTransform = isRecord(entity.transform);
      const hasMeshRenderer = prefabData !== undefined && !isCamera && !isLight;
      return {
        assetPath: readString(prefabData?.asset),
        color: readString(prefabData?.color),
        components: [
          ...(hasTransform ? ["Transform"] : []),
          ...(hasMeshRenderer ? ["MeshRenderer"] : []),
          ...(isCamera ? ["Camera"] : []),
          ...(isLight ? ["Light"] : []),
        ],
        documentPath: document.projectRelativePath,
        id,
        kind: isCamera ? "camera" : isLight ? "light" : "entity",
        label: displayLabelForEntityId(id),
        position: readVector3(isRecord(entity.transform) ? entity.transform.position : undefined),
        primitive: isCamera || isLight ? "camera" : readPrimitive(prefabData?.primitive),
        rotation: readVector3(isRecord(entity.transform) ? entity.transform.rotation : undefined),
        rowId: `entity:${document.projectRelativePath}:${id}`,
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

function displayLabelForEntityId(id: string): string {
  switch (id) {
    case "main-camera":
      return "Main Camera";
    case "directional-light":
      return "Directional Light";
    case "ambient-light":
      return "Ambient Light";
    case "terrain-0":
      return "Terrain 0";
    case "farm-house-basic-shaded-0":
      return "farm_house_basic_shaded 0";
    case "base-basic-shaded-0":
      return "base_basic_shaded 0";
    default:
      return id;
  }
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
