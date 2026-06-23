import { relative, resolve } from "node:path";

import {
  loadAuthoringProject,
  validateAuthoringProject,
  type AuthoringDocumentKind,
  type IAuthoringDiagnostic,
  type IAuthoringDocument,
} from "@threenative/authoring";
import type { EditorInspectorFieldKind, EditorInspectorSourceFamily, IEditorAssetRow, IEditorEnvironmentSummary, IEditorLodStats, IEditorPropertyRow, IEditorSceneObject, EditorScenePrimitive } from "../adapters/editorModel.js";
import { buildCatalogModel } from "../workbench/catalogModel.js";
import { buildSceneLifecycleModel, type ISceneLifecycleModel } from "../workbench/sceneModel.js";

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
  assets: IEditorAssetRow[];
  diagnostics: IAuthoringDiagnostic[];
  documents: IEditorProjectDocumentGroup[];
  environment?: IEditorEnvironmentSummary;
  ok: boolean;
  projectPath: string;
  projectRevision: string;
  lod: IEditorLodStats;
  sceneLifecycle: ISceneLifecycleModel;
  sceneObjects: IEditorSceneObject[];
}

const systemStringListRowKeys = [
  "reads",
  "writes",
  "resourceReads",
  "resourceWrites",
  "eventReads",
  "eventWrites",
  "services",
  "after",
  "before",
] as const;

type SystemStringListRowKey = (typeof systemStringListRowKeys)[number];

const systemMetadataLabels: Record<SystemStringListRowKey, string> = {
  after: "After",
  before: "Before",
  eventReads: "Event Reads",
  eventWrites: "Event Writes",
  reads: "Reads",
  resourceReads: "Resource Reads",
  resourceWrites: "Resource Writes",
  services: "Services",
  writes: "Writes",
};

export async function loadEditorProjectApi(options: { projectPath: string; rootPath?: string }): Promise<IEditorProjectApiResult> {
  const guard = validateProjectRoot(options.projectPath, options.rootPath);
  if (guard !== undefined) {
    return emptyProjectResult(resolve(options.projectPath), [guard]);
  }

  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const validation = await validateAuthoringProject({ projectPath: project.projectPath });
  const sceneObjects = buildSceneObjects(project.documents);
  const diagnostics = [...project.diagnostics, ...validation.diagnostics, ...modelAssetDiagnostics(sceneObjects)];
  const hasErrors = diagnostics.some((diagnostic) => diagnostic.severity === "error");
  return {
    diagnostics,
    assets: buildProjectAssets(project.documents),
    documents: groupDocuments(project.documents),
    environment: buildEnvironmentSummary(project.documents),
    lod: buildLodStats(sceneObjects),
    ok: !hasErrors,
    projectPath: project.projectPath,
    projectRevision: projectRevision(project.documents),
    sceneLifecycle: buildSceneLifecycleModel(project.documents, { buildReady: !hasErrors && sceneObjects.length > 0, hasErrors }),
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
    assets: [],
    documents: [],
    lod: { budget: 200_000, loadedTriangles: 0, loading: false, mode: "auto", precision: "estimate", selected: "original", triangleCount: 0 },
    ok: false,
    projectPath,
    projectRevision: "0:0",
    sceneLifecycle: { scenes: [], state: "diagnostic" },
    sceneObjects: [],
  };
}

function buildProjectAssets(documents: readonly IAuthoringDocument[]): IEditorAssetRow[] {
  return buildCatalogModel(documents).map((row) => ({
    access: row.mutation === "enabled" ? "sourcePersistable" : "inspectableOnly",
    id: `asset:${row.id}`,
    kind: row.assetKind ?? row.kind,
    label: row.id,
    path: row.path ?? row.documentPath,
  }));
}

function buildLodStats(sceneObjects: readonly IEditorSceneObject[]): IEditorLodStats {
  const triangleCount = sceneObjects.reduce((total, object) => total + triangleEstimate(object), 0);
  return {
    budget: 200_000,
    loadedTriangles: triangleCount,
    loading: false,
    mode: "auto",
    precision: "estimate",
    selected: "original",
    triangleCount,
  };
}

function modelAssetDiagnostics(sceneObjects: readonly IEditorSceneObject[]): IAuthoringDiagnostic[] {
  return sceneObjects.flatMap((object) => {
    const assetPath = object.assetPath;
    if (assetPath === undefined || !(assetPath.endsWith(".glb") || assetPath.endsWith(".gltf"))) {
      return [];
    }
    if (assetPath.startsWith("http://") || assetPath.startsWith("https://")) {
      const diagnostic: IAuthoringDiagnostic = {
        code: "TN_EDITOR_MODEL_ASSET_REMOTE_UNSUPPORTED",
        message: `Editor model asset '${assetPath}' must be project-local to load in the viewport.`,
        path: object.sourcePath,
        severity: "error",
        suggestion: "Copy the GLB/GLTF into the project and reference it through a project-relative asset path.",
      };
      return [diagnostic];
    }
    const diagnostic: IAuthoringDiagnostic = {
      code: "TN_EDITOR_MODEL_ASSET_PROJECT_ROUTE",
      message: `Editor model asset '${assetPath}' loads through /project-assets.`,
      path: object.sourcePath,
      severity: "info",
      suggestion: "If the model does not appear in the viewport, verify the project-relative file exists under the opened project.",
    };
    return [diagnostic];
  });
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
  environmentId: string;
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
      environmentId: readDocumentId(document.data) ?? "",
      mode: readString(skybox.mode) ?? "configured",
      value: summarizeSkybox(skybox),
    };
  }
  return undefined;
}

function buildEnvironmentSummary(documents: readonly IAuthoringDocument[]): IEditorEnvironmentSummary | undefined {
  for (const document of documents) {
    if (document.kind !== "environment" || !isRecord(document.data)) {
      continue;
    }
    const skybox = isRecord(document.data.skybox) ? document.data.skybox : undefined;
    const terrain = isRecord(document.data.terrain) ? document.data.terrain : undefined;
    return {
      ...(skybox === undefined ? {} : { skybox: { mode: readString(skybox.mode) ?? "configured", value: summarizeSkybox(skybox) } }),
      ...(terrain === undefined
        ? {}
        : {
            terrain: {
              heightMode: readString(terrain.heightMode),
              id: readString(terrain.id),
              sourceAsset: readString(terrain.heightmap) ?? readString(terrain.sourceAsset),
            },
          }),
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
    inspectorRow({ id: "inspect:id", input, label: "ID", readOnly: true, readOnlyReason: "Entity ids are stable source identifiers after creation.", value: input.entityId }),
    inspectorRow({ id: "inspect:name", input, label: "Name", readOnly: true, readOnlyReason: "Display names are derived from source ids in this editor slice.", value: displayLabelForEntityId(input.entityId) }),
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
    const prefabId = readString(input.prefabData.id) ?? "";
    const prefabPrimitive = readPrimitive(input.prefabData.primitive);
    const prefabColor = readString(input.prefabData.color);
    const prefabAsset = readString(input.prefabData.asset);
    const prefabArgs = { prefabId, sceneId: input.sceneId };
    rows.push(
      inspectorRow({
        component: "MeshRenderer",
        defaultValue: "box",
        fieldKind: "enum",
        id: "inspect:primitive",
        input,
        jsonPointer: `/prefabs/${prefabId}/primitive`,
        label: "Primitive",
        operation: { args: prefabArgs, name: "scene.set_prefab", valueArg: "primitive" },
        options: ["box", "capsule", "cone", "cylinder", "plane", "sphere"],
        readOnly: false,
        value: prefabPrimitive,
      }),
      inspectorRow({
        component: "MeshRenderer",
        defaultValue: "#2f80ed",
        fieldKind: "color",
        id: "inspect:color",
        input,
        jsonPointer: `/prefabs/${prefabId}/color`,
        label: "Color",
        operation: { args: prefabArgs, name: "scene.set_prefab", valueArg: "color" },
        readOnly: false,
        value: prefabColor ?? "#2f80ed",
      }),
      inspectorRow({
        component: "MeshRenderer",
        fieldKind: "asset",
        id: "inspect:asset",
        input,
        jsonPointer: `/prefabs/${prefabId}/asset`,
        label: "Asset",
        operation: { args: prefabArgs, name: "scene.set_prefab", valueArg: "asset" },
        readOnly: false,
        value: prefabAsset ?? "",
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
          operation: { args: { environmentId: input.environmentSkybox.environmentId, mode: input.environmentSkybox.mode }, name: "environment.set_skybox", valueArg: "asset" },
          path: `${input.environmentSkybox.documentPath}/skybox`,
          readOnly: false,
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
          operation: { args: { asset: input.environmentSkybox.value, environmentId: input.environmentSkybox.environmentId }, name: "environment.set_skybox", valueArg: "mode" },
          path: `${input.environmentSkybox.documentPath}/skybox/mode`,
          readOnly: false,
          sourceFamily: "environment",
          sourcePath: input.environmentSkybox.documentPath,
          value: input.environmentSkybox.mode,
        },
      );
    }
  }

  if (isRecord(input.lightData)) {
    const lightKind = readString(input.lightData.kind) ?? "directional";
    const lightIntensity = typeof input.lightData.intensity === "number" && Number.isFinite(input.lightData.intensity) ? input.lightData.intensity : 1;
    const lightColor = readString(input.lightData.color) ?? "#ffffff";
    const lightArgs = {
      angle: readNumber(input.lightData.angle),
      color: lightColor,
      entityId: input.entityId,
      intensity: lightIntensity,
      kind: lightKind,
      range: readNumber(input.lightData.range),
      sceneId: input.sceneId,
      shadowBias: readNumber(input.lightData.shadowBias),
      shadowNormalBias: readNumber(input.lightData.shadowNormalBias),
    };
    rows.push(
      inspectorRow({ component: "Light", defaultValue: "directional", fieldKind: "enum", id: "inspect:light-kind", input, jsonPointer: `/entities/${input.entityId}/components/Light/kind`, label: "Kind", operation: { args: lightArgs, name: "scene.set_light", valueArg: "kind" }, options: ["ambient", "directional", "point", "spot"], readOnly: false, value: lightKind }),
      inspectorRow({ component: "Light", defaultValue: 1, fieldKind: "number", id: "inspect:light-intensity", input, jsonPointer: `/entities/${input.entityId}/components/Light/intensity`, label: "Intensity", operation: { args: lightArgs, name: "scene.set_light", valueArg: "intensity" }, readOnly: false, value: formatScalar(input.lightData.intensity, "1") }),
      inspectorRow({ component: "Light", defaultValue: "#ffffff", fieldKind: "color", id: "inspect:light-color", input, jsonPointer: `/entities/${input.entityId}/components/Light/color`, label: "Color", operation: { args: lightArgs, name: "scene.set_light", valueArg: "color" }, readOnly: false, value: lightColor }),
      inspectorRow({ component: "Light", fieldKind: "number", id: "inspect:light-range", input, jsonPointer: `/entities/${input.entityId}/components/Light/range`, label: "Range", operation: { args: lightArgs, name: "scene.set_light", valueArg: "range" }, readOnly: false, value: formatScalar(input.lightData.range, "") }),
      inspectorRow({ component: "Light", fieldKind: "number", id: "inspect:light-angle", input, jsonPointer: `/entities/${input.entityId}/components/Light/angle`, label: "Angle", operation: { args: lightArgs, name: "scene.set_light", valueArg: "angle" }, readOnly: false, value: formatScalar(input.lightData.angle, "") }),
      inspectorRow({ component: "Light", fieldKind: "number", id: "inspect:light-shadow-bias", input, jsonPointer: `/entities/${input.entityId}/components/Light/shadowBias`, label: "Shadow Bias", operation: { args: lightArgs, name: "scene.set_light", valueArg: "shadowBias" }, readOnly: false, value: formatScalar(input.lightData.shadowBias, "") }),
      inspectorRow({ component: "Light", fieldKind: "number", id: "inspect:light-shadow-normal-bias", input, jsonPointer: `/entities/${input.entityId}/components/Light/shadowNormalBias`, label: "Shadow Normal Bias", operation: { args: lightArgs, name: "scene.set_light", valueArg: "shadowNormalBias" }, readOnly: false, value: formatScalar(input.lightData.shadowNormalBias, "") }),
    );
  }

  for (const [component, value] of Object.entries(input.components ?? {})) {
    if (["camera", "Light", "light"].includes(component)) {
      continue;
    }
    if (isRecord(value)) {
      rows.push(inspectorRow({ component, fieldKind: "json", id: `inspect:component:${component}`, input, jsonPointer: `/entities/${input.entityId}/components/${escapeJsonPointer(component)}`, label: component, operation: { args: { componentKind: component, entityId: input.entityId, sceneId: input.sceneId }, name: "scene.set_component", valueArg: "value" }, readOnly: false, value: summarizeValue(value) }));
    }
  }

  return rows;
}

function documentInspectorRows(document: IAuthoringDocument): IEditorPropertyRow[] {
  if (!isRecord(document.data)) {
    return [];
  }
  const rows: IEditorPropertyRow[] = [
    documentRow(document, "document", "Document", document.projectRelativePath, "generated", true, "/", undefined, undefined, undefined, undefined, "Document paths are source provenance, not editable document data."),
    documentRow(document, "kind", "Kind", document.kind, "generated", true, "/schema", undefined, undefined, undefined, undefined, "Document kind is derived from the source schema."),
  ];
  switch (document.kind) {
    case "material":
      for (const [index, material] of readArray(document.data.materials).filter(isRecord).entries()) {
        rows.push(documentRow(document, `material:${index}:color`, `${readString(material.id) ?? `material.${index}`} Color`, readString(material.color) ?? "", "color", false, `/materials/${index}/color`, "material", "material.set", "color", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:roughness`, `${readString(material.id) ?? `material.${index}`} Roughness`, formatScalar(material.roughness, ""), "number", false, `/materials/${index}/roughness`, "material", "material.set", "roughness", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:metalness`, `${readString(material.id) ?? `material.${index}`} Metalness`, formatScalar(material.metalness, ""), "number", false, `/materials/${index}/metalness`, "material", "material.set", "metalness", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:emissive`, `${readString(material.id) ?? `material.${index}`} Emissive`, readString(material.emissive) ?? "", "color", false, `/materials/${index}/emissive`, "material", "material.set", "emissive", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:emissiveIntensity`, `${readString(material.id) ?? `material.${index}`} Emissive Intensity`, formatScalar(material.emissiveIntensity, ""), "number", false, `/materials/${index}/emissiveIntensity`, "material", "material.set", "emissiveIntensity", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:alphaMode`, `${readString(material.id) ?? `material.${index}`} Alpha Mode`, readString(material.alphaMode) ?? "", "enum", false, `/materials/${index}/alphaMode`, "material", "material.set", "alphaMode", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:alphaCutoff`, `${readString(material.id) ?? `material.${index}`} Alpha Cutoff`, formatScalar(material.alphaCutoff, ""), "number", false, `/materials/${index}/alphaCutoff`, "material", "material.set", "alphaCutoff", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:opacity`, `${readString(material.id) ?? `material.${index}`} Opacity`, formatScalar(material.opacity, ""), "number", false, `/materials/${index}/opacity`, "material", "material.set", "opacity", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:baseColorTexture`, `${readString(material.id) ?? `material.${index}`} Base Color Texture`, readString(material.baseColorTexture) ?? "", "asset", false, `/materials/${index}/baseColorTexture`, "material", "material.set", "baseColorTexture", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:normalTexture`, `${readString(material.id) ?? `material.${index}`} Normal Texture`, readString(material.normalTexture) ?? "", "asset", false, `/materials/${index}/normalTexture`, "material", "material.set", "normalTexture", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:metallicRoughnessTexture`, `${readString(material.id) ?? `material.${index}`} Metallic Roughness Texture`, readString(material.metallicRoughnessTexture) ?? "", "asset", false, `/materials/${index}/metallicRoughnessTexture`, "material", "material.set", "metallicRoughnessTexture", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:emissiveTexture`, `${readString(material.id) ?? `material.${index}`} Emissive Texture`, readString(material.emissiveTexture) ?? "", "asset", false, `/materials/${index}/emissiveTexture`, "material", "material.set", "emissiveTexture", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:occlusionTexture`, `${readString(material.id) ?? `material.${index}`} Occlusion Texture`, readString(material.occlusionTexture) ?? "", "asset", false, `/materials/${index}/occlusionTexture`, "material", "material.set", "occlusionTexture", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:clearcoat`, `${readString(material.id) ?? `material.${index}`} Clearcoat`, formatScalar(material.clearcoat, ""), "number", false, `/materials/${index}/clearcoat`, "material", "material.set", "clearcoat", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:clearcoatRoughness`, `${readString(material.id) ?? `material.${index}`} Clearcoat Roughness`, formatScalar(material.clearcoatRoughness, ""), "number", false, `/materials/${index}/clearcoatRoughness`, "material", "material.set", "clearcoatRoughness", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:clearcoatTexture`, `${readString(material.id) ?? `material.${index}`} Clearcoat Texture`, readString(material.clearcoatTexture) ?? "", "asset", false, `/materials/${index}/clearcoatTexture`, "material", "material.set", "clearcoatTexture", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:clearcoatRoughnessTexture`, `${readString(material.id) ?? `material.${index}`} Clearcoat Roughness Texture`, readString(material.clearcoatRoughnessTexture) ?? "", "asset", false, `/materials/${index}/clearcoatRoughnessTexture`, "material", "material.set", "clearcoatRoughnessTexture", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:transmission`, `${readString(material.id) ?? `material.${index}`} Transmission`, formatScalar(material.transmission, ""), "number", false, `/materials/${index}/transmission`, "material", "material.set", "transmission", { materialId: readString(material.id) ?? "" }));
        rows.push(documentRow(document, `material:${index}:transmissionTexture`, `${readString(material.id) ?? `material.${index}`} Transmission Texture`, readString(material.transmissionTexture) ?? "", "asset", false, `/materials/${index}/transmissionTexture`, "material", "material.set", "transmissionTexture", { materialId: readString(material.id) ?? "" }));
      }
      break;
    case "input":
      for (const [index, action] of readArray(document.data.actions).filter(isRecord).entries()) {
        rows.push(documentRow(document, `input:${index}:id`, "Action ID", readString(action.id) ?? "", "string", true, `/actions/${index}/id`, "input", undefined, undefined, undefined, "Input action ids are stable source identifiers after creation."));
        rows.push(documentRow(document, `input:${index}:bindings`, "Bindings", readArray(action.bindings).filter((binding): binding is string => typeof binding === "string").join(", "), "stringList", false, `/actions/${index}/bindings`, "input", "input.add_action", "keys", { actionId: readString(action.id) ?? "", inputDocId: readDocumentId(document.data) ?? "" }));
      }
      for (const [index, axis] of readArray(document.data.axes).filter(isRecord).entries()) {
        const axisId = readString(axis.id) ?? "";
        const baseArgs = {
          axisId,
          inputDocId: readDocumentId(document.data) ?? "",
          negativeKeys: readStringArray(axis.negative).map(stripKeyboardBinding),
          positiveKeys: readStringArray(axis.positive).map(stripKeyboardBinding),
          ...(readString(axis.value) === undefined ? {} : { value: readString(axis.value) }),
        };
        rows.push(documentRow(document, `input-axis:${index}:id`, "Axis ID", axisId, "string", true, `/axes/${index}/id`, "input", undefined, undefined, undefined, "Input axis ids are stable source identifiers after creation."));
        rows.push(documentRow(document, `input-axis:${index}:negative`, `${axisId || `axis.${index}`} Negative`, readStringArray(axis.negative).join(", "), "stringList", false, `/axes/${index}/negative`, "input", "input.add_axis", "negativeKeys", baseArgs));
        rows.push(documentRow(document, `input-axis:${index}:positive`, `${axisId || `axis.${index}`} Positive`, readStringArray(axis.positive).join(", "), "stringList", false, `/axes/${index}/positive`, "input", "input.add_axis", "positiveKeys", baseArgs));
        rows.push(documentRow(document, `input-axis:${index}:value`, `${axisId || `axis.${index}`} Value`, readString(axis.value) ?? "", "string", false, `/axes/${index}/value`, "input", "input.add_axis", "value", baseArgs));
      }
      break;
    case "systems":
      for (const [index, system] of readArray(document.data.systems).filter(isRecord).entries()) {
        const systemId = readString(system.id) ?? "";
        const labelPrefix = systemId || `system.${index}`;
        const metadataArgs = systemMetadataArgs(systemId, system, document.projectRelativePath);
        rows.push(documentRow(document, `system:${index}:schedule`, `${labelPrefix} Schedule`, readString(system.schedule) ?? "", "string", true, `/systems/${index}/schedule`, "system", undefined, undefined, undefined, "System schedule mutation is not promoted after creation."));
        rows.push(documentRow(document, `system:${index}:script`, `${labelPrefix} Script`, formatScript(system.script), "script", false, `/systems/${index}/script`, "system", "system.attach_script", "modulePath", { exportName: readString(isRecord(system.script) ? system.script.export : undefined) ?? "default", file: document.projectRelativePath, systemId }));
        for (const key of systemStringListRowKeys) {
          rows.push(documentRow(document, `system:${index}:${key}`, `${labelPrefix} ${systemMetadataLabels[key]}`, readStringArray(system[key]).join(", "), "stringList", false, `/systems/${index}/${key}`, "system", "system.set_metadata", key, metadataArgs));
        }
        rows.push(documentRow(document, `system:${index}:queries`, `${labelPrefix} Queries`, summarizeValue(readRecordArray(system.queries)), "json", false, `/systems/${index}/queries`, "system", "system.set_metadata", "queries", metadataArgs));
        rows.push(documentRow(document, `system:${index}:commands`, `${labelPrefix} Commands`, summarizeValue(readRecordArray(system.commands)), "json", false, `/systems/${index}/commands`, "system", "system.set_metadata", "commands", metadataArgs));
      }
      break;
    case "asset":
      for (const [index, asset] of readArray(document.data.assets).filter(isRecord).entries()) {
        const assetId = readString(asset.id) ?? "";
        const assetType = readString(asset.type) ?? "model";
        const assetPath = readString(asset.path) ?? "";
        const baseArgs = {
          assetId,
          file: document.projectRelativePath,
          format: readString(asset.format),
          height: readNumber(asset.height),
          ...(assetType === "render-target" ? {} : { path: assetPath }),
          sampleCount: readNumber(asset.sampleCount),
          type: assetType,
          usage: readString(asset.usage),
          width: readNumber(asset.width),
        };
        rows.push(documentRow(document, `asset:${index}:type`, `${assetId || `asset.${index}`} Type`, assetType, "enum", false, `/assets/${index}/type`, "asset", "asset.add", "type", baseArgs));
        if (assetType === "render-target") {
          rows.push(documentRow(document, `asset:${index}:width`, `${assetId || `asset.${index}`} Width`, formatScalar(asset.width, ""), "number", false, `/assets/${index}/width`, "asset", "asset.add", "width", baseArgs));
          rows.push(documentRow(document, `asset:${index}:height`, `${assetId || `asset.${index}`} Height`, formatScalar(asset.height, ""), "number", false, `/assets/${index}/height`, "asset", "asset.add", "height", baseArgs));
          rows.push(documentRow(document, `asset:${index}:usage`, `${assetId || `asset.${index}`} Usage`, readString(asset.usage) ?? "color", "enum", false, `/assets/${index}/usage`, "asset", "asset.add", "usage", baseArgs));
          rows.push(documentRow(document, `asset:${index}:format`, `${assetId || `asset.${index}`} Format`, readString(asset.format) ?? "", "enum", false, `/assets/${index}/format`, "asset", "asset.add", "format", baseArgs));
        } else {
          rows.push(documentRow(document, `asset:${index}:path`, `${assetId || `asset.${index}`} Path`, assetPath, "asset", false, `/assets/${index}/path`, "asset", "asset.add", "path", baseArgs));
        }
      }
      break;
    case "project": {
      const projectId = readDocumentId(document.data) ?? "";
      const baseArgs = {
        authoringVersion: readString(document.data.authoringVersion),
        buildTargets: readStringArray(document.data.buildTargets),
        file: document.projectRelativePath,
        projectId,
        sourceRoots: readStringArray(document.data.sourceRoots),
      };
      rows.push(documentRow(document, "project:id", "Project", projectId, "string", false, "/id", "project", "project.create", "projectId", baseArgs));
      rows.push(documentRow(document, "project:authoring-version", "Authoring Version", readString(document.data.authoringVersion) ?? "", "string", false, "/authoringVersion", "project", "project.create", "authoringVersion", baseArgs));
      rows.push(documentRow(document, "project:source-roots", "Source Roots", readStringArray(document.data.sourceRoots).join(", "), "stringList", false, "/sourceRoots", "project", "project.create", "sourceRoots", baseArgs));
      rows.push(documentRow(document, "project:build-targets", "Build Targets", readStringArray(document.data.buildTargets).join(", "), "stringList", false, "/buildTargets", "project", "project.create", "buildTargets", baseArgs));
      break;
    }
    case "mesh":
      for (const [index, mesh] of readArray(document.data.meshes).filter(isRecord).entries()) {
        const meshId = readString(mesh.id) ?? "";
        rows.push(documentRow(document, `mesh:${index}:primitive`, `${meshId || `mesh.${index}`} Primitive`, readString(mesh.primitive) ?? "", "enum", false, `/meshes/${index}/primitive`, "mesh", "mesh.create_primitive", "kind", { file: document.projectRelativePath, kind: readString(mesh.primitive) ?? "", meshId }));
      }
      break;
    case "runtime": {
      const runtimeId = readDocumentId(document.data) ?? "";
      const window = isRecord(document.data.window) ? document.data.window : {};
      const renderer = isRecord(document.data.renderer) ? document.data.renderer : {};
      const bloom = isRecord(renderer.bloom) ? renderer.bloom : {};
      rows.push(documentRow(document, "runtime:window-width", "Window Width", formatScalar(window.width, ""), "number", false, "/window/width", "runtime", "runtime.set_window", "width", { height: readNumber(window.height), runtimeId, title: readString(window.title) }));
      rows.push(documentRow(document, "runtime:window-height", "Window Height", formatScalar(window.height, ""), "number", false, "/window/height", "runtime", "runtime.set_window", "height", { runtimeId, title: readString(window.title), width: readNumber(window.width) }));
      rows.push(documentRow(document, "runtime:window-title", "Window Title", readString(window.title) ?? "", "string", false, "/window/title", "runtime", "runtime.set_window", "title", { height: readNumber(window.height), runtimeId, width: readNumber(window.width) }));
      rows.push(documentRow(document, "runtime:renderer-antialias", "Renderer Antialias", readString(renderer.antialias) ?? "", "enum", false, "/renderer/antialias", "runtime", "runtime.set_rendering", "antialias", { bloomEnabled: readBoolean(bloom.enabled), bloomIntensity: readNumber(bloom.intensity), bloomThreshold: readNumber(bloom.threshold), renderPath: readString(renderer.renderPath), runtimeId }));
      rows.push(documentRow(document, "runtime:renderer-bloom", "Bloom", formatBoolean(bloom.enabled), "boolean", false, "/renderer/bloom/enabled", "runtime", "runtime.set_rendering", "bloomEnabled", { antialias: readString(renderer.antialias), bloomIntensity: readNumber(bloom.intensity), bloomThreshold: readNumber(bloom.threshold), renderPath: readString(renderer.renderPath), runtimeId }));
      rows.push(documentRow(document, "runtime:renderer-bloom-intensity", "Bloom Intensity", formatScalar(bloom.intensity, ""), "number", false, "/renderer/bloom/intensity", "runtime", "runtime.set_rendering", "bloomIntensity", { antialias: readString(renderer.antialias), bloomEnabled: readBoolean(bloom.enabled), bloomThreshold: readNumber(bloom.threshold), renderPath: readString(renderer.renderPath), runtimeId }));
      rows.push(documentRow(document, "runtime:renderer-bloom-threshold", "Bloom Threshold", formatScalar(bloom.threshold, ""), "number", false, "/renderer/bloom/threshold", "runtime", "runtime.set_rendering", "bloomThreshold", { antialias: readString(renderer.antialias), bloomEnabled: readBoolean(bloom.enabled), bloomIntensity: readNumber(bloom.intensity), renderPath: readString(renderer.renderPath), runtimeId }));
      rows.push(documentRow(document, "runtime:renderer-render-path", "Render Path", readString(renderer.renderPath) ?? "", "enum", false, "/renderer/renderPath", "runtime", "runtime.set_rendering", "renderPath", { antialias: readString(renderer.antialias), bloomEnabled: readBoolean(bloom.enabled), bloomIntensity: readNumber(bloom.intensity), bloomThreshold: readNumber(bloom.threshold), runtimeId }));
      break;
    }
    case "target": {
      const targetProfileId = readDocumentId(document.data) ?? "";
      const baseArgs = {
        budgets: isRecord(document.data.budgets) ? { ...document.data.budgets } : undefined,
        performance: isRecord(document.data.performance) ? { ...document.data.performance } : undefined,
        targetProfileId,
        targets: readStringArray(document.data.targets),
      };
      rows.push(documentRow(document, "target:targets", "Targets", readStringArray(document.data.targets).join(", "), "stringList", false, "/targets", "target", "target.set_profile", "targets", baseArgs));
      rows.push(documentRow(document, "target:budgets", "Budgets", summarizeValue(document.data.budgets), "json", false, "/budgets", "target", "target.set_profile", "budgets", baseArgs));
      rows.push(documentRow(document, "target:performance", "Performance", summarizeValue(document.data.performance), "json", false, "/performance", "target", "target.set_profile", "performance", baseArgs));
      break;
    }
    case "scene":
      rows.push(documentRow(document, "scene:lifecycle:kind", "Scene Kind", readString(document.data.kind) ?? "level", "enum", false, "/kind", "scene", "scene.set_lifecycle", "kind", { activation: readString(document.data.activation), initial: document.data.initial === true, sceneId: readDocumentId(document.data) ?? "" }));
      rows.push(documentRow(document, "scene:lifecycle:activation", "Activation", readString(document.data.activation) ?? "", "enum", false, "/activation", "scene", "scene.set_lifecycle", "activation", { initial: document.data.initial === true, kind: readString(document.data.kind), sceneId: readDocumentId(document.data) ?? "" }));
      rows.push(documentRow(document, "scene:lifecycle:initial", "Initial Scene", document.data.initial === true ? "true" : "false", "boolean", false, "/initial", "scene", "scene.set_lifecycle", "initial", { activation: readString(document.data.activation), kind: readString(document.data.kind), sceneId: readDocumentId(document.data) ?? "" }));
      for (const [index, resource] of readArray(document.data.resources).filter(isRecord).entries()) {
        const resourceId = readString(resource.id) ?? "";
        if (resource.path !== undefined || resource.value === undefined) {
          rows.push(documentRow(document, `resource:${index}:path`, `${resourceId || `resource.${index}`} Path`, readString(resource.path) ?? "", "asset", false, `/resources/${index}/path`, "scene", "scene.set_resource", "path", { resourceId, sceneId: readDocumentId(document.data) ?? "" }));
        }
        if (resource.value !== undefined) {
          rows.push(documentRow(document, `resource:${index}:value`, `${resourceId || `resource.${index}`} Value`, summarizeValue(resource.value), "json", false, `/resources/${index}/value`, "scene", "scene.set_resource", "value", { resourceId, sceneId: readDocumentId(document.data) ?? "" }));
        }
      }
      break;
    case "environment": {
      const environmentId = readDocumentId(document.data) ?? "";
      const skybox = isRecord(document.data.skybox) ? document.data.skybox : undefined;
      if (skybox !== undefined) {
        rows.push(documentRow(document, "environment:skybox", "Skybox", summarizeSkybox(skybox), "asset", false, "/skybox", "environment", "environment.set_skybox", "asset", { environmentId, mode: readString(skybox.mode) }));
        rows.push(documentRow(document, "environment:skybox-mode", "Skybox Mode", readString(skybox.mode) ?? "", "enum", false, "/skybox/mode", "environment", "environment.set_skybox", "mode", { asset: summarizeSkybox(skybox), environmentId }));
      }
      if (document.data.environmentMap !== undefined) {
        rows.push(documentRow(document, "environment:environment-map", "Environment Map", summarizeAssetBackedValue(document.data.environmentMap), "asset", false, "/environmentMap", "environment", "environment.set_map", "asset", { environmentId }));
      }
      const terrain = isRecord(document.data.terrain) ? document.data.terrain : undefined;
      if (terrain !== undefined) {
        const terrainArgs = { environmentId, heightmap: readString(terrain.heightmap) ?? readString(terrain.sourceAsset), heightMode: readString(terrain.heightMode), terrainId: readString(terrain.id) };
        rows.push(documentRow(document, "environment:terrain-id", "Terrain", readString(terrain.id) ?? "configured", "string", false, "/terrain/id", "environment", "environment.set_terrain", "terrainId", terrainArgs));
        rows.push(documentRow(document, "environment:terrain-height-mode", "Terrain Height Mode", readString(terrain.heightMode) ?? "unknown", "enum", false, "/terrain/heightMode", "environment", "environment.set_terrain", "heightMode", terrainArgs));
        rows.push(documentRow(document, "environment:terrain-heightmap", "Terrain Heightmap", readString(terrain.heightmap) ?? readString(terrain.sourceAsset) ?? "flat fallback", "asset", false, "/terrain/heightmap", "environment", "environment.set_terrain", "heightmap", terrainArgs));
      }
      if (document.data.walkability !== undefined) {
        rows.push(documentRow(document, "environment:walkability", "Walkability", summarizeValue(document.data.walkability), "json", false, "/walkability", "environment", "environment.set_walkability", "walkability", { environmentId }));
      }
      if (document.data.path !== undefined) {
        rows.push(documentRow(document, "environment:path", "Path", summarizeValue(document.data.path), "json", false, "/path", "environment", "environment.set_path", "path", { environmentId }));
      }
      for (const [index, probe] of readArray(document.data.lightProbes).filter(isRecord).entries()) {
        const probeId = readString(probe.id) ?? "";
        rows.push(documentRow(document, `environment:light-probe:${index}`, `${probeId || `lightProbe.${index}`} Light Probe`, summarizeValue(probe), "json", false, `/lightProbes/${index}`, "environment", "environment.set_light_probe", "probe", { environmentId, probe: { ...probe }, probeId }));
      }
      for (const [index, asset] of readArray(document.data.sourceAssets).filter(isRecord).entries()) {
        if (asset.lod !== undefined) {
          const sourceAssetId = readString(asset.id) ?? "";
          rows.push(documentRow(document, `environment:source-asset:${index}:lod`, `${sourceAssetId || `sourceAsset.${index}`} LOD`, summarizeValue(asset.lod), "json", false, `/sourceAssets/${index}/lod`, "environment", "environment.set_source_asset_lod", "lod", { environmentId, sourceAssetId }));
        }
      }
      break;
    }
    case "generator": {
      rows.push(documentRow(document, "generator:module", "Generator Module", readString(document.data.module) ?? "", "string", true, "/module", "generator", undefined, undefined, undefined, "Generator provenance is one-way metadata; edit the generator source or rerun generator.record."));
      rows.push(documentRow(document, "generator:export", "Generator Export", readString(document.data.export) ?? "", "string", true, "/export", "generator", undefined, undefined, undefined, "Generator provenance is one-way metadata; edit the generator source or rerun generator.record."));
      rows.push(documentRow(document, "generator:outputs", "Generated Outputs", readStringArray(document.data.outputs).join(", "), "stringList", true, "/outputs", "generator", undefined, undefined, undefined, "Generator outputs are one-way provenance and do not receive reverse editor patches."));
      rows.push(documentRow(document, "generator:overwrite-policy", "Overwrite Policy", readString(document.data.overwritePolicy) ?? "", "enum", true, "/overwritePolicy", "generator", undefined, undefined, undefined, "Generator overwrite policy is controlled by generator.record."));
      break;
    }
    case "ui":
      for (const [index, node] of readArray(document.data.nodes).filter(isRecord).entries()) {
        const nodeId = readString(node.id) ?? "";
        const nodeType = readString(node.type) ?? "text";
        const style = isRecord(node.style) ? node.style : {};
        rows.push(documentRow(document, `ui-node:${index}:type`, `${nodeId || `node.${index}`} Type`, nodeType, "enum", false, `/nodes/${index}/type`, "ui", "ui.add_node", "type", { action: readString(node.action), label: readString(node.label), nodeId, src: readString(node.src), text: readString(node.text), uiDocId: readDocumentId(document.data) ?? "" }));
        rows.push(documentRow(document, `ui-node:${index}:label`, `${nodeId || `node.${index}`} Label`, readString(node.label) ?? readString(node.text) ?? "", "string", false, `/nodes/${index}/label`, "ui", "ui.add_node", "label", { action: readString(node.action), nodeId, src: readString(node.src), text: readString(node.text), type: nodeType, uiDocId: readDocumentId(document.data) ?? "" }));
        rows.push(documentRow(document, `ui-node:${index}:color`, `${nodeId || `node.${index}`} Color`, readString(style.color) ?? "", "color", false, `/nodes/${index}/style/color`, "ui", "ui.set_style", "color", { nodeId, uiDocId: readDocumentId(document.data) ?? "" }));
        rows.push(documentRow(document, `ui-node:${index}:background`, `${nodeId || `node.${index}`} Background`, readString(style.backgroundColor) ?? "", "color", false, `/nodes/${index}/style/backgroundColor`, "ui", "ui.set_style", "backgroundColor", { nodeId, uiDocId: readDocumentId(document.data) ?? "" }));
        rows.push(documentRow(document, `ui-node:${index}:font-size`, `${nodeId || `node.${index}`} Font Size`, formatScalar(style.fontSize, ""), "number", false, `/nodes/${index}/style/fontSize`, "ui", "ui.set_style", "fontSize", { nodeId, uiDocId: readDocumentId(document.data) ?? "" }));
      }
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

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
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
    case "generator":
    case "input":
    case "material":
    case "mesh":
    case "prefab":
    case "project":
    case "resources":
    case "runtime":
    case "target":
    case "scene":
    case "ui":
      return kind;
    case "systems":
      return "system";
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

function summarizeAssetBackedValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (isRecord(value)) {
    return readString(value.asset) ?? readString(value.path) ?? summarizeValue(value);
  }
  return summarizeValue(value);
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

function systemMetadataArgs(systemId: string, system: Record<string, unknown>, file: string): Record<string, unknown> {
  return {
    after: readStringArray(system.after),
    before: readStringArray(system.before),
    commands: readRecordArray(system.commands),
    eventReads: readStringArray(system.eventReads),
    eventWrites: readStringArray(system.eventWrites),
    queries: readRecordArray(system.queries),
    reads: readStringArray(system.reads),
    resourceReads: readStringArray(system.resourceReads),
    resourceWrites: readStringArray(system.resourceWrites),
    services: readStringArray(system.services),
    file,
    systemId,
    writes: readStringArray(system.writes),
  };
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readRecordArray(value: unknown): Record<string, unknown>[] {
  return readArray(value).filter(isRecord);
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

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return readArray(value).filter((item): item is string => typeof item === "string");
}

function stripKeyboardBinding(value: string): string {
  return value.replace(/^keyboard\./, "");
}

function formatScalar(value: unknown, fallback: string): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : readString(value) ?? fallback;
}

function formatBoolean(value: unknown): string {
  return typeof value === "boolean" ? String(value) : "";
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
