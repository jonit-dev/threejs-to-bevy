import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { isGeneratedArtifactPath, normalizeRelativePath, writeAuthoringJsonDocument, type AuthoringDocumentKind, type IAuthoringDocument } from "../documents.js";
import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "../diagnostics.js";
import { validateMaterialDocument } from "./materialValidation.js";
import { buildUiSourceRecipe, mergeById } from "./uiRecipes.js";
import { generatedPathDiagnostic, schemaDocumentShapeFix, typeDiagnostic, validateGeneratedPathString } from "./validationHelpers.js";
import { loadAuthoringProject, type IAuthoringProject } from "../project.js";
import {
  cameraComponentKeys,
  characterControllerComponentKeys,
  colliderComponentKeys,
  ecsIdPattern,
  entityKeys,
  assetDocumentKeys,
  assetDocumentSchema,
  assetKeys,
  audioDocumentKeys,
  audioDocumentSchema,
  audioSoundKeys,
  environmentDocumentKeys,
  environmentDocumentSchema,
  flowActionKeys,
  flowDocumentKeys,
  flowDocumentSchema,
  flowStateKeys,
  flowTransitionKeys,
  flowTriggerKeys,
  generatorDocumentKeys,
  generatorDocumentSchema,
  inputAxisKeys,
  inputActionKeys,
  inputControlsSettingsKeys,
  inputControlsSettingsRowKeys,
  inputDocumentKeys,
  inputDocumentSchema,
  inputPersistedBindingOverrideKeys,
  instanceKeys,
  kinematicMoverComponentKeys,
  lightComponentKeys,
  logicalIdPattern,
  materialDocumentSchema,
  meshDocumentKeys,
  meshDocumentSchema,
  meshRendererComponentKeys,
  meshKeys,
  prefabDocumentKeys,
  prefabDocumentSchema,
  prefabKeys,
  projectDocumentKeys,
  projectDocumentSchema,
  resourceIdPattern,
  resourcesDocumentKeys,
  resourcesDocumentSchema,
  renderLayersComponentKeys,
  rigidBodyComponentKeys,
  spawnerAreaKeys,
  spawnerComponentKeys,
  spawnerDespawnPolicyKeys,
  readArray,
  readString,
  resourceKeys,
  runtimeDocumentKeys,
  runtimeDocumentSchema,
  schemaDocumentKeys,
  schemaDocumentSchema,
  schemaEntryKeys,
  sceneDocumentKeys,
  sceneDocumentSchema,
  sequenceDocumentKeys,
  sequenceDocumentSchema,
  sequenceKeyframeKeys,
  sequenceTrackKeys,
  scriptReferenceKeys,
  scriptLifecycleKeys,
  systemsDocumentKeys,
  systemsDocumentSchema,
  targetProfileDocumentKeys,
  targetProfileDocumentSchema,
  supportedPrefabPrimitives,
  supportedMeshPrimitives,
  supportedCameraModes,
  supportedCharacterControllerGrounding,
  supportedColliderKinds,
  supportedComponentKinds,
  supportedGeneratorOverwritePolicies,
  supportedFlowActionKinds,
  supportedFlowTriggerKinds,
  supportedInputAxisSlots,
  supportedInputCaptureStates,
  supportedInputOverrideDevices,
  supportedInputRebindKinds,
  supportedKinematicMoverAxes,
  supportedKinematicMoverModes,
  supportedSpawnerAreaShapes,
  supportedSpawnerModes,
  supportedLightKinds,
  supportedRendererAntialiasModes,
  supportedRenderLookProfiles,
  supportedRenderLookReservedProfiles,
  supportedRenderLookShadowQualities,
  uiDocumentKeys,
  supportedRigidBodyKinds,
  supportedSceneActivationPolicies,
  supportedSceneLifecycleKinds,
  supportedSchemaDocumentKinds,
  supportedSchemaFieldKinds,
  supportedSequenceEasings,
  supportedSequenceTrackKinds,
  supportedUiNodeTypes,
  supportedUiTextAlignments,
  supportedUiTextDecorations,
  uiDocumentSchema,
  visibilityComponentKeys,
  systemCommandKeys,
  systemKeys,
  systemQueryKeys,
  transformKeys,
  uiBindingKeys,
  uiComponentInstanceKeys,
  uiKeys,
  uiNodeKeys,
  uiStyleKeys,
  type IScriptReference,
  type ISceneDocument,
  isRecord,
} from "../schemas.js";

import type {
  IAuthoringOperationResult,
  IAuthoringOperationContext,
  IValidateSceneOptions,
  IValidateAuthoringProjectOptions,
  ICreateSceneOptions,
  IImportWorldOptions,
  IAddEntityOptions,
  IAddPrefabInstanceOptions,
  IAddTenPinLayoutOptions,
  IAddTagOptions,
  IAddGroupOptions,
  IAddPrefabOptions,
  ISetPrefabColorOptions,
  ISetPrefabOptions,
  IAddResourceOptions,
  ISetResourceOptions,
  ICreateResourcesDocumentOptions,
  IAddResourceDocumentEntryOptions,
  ISetResourceDocumentEntryOptions,
  ICreateFlowDocumentOptions,
  IAddFlowStateOptions,
  IAddFlowTransitionOptions,
  ICreateSequenceDocumentOptions,
  IAddSequenceTrackOptions,
  IAddSequenceKeyOptions,
  ICreateSchemaDocumentOptions,
  ISetSchemaEntryOptions,
  ISetComponentOptions,
  ISetSceneLifecycleOptions,
  ISetCameraComponentOptions,
  ISetLightComponentOptions,
  ISetMeshRendererComponentOptions,
  ISetRenderLayersComponentOptions,
  ISetRigidBodyComponentOptions,
  ISetSpawnerComponentOptions,
  ISetColliderComponentOptions,
  ISetCharacterControllerComponentOptions,
  ISetVisibilityComponentOptions,
  IRemoveComponentOptions,
  IAddUiNodeOptions,
  ISetTransformOptions,
  ISetCameraOptions,
  IAttachScriptOptions,
  IBindUiOptions,
  ICreateUiDocumentOptions,
  IAddUiTextOptions,
  IAddUiNodeDocumentOptions,
  IAddUiComponentInstanceOptions,
  UiSourceRecipeKind,
  IApplyUiRecipeOptions,
  IRemoveUiComponentInstanceOptions,
  ISetUiLayoutOptions,
  ISetUiStyleOptions,
  IBindUiDocumentOptions,
  ICreateEnvironmentDocumentOptions,
  ISetEnvironmentSkyboxOptions,
  ISetEnvironmentMapOptions,
  ISetEnvironmentTerrainOptions,
  ISetEnvironmentPathOptions,
  ISetEnvironmentWalkabilityOptions,
  ISetEnvironmentLightProbeOptions,
  ISetEnvironmentSourceAssetLodOptions,
  ICreateRuntimeConfigOptions,
  ISetRuntimeWindowOptions,
  ISetRuntimeRenderingOptions,
  ISetTargetProfileOptions,
  IRecordGeneratorProvenanceOptions,
  ICreateMaterialOptions,
  ISetMaterialOptions,
  ICreateMeshPrimitiveOptions,
  ICreateMeshCustomOptions,
  ICreatePrefabDocumentOptions,
  ICreateProjectMetadataOptions,
  IAddPrefabComponentOptions,
  ISetPrefabMaterialOptions,
  IAddInputActionOptions,
  IAddInputAxisOptions,
  ISetInputControlsOptions,
  ISetInputBindingOverrideOptions,
  IAddAssetOptions,
  IAddAnimationClipOptions,
  IAddAnimationGraphStateOptions,
  IAddParticleEmitterOptions,
  ICreateAudioDocumentOptions,
  IAddAudioSoundOptions,
  ICreateSystemOptions,
  IAttachSystemScriptOptions,
  ISetSystemMetadataOptions,
  ISceneInspection,
  ISceneNodeInspection,
  ICreateSceneResult,
  IImportWorldResult,
  IInspectSceneResult,
} from "./types.js";
import type {
  IAuthoringValidationContext,
  IDeclarationDocumentValidationOptions,
} from "./sharedTypes.js";
import {
  validateRuntimeDocument,
  validateRuntimeRenderLook,
  validateRuntimeRenderLookNumber,
  validateTargetProfileDocument,
  validateSceneDocument,
  validateDeclarationDocument,
  validateRootDocument,
  validateFlowDocument,
  validateSequenceDocument,
  validateFlowStateRef,
  validateFlowTrigger,
  validateFlowActions,
  validateUiDocument,
  validatePrefabDocument,
  validateSystemsDocument,
  validateUiNodes,
  validateUiResponsiveRules,
  validateUiVirtualRange,
  validateUiComponentInstance,
  validateUiStyle,
  validateDocumentHeader,
} from "./sharedB.js";
import {
  validatePrefabs,
  collectEntityIds,
  collectInstanceIds,
  collectUiNodeIds,
  collectIds,
  validateEntities,
  validateInstances,
  validateTransform,
  validateComponents,
  validateMeshRendererComponent,
  validateLightComponent,
  validateRenderLayersComponent,
  validateRigidBodyComponent,
  validateCcdComponent,
  validateColliderComponent,
  validateCharacterControllerComponent,
  validateColliderSlope,
  validateCharacterPushPolicy,
  validateKinematicMoverComponent,
  validateSpawnerComponent,
  validateSpawnerArea,
  validateSpawnerDespawnPolicy,
  validateVisibilityComponent,
  validateEnumString,
  validateRequiredNumber,
  validateCustomMeshSource,
  validateOptionalNumber,
  validateRequiredPositiveNumber,
  validateOptionalPositiveInteger,
  validateOptionalNonNegativeNumber,
  validateOptionalNonNegativeInteger,
  validateOptionalVec2,
  isVector2,
  validateOptionalStringEnum,
  validateRequiredString,
  validateOptionalString,
  validateOptionalStringArray,
  validateOptionalBoolean,
  isVector3,
  isBooleanVector3,
  isNumberTuple,
  validateCameraComponent,
} from "./sharedC.js";
import {
  validateResources,
  validateAssetDeclaration,
  validateRenderTargetAssetDeclaration,
  validatePositiveNumber,
  isPortableJson,
  validateSystems,
  validateScriptLifecycles,
  validateSystemQueries,
  validateSystemCommands,
  validateSystemCommandShape,
  validateScriptReference,
  validateUi,
  validateUiBindingFormat,
  inspectSceneDocument,
  inspectSceneNode,
  pushArrayIdMatches,
  compactInstanceRecord,
  tenPinLayout,
  roundNumber,
  countSourceLines,
  repeatedComponentBlocks,
  idsFromArray,
  sortedStringList,
  collectMaterialIdsForProject,
  collectPrefabDocumentIdsForProject,
  ensureArrayProperty,
  findSceneItem,
  setOptionalString,
  setOptionalNumber,
  inputControlsRowSortKey,
  inputOverrideSortKey,
  schemaFieldKeys,
  validateSchemaDocumentKind,
  validateSchemaFields,
  formatKeyboardBinding,
  validateInputMetadata,
  validateInputBindingStrings,
  validateStructuredInputBindingList,
  validateStructuredInputBindingString,
} from "./sharedD.js";
import {
  canonicalKeyboardCodes,
  keyboardCodeAliases,
  isCanonicalKeyboardCode,
  normalizeKeyboardCodeAlias,
  validateInputControlsSettings,
  validateInputBindingOverrides,
  validateStringList,
  validateSupportedStringList,
  validateOptionalPositiveNumber,
  cloneJson,
  validateEcsId,
  validateResourceId,
  validateLogicalId,
  unknownKeyDiagnostics,
  missingReferenceDiagnostic,
  closestIdSuggestion,
  duplicateIdCode,
  readSceneId,
  readDocumentId,
  hasNamedExport,
  escapeJsonPointer,
  escapeRegExp,
  levenshtein,
  isString,
} from "./sharedE.js";

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

export function emptyScene(sceneId: string): ISceneDocument {
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

export function sceneFromWorld(sceneId: string, world: unknown): ISceneDocument {
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

export function nextSceneCommands(sceneId: string): string[] {
  return [
    `tn scene add-entity ${sceneId} <entity-id> --json`,
    `tn scene set-transform ${sceneId} <entity-id> --position x,y,z --json`,
    `tn scene attach-script ${sceneId} <system-id> --module src/scripts/<system>.ts --export <exportName> --json`,
    `tn scene validate ${sceneId} --json`,
    "tn build --json",
    "tn verify --json",
  ];
}

export function mutateAsset(
  projectPath: string,
  assetId: string,
  apply: (asset: Record<string, unknown>) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument({ projectPath }, "asset", assetId, (data, file) => {
    const assets = ensureArrayProperty(data, "assets");
    const asset = findSceneItem(assets, assetId);
    if (asset === undefined) {
      return [missingReferenceDiagnostic(file, "/assets", "asset", assetId, idsFromArray(assets))];
    }
    if (asset.type !== "model") {
      return [typeDiagnostic(file, `/assets/${assets.indexOf(asset)}/type`, "animation and particle metadata require a model asset.", asset.type)];
    }
    return apply(asset);
  });
}

export const systemStringListMetadataKeys = [
  "after",
  "before",
  "eventReads",
  "eventWrites",
  "reads",
  "resourceReads",
  "resourceWrites",
  "services",
  "writes",
] as const;

export function defaultRuntimeConfigData(runtimeId: string, renderProfile = "cinematic"): Record<string, unknown> {
  return {
    schema: runtimeDocumentSchema,
    version: "0.1.0",
    id: runtimeId,
    renderer: { antialias: "msaa4", renderLook: { version: 1, profile: renderProfile } },
    time: { fixedDelta: 1 / 60, paused: false },
    window: { height: 720, width: 1280 },
  };
}

export function defaultProjectMetadataData(projectId: string): Record<string, unknown> {
  return {
    schema: projectDocumentSchema,
    version: "0.1.0",
    id: projectId,
    authoringVersion: "0.1.0",
    buildTargets: ["web", "desktop"],
    sourceRoots: ["content", "src"],
  };
}

export async function createSourceDocument(options: {
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

  diagnostics.push(...(await validateAuthoringDocument(project.projectPath, projectRelativePath, options.kind, options.data, validationContextForProject(project))));
  if (hasAuthoringErrors(diagnostics)) {
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const document: IAuthoringDocument = { data: options.data, file: absoluteFile, kind: options.kind, projectRelativePath };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath: project.projectPath });
}

export async function upsertSourceDocument(options: {
  projectPath: string;
  kind: AuthoringDocumentKind;
  id: string;
  file: string;
  emptyData: Record<string, unknown>;
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[];
}): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const absoluteFile = resolve(project.projectPath, options.file);
  const projectRelativePath = normalizeRelativePath(relative(project.projectPath, absoluteFile));
  const existing = project.documents.find((document) =>
    document.kind === options.kind
    && (readDocumentId(document.data) === options.id || document.projectRelativePath === projectRelativePath)
  );
  if (existing !== undefined) {
    return mutateLoadedSourceDocument(project, existing, options.apply);
  }

  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.id, `${options.kind} document`);
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
    diagnostics.push(...(await validateAuthoringDocument(project.projectPath, projectRelativePath, options.kind, nextData, validationContextForProject(project))));
  }

  if (hasAuthoringErrors(diagnostics)) {
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const document: IAuthoringDocument = { data: nextData, file: absoluteFile, kind: options.kind, projectRelativePath };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath: project.projectPath });
}

export async function mutateSourceDocument(
  options: IAuthoringOperationContext,
  kind: AuthoringDocumentKind,
  id: string,
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
  file?: string,
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((candidate) => candidate.kind === kind && (file === undefined ? readDocumentId(candidate.data) === id : candidate.projectRelativePath === file));
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

  return mutateLoadedSourceDocument(project, document, apply);
}

export async function mutateLoadedSourceDocument(
  project: Awaited<ReturnType<typeof loadAuthoringProject>>,
  document: IAuthoringDocument,
  apply: (data: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  const diagnostics = [...project.diagnostics];
  const context = validationContextForProject(project);
  const beforeDiagnostics = await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, document.data, context);
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

  const afterDiagnostics = await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, nextData, context);
  if (hasAuthoringErrors(afterDiagnostics)) {
    return authoringOperationResult({ diagnostics: afterDiagnostics, projectPath: project.projectPath });
  }

  document.data = nextData;
  await writeAuthoringJsonDocument(document);
  return authoringOperationResult({ changed: true, diagnostics: afterDiagnostics, filesWritten: [document.projectRelativePath], projectPath: project.projectPath });
}

export function validateNewSourcePath(diagnostics: IAuthoringDiagnostic[], projectRelativePath: string, requestedFile: string, extension: string): void {
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

export function sourceExtensionForKind(kind: AuthoringDocumentKind): string {
  switch (kind) {
    case "asset":
      return ".assets.json";
    case "audio":
      return ".audio.json";
    case "environment":
      return ".environment.json";
    case "flow":
      return ".flow.json";
    case "generator":
      return ".generator.json";
    case "input":
      return ".input.json";
    case "material":
      return ".materials.json";
    case "mesh":
      return ".meshes.json";
    case "prefab":
      return ".prefab.json";
    case "project":
      return ".authoring.json";
    case "runtime":
      return ".runtime.json";
    case "resources":
      return ".resources.json";
    case "schema":
      return ".schema.json";
    case "sequence":
      return ".sequence.json";
    case "systems":
      return ".systems.json";
    case "target":
      return ".target.json";
    case "ui":
      return ".ui.json";
    default:
      return ".json";
  }
}

export async function mutateScene(
  options: IAuthoringOperationContext & { sceneId: string },
  apply: (scene: Record<string, unknown>, file: string) => void | IAuthoringDiagnostic[],
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const prefabDocumentIds = collectPrefabDocumentIdsForProject(project);
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

  const beforeDiagnostics = await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, sceneDocument.data, { materialIds, prefabDocumentIds });
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

  const afterDiagnostics = await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, nextData, { materialIds, prefabDocumentIds });
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

export function validationContextForProject(project: IAuthoringProject): IAuthoringValidationContext {
  return {
    materialIds: collectMaterialIdsForProject(project),
    prefabDocumentIds: collectPrefabDocumentIdsForProject(project),
  };
}

export async function validateAuthoringDocument(
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
        validateItem: (diagnostics, path, item) => validateAssetDeclaration(diagnostics, path, item, file),
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
      return [
        ...(await validateDeclarationDocument(file, data, {
          declarationKeys: inputActionKeys,
          duplicateKind: "input",
          expectedSchema: inputDocumentSchema,
          idKind: "input document",
          listName: "actions",
          rootKeys: inputDocumentKeys,
          validateItem: (diagnostics, path, item) => {
            validateStringList(diagnostics, file, `${path}/bindings`, item.bindings, "input action bindings must be non-empty strings.");
          },
        })),
        ...(await validateDeclarationDocument(file, data, {
          declarationKeys: inputAxisKeys,
          duplicateKind: "input axis",
          expectedSchema: inputDocumentSchema,
          idKind: "input document",
          listName: "axes",
          rootKeys: inputDocumentKeys,
          validateItem: (diagnostics, path, item) => {
            validateStringList(diagnostics, file, `${path}/negative`, item.negative, "input axis negative bindings must be non-empty strings.");
            validateStringList(diagnostics, file, `${path}/positive`, item.positive, "input axis positive bindings must be non-empty strings.");
            if (item.value !== undefined && readString(item.value) === undefined) {
              diagnostics.push(typeDiagnostic(file, `${path}/value`, "input axis value binding must be a non-empty string.", item.value));
            }
          },
        })),
        ...validateInputMetadata(file, data),
      ];
    case "environment":
      return validateRootDocument(file, data, environmentDocumentSchema, "environment document", environmentDocumentKeys);
    case "flow":
      return validateFlowDocument(file, data);
    case "generator":
      return validateGeneratorDocument(file, data);
    case "material":
      return validateMaterialDocument(file, data, validateDeclarationDocument);
    case "mesh":
      return validateDeclarationDocument(file, data, {
        declarationKeys: meshKeys,
        duplicateKind: "mesh",
        expectedSchema: meshDocumentSchema,
        idKind: "mesh document",
        listName: "meshes",
        rootKeys: meshDocumentKeys,
        validateItem: (diagnostics, path, item) => {
          if (item.kind !== "primitive" && item.kind !== "custom") {
            diagnostics.push(typeDiagnostic(file, `${path}/kind`, "mesh kind must be 'primitive' or 'custom'.", item.kind));
            return;
          }
          if (item.kind === "custom") {
            validateCustomMeshSource(diagnostics, file, path, item);
            return;
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
          if (item.size !== undefined) {
            if (!Array.isArray(item.size) || item.size.length === 0 || item.size.some((value) => typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
              diagnostics.push(typeDiagnostic(file, `${path}/size`, "mesh primitive size must be a non-empty array of positive finite numbers.", item.size));
            }
          }
        },
      });
    case "overlay":
      // Overlay documents use the versioned IR shape and are validated by the
      // compiler's overlay emitter, which owns that contract.
      return [];
    case "prefab":
      return validatePrefabDocument(file, data);
    case "project":
      return validateProjectDocument(file, data);
    case "runtime":
      return validateRuntimeDocument(file, data);
    case "resources":
      return validateDeclarationDocument(file, data, {
        declarationKeys: resourceKeys,
        duplicateKind: "resource",
        expectedSchema: resourcesDocumentSchema,
        idKind: "resources document",
        listName: "resources",
        rootKeys: resourcesDocumentKeys,
        validateItem: (diagnostics, path, item) => {
          validateOptionalString(diagnostics, file, `${path}/path`, item.path, "resource path must be a non-empty string.");
        },
      });
    case "schema": {
      const legacySchemaShape = isRecord(data) && data.schema !== schemaDocumentSchema && schemaDocumentShapeFix(file, data) !== undefined;
      return validateDeclarationDocument(file, data, {
        declarationKeys: schemaEntryKeys,
        duplicateKind: isRecord(data) && data.kind === "event" ? "event schema" : "schema",
        expectedSchema: schemaDocumentSchema,
        idKind: "schema document",
        listName: "schemas",
        rootKeys: schemaDocumentKeys,
        validateRoot: (diagnostics) => {
          if (!legacySchemaShape) {
            diagnostics.push(...validateSchemaDocumentKind(file, isRecord(data) ? data.kind : undefined));
          }
        },
        validateItem: (diagnostics, path, item) => {
          validateSchemaFields(diagnostics, file, `${path}/fields`, item.fields);
        },
      });
    }
    case "scene":
      return validateSceneDocument(projectPath, file, data, context);
    case "sequence":
      return validateSequenceDocument(file, data);
    case "systems":
      return validateSystemsDocument(projectPath, file, data);
    case "target":
      return validateTargetProfileDocument(file, data);
    case "ui":
      return validateUiDocument(file, data);
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

export async function validateGeneratorDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [typeDiagnostic(file, "", "Generator provenance source document must be a JSON object.", data)];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, generatorDocumentKeys));
  if (data.schema !== generatorDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_GENERATOR_SCHEMA_INVALID",
        file,
        message: `Generator provenance source document must use schema '${generatorDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, "generator provenance document");
  validateGeneratedPathString(diagnostics, file, "/module", data.module, "generator module must be a non-empty source path.");
  validateOptionalString(diagnostics, file, "/export", data.export, "generator export must be a non-empty string.");
  validateStringList(diagnostics, file, "/outputs", data.outputs, "generator outputs must be an array of non-empty project-relative paths.");
  if (data.overwritePolicy !== undefined) {
    validateEnumString(diagnostics, file, "/overwritePolicy", data.overwritePolicy, supportedGeneratorOverwritePolicies, "generator overwrite policy", "Use 'skip', 'replace', or 'manual'.");
  }
  validateOptionalString(diagnostics, file, "/inputHash", data.inputHash, "generator inputHash must be a non-empty string.");
  validateOptionalString(diagnostics, file, "/outputHash", data.outputHash, "generator outputHash must be a non-empty string.");
  if (data.lastRun !== undefined && !isRecord(data.lastRun)) {
    diagnostics.push(typeDiagnostic(file, "/lastRun", "generator lastRun must be an object when present.", data.lastRun));
  }
  return sortAuthoringDiagnostics(diagnostics);
}

export async function validateProjectDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics = validateRootDocument(file, data, projectDocumentSchema, "project authoring document", projectDocumentKeys);
  if (!isRecord(data)) {
    return diagnostics;
  }
  validateOptionalString(diagnostics, file, "/authoringVersion", data.authoringVersion, "authoringVersion must be a non-empty string.");
  validateStringList(diagnostics, file, "/sourceRoots", data.sourceRoots, "sourceRoots must be an array of non-empty project-relative paths.");
  validateStringList(diagnostics, file, "/buildTargets", data.buildTargets, "buildTargets must be an array of non-empty target ids.");
  return sortAuthoringDiagnostics(diagnostics);
}
