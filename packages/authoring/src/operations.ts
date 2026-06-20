import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { isGeneratedArtifactPath, writeAuthoringJsonDocument } from "./documents.js";
import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "./diagnostics.js";
import { loadAuthoringProject, type IAuthoringProject } from "./project.js";
import {
  cameraComponentKeys,
  entityKeys,
  logicalIdPattern,
  prefabKeys,
  readArray,
  readString,
  resourceKeys,
  sceneDocumentKeys,
  sceneDocumentSchema,
  scriptReferenceKeys,
  supportedCameraModes,
  supportedComponentKinds,
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

export interface ISceneInspection {
  id: string;
  file: string;
  entities: string[];
  prefabs: string[];
  resources: string[];
  systems: string[];
  uiNodes: string[];
}

export interface IInspectSceneResult extends IAuthoringOperationResult {
  scene?: ISceneInspection;
}

export async function validateScene(options: IValidateSceneOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const selectedScenes = options.sceneId === undefined ? sceneDocuments : sceneDocuments.filter((document) => readSceneId(document.data) === options.sceneId);

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
    diagnostics.push(...(await validateSceneDocument(project.projectPath, document.projectRelativePath, document.data)));
  }

  return authoringOperationResult({
    diagnostics,
    projectPath: project.projectPath,
  });
}

export async function inspectScene(options: IValidateSceneOptions & { sceneId: string }): Promise<IInspectSceneResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);

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

  diagnostics.push(...(await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, sceneDocument.data)));

  return {
    ...authoringOperationResult({ diagnostics, projectPath: project.projectPath }),
    scene: inspectSceneDocument(sceneDocument.projectRelativePath, sceneDocument.data),
  };
}

async function validateSceneDocument(projectPath: string, file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
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

  validateEntities(diagnostics, file, data.entities, entities, prefabs);
  validateResources(diagnostics, file, data.resources);
  await validateSystems(diagnostics, projectPath, file, data.systems, systems);
  validateUi(diagnostics, file, data.ui, uiNodes, resources);

  return sortAuthoringDiagnostics(diagnostics);
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
    const id = validateLogicalId(diagnostics, file, `${path}/id`, value.id, kind);
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

function validateEntities(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, entityIds: readonly string[], prefabIds: readonly string[]): void {
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
    validateComponents(diagnostics, file, `${path}/components`, entity.components, entityIds);
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

function validateComponents(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, entityIds: readonly string[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "components must be an object keyed by component kind.", value));
    return;
  }

  for (const [kind, component] of Object.entries(value)) {
    if (!supportedComponentKinds.has(kind)) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_COMPONENT_KIND_UNKNOWN",
          file,
          message: `Unknown component kind '${kind}'.`,
          path: `${path}/${escapeJsonPointer(kind)}`,
          value: kind,
          suggestion: "Use a supported structured authoring component kind.",
        }),
      );
      continue;
    }

    if (kind === "camera") {
      validateCameraComponent(diagnostics, file, `${path}/camera`, component, entityIds);
    }
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
  });
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
