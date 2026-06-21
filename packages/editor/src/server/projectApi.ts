import { relative, resolve } from "node:path";

import {
  loadAuthoringProject,
  validateAuthoringProject,
  type AuthoringDocumentKind,
  type IAuthoringDiagnostic,
  type IAuthoringDocument,
} from "@threenative/authoring";
import type { EditorInspectorFieldKind, EditorInspectorSourceFamily, IEditorLodStats, IEditorPropertyRow, IEditorSceneObject, EditorScenePrimitive } from "../adapters/editorModel.js";

export interface IEditorProjectDocumentGroup {
  documents: Array<{
    id: string;
    inspectorRows?: IEditorPropertyRow[];
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
      inspectorRows: documentInspectorRows(document),
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

interface IEnvironmentSkyboxSummary {
  documentPath: string;
  mode: string;
  value: string;
}

function readEnvironmentSkybox(documents: readonly IAuthoringDocument[]): IEnvironmentSkyboxSummary | undefined {
  for (const document of documents) {
    if (document.kind !== "environment" || !isRecord(document.data)) {
      continue;
    }
    const skybox = isRecord(document.data.skybox) ? document.data.skybox : undefined;
    if (skybox === undefined) {
      continue;
    }
    return {
      documentPath: document.projectRelativePath,
      mode: readString(skybox.mode) ?? "configured",
      value: summarizeSkybox(skybox),
    };
  }
  return undefined;
}

function buildSceneObjects(documents: readonly IAuthoringDocument[]): IEditorSceneObject[] {
  const environmentSkybox = readEnvironmentSkybox(documents);
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
          ...Object.keys(components ?? {}).filter((component) => !["camera", "Light", "light"].includes(component)),
        ],
        documentPath: document.projectRelativePath,
        id,
        inspectorRows: objectInspectorRows({
          components,
          documentPath: document.projectRelativePath,
          entity,
          entityId: id,
          environmentSkybox,
          lightData,
          prefabData,
          sceneId,
        }),
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

function objectInspectorRows(input: {
  components: Record<string, unknown> | undefined;
  documentPath: string;
  entity: Record<string, unknown>;
  entityId: string;
  environmentSkybox: IEnvironmentSkyboxSummary | undefined;
  lightData: unknown;
  prefabData: Record<string, unknown> | undefined;
  sceneId: string;
}): IEditorPropertyRow[] {
  const rows: IEditorPropertyRow[] = [
    inspectorRow({ id: "inspect:id", input, label: "ID", readOnly: true, value: input.entityId }),
    inspectorRow({ id: "inspect:name", input, label: "Name", readOnly: true, value: displayLabelForEntityId(input.entityId) }),
    inspectorRow({ id: "inspect:source", input, fieldKind: "generated", label: "Source", readOnly: true, readOnlyReason: "Source provenance is generated by the editor project API.", value: input.documentPath }),
  ];

  if (isRecord(input.entity.transform)) {
    rows.push(
      vectorRow("Position", "position", input, readVector3(input.entity.transform.position), [0, 0, 0]),
      vectorRow("Rotation", "rotation", input, readVector3(input.entity.transform.rotation), [0, 0, 0]),
      vectorRow("Scale", "scale", input, readVector3(input.entity.transform.scale), [1, 1, 1]),
    );
  }

  if (input.prefabData !== undefined && !isRecord(input.components?.camera) && !isRecord(input.lightData)) {
    rows.push(
      inspectorRow({
        component: "MeshRenderer",
        defaultValue: "box",
        fieldKind: "enum",
        id: "inspect:primitive",
        input,
        jsonPointer: `/prefabs/${readString(input.prefabData.id) ?? ""}/primitive`,
        label: "Primitive",
        options: ["box", "capsule", "cone", "cylinder", "plane", "sphere"],
        readOnly: true,
        readOnlyReason: "Prefab primitive updates do not have a promoted source operation yet.",
        value: readPrimitive(input.prefabData.primitive),
      }),
      inspectorRow({
        component: "MeshRenderer",
        defaultValue: "#2f80ed",
        fieldKind: "color",
        id: "inspect:color",
        input,
        jsonPointer: `/prefabs/${readString(input.prefabData.id) ?? ""}/color`,
        label: "Color",
        readOnly: true,
        readOnlyReason: "Scene prefab color updates do not have a promoted editor operation yet.",
        value: readString(input.prefabData.color) ?? "default",
      }),
      inspectorRow({
        component: "MeshRenderer",
        fieldKind: "asset",
        id: "inspect:asset",
        input,
        jsonPointer: `/prefabs/${readString(input.prefabData.id) ?? ""}/asset`,
        label: "Asset",
        readOnly: true,
        readOnlyReason: "Prefab asset reference updates do not have a promoted source operation yet.",
        value: readString(input.prefabData.asset) ?? "none",
      }),
    );
  }

  const camera = isRecord(input.components?.camera) ? input.components.camera : undefined;
  if (camera !== undefined) {
    rows.push(
      inspectorRow({
        component: "Camera",
        defaultValue: "perspective",
        fieldKind: "enum",
        id: "inspect:camera-mode",
        input,
        jsonPointer: `/entities/${input.entityId}/components/camera/mode`,
        label: "Mode",
        operation: { args: { cameraId: input.entityId, sceneId: input.sceneId, targetId: readString(camera.target) ?? "" }, name: "scene.set_camera", valueArg: "mode" },
        options: ["third-person-follow", "perspective", "orthographic"],
        readOnly: false,
        value: readString(camera.mode) ?? "perspective",
      }),
      inspectorRow({
        component: "Camera",
        defaultValue: "",
        fieldKind: "string",
        id: "inspect:camera-target",
        input,
        jsonPointer: `/entities/${input.entityId}/components/camera/target`,
        label: "Target",
        operation: { args: { cameraId: input.entityId, mode: readString(camera.mode) ?? "perspective", sceneId: input.sceneId }, name: "scene.set_camera", valueArg: "targetId" },
        readOnly: false,
        value: readString(camera.target) ?? "",
      }),
    );
    if (input.environmentSkybox !== undefined) {
      rows.push(
        {
          access: "sourcePersistable",
          component: "Camera",
          defaultValue: "none",
          documentPath: input.environmentSkybox.documentPath,
          fieldKind: "asset",
          id: `inspect:camera-skybox:entity:${input.documentPath}:${input.entityId}`,
          jsonPointer: "/skybox",
          label: "Skybox",
          path: `${input.environmentSkybox.documentPath}/skybox`,
          readOnly: true,
          readOnlyReason: "Skybox is owned by environment.scene source and does not have a promoted editor mutation operation yet.",
          sourceFamily: "environment",
          sourcePath: input.environmentSkybox.documentPath,
          value: input.environmentSkybox.value,
        },
        {
          access: "sourcePersistable",
          component: "Camera",
          defaultValue: "none",
          documentPath: input.environmentSkybox.documentPath,
          fieldKind: "enum",
          id: `inspect:camera-skybox-mode:entity:${input.documentPath}:${input.entityId}`,
          jsonPointer: "/skybox/mode",
          label: "Skybox Mode",
          options: ["equirect", "cubemap"],
          path: `${input.environmentSkybox.documentPath}/skybox/mode`,
          readOnly: true,
          readOnlyReason: "Skybox is owned by environment.scene source and does not have a promoted editor mutation operation yet.",
          sourceFamily: "environment",
          sourcePath: input.environmentSkybox.documentPath,
          value: input.environmentSkybox.mode,
        },
      );
    }
  }

  if (isRecord(input.lightData)) {
    rows.push(
      inspectorRow({ component: "Light", defaultValue: "directional", fieldKind: "enum", id: "inspect:light-kind", input, label: "Kind", options: ["ambient", "directional", "point", "spot"], readOnly: true, readOnlyReason: "Light is not part of supportedComponentKinds; source data is preserved read-only.", value: readString(input.lightData.kind) ?? "directional" }),
      inspectorRow({ component: "Light", defaultValue: 1, fieldKind: "number", id: "inspect:light-intensity", input, label: "Intensity", readOnly: true, readOnlyReason: "Light is not part of supportedComponentKinds; source data is preserved read-only.", value: formatScalar(input.lightData.intensity, "1") }),
    );
  }

  for (const [component, value] of Object.entries(input.components ?? {})) {
    if (["camera", "Light", "light"].includes(component)) {
      continue;
    }
    rows.push(inspectorRow({ component, fieldKind: "json", id: `inspect:component:${component}`, input, label: component, readOnly: true, readOnlyReason: "Custom component payloads remain read-only until schema and operation coverage is promoted.", value: summarizeValue(value) }));
  }

  return rows;
}

function documentInspectorRows(document: IAuthoringDocument): IEditorPropertyRow[] {
  if (!isRecord(document.data)) {
    return [];
  }
  const rows: IEditorPropertyRow[] = [
    documentRow(document, "document", "Document", document.projectRelativePath, "generated", true, "/"),
    documentRow(document, "kind", "Kind", document.kind, "generated", true, "/schema"),
  ];
  switch (document.kind) {
    case "material":
      for (const [index, material] of readArray(document.data.materials).filter(isRecord).entries()) {
        rows.push(documentRow(document, `material:${index}:color`, `${readString(material.id) ?? `material.${index}`} Color`, readString(material.color) ?? "", "color", false, `/materials/${index}/color`, "material", "material.set", "color", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:roughness`, `${readString(material.id) ?? `material.${index}`} Roughness`, formatScalar(material.roughness, ""), "number", false, `/materials/${index}/roughness`, "material", "material.set", "roughness", { materialId: readString(material.id) ?? "" }));
      }
      break;
    case "input":
      for (const [index, action] of readArray(document.data.actions).filter(isRecord).entries()) {
        rows.push(documentRow(document, `input:${index}:id`, "Action ID", readString(action.id) ?? "", "string", true, `/actions/${index}/id`, "input", undefined, undefined, undefined, "Input action ids are stable source identifiers after creation."));
        rows.push(documentRow(document, `input:${index}:bindings`, "Bindings", readArray(action.bindings).filter((binding): binding is string => typeof binding === "string").join(", "), "stringList", false, `/actions/${index}/bindings`, "input", "input.add_action", "keys", { actionId: readString(action.id) ?? "", inputDocId: readDocumentId(document.data) ?? "" }));
      }
      break;
    case "systems":
      for (const [index, system] of readArray(document.data.systems).filter(isRecord).entries()) {
        rows.push(documentRow(document, `system:${index}:schedule`, `${readString(system.id) ?? `system.${index}`} Schedule`, readString(system.schedule) ?? "", "string", true, `/systems/${index}/schedule`, "system", undefined, undefined, undefined, "System schedule mutation is not promoted after creation."));
        rows.push(documentRow(document, `system:${index}:script`, `${readString(system.id) ?? `system.${index}`} Script`, formatScript(system.script), "script", false, `/systems/${index}/script`, "system", "system.attach_script", "modulePath", { exportName: readString(isRecord(system.script) ? system.script.export : undefined) ?? "default", systemId: readString(system.id) ?? "" }));
      }
      break;
    case "asset":
      for (const [index, asset] of readArray(document.data.assets).filter(isRecord).entries()) {
        rows.push(documentRow(document, `asset:${index}:path`, `${readString(asset.id) ?? `asset.${index}`} Path`, readString(asset.path) ?? "", "asset", true, `/assets/${index}/path`, "asset", undefined, undefined, undefined, "Asset catalog mutation is not exposed through the editor operation API yet."));
      }
      break;
    case "mesh":
      for (const [index, mesh] of readArray(document.data.meshes).filter(isRecord).entries()) {
        rows.push(documentRow(document, `mesh:${index}:primitive`, `${readString(mesh.id) ?? `mesh.${index}`} Primitive`, readString(mesh.primitive) ?? "", "enum", true, `/meshes/${index}/primitive`, "mesh", undefined, undefined, undefined, "Mesh primitive declarations are edited through create flows in this slice."));
      }
      break;
    case "scene":
      for (const [index, resource] of readArray(document.data.resources).filter(isRecord).entries()) {
        rows.push(documentRow(document, `resource:${index}:path`, `${readString(resource.id) ?? `resource.${index}`} Path`, readString(resource.path) ?? summarizeValue(resource.value), "asset", true, `/resources/${index}/path`, "scene", undefined, undefined, undefined, "Scene resource mutation is not exposed through the editor operation API yet."));
      }
      break;
    case "environment": {
      const skybox = isRecord(document.data.skybox) ? document.data.skybox : undefined;
      if (skybox !== undefined) {
        rows.push(documentRow(document, "environment:skybox", "Skybox", summarizeSkybox(skybox), "asset", true, "/skybox", "environment", undefined, undefined, undefined, "Environment skybox mutation is not exposed through the editor operation API yet."));
        rows.push(documentRow(document, "environment:skybox-mode", "Skybox Mode", readString(skybox.mode) ?? "", "enum", true, "/skybox/mode", "environment", undefined, undefined, undefined, "Environment skybox mutation is not exposed through the editor operation API yet."));
      }
      break;
    }
    case "ui":
      for (const [index, binding] of readArray(document.data.bindings).filter(isRecord).entries()) {
        rows.push(documentRow(document, `ui:${index}:binding`, `${readString(binding.node) ?? `node.${index}`} Binding`, readString(binding.resource) ?? "", "string", false, `/bindings/${index}/resource`, "ui", "ui.bind", "resourcePath", { nodeId: readString(binding.node) ?? "", uiDocId: readDocumentId(document.data) ?? "" }));
      }
      break;
    case "audio":
    case "prefab":
    case "project":
    case "unknown":
      break;
  }
  if ("provenance" in document.data) {
    rows.push(documentRow(document, "provenance", "Provenance", summarizeValue(document.data.provenance), "generated", true, "/provenance", sourceFamilyForDocumentKind(document.kind), undefined, undefined, undefined, "Generated provenance is inspectable evidence, not editor-owned source."));
  }
  return rows;
}

function projectRevision(documents: readonly IAuthoringDocument[]): string {
  const signature = documents.map((document) => `${document.kind}:${document.projectRelativePath}`).join("|");
  return `${documents.length}:${signature.length}`;
}

function inspectorRow(options: {
  component?: string;
  defaultValue?: unknown;
  fieldKind?: EditorInspectorFieldKind;
  id: string;
  input: { documentPath: string; entityId: string; sceneId: string };
  jsonPointer?: string;
  label: string;
  operation?: IEditorPropertyRow["operation"];
  options?: readonly string[];
  readOnly: boolean;
  readOnlyReason?: string;
  value: string;
}): IEditorPropertyRow {
  return {
    access: "sourcePersistable",
    component: options.component,
    defaultValue: options.defaultValue,
    documentPath: options.input.documentPath,
    fieldKind: options.fieldKind ?? "string",
    id: `${options.id}:entity:${options.input.documentPath}:${options.input.entityId}`,
    jsonPointer: options.jsonPointer,
    label: options.label,
    operation: options.operation,
    options: options.options,
    path: options.jsonPointer === undefined ? options.input.documentPath : `${options.input.documentPath}${options.jsonPointer}`,
    readOnly: options.readOnly,
    readOnlyReason: options.readOnlyReason,
    sourceFamily: "scene",
    sourcePath: options.input.documentPath,
    value: options.value,
  };
}

function vectorRow(
  label: string,
  field: "position" | "rotation" | "scale",
  input: { documentPath: string; entityId: string; sceneId: string },
  value: readonly [number, number, number] | undefined,
  fallback: readonly [number, number, number],
): IEditorPropertyRow {
  return inspectorRow({
    component: "Transform",
    defaultValue: fallback,
    fieldKind: "vector3",
    id: `inspect:${field}`,
    input,
    jsonPointer: `/entities/${input.entityId}/transform/${field}`,
    label,
    operation: { args: { entityId: input.entityId, sceneId: input.sceneId }, name: "scene.set_transform", valueArg: field },
    readOnly: false,
    value: formatVector(value, fallback),
  });
}

function documentRow(
  document: IAuthoringDocument,
  id: string,
  label: string,
  value: string,
  fieldKind: EditorInspectorFieldKind,
  readOnly: boolean,
  jsonPointer: string,
  sourceFamily: EditorInspectorSourceFamily = sourceFamilyForDocumentKind(document.kind),
  operationName?: string,
  valueArg?: string,
  args?: Record<string, unknown>,
  readOnlyReason?: string,
): IEditorPropertyRow {
  return {
    access: "sourcePersistable",
    documentPath: document.projectRelativePath,
    fieldKind,
    id: `document:${document.projectRelativePath}:${id}`,
    jsonPointer,
    label,
    operation: operationName === undefined ? undefined : { args: args ?? {}, name: operationName, valueArg },
    path: `${document.projectRelativePath}${jsonPointer}`,
    readOnly,
    readOnlyReason,
    sourceFamily,
    sourcePath: document.projectRelativePath,
    value,
  };
}

function sourceFamilyForDocumentKind(kind: AuthoringDocumentKind): EditorInspectorSourceFamily {
  switch (kind) {
    case "asset":
    case "audio":
    case "environment":
    case "input":
    case "material":
    case "mesh":
    case "prefab":
    case "scene":
    case "ui":
      return kind;
    case "systems":
      return "system";
    case "project":
    case "unknown":
      return "scene";
  }
}

function summarizeSkybox(skybox: Record<string, unknown>): string {
  const asset = readString(skybox.asset);
  if (asset !== undefined) {
    return asset;
  }
  const faces = isRecord(skybox.faces) ? Object.values(facesRecord(skybox.faces)).filter((value): value is string => typeof value === "string") : [];
  return faces.length === 0 ? "configured" : faces.join(", ");
}

function facesRecord(value: Record<string, unknown>): Record<string, unknown> {
  return value;
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
    case "cone":
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

function formatScalar(value: unknown, fallback: string): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : readString(value) ?? fallback;
}

function formatScript(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  const modulePath = readString(value.module) ?? "";
  const exportName = readString(value.export) ?? "";
  return [modulePath, exportName].filter((part) => part !== "").join("#");
}

function formatVector(value: readonly [number, number, number] | undefined, fallback: readonly [number, number, number]): string {
  return `[${(value ?? fallback).join(", ")}]`;
}

function summarizeValue(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return JSON.stringify(value);
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
