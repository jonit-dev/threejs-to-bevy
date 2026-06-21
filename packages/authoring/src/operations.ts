import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

import { isGeneratedArtifactPath, normalizeRelativePath, writeAuthoringJsonDocument, type AuthoringDocumentKind, type IAuthoringDocument } from "./documents.js";
import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { loadAuthoringProject, type IAuthoringProject } from "./project.js";
import {
  cameraComponentKeys,
  ecsIdPattern,
  entityKeys,
  assetDocumentKeys,
  assetDocumentSchema,
  assetKeys,
  audioDocumentKeys,
  audioDocumentSchema,
  audioSoundKeys,
  inputActionKeys,
  inputDocumentKeys,
  inputDocumentSchema,
  logicalIdPattern,
  materialDocumentKeys,
  materialDocumentSchema,
  materialKeys,
  meshDocumentKeys,
  meshDocumentSchema,
  meshKeys,
  prefabDocumentKeys,
  prefabDocumentSchema,
  prefabKeys,
  resourceIdPattern,
  readArray,
  readString,
  resourceKeys,
  sceneDocumentKeys,
  sceneDocumentSchema,
  scriptReferenceKeys,
  systemsDocumentKeys,
  systemsDocumentSchema,
  supportedPrefabPrimitives,
  supportedMeshPrimitives,
  supportedCameraModes,
  supportedComponentKinds,
  uiDocumentKeys,
  uiDocumentSchema,
  systemKeys,
  transformKeys,
  uiBindingKeys,
  uiKeys,
  uiNodeKeys,
  type IScriptReference,
  type ISceneDocument,
  isRecord,
} from "./schemas.js";

export interface IAuthoringOperationResult {
  ok: boolean;
  changed: boolean;
  diagnostics: IAuthoringDiagnostic[];
  projectPath: string;
  filesWritten: string[];
}

export interface IAuthoringOperationContext {
  projectPath: string;
}

export function authoringOperationResult(input: {
  projectPath: string;
  changed?: boolean;
  diagnostics?: readonly IAuthoringDiagnostic[];
  filesWritten?: readonly string[];
}): IAuthoringOperationResult {
  const diagnostics = sortAuthoringDiagnostics(input.diagnostics ?? []);
  return {
    ok: !hasAuthoringErrors(diagnostics),
    changed: input.changed ?? false,
    diagnostics,
    projectPath: input.projectPath,
    filesWritten: [...(input.filesWritten ?? [])].sort(),
  };
}

export async function loadProjectForOperation(context: IAuthoringOperationContext): Promise<IAuthoringProject> {
  return loadAuthoringProject({ projectPath: context.projectPath });
}

export async function writeChangedProjectDocuments(project: IAuthoringProject): Promise<string[]> {
  const filesWritten: string[] = [];
  for (const document of project.documents) {
    await writeAuthoringJsonDocument(document);
    filesWritten.push(document.projectRelativePath);
  }
  return filesWritten.sort();
}

export interface IValidateSceneOptions extends IAuthoringOperationContext {
  sceneId?: string;
}

export interface IValidateAuthoringProjectOptions extends IAuthoringOperationContext {}

export interface ICreateSceneOptions extends IAuthoringOperationContext {
  sceneId: string;
  file?: string;
}

export interface IImportWorldOptions extends IAuthoringOperationContext {
  sceneId: string;
  worldFile: string;
  file?: string;
  replace?: boolean;
}

export interface IAddEntityOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  prefabId?: string;
}

export interface IAddPrefabOptions extends IAuthoringOperationContext {
  sceneId: string;
  prefabId: string;
  primitive?: string;
  color?: string;
  asset?: string;
}

export interface ISetPrefabColorOptions extends IAuthoringOperationContext {
  sceneId: string;
  prefabId: string;
  color: string;
}

export interface IAddResourceOptions extends IAuthoringOperationContext {
  sceneId: string;
  resourceId: string;
  path?: string;
  value?: unknown;
}

export interface ISetResourceOptions extends IAuthoringOperationContext {
  sceneId: string;
  resourceId: string;
  path?: string;
  value?: unknown;
}

export interface ISetComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  componentKind: string;
  value: Record<string, unknown>;
}

export interface IRemoveComponentOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  componentKind: string;
}

export interface IAddUiNodeOptions extends IAuthoringOperationContext {
  sceneId: string;
  uiNodeId: string;
}

export interface ISetTransformOptions extends IAuthoringOperationContext {
  sceneId: string;
  entityId: string;
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: [number, number, number];
}

export interface ISetCameraOptions extends IAuthoringOperationContext {
  sceneId: string;
  cameraId: string;
  mode: string;
  targetId: string;
}

export interface IAttachScriptOptions extends IAuthoringOperationContext {
  sceneId: string;
  systemId: string;
  modulePath: string;
  exportName: string;
}

export interface IBindUiOptions extends IAuthoringOperationContext {
  sceneId: string;
  uiNodeId: string;
  resourcePath: string;
}

export interface ICreateUiDocumentOptions extends IAuthoringOperationContext {
  uiDocId: string;
}

export interface IAddUiTextOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  text: string;
}

export interface ISetUiLayoutOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  align?: string;
  height?: number;
  justify?: string;
  top?: number;
  width?: number;
}

export interface IBindUiDocumentOptions extends IAuthoringOperationContext {
  uiDocId: string;
  nodeId: string;
  resourcePath: string;
}

export interface ICreateMaterialOptions extends IAuthoringOperationContext {
  materialId: string;
}

export interface ISetMaterialOptions extends IAuthoringOperationContext {
  materialId: string;
  color?: string;
  roughness?: number;
}

export interface ICreateMeshPrimitiveOptions extends IAuthoringOperationContext {
  meshId: string;
  kind: string;
}

export interface ICreatePrefabDocumentOptions extends IAuthoringOperationContext {
  prefabId: string;
}

export interface IAddPrefabComponentOptions extends IAuthoringOperationContext {
  prefabId: string;
  componentKind: string;
  value: Record<string, unknown>;
}

export interface IAddInputActionOptions extends IAuthoringOperationContext {
  inputDocId: string;
  actionId: string;
  keys: readonly string[];
}

export interface ICreateSystemOptions extends IAuthoringOperationContext {
  systemId: string;
  schedule: string;
}

export interface IAttachSystemScriptOptions extends IAuthoringOperationContext {
  systemId: string;
  modulePath: string;
  exportName: string;
}

export interface ISceneInspection {
  id: string;
  file: string;
  entities: string[];
  prefabs: string[];
  resources: string[];
  systems: string[];
  uiNodes: string[];
}

export interface ICreateSceneResult extends IAuthoringOperationResult {
  sceneId: string;
  file: string;
  nextCommands: string[];
}

export interface IImportWorldResult extends IAuthoringOperationResult {
  sceneId: string;
  file: string;
  entityCount: number;
  resourceCount: number;
}

export interface IInspectSceneResult extends IAuthoringOperationResult {
  scene?: ISceneInspection;
}

export async function createScene(options: ICreateSceneOptions): Promise<ICreateSceneResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.sceneId, "scene");

  const requestedFile = options.file ?? `content/scenes/${options.sceneId}.scene.json`;
  const absoluteFile = resolve(projectPath, requestedFile);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteFile));

  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Scene source documents must be created inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/scenes/ such as content/scenes/main.scene.json.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
        file: projectRelativePath,
        message: "Generated bundle artifacts cannot be used as authoring source documents.",
        suggestion: "Create scene source documents under content/scenes/ instead.",
      }),
    );
  } else if (!projectRelativePath.endsWith(".scene.json")) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: "Scene source documents must use the .scene.json extension.",
        value: projectRelativePath,
        suggestion: "Use a path such as content/scenes/main.scene.json.",
      }),
    );
  }

  const duplicateScene = project.documents.find((document) => document.kind === "scene" && readSceneId(document.data) === options.sceneId);
  if (duplicateScene !== undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DUPLICATE_SCENE_ID",
        file: duplicateScene.projectRelativePath,
        message: `Scene id '${options.sceneId}' already exists.`,
        path: "/id",
        value: options.sceneId,
        suggestion: "Use a new scene id or mutate the existing scene document.",
      }),
    );
  }

  try {
    await access(absoluteFile);
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
        file: projectRelativePath,
        message: `Scene source document '${projectRelativePath}' already exists.`,
        suggestion: "Use a different --file path or mutate the existing scene document.",
      }),
    );
  } catch {
    // Missing is the only successful create path; other write errors surface when writing.
  }

  const scene: ISceneDocument = {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: options.sceneId,
    entities: [],
    prefabs: [],
    resources: [],
    systems: [],
    ui: { nodes: [], bindings: [] },
  };

  if (!hasAuthoringErrors(diagnostics)) {
    diagnostics.push(...(await validateSceneDocument(projectPath, projectRelativePath, scene)));
  }

  if (hasAuthoringErrors(diagnostics)) {
    return {
      ...authoringOperationResult({ diagnostics, projectPath }),
      file: projectRelativePath,
      nextCommands: nextSceneCommands(options.sceneId),
      sceneId: options.sceneId,
    };
  }

  const document: IAuthoringDocument = {
    data: scene,
    file: absoluteFile,
    kind: "scene",
    projectRelativePath,
  };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);

  return {
    ...authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath }),
    file: projectRelativePath,
    nextCommands: nextSceneCommands(options.sceneId),
    sceneId: options.sceneId,
  };
}

export async function importWorld(options: IImportWorldOptions): Promise<IImportWorldResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.sceneId, "scene");

  const requestedFile = options.file ?? `content/scenes/${options.sceneId}.scene.json`;
  const absoluteFile = resolve(projectPath, requestedFile);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteFile));
  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Imported scene source documents must be written inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/scenes/ such as content/scenes/imported.scene.json.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(generatedPathDiagnostic(projectRelativePath, "", projectRelativePath));
  } else if (!projectRelativePath.endsWith(".scene.json")) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: "Imported scene source documents must use the .scene.json extension.",
        value: projectRelativePath,
        suggestion: "Use a path such as content/scenes/imported.scene.json.",
      }),
    );
  }

  if (!options.replace) {
    try {
      await access(absoluteFile);
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
          file: projectRelativePath,
          message: `Scene source document '${projectRelativePath}' already exists.`,
          suggestion: "Pass --replace or use a different --file path.",
        }),
      );
    } catch {
      // Missing is OK.
    }
  }

  const worldPath = resolve(projectPath, options.worldFile);
  let world: unknown;
  try {
    world = JSON.parse(await readFile(worldPath, "utf8"));
  } catch (error) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_WORLD_IMPORT_FAILED",
        file: options.worldFile,
        message: `Could not read world IR JSON: ${error instanceof Error ? error.message : String(error)}`,
        value: options.worldFile,
      }),
    );
  }

  const scene = world === undefined ? emptyScene(options.sceneId) : sceneFromWorld(options.sceneId, world);
  diagnostics.push(...(await validateSceneDocument(projectPath, projectRelativePath, scene)));
  if (hasAuthoringErrors(diagnostics)) {
    return {
      ...authoringOperationResult({ diagnostics, projectPath }),
      entityCount: scene.entities?.length ?? 0,
      file: projectRelativePath,
      resourceCount: scene.resources?.length ?? 0,
      sceneId: options.sceneId,
    };
  }

  const document: IAuthoringDocument = {
    data: scene,
    file: absoluteFile,
    kind: "scene",
    projectRelativePath,
  };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);

  return {
    ...authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath }),
    entityCount: scene.entities?.length ?? 0,
    file: projectRelativePath,
    resourceCount: scene.resources?.length ?? 0,
    sceneId: options.sceneId,
  };
}

export async function validateScene(options: IValidateSceneOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const selectedScenes = options.sceneId === undefined ? sceneDocuments : sceneDocuments.filter((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);

  if (options.sceneId !== undefined && selectedScenes.length === 0) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
  }

  for (const document of selectedScenes) {
    diagnostics.push(...(await validateSceneDocument(project.projectPath, document.projectRelativePath, document.data, { materialIds })));
  }

  return authoringOperationResult({
    diagnostics,
    projectPath: project.projectPath,
  });
}

export async function validateAuthoringProject(options: IValidateAuthoringProjectOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const materialIds = collectMaterialIdsForProject(project);

  for (const document of project.documents) {
    diagnostics.push(
      ...(await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, document.data, { materialIds })),
    );
  }

  return authoringOperationResult({
    diagnostics,
    projectPath: project.projectPath,
  });
}

function emptyScene(sceneId: string): ISceneDocument {
  return {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: sceneId,
    entities: [],
    prefabs: [],
    resources: [],
    systems: [],
    ui: { nodes: [], bindings: [] },
  };
}

function sceneFromWorld(sceneId: string, world: unknown): ISceneDocument {
  const worldRecord = isRecord(world) ? world : {};
  const worldEntities = readArray(worldRecord.entities) ?? [];
  const entities = worldEntities
    .filter(isRecord)
    .map((entity) => ({
      id: readString(entity.id) ?? "invalid-entity-id",
      ...(isRecord(entity.components) ? { components: cloneJson(entity.components) as Record<string, unknown> } : {}),
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id)));

  const resourcesRecord = isRecord(worldRecord.resources) ? worldRecord.resources : {};
  const resources = Object.entries(resourcesRecord)
    .map(([id, value]) => ({ id, value: cloneJson(value) }))
    .sort((left, right) => left.id.localeCompare(right.id));

  return {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: sceneId,
    entities,
    prefabs: [],
    resources,
    systems: [],
    ui: { nodes: [], bindings: [] },
  };
}

function nextSceneCommands(sceneId: string): string[] {
  return [
    `tn scene add-entity ${sceneId} <entity-id> --json`,
    `tn scene set-transform ${sceneId} <entity-id> --position x,y,z --json`,
    `tn scene attach-script ${sceneId} <system-id> --module src/scripts/<system>.ts --export <exportName> --json`,
    `tn scene validate ${sceneId} --json`,
    "tn build --json",
    "tn verify --json",
  ];
}

export async function inspectScene(options: IValidateSceneOptions & { sceneId: string }): Promise<IInspectSceneResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);

  if (sceneDocument === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
    return {
      ...authoringOperationResult({ diagnostics, projectPath: project.projectPath }),
    };
  }

  diagnostics.push(...(await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, sceneDocument.data, { materialIds })));

  return {
    ...authoringOperationResult({ diagnostics, projectPath: project.projectPath }),
    scene: inspectSceneDocument(sceneDocument.projectRelativePath, sceneDocument.data),
  };
}

export async function addEntity(options: IAddEntityOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const entities = ensureArrayProperty(scene, "entities");
    entities.push({
      id: options.entityId,
      ...(options.prefabId === undefined ? {} : { prefab: options.prefabId }),
    });
  });
}

export async function addPrefab(options: IAddPrefabOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const prefabs = ensureArrayProperty(scene, "prefabs");
    prefabs.push({
      id: options.prefabId,
      ...(options.primitive === undefined ? {} : { primitive: options.primitive }),
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.asset === undefined ? {} : { asset: options.asset }),
    });
  });
}

export async function setPrefabColor(options: ISetPrefabColorOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const prefab = findSceneItem(scene.prefabs, options.prefabId);
    if (prefab === undefined) {
      return [missingReferenceDiagnostic(file, "/prefabs", "prefab", options.prefabId, idsFromArray(scene.prefabs))];
    }
    prefab.color = options.color;
    return [];
  });
}

export async function addResource(options: IAddResourceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const resources = ensureArrayProperty(scene, "resources");
    resources.push({
      id: options.resourceId,
      ...(options.path === undefined ? {} : { path: options.path }),
      ...(options.value === undefined ? {} : { value: options.value }),
    });
  });
}

export async function setResource(options: ISetResourceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const resource = findSceneItem(scene.resources, options.resourceId);
    if (resource === undefined) {
      return [missingReferenceDiagnostic(file, "/resources", "resource", options.resourceId, idsFromArray(scene.resources))];
    }
    if (options.path !== undefined) {
      resource.path = options.path;
    }
    if (options.value !== undefined) {
      resource.value = options.value;
    }
    return [];
  });
}

export async function setComponent(options: ISetComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      [options.componentKind]: options.value,
    };
    return [];
  });
}

export async function removeComponent(options: IRemoveComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    if (!isRecord(entity.components)) {
      return [];
    }
    delete entity.components[options.componentKind];
    return [];
  });
}

export async function addUiNode(options: IAddUiNodeOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const ui = isRecord(scene.ui) ? scene.ui : {};
    const nodes = ensureArrayProperty(ui, "nodes");
    scene.ui = ui;
    nodes.push({ id: options.uiNodeId });
  });
}

export async function setTransform(options: ISetTransformOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    entity.transform = {
      ...(isRecord(entity.transform) ? entity.transform : {}),
      ...(options.position === undefined ? {} : { position: options.position }),
      ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
      ...(options.scale === undefined ? {} : { scale: options.scale }),
    };
    return [];
  });
}

export async function setCamera(options: ISetCameraOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.cameraId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.cameraId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      camera: {
        mode: options.mode,
        target: options.targetId,
      },
    };
    return [];
  });
}

export async function attachScript(options: IAttachScriptOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const systems = ensureArrayProperty(scene, "systems");
    const existing = findSceneItem(systems, options.systemId);
    const system = existing ?? { id: options.systemId };
    system.script = {
      module: options.modulePath,
      export: options.exportName,
    };
    if (existing === undefined) {
      systems.push(system);
    }
  });
}

export async function bindUi(options: IBindUiOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const ui = isRecord(scene.ui) ? scene.ui : {};
    const bindings = ensureArrayProperty(ui, "bindings");
    scene.ui = ui;
    bindings.push({
      node: options.uiNodeId,
      resource: options.resourcePath,
    });
  });
}

export async function createUiDocument(options: ICreateUiDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "ui",
    id: options.uiDocId,
    file: `content/ui/${options.uiDocId}.ui.json`,
    data: { schema: uiDocumentSchema, version: "0.1.0", id: options.uiDocId, nodes: [], bindings: [] },
  });
}

export async function addUiText(options: IAddUiTextOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const existing = findSceneItem(nodes, options.nodeId);
    const node = existing ?? { id: options.nodeId };
    node.type = "text";
    node.text = options.text;
    if (existing === undefined) {
      nodes.push(node);
    }
  });
}

export async function setUiLayout(options: ISetUiLayoutOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data, file) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const node = findSceneItem(nodes, options.nodeId);
    if (node === undefined) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    node.layout = {
      ...(isRecord(node.layout) ? node.layout : {}),
      ...(options.align === undefined ? {} : { align: options.align }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...(options.justify === undefined ? {} : { justify: options.justify }),
      ...(options.top === undefined ? {} : { top: options.top }),
      ...(options.width === undefined ? {} : { width: options.width }),
    };
    return [];
  });
}

export async function bindUiDocument(options: IBindUiDocumentOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const bindings = ensureArrayProperty(data, "bindings");
    bindings.push({ node: options.nodeId, resource: options.resourcePath });
  });
}

export async function createMaterial(options: ICreateMaterialOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "material",
    id: options.materialId,
    file: `content/materials/${options.materialId}.materials.json`,
    data: { schema: materialDocumentSchema, version: "0.1.0", id: options.materialId, materials: [{ id: options.materialId }] },
  });
}

export async function setMaterial(options: ISetMaterialOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "material", options.materialId, (data, file) => {
    const materials = ensureArrayProperty(data, "materials");
    const material = findSceneItem(materials, options.materialId);
    if (material === undefined) {
      return [missingReferenceDiagnostic(file, "/materials", "material", options.materialId, idsFromArray(materials))];
    }
    if (options.color !== undefined) {
      material.color = options.color;
    }
    if (options.roughness !== undefined) {
      material.roughness = options.roughness;
    }
    return [];
  });
}

export async function createMeshPrimitive(options: ICreateMeshPrimitiveOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "mesh",
    id: options.meshId,
    file: `content/meshes/${options.meshId}.meshes.json`,
    data: { schema: meshDocumentSchema, version: "0.1.0", id: options.meshId, meshes: [{ id: options.meshId, kind: "primitive", primitive: options.kind }] },
  });
}

export async function createPrefabDocument(options: ICreatePrefabDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "prefab",
    id: options.prefabId,
    file: `content/prefabs/${options.prefabId}.prefab.json`,
    data: { schema: prefabDocumentSchema, version: "0.1.0", id: options.prefabId, entities: [{ id: options.prefabId, components: {} }] },
  });
}

export async function addPrefabComponent(options: IAddPrefabComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "prefab", options.prefabId, (data, file) => {
    const entities = ensureArrayProperty(data, "entities");
    const entity = findSceneItem(entities, options.prefabId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.prefabId, idsFromArray(entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      [options.componentKind]: options.value,
    };
    return [];
  });
}

export async function addInputAction(options: IAddInputActionOptions): Promise<IAuthoringOperationResult> {
  const bindings = options.keys.map((key) => `keyboard.${key.length === 1 ? key.toLowerCase() : key}`);
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "input",
    id: options.inputDocId,
    file: `content/input/${options.inputDocId}.input.json`,
    emptyData: { schema: inputDocumentSchema, version: "0.1.0", id: options.inputDocId, actions: [] },
    apply: (data) => {
      const actions = ensureArrayProperty(data, "actions");
      const existing = findSceneItem(actions, options.actionId);
      const action = existing ?? { id: options.actionId };
      action.bindings = bindings;
      if (existing === undefined) {
        actions.push(action);
      }
    },
  });
}

export async function createSystem(options: ICreateSystemOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "systems",
    id: options.systemId,
    file: `content/systems/${options.systemId}.systems.json`,
    data: { schema: systemsDocumentSchema, version: "0.1.0", id: options.systemId, systems: [{ id: options.systemId, schedule: options.schedule }] },
  });
}

export async function attachSystemScript(options: IAttachSystemScriptOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "systems", options.systemId, (data, file) => {
    const systems = ensureArrayProperty(data, "systems");
    const system = findSceneItem(systems, options.systemId);
    if (system === undefined) {
      return [missingReferenceDiagnostic(file, "/systems", "system", options.systemId, idsFromArray(systems))];
    }
    system.script = { module: options.modulePath, export: options.exportName };
    return [];
  });
}

async function createSourceDocument(options: {
  projectPath: string;
  kind: AuthoringDocumentKind;
  id: string;
  file: string;
  data: Record<string, unknown>;
}): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.id, `${options.kind} document`);
  const absoluteFile = resolve(project.projectPath, options.file);
  const projectRelativePath = normalizeRelativePath(relative(project.projectPath, absoluteFile));
  validateNewSourcePath(diagnostics, projectRelativePath, options.file, sourceExtensionForKind(options.kind));

  const duplicateDocument = project.documents.find((document) => document.kind === options.kind && readDocumentId(document.data) === options.id);
  if (duplicateDocument !== undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DUPLICATE_DOCUMENT_ID",
        file: duplicateDocument.projectRelativePath,
        message: `${options.kind} document id '${options.id}' already exists.`,
        path: "/id",
        value: options.id,
        suggestion: "Use a new id or mutate the existing source document.",
      }),
    );
  }

  try {
    await access(absoluteFile);
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
        file: projectRelativePath,
        message: `Authoring source document '${projectRelativePath}' already exists.`,
        suggestion: "Use a different id or mutate the existing source document.",
      }),
    );
  } catch {
    // Missing is the successful create path.
  }

  diagnostics.push(...(await validateAuthoringDocument(project.projectPath, projectRelativePath, options.kind, options.data, { materialIds: collectMaterialIdsForProject(project) })));
  if (hasAuthoringErrors(diagnostics)) {
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const document: IAuthoringDocument = { data: options.data, file: absoluteFile, kind: options.kind, projectRelativePath };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath: project.projectPath });
}

async function upsertSourceDocument(options: {
  projectPath: string;
  kind: AuthoringDocumentKind;
  id: string;
  file: string;
  emptyData: Record<string, unknown>;
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[];
}): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const existing = project.documents.find((document) => document.kind === options.kind && readDocumentId(document.data) === options.id);
  if (existing !== undefined) {
    return mutateSourceDocument(options, options.kind, options.id, options.apply);
  }

  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.id, `${options.kind} document`);
  const absoluteFile = resolve(project.projectPath, options.file);
  const projectRelativePath = normalizeRelativePath(relative(project.projectPath, absoluteFile));
  validateNewSourcePath(diagnostics, projectRelativePath, options.file, sourceExtensionForKind(options.kind));
  try {
    await access(absoluteFile);
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
        file: projectRelativePath,
        message: `Authoring source document '${projectRelativePath}' already exists.`,
        suggestion: "Use a different id or mutate the existing source document.",
      }),
    );
  } catch {
    // Missing is the successful upsert-create path.
  }

  const nextData = cloneJson(options.emptyData);
  if (!isRecord(nextData)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file: projectRelativePath,
        message: "Structured authoring source document must be a JSON object before mutation.",
      }),
    );
  } else {
    diagnostics.push(...(options.apply(nextData, projectRelativePath) ?? []));
    diagnostics.push(...(await validateAuthoringDocument(project.projectPath, projectRelativePath, options.kind, nextData, { materialIds: collectMaterialIdsForProject(project) })));
  }

  if (hasAuthoringErrors(diagnostics)) {
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const document: IAuthoringDocument = { data: nextData, file: absoluteFile, kind: options.kind, projectRelativePath };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath: project.projectPath });
}

async function mutateSourceDocument(
  options: IAuthoringOperationContext,
  kind: AuthoringDocumentKind,
  id: string,
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((candidate) => candidate.kind === kind && readDocumentId(candidate.data) === id);
  const diagnostics = [...project.diagnostics];

  if (document === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_MISSING",
        message: `No ${kind} source document with id '${id}' was found.`,
        value: id,
        suggestion: closestIdSuggestion(id, project.documents.filter((candidate) => candidate.kind === kind).map((candidate) => readDocumentId(candidate.data)).filter(isString)),
      }),
    );
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const materialIds = collectMaterialIdsForProject(project);
  const beforeDiagnostics = await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, document.data, { materialIds });
  if (hasAuthoringErrors(beforeDiagnostics)) {
    return authoringOperationResult({ diagnostics: beforeDiagnostics, projectPath: project.projectPath });
  }

  const nextData = cloneJson(document.data);
  if (!isRecord(nextData)) {
    return authoringOperationResult({
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
          file: document.projectRelativePath,
          message: "Structured authoring source document must be a JSON object before mutation.",
        }),
      ],
      projectPath: project.projectPath,
    });
  }

  const applyDiagnostics = apply(nextData, document.projectRelativePath) ?? [];
  if (hasAuthoringErrors(applyDiagnostics)) {
    return authoringOperationResult({ diagnostics: applyDiagnostics, projectPath: project.projectPath });
  }

  const afterDiagnostics = await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, nextData, { materialIds });
  if (hasAuthoringErrors(afterDiagnostics)) {
    return authoringOperationResult({ diagnostics: afterDiagnostics, projectPath: project.projectPath });
  }

  document.data = nextData;
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics: afterDiagnostics, filesWritten: [document.projectRelativePath], projectPath: project.projectPath });
}

function validateNewSourcePath(diagnostics: IAuthoringDiagnostic[], projectRelativePath: string, requestedFile: string, extension: string): void {
  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Authoring source documents must be created inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/ for structured source documents.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(generatedPathDiagnostic(projectRelativePath, "", projectRelativePath));
  } else if (!projectRelativePath.endsWith(extension)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: `Authoring source documents for this operation must use the ${extension} extension.`,
        value: projectRelativePath,
      }),
    );
  }
}

function sourceExtensionForKind(kind: AuthoringDocumentKind): string {
  switch (kind) {
    case "input":
      return ".input.json";
    case "material":
      return ".materials.json";
    case "mesh":
      return ".meshes.json";
    case "prefab":
      return ".prefab.json";
    case "systems":
      return ".systems.json";
    case "ui":
      return ".ui.json";
    default:
      return ".json";
  }
}

async function mutateScene(
  options: IAuthoringOperationContext & { sceneId: string },
  apply: (scene: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const diagnostics = [...project.diagnostics];

  if (sceneDocument === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const beforeDiagnostics = await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, sceneDocument.data, { materialIds });
  if (hasAuthoringErrors(beforeDiagnostics)) {
    return authoringOperationResult({
      diagnostics: beforeDiagnostics,
      projectPath: project.projectPath,
    });
  }

  const nextData = cloneJson(sceneDocument.data);
  if (!isRecord(nextData)) {
    return authoringOperationResult({
      diagnostics: [
        authoringDiagnostic({
          code: "TN_AUTHORING_SCENE_SHAPE_INVALID",
          file: sceneDocument.projectRelativePath,
          message: "Scene source document must be a JSON object before mutation.",
        }),
      ],
      projectPath: project.projectPath,
    });
  }

  const applyDiagnostics = apply(nextData, sceneDocument.projectRelativePath) ?? [];
  if (hasAuthoringErrors(applyDiagnostics)) {
    return authoringOperationResult({
      diagnostics: applyDiagnostics,
      projectPath: project.projectPath,
    });
  }

  const afterDiagnostics = await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, nextData, { materialIds });
  if (hasAuthoringErrors(afterDiagnostics)) {
    return authoringOperationResult({
      diagnostics: afterDiagnostics,
      projectPath: project.projectPath,
    });
  }

  sceneDocument.data = nextData;
  await writeAuthoringJsonDocument(sceneDocument);
  return authoringOperationResult({
    changed: true,
    diagnostics: afterDiagnostics,
    filesWritten: [sceneDocument.projectRelativePath],
    projectPath: project.projectPath,
  });
}

interface IAuthoringValidationContext {
  materialIds: readonly string[];
}

async function validateAuthoringDocument(
  projectPath: string,
  file: string,
  kind: AuthoringDocumentKind,
  data: unknown,
  context: IAuthoringValidationContext,
): Promise<IAuthoringDiagnostic[]> {
  switch (kind) {
    case "asset":
      return validateDeclarationDocument(file, data, {
        declarationKeys: assetKeys,
        duplicateKind: "asset",
        expectedSchema: assetDocumentSchema,
        idKind: "asset document",
        listName: "assets",
        rootKeys: assetDocumentKeys,
        validateItem: (diagnostics, path, item) => validateGeneratedPathString(diagnostics, file, `${path}/path`, item.path, "asset path must be a non-empty source path."),
      });
    case "audio":
      return validateDeclarationDocument(file, data, {
        declarationKeys: audioSoundKeys,
        duplicateKind: "audio",
        expectedSchema: audioDocumentSchema,
        idKind: "audio document",
        listName: "sounds",
        rootKeys: audioDocumentKeys,
        validateItem: (diagnostics, path, item) => validateGeneratedPathString(diagnostics, file, `${path}/asset`, item.asset, "audio asset must be a non-empty source path."),
      });
    case "input":
      return validateDeclarationDocument(file, data, {
        declarationKeys: inputActionKeys,
        duplicateKind: "input",
        expectedSchema: inputDocumentSchema,
        idKind: "input document",
        listName: "actions",
        rootKeys: inputDocumentKeys,
      });
    case "material":
      return validateDeclarationDocument(file, data, {
        declarationKeys: materialKeys,
        duplicateKind: "material",
        expectedSchema: materialDocumentSchema,
        idKind: "material document",
        listName: "materials",
        rootKeys: materialDocumentKeys,
        validateItem: (diagnostics, path, item) => {
          validateGeneratedPathString(diagnostics, file, `${path}/asset`, item.asset, "material asset must be a non-empty source path.");
          if (item.color !== undefined && readString(item.color) === undefined) {
            diagnostics.push(typeDiagnostic(file, `${path}/color`, "material color must be a non-empty string.", item.color));
          }
          if (item.roughness !== undefined && (typeof item.roughness !== "number" || !Number.isFinite(item.roughness))) {
            diagnostics.push(typeDiagnostic(file, `${path}/roughness`, "material roughness must be a finite number.", item.roughness));
          }
        },
      });
    case "mesh":
      return validateDeclarationDocument(file, data, {
        declarationKeys: meshKeys,
        duplicateKind: "mesh",
        expectedSchema: meshDocumentSchema,
        idKind: "mesh document",
        listName: "meshes",
        rootKeys: meshDocumentKeys,
        validateItem: (diagnostics, path, item) => {
          if (item.kind !== "primitive") {
            diagnostics.push(typeDiagnostic(file, `${path}/kind`, "mesh kind must be 'primitive' in this authoring slice.", item.kind));
          }
          const primitive = readString(item.primitive);
          if (primitive === undefined || !supportedMeshPrimitives.has(primitive)) {
            diagnostics.push(
              authoringDiagnostic({
                code: "TN_AUTHORING_MESH_PRIMITIVE_UNKNOWN",
                file,
                message: `Unknown mesh primitive '${String(item.primitive)}'.`,
                path: `${path}/primitive`,
                value: item.primitive,
                suggestion: "Use 'box', 'sphere', 'cylinder', 'cone', or 'plane'.",
              }),
            );
          }
        },
      });
    case "prefab":
      return validatePrefabDocument(file, data);
    case "scene":
      return validateSceneDocument(projectPath, file, data, context);
    case "systems":
      return validateSystemsDocument(projectPath, file, data);
    case "ui":
      return validateUiDocument(file, data);
    case "project":
      return [];
    case "unknown":
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_DOCUMENT_KIND_UNKNOWN",
          file,
          message: "Authoring document kind could not be determined from its file extension or schema.",
          suggestion: "Use a supported source extension such as .scene.json, .ui.json, or .materials.json.",
        }),
      ];
  }
}

async function validateSceneDocument(
  projectPath: string,
  file: string,
  data: unknown,
  context: IAuthoringValidationContext = { materialIds: [] },
): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_SHAPE_INVALID",
        file,
        message: "Scene source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }

  diagnostics.push(...unknownKeyDiagnostics(file, "", data, sceneDocumentKeys));

  if (data.schema !== sceneDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_SCHEMA_INVALID",
        file,
        message: `Scene source document must use schema '${sceneDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }

  validateLogicalId(diagnostics, file, "/id", data.id, "scene");

  const prefabs = collectIds(diagnostics, file, "/prefabs", readArray(data.prefabs), "prefab", prefabKeys);
  const resources = collectIds(diagnostics, file, "/resources", readArray(data.resources), "resource", resourceKeys);
  const systems = collectIds(diagnostics, file, "/systems", readArray(data.systems), "system", systemKeys);
  const uiNodes = collectUiNodeIds(diagnostics, file, data.ui);
  const entities = collectEntityIds(diagnostics, file, data.entities);

  validateEntities(diagnostics, file, data.entities, entities, prefabs, context.materialIds);
  validatePrefabs(diagnostics, file, data.prefabs);
  validateResources(diagnostics, file, data.resources);
  await validateSystems(diagnostics, projectPath, file, data.systems, systems);
  validateUi(diagnostics, file, data.ui, uiNodes, resources);

  return sortAuthoringDiagnostics(diagnostics);
}

interface IDeclarationDocumentValidationOptions {
  declarationKeys: ReadonlySet<string>;
  duplicateKind: string;
  expectedSchema: string;
  idKind: string;
  listName: string;
  rootKeys: ReadonlySet<string>;
  validateItem?: (diagnostics: IAuthoringDiagnostic[], path: string, item: Record<string, unknown>) => void | Promise<void>;
}

async function validateDeclarationDocument(
  file: string,
  data: unknown,
  options: IDeclarationDocumentValidationOptions,
): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "Structured authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }

  diagnostics.push(...unknownKeyDiagnostics(file, "", data, options.rootKeys));
  validateDocumentHeader(diagnostics, file, data, options.expectedSchema, options.idKind);

  const list = readArray(data[options.listName]);
  if (data[options.listName] !== undefined && list === undefined) {
    diagnostics.push(typeDiagnostic(file, `/${options.listName}`, `${options.listName} must be an array.`, data[options.listName]));
    return sortAuthoringDiagnostics(diagnostics);
  }
  collectIds(diagnostics, file, `/${options.listName}`, list, options.duplicateKind, options.declarationKeys);
  for (const [index, item] of list?.entries() ?? []) {
    if (isRecord(item)) {
      await options.validateItem?.(diagnostics, `/${options.listName}/${index}`, item);
    }
  }
  return sortAuthoringDiagnostics(diagnostics);
}

async function validateUiDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "UI authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, uiDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, uiDocumentSchema, "ui document");
  const nodes = collectIds(diagnostics, file, "/nodes", readArray(data.nodes), "ui-node", uiNodeKeys);
  const bindings = readArray(data.bindings);
  if (data.bindings !== undefined && bindings === undefined) {
    diagnostics.push(typeDiagnostic(file, "/bindings", "bindings must be an array.", data.bindings));
  }
  bindings?.forEach((binding, index) => {
    const path = `/bindings/${index}`;
    if (!isRecord(binding)) {
      diagnostics.push(typeDiagnostic(file, path, "ui binding must be an object.", binding));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, binding, uiBindingKeys));
    const node = readString(binding.node);
    if (node === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/node`, "ui binding node must be a non-empty ui node id.", binding.node));
    } else if (!nodes.includes(node)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/node`, "ui-node", node, nodes));
    }
    if (binding.resource !== undefined && readString(binding.resource) === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/resource`, "ui binding resource must be a non-empty resource id.", binding.resource));
    }
  });
  return sortAuthoringDiagnostics(diagnostics);
}

async function validatePrefabDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "Prefab authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, prefabDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, prefabDocumentSchema, "prefab document");
  const entities = collectEntityIds(diagnostics, file, data.entities);
  validateEntities(diagnostics, file, data.entities, entities, [], []);
  return sortAuthoringDiagnostics(diagnostics);
}

async function validateSystemsDocument(projectPath: string, file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID",
        file,
        message: "Systems authoring source document must be a JSON object.",
        path: "",
        value: data,
      }),
    ];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, systemsDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, systemsDocumentSchema, "systems document");
  const systems = collectIds(diagnostics, file, "/systems", readArray(data.systems), "system", systemKeys);
  await validateSystems(diagnostics, projectPath, file, data.systems, systems);
  return sortAuthoringDiagnostics(diagnostics);
}

function validateDocumentHeader(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  data: Record<string, unknown>,
  expectedSchema: string,
  idKind: string,
): void {
  if (data.schema !== expectedSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DOCUMENT_SCHEMA_INVALID",
        file,
        message: `Structured authoring document must use schema '${expectedSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, idKind);
}

function validatePrefabs(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const prefabs = readArray(value);
  if (value !== undefined && prefabs === undefined) {
    diagnostics.push(typeDiagnostic(file, "/prefabs", "prefabs must be an array.", value));
    return;
  }
  prefabs?.forEach((prefab, index) => {
    if (!isRecord(prefab)) {
      return;
    }
    const primitive = readString(prefab.primitive);
    if (prefab.primitive !== undefined && (primitive === undefined || !supportedPrefabPrimitives.has(primitive))) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_PREFAB_PRIMITIVE_UNKNOWN",
          file,
          message: `Unknown prefab primitive '${String(prefab.primitive)}'.`,
          path: `/prefabs/${index}/primitive`,
          value: prefab.primitive,
          suggestion: "Use 'box', 'capsule', 'cone', 'cylinder', 'plane', or 'sphere'.",
        }),
      );
    }
    if (prefab.color !== undefined && readString(prefab.color) === undefined) {
      diagnostics.push(typeDiagnostic(file, `/prefabs/${index}/color`, "prefab color must be a non-empty string.", prefab.color));
    }
    if (prefab.asset !== undefined && readString(prefab.asset) === undefined) {
      diagnostics.push(typeDiagnostic(file, `/prefabs/${index}/asset`, "prefab asset must be a non-empty project-relative asset path.", prefab.asset));
    }
  });
}

function collectEntityIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  const entities = readArray(value);
  if (value !== undefined && entities === undefined) {
    diagnostics.push(typeDiagnostic(file, "/entities", "entities must be an array.", value));
    return [];
  }
  return collectIds(diagnostics, file, "/entities", entities, "entity", entityKeys);
}

function collectUiNodeIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, "/ui", "ui must be an object.", value));
    return [];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/ui", value, uiKeys));
  const nodes = readArray(value.nodes);
  if (value.nodes !== undefined && nodes === undefined) {
    diagnostics.push(typeDiagnostic(file, "/ui/nodes", "ui.nodes must be an array.", value.nodes));
    return [];
  }
  return collectIds(diagnostics, file, "/ui/nodes", nodes, "ui-node", uiNodeKeys);
}

function collectIds(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  basePath: string,
  values: unknown[] | undefined,
  kind: string,
  allowedKeys: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  if (values === undefined) {
    return ids;
  }

  const seen = new Map<string, string>();
  values.forEach((value, index) => {
    const path = `${basePath}/${index}`;
    if (!isRecord(value)) {
      diagnostics.push(typeDiagnostic(file, path, `${kind} declaration must be an object.`, value));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, value, allowedKeys));
    const id = kind === "resource"
      ? validateResourceId(diagnostics, file, `${path}/id`, value.id)
      : kind === "entity"
        ? validateEcsId(diagnostics, file, `${path}/id`, value.id, kind)
        : validateLogicalId(diagnostics, file, `${path}/id`, value.id, kind);
    if (id === undefined) {
      return;
    }
    const existingPath = seen.get(id);
    if (existingPath !== undefined) {
      diagnostics.push(
        authoringDiagnostic({
          code: duplicateIdCode(kind),
          file,
          message: `Duplicate ${kind} id '${id}'.`,
          path: `${path}/id`,
          value: id,
          related: [{ file, path: existingPath, message: `First ${kind} declaration with this id.` }],
          suggestion: `Give each ${kind} a stable unique id.`,
        }),
      );
    } else {
      seen.set(id, `${path}/id`);
      ids.push(id);
    }
  });
  return ids;
}

function validateEntities(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: unknown,
  entityIds: readonly string[],
  prefabIds: readonly string[],
  materialIds: readonly string[],
): void {
  const entities = readArray(value);
  if (entities === undefined) {
    return;
  }

  entities.forEach((entity, index) => {
    if (!isRecord(entity)) {
      return;
    }
    const path = `/entities/${index}`;
    const prefab = readString(entity.prefab);
    if (entity.prefab !== undefined && prefab === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/prefab`, "Entity prefab must be a non-empty string.", entity.prefab));
    } else if (prefab !== undefined && !prefabIds.includes(prefab)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/prefab`, "prefab", prefab, prefabIds));
    }

    validateTransform(diagnostics, file, `${path}/transform`, entity.transform);
    validateComponents(diagnostics, file, `${path}/components`, entity.components, entityIds, materialIds);
  });
}

function validateTransform(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "Transform must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, transformKeys));
  for (const key of transformKeys) {
    const vector = value[key];
    if (vector === undefined) {
      continue;
    }
    if (!Array.isArray(vector) || vector.length !== 3 || vector.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_VECTOR3_INVALID",
          file,
          message: `Transform ${key} must be a three-number vector.`,
          path: `${path}/${key}`,
          value: vector,
          suggestion: "Use [x, y, z] numeric values.",
        }),
      );
    }
  }
}

function validateComponents(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  entityIds: readonly string[],
  materialIds: readonly string[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "components must be an object keyed by component kind.", value));
    return;
  }

  for (const [kind, component] of Object.entries(value)) {
    if (!isRecord(component)) {
      diagnostics.push(typeDiagnostic(file, `${path}/${escapeJsonPointer(kind)}`, `component '${kind}' must be an object.`, component));
      continue;
    }
    if (kind === "camera") {
      validateCameraComponent(diagnostics, file, `${path}/camera`, component, entityIds);
    } else if (kind === "MeshRenderer" || kind === "meshRenderer") {
      validateMeshRendererComponent(diagnostics, file, `${path}/${escapeJsonPointer(kind)}`, component, materialIds);
    }
  }
}

function validateMeshRendererComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>, materialIds: readonly string[]): void {
  const material = readString(value.material);
  if (value.material !== undefined && material === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/material`, "mesh renderer material must be a non-empty material id.", value.material));
  } else if (material !== undefined && materialIds.length > 0 && !materialIds.includes(material)) {
    diagnostics.push(missingReferenceDiagnostic(file, `${path}/material`, "material", material, materialIds));
  }
}

function validateCameraComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, entityIds: readonly string[]): void {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "camera component must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, cameraComponentKeys));
  const mode = readString(value.mode);
  if (value.mode !== undefined && (mode === undefined || !supportedCameraModes.has(mode))) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_CAMERA_MODE_UNKNOWN",
        file,
        message: `Unknown camera mode '${String(value.mode)}'.`,
        path: `${path}/mode`,
        value: value.mode,
        suggestion: "Use 'third-person-follow', 'perspective', or 'orthographic'.",
      }),
    );
  }
  const target = readString(value.target);
  if (value.target !== undefined && target === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/target`, "camera target must be a non-empty entity id.", value.target));
  } else if (target !== undefined && !entityIds.includes(target)) {
    diagnostics.push(missingReferenceDiagnostic(file, `${path}/target`, "entity", target, entityIds));
  }
}

function validateResources(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const resources = readArray(value);
  if (value !== undefined && resources === undefined) {
    diagnostics.push(typeDiagnostic(file, "/resources", "resources must be an array.", value));
    return;
  }
  resources?.forEach((resource, index) => {
    if (!isRecord(resource)) {
      return;
    }
    const path = `/resources/${index}/path`;
    const sourcePath = readString(resource.path);
    if (resource.path !== undefined && sourcePath === undefined) {
      diagnostics.push(typeDiagnostic(file, path, "resource path must be a non-empty string.", resource.path));
    } else if (sourcePath !== undefined && isGeneratedArtifactPath(sourcePath)) {
      diagnostics.push(generatedPathDiagnostic(file, path, sourcePath));
    }
    if (resource.value !== undefined && !isPortableJson(resource.value)) {
      diagnostics.push(typeDiagnostic(file, `/resources/${index}/value`, "resource value must be portable JSON.", resource.value));
    }
  });
}

function validateGeneratedPathString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  const sourcePath = readString(value);
  if (value !== undefined && sourcePath === undefined) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  } else if (sourcePath !== undefined && isGeneratedArtifactPath(sourcePath)) {
    diagnostics.push(generatedPathDiagnostic(file, path, sourcePath));
  }
}

function isPortableJson(value: unknown): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return true;
  }
  if (typeof value === "number") {
    return Number.isFinite(value);
  }
  if (Array.isArray(value)) {
    return value.every(isPortableJson);
  }
  if (isRecord(value)) {
    return Object.values(value).every(isPortableJson);
  }
  return false;
}

async function validateSystems(
  diagnostics: IAuthoringDiagnostic[],
  projectPath: string,
  file: string,
  value: unknown,
  _systemIds: readonly string[],
): Promise<void> {
  const systems = readArray(value);
  if (value !== undefined && systems === undefined) {
    diagnostics.push(typeDiagnostic(file, "/systems", "systems must be an array.", value));
    return;
  }

  for (const [index, system] of systems?.entries() ?? []) {
    if (!isRecord(system)) {
      continue;
    }
    const path = `/systems/${index}`;
    if (typeof system.run === "string" || typeof system.script === "string") {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_INLINE_SCRIPT_FORBIDDEN",
          file,
          message: "Inline script strings are not valid structured authoring source.",
          path: typeof system.run === "string" ? `${path}/run` : `${path}/script`,
          suggestion: "Reference a TypeScript module and named export instead.",
        }),
      );
      continue;
    }
    if (system.script !== undefined) {
      await validateScriptReference(diagnostics, projectPath, file, `${path}/script`, system.script);
    }
  }
}

async function validateScriptReference(
  diagnostics: IAuthoringDiagnostic[],
  projectPath: string,
  file: string,
  path: string,
  value: unknown,
): Promise<void> {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "script reference must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, scriptReferenceKeys));
  const modulePath = readString(value.module);
  const exportName = readString(value.export);
  if (modulePath === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/module`, "script module must be a non-empty path.", value.module));
    return;
  }
  if (isGeneratedArtifactPath(modulePath)) {
    diagnostics.push(generatedPathDiagnostic(file, `${path}/module`, modulePath));
    return;
  }
  if (exportName === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/export`, "script export must be a non-empty name.", value.export));
    return;
  }

  const absoluteModulePath = resolve(projectPath, modulePath);
  try {
    await access(absoluteModulePath);
  } catch {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCRIPT_MODULE_MISSING",
        file,
        message: `Script module '${modulePath}' was not found.`,
        path: `${path}/module`,
        value: modulePath,
        suggestion: "Create the module under the project or update the script reference.",
      }),
    );
    return;
  }

  const source = await readFile(absoluteModulePath, "utf8");
  if (!hasNamedExport(source, exportName)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCRIPT_EXPORT_MISSING",
        file,
        message: `Script module '${modulePath}' does not export '${exportName}'.`,
        path: `${path}/export`,
        value: exportName,
        suggestion: "Export the named system function or update the script reference.",
      }),
    );
  }
}

function validateUi(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, uiNodeIds: readonly string[], resourceIds: readonly string[]): void {
  if (value === undefined || !isRecord(value)) {
    return;
  }
  const bindings = readArray(value.bindings);
  if (value.bindings !== undefined && bindings === undefined) {
    diagnostics.push(typeDiagnostic(file, "/ui/bindings", "ui.bindings must be an array.", value.bindings));
    return;
  }

  bindings?.forEach((binding, index) => {
    const path = `/ui/bindings/${index}`;
    if (!isRecord(binding)) {
      diagnostics.push(typeDiagnostic(file, path, "ui binding must be an object.", binding));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, binding, uiBindingKeys));
    const node = readString(binding.node);
    if (node === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/node`, "ui binding node must be a non-empty ui node id.", binding.node));
    } else if (!uiNodeIds.includes(node)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/node`, "ui-node", node, uiNodeIds));
    }
    const resource = readString(binding.resource);
    if (resource === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/resource`, "ui binding resource must be a non-empty resource id.", binding.resource));
    } else if (!resourceIds.some((resourceId) => resource === resourceId || resource.startsWith(`${resourceId}.`))) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/resource`, "resource", resource, resourceIds));
    }
  });
}

function inspectSceneDocument(file: string, data: unknown): ISceneInspection | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  return {
    id: readString(data.id) ?? "",
    file,
    entities: idsFromArray(data.entities),
    prefabs: idsFromArray(data.prefabs),
    resources: idsFromArray(data.resources),
    systems: idsFromArray(data.systems),
    uiNodes: isRecord(data.ui) ? idsFromArray(data.ui.nodes) : [],
  };
}

function idsFromArray(value: unknown): string[] {
  return (readArray(value) ?? [])
    .map((item) => (isRecord(item) ? readString(item.id) : undefined))
    .filter(isString)
    .sort();
}

function collectMaterialIdsForProject(project: IAuthoringProject): string[] {
  const ids: string[] = [];
  for (const document of project.documents) {
    if (document.kind === "material" && isRecord(document.data)) {
      ids.push(...idsFromArray(document.data.materials));
    }
  }
  return [...new Set(ids)].sort();
}

function ensureArrayProperty(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const existing = record[key];
  if (Array.isArray(existing)) {
    return existing as Record<string, unknown>[];
  }
  const created: Record<string, unknown>[] = [];
  record[key] = created;
  return created;
}

function findSceneItem(value: unknown, id: string): Record<string, unknown> | undefined {
  return (readArray(value) ?? []).find((item): item is Record<string, unknown> => isRecord(item) && item.id === id);
}

function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

function validateEcsId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, kind: string): string | undefined {
  const id = readString(value);
  if (id === undefined || !ecsIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: `${kind} id must be a non-empty ECS id using letters, numbers, '.', '_' or '-'.`,
        path,
        value,
        suggestion: "Use a stable id such as 'kart.player.oobi' or 'track.arrow.-1.1'.",
      }),
    );
    return undefined;
  }
  return id;
}

function validateResourceId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): string | undefined {
  const id = readString(value);
  if (id === undefined || !resourceIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: "resource id must be a non-empty ECS resource id using letters, numbers, '.', '_' or '-'.",
        path,
        value,
        suggestion: "Use a stable id such as 'RaceState', 'MinimapState', or 'hud.score'.",
      }),
    );
    return undefined;
  }
  return id;
}

function validateLogicalId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, kind: string): string | undefined {
  const id = readString(value);
  if (id === undefined || !logicalIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: `${kind} id must be a non-empty logical id using lowercase letters, numbers, '.', '_' or '-'.`,
        path,
        value,
        suggestion: "Use a stable id such as 'player-kart' or 'scene.arena'.",
      }),
    );
    return undefined;
  }
  return id;
}

function unknownKeyDiagnostics(file: string, path: string, value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): IAuthoringDiagnostic[] {
  return Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .sort()
    .map((key) =>
      authoringDiagnostic({
        code: "TN_AUTHORING_UNKNOWN_FIELD",
        file,
        message: `Unknown field '${key}' is not supported in this authoring document shape.`,
        path: `${path}/${escapeJsonPointer(key)}`,
        value: key,
        suggestion: "Remove the field or use a supported structured authoring property.",
      }),
    );
}

function typeDiagnostic(file: string, path: string, message: string, value: unknown): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_SHAPE_INVALID",
    file,
    message,
    path,
    value,
  });
}

function missingReferenceDiagnostic(file: string, path: string, kind: string, value: string, candidates: readonly string[]): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_REF_MISSING",
    file,
    message: `No ${kind} with id '${value}' exists.`,
    path,
    value,
    suggestion: closestIdSuggestion(value, candidates),
  });
}

function generatedPathDiagnostic(file: string, path: string, value: string): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
    file,
    message: "Generated bundle artifacts cannot be used as authoring source paths.",
    path,
    value,
    suggestion: "Reference durable source files instead of dist/game.bundle or scripts.bundle.js.",
  });
}

function closestIdSuggestion(value: string, candidates: readonly string[]): string | undefined {
  const closest = candidates
    .map((candidate) => ({ candidate, distance: levenshtein(value, candidate) }))
    .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))[0];
  if (closest === undefined || closest.distance > 3) {
    return undefined;
  }
  return `Did you mean '${closest.candidate}'?`;
}

function duplicateIdCode(kind: string): string {
  return `TN_AUTHORING_DUPLICATE_${kind.toUpperCase().replaceAll("-", "_")}_ID`;
}

function readSceneId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.id) : undefined;
}

function readDocumentId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.id) : undefined;
}

function hasNamedExport(source: string, exportName: string): boolean {
  const escaped = escapeRegExp(exportName);
  return new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${escaped}\\b`).test(source) || new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(source);
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        (current[rightIndex] ?? 0) + 1,
        (previous[rightIndex + 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
