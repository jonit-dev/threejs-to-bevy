import { access, mkdir, readFile, realpath } from "node:fs/promises";
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
  img2ThreejsAcceptedPassKeys,
  img2ThreejsBudgetKeys,
  img2ThreejsHashedResourceKeys,
  img2ThreejsProviderManifest,
  img2ThreejsProvenanceUpstreamKeys,
  img2ThreejsRecipeLimits,
  img2ThreejsSourceHashKeys,
  blenderRecipeAnimationKeyframeKeys,
  blenderRecipeAnimationKeys,
  blenderRecipeAnimationTrackKeys,
  blenderRecipeBudgetKeys,
  blenderRecipeKeys,
  blenderRecipeLimits,
  blenderRecipeMaterialKeys,
  blenderRecipeModifierKeys,
  blenderRecipeOperationKeys,
  blenderRecipePartKeys,
  blenderRecipeSchema,
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
  supportedGeneratorProviders,
  supportedBlenderAnimationInterpolations,
  supportedBlenderAnimationProperties,
  supportedBlenderBooleanOperations,
  supportedBlenderRecipeModifiers,
  supportedBlenderRecipeOperations,
  supportedBlenderRecipePrimitives,
  supportedBlenderRecipeShading,
  supportedBlenderSourceRecipeOperations,
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
    case "distribution":
      // Distribution source is normalized and validated by its owning IR
      // contract in the distribution authoring operations.
      return [];
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
    case "interaction":
      // The shared IR validator owns the closed interaction vocabulary and
      // schema-reference checks after compiler normalization.
      return [];
    case "environment":
      return validateRootDocument(file, data, environmentDocumentSchema, "environment document", environmentDocumentKeys);
    case "flow":
      return validateFlowDocument(file, data);
    case "generator":
      return validateGeneratorDocument(file, data, projectPath);
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
    case "persistence":
      // The local-data IR validator owns the persistence schema after compiler
      // normalization, matching distribution source validation ownership.
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

export async function validateGeneratorDocument(file: string, data: unknown, projectPath?: string): Promise<IAuthoringDiagnostic[]> {
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
  const provider = data.provider === undefined ? "typescript" : data.provider;
  validateEnumString(diagnostics, file, "/provider", provider, supportedGeneratorProviders, "generator provider", "Use 'typescript', 'blender', or 'img2threejs'.");
  if (provider === "typescript") {
    validateGeneratedPathString(diagnostics, file, "/module", data.module, "generator module must be a non-empty source path.");
    validateRequiredString(diagnostics, file, "/export", data.export, "generator export must be a non-empty string.");
    for (const field of ["recipe", "providerVersion"] as const) {
      if (data[field] !== undefined) {
        diagnostics.push(generatorProviderFieldDiagnostic(file, `/${field}`, field, "typescript", ["module", "export"]));
      }
    }
  } else if (provider === "blender") {
    validateRequiredString(diagnostics, file, "/providerVersion", data.providerVersion, "Blender providerVersion must be a non-empty string.");
    validateBlenderRecipePath(diagnostics, file, "/recipe", data.recipe);
    for (const field of ["module", "export"] as const) {
      if (data[field] !== undefined) {
        diagnostics.push(generatorProviderFieldDiagnostic(file, `/${field}`, field, "blender", ["providerVersion", "recipe"]));
      }
    }
  } else if (provider === "img2threejs") {
    validateImg2ThreejsGeneratorProvenance(diagnostics, file, data);
  }
  validateStringList(diagnostics, file, "/outputs", data.outputs, "generator outputs must be an array of non-empty project-relative paths.");
  if ((provider === "blender" || provider === "img2threejs") && Array.isArray(data.outputs)) {
    data.outputs.forEach((output, index) => validateBlenderOutputPath(diagnostics, file, `/outputs/${index}`, output));
  }
  if (data.overwritePolicy !== undefined) {
    validateEnumString(diagnostics, file, "/overwritePolicy", data.overwritePolicy, supportedGeneratorOverwritePolicies, "generator overwrite policy", "Use 'skip', 'replace', or 'manual'.");
  }
  validateOptionalString(diagnostics, file, "/inputHash", data.inputHash, "generator inputHash must be a non-empty string.");
  validateOptionalString(diagnostics, file, "/outputHash", data.outputHash, "generator outputHash must be a non-empty string.");
  if (data.lastRun !== undefined && !isRecord(data.lastRun)) {
    diagnostics.push(typeDiagnostic(file, "/lastRun", "generator lastRun must be an object when present.", data.lastRun));
  }
  if (provider === "blender" && projectPath !== undefined && typeof data.recipe === "string" && diagnostics.every((diagnostic) => diagnostic.path !== "/recipe")) {
    try {
      const [projectRealPath, recipeRealPath] = await Promise.all([realpath(projectPath), realpath(resolve(projectPath, data.recipe))]);
      const realRelativePath = normalizeRelativePath(relative(projectRealPath, recipeRealPath));
      if (realRelativePath.startsWith("../") || realRelativePath === "..") {
        diagnostics.push(blenderRecipeDiagnostic(data.recipe, "/recipe", "TN_AUTHORING_BLENDER_RECIPE_PATH_INVALID", "Blender recipe path must not escape the project through a symbolic link.", data.recipe, ["content/generators/<generator-id>.recipe.json"]));
        return sortAuthoringDiagnostics(diagnostics);
      }
      const recipe = JSON.parse(await readFile(recipeRealPath, "utf8")) as unknown;
      diagnostics.push(...validateBlenderRecipe(data.recipe, recipe));
      if (isRecord(recipe) && recipe.id !== data.id) diagnostics.push(blenderRecipeDiagnostic(data.recipe, "/id", "TN_AUTHORING_BLENDER_RECIPE_ID_MISMATCH", "Blender recipe id must match its generator provenance id.", recipe.id, [String(data.id)]));
      if (isRecord(recipe) && typeof recipe.source === "string" && diagnostics.every((diagnostic) => diagnostic.path !== "/source")) {
        try {
          const sourceRealPath = await realpath(resolve(projectPath, recipe.source));
          const sourceRelativePath = normalizeRelativePath(relative(projectRealPath, sourceRealPath));
          if (sourceRelativePath.startsWith("../") || sourceRelativePath === "..") {
            diagnostics.push(blenderRecipeDiagnostic(data.recipe, "/source", "TN_AUTHORING_BLENDER_RECIPE_SOURCE_PATH_INVALID", "Blender recipe source must not escape the project through a symbolic link.", recipe.source, ["project-local GLB below assets/"]));
          }
        } catch (error) {
          diagnostics.push(blenderRecipeDiagnostic(data.recipe, "/source", "TN_AUTHORING_BLENDER_RECIPE_SOURCE_READ_FAILED", `Could not read Blender recipe source '${recipe.source}'.`, error instanceof Error ? error.message : String(error), ["existing project-local GLB below assets/"]));
        }
      }
    } catch (error) {
      diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_READ_FAILED", file: data.recipe, message: `Could not read Blender recipe '${data.recipe}'.`, value: error instanceof Error ? error.message : String(error), fix: { instruction: "Restore the durable recipe file referenced by generator provenance.", allowed: [data.recipe] } }));
    }
  }
  return sortAuthoringDiagnostics(diagnostics);
}

function validateImg2ThreejsGeneratorProvenance(diagnostics: IAuthoringDiagnostic[], file: string, data: Record<string, unknown>): void {
  if (data.version !== "0.1.0") diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/version", "img2threejs provenance version must be 0.1.0.", data.version));
  validateRequiredString(diagnostics, file, "/providerVersion", data.providerVersion, "img2threejs providerVersion must be a non-empty string.");
  validateRequiredString(diagnostics, file, "/module", data.module, "img2threejs module must be a non-empty project source path.");
  validateRequiredString(diagnostics, file, "/export", data.export, "img2threejs export must be a non-empty named export.");
  validateRequiredString(diagnostics, file, "/sourceImage", data.sourceImage, "img2threejs sourceImage must be a non-empty project source path.");
  validateRequiredString(diagnostics, file, "/sculptSpec", data.sculptSpec, "img2threejs sculptSpec must be a non-empty project source path.");
  if (typeof data.recipe !== "string" || !/^content\/generators\/[a-z][a-z0-9._-]*\.img2threejs\.json$/.test(data.recipe) || data.recipe.includes("..")) {
    diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/recipe", "img2threejs recipe must be contained under content/generators/ and end in .img2threejs.json.", data.recipe));
  }
  if (typeof data.module !== "string" || !/^src\/generators\/[A-Za-z0-9._/-]+\.ts$/.test(data.module) || data.module.includes("..")) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/module", "img2threejs module must be a TypeScript source beneath src/generators/.", data.module));
  if (typeof data.sourceImage !== "string" || !data.sourceImage.startsWith("content/references/") || data.sourceImage.includes("..")) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/sourceImage", "img2threejs sourceImage must remain beneath content/references/.", data.sourceImage));
  if (typeof data.sculptSpec !== "string" || !/^content\/generators\/[a-z][a-z0-9._-]*\.sculpt-spec\.json$/.test(data.sculptSpec) || data.sculptSpec.includes("..")) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/sculptSpec", "img2threejs sculptSpec must remain beneath content/generators/.", data.sculptSpec));
  if (data.providerVersion !== img2ThreejsProviderManifest.skillVersion) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/providerVersion", `img2threejs providerVersion must match reviewed skill ${img2ThreejsProviderManifest.skillVersion}.`, data.providerVersion));
  validateImg2ThreejsUpstream(diagnostics, file, data.upstream);
  validateImg2ThreejsSourceHashes(diagnostics, file, data.sourceHashes);
  validateImg2ThreejsAcceptedPasses(diagnostics, file, data.acceptedPasses);
  validateImg2ThreejsBudgets(diagnostics, file, data.budgets);
  if (!isSha256(data.inputHash)) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/inputHash", "img2threejs inputHash must be a sha256 digest.", data.inputHash));
  if (data.overwritePolicy === undefined) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/overwritePolicy", "img2threejs overwritePolicy is required.", data.overwritePolicy));
}

function validateImg2ThreejsUpstream(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  if (!isRecord(value)) {
    diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/upstream", "img2threejs upstream provenance must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/upstream", value, img2ThreejsProvenanceUpstreamKeys));
  const expected = { commit: img2ThreejsProviderManifest.reviewedCommit, internalForkTree: img2ThreejsProviderManifest.internalForkTree, repository: img2ThreejsProviderManifest.repository, skillVersion: img2ThreejsProviderManifest.skillVersion };
  for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `/upstream/${key}`, `img2threejs upstream ${key} must match the reviewed provider manifest.`, value[key]));
}

function validateImg2ThreejsSourceHashes(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  if (!isRecord(value)) {
    diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/sourceHashes", "img2threejs sourceHashes must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/sourceHashes", value, img2ThreejsSourceHashKeys));
  for (const key of ["recipe", "sourceImage", "sculptSpec", "factory", "validationReport"] as const) if (!isSha256(value[key])) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `/sourceHashes/${key}`, `img2threejs ${key} source hash must be a sha256 digest.`, value[key]));
  validateImg2ThreejsHashedResources(diagnostics, file, "/sourceHashes/resources", value.resources, ["assets/", "content/"]);
}

function validateImg2ThreejsAcceptedPasses(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/acceptedPasses", "img2threejs acceptedPasses must be a non-empty array.", value));
    return;
  }
  const ids = new Set<string>();
  value.forEach((pass, index) => {
    if (!isRecord(pass)) {
      diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `/acceptedPasses/${index}`, "img2threejs accepted pass must be an object.", pass));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, `/acceptedPasses/${index}`, pass, img2ThreejsAcceptedPassKeys));
    if (typeof pass.id !== "string" || pass.id === "" || ids.has(pass.id)) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `/acceptedPasses/${index}/id`, "img2threejs accepted pass id must be unique and non-empty.", pass.id));
    else ids.add(pass.id);
    if (!isSha256(pass.reviewHash)) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `/acceptedPasses/${index}/reviewHash`, "img2threejs reviewHash must be a sha256 digest.", pass.reviewHash));
    validateImg2ThreejsHashedResources(diagnostics, file, `/acceptedPasses/${index}/evidence`, pass.evidence, ["artifacts/", "content/"]);
  });
}

function validateImg2ThreejsHashedResources(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, allowedPrefixes: readonly string[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push(img2ThreejsProvenanceDiagnostic(file, path, "img2threejs hashed resources must be an array.", value));
    return;
  }
  value.forEach((resource, index) => {
    if (!isRecord(resource)) {
      diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `${path}/${index}`, "img2threejs hashed resource must be an object.", resource));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, `${path}/${index}`, resource, img2ThreejsHashedResourceKeys));
    const normalized = typeof resource.path === "string" ? normalizeRelativePath(resource.path) : undefined;
    if (normalized === undefined || normalized === "" || normalized !== resource.path || normalized.startsWith("/") || /^[a-z][a-z0-9+.-]*:/iu.test(normalized) || normalized.startsWith("//") || !allowedPrefixes.some((prefix) => normalized.startsWith(prefix)) || isGeneratedArtifactPath(normalized)) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `${path}/${index}/path`, "img2threejs hashed resource path must be durable and project-relative.", resource.path));
    if (!isSha256(resource.sha256)) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `${path}/${index}/sha256`, "img2threejs resource hash must be a sha256 digest.", resource.sha256));
  });
}

function validateImg2ThreejsBudgets(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  if (!isRecord(value)) {
    diagnostics.push(img2ThreejsProvenanceDiagnostic(file, "/budgets", "img2threejs budgets must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/budgets", value, img2ThreejsBudgetKeys));
  for (const [key, limit] of Object.entries(img2ThreejsRecipeLimits)) if (typeof value[key] !== "number" || !Number.isInteger(value[key]) || Number(value[key]) <= 0 || Number(value[key]) > limit) diagnostics.push(img2ThreejsProvenanceDiagnostic(file, `/budgets/${key}`, `img2threejs budget must be a positive integer no greater than ${limit}.`, value[key]));
}

function isSha256(value: unknown): value is string {
  return typeof value === "string" && /^sha256:[a-f0-9]{64}$/.test(value);
}

function img2ThreejsProvenanceDiagnostic(file: string, path: string, message: string, value: unknown): IAuthoringDiagnostic {
  return authoringDiagnostic({ code: "TN_IMG2THREEJS_PROVENANCE_INVALID", file, fix: { instruction: "Re-record this generator from its reviewed img2threejs workspace." }, message, path, value });
}

export function validateBlenderRecipe(file: string, data: unknown): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [typeDiagnostic(file, "", "Blender recipe must be a JSON object.", data)];
  }
  const recipeBytes = Buffer.byteLength(JSON.stringify(data), "utf8");
  if (recipeBytes > 1024 * 1024) diagnostics.push(blenderBudgetDiagnostic(file, "", "serialized byte", recipeBytes, 1024 * 1024));
  diagnostics.push(...unknownBlenderKeys(file, "", data, blenderRecipeKeys));
  rejectUnsafeBlenderRecipeFields(diagnostics, file, data);
  if (data.schema !== blenderRecipeSchema) {
    diagnostics.push(blenderRecipeDiagnostic(file, "/schema", "TN_AUTHORING_BLENDER_RECIPE_SCHEMA_INVALID", `Blender recipe must use schema '${blenderRecipeSchema}'.`, data.schema, ["schema", "version", "id", "materials", "parts", "operations", "animations", "budgets"]));
  }
  if (data.version !== "0.1.0") {
    diagnostics.push(blenderRecipeDiagnostic(file, "/version", "TN_AUTHORING_BLENDER_RECIPE_VERSION_INVALID", "Blender recipe version must be '0.1.0'.", data.version, ["0.1.0"]));
  }
  validateLogicalId(diagnostics, file, "/id", data.id, "Blender recipe");
  const budgets = isRecord(data.budgets) ? data.budgets : {};
  const sourceMode = data.source !== undefined;
  if (sourceMode) {
    validateBlenderSourcePath(diagnostics, file, "/source", data.source);
    for (const field of ["parts"] as const) {
      if (data[field] !== undefined) {
        diagnostics.push(blenderRecipeDiagnostic(file, `/${field}`, "TN_AUTHORING_BLENDER_RECIPE_SOURCE_MODE_INVALID", `Source-backed Blender recipes cannot declare '${field}'.`, data[field], ["source", "materials", "operations", "animations", "budgets"]));
      }
    }
    if (!Array.isArray(data.animations) || data.animations.length === 0) {
      diagnostics.push(typeDiagnostic(file, "/animations", "Source-backed Blender recipes must declare at least one animation clip.", data.animations));
    }
  }

  const materials = Array.isArray(data.materials) ? data.materials : [];
  if (data.materials !== undefined && !Array.isArray(data.materials)) {
    diagnostics.push(typeDiagnostic(file, "/materials", "Blender recipe materials must be an array.", data.materials));
  }
  const materialIds = new Set<string>();
  materials.forEach((material, index) => {
    const path = `/materials/${index}`;
    if (!isRecord(material)) {
      diagnostics.push(typeDiagnostic(file, path, "Blender recipe material must be an object.", material));
      return;
    }
    diagnostics.push(...unknownBlenderKeys(file, path, material, blenderRecipeMaterialKeys));
    const id = sourceMode
      ? blenderSourceMaterialName(diagnostics, file, `${path}/id`, material.id)
      : blenderLogicalId(diagnostics, file, `${path}/id`, material.id, "material");
    if (id !== undefined && materialIds.has(id)) {
      diagnostics.push(blenderRecipeDiagnostic(file, `${path}/id`, "TN_AUTHORING_BLENDER_RECIPE_ID_DUPLICATE", `Blender recipe material id '${id}' must be unique.`, id, ["unique material ids"]));
    }
    if (id !== undefined) materialIds.add(id);
    validateBlenderColor(diagnostics, file, `${path}/baseColor`, material.baseColor, !sourceMode);
    validateBlenderUnitNumber(diagnostics, file, `${path}/metallic`, material.metallic, false);
    validateBlenderUnitNumber(diagnostics, file, `${path}/roughness`, material.roughness, false);
    validateBlenderColor(diagnostics, file, `${path}/emissive`, material.emissive, false);
    if (material.alphaMode !== undefined) validateEnumString(diagnostics, file, `${path}/alphaMode`, material.alphaMode, new Set(["blend", "mask", "opaque"]), "material alpha mode", "Use 'blend', 'mask', or 'opaque'.");
    validateOptionalBoolean(diagnostics, file, `${path}/doubleSided`, material.doubleSided, "material doubleSided must be a boolean.");
  });

  const parts = Array.isArray(data.parts) ? data.parts : [];
  if (!sourceMode && (!Array.isArray(data.parts) || data.parts.length === 0)) {
    diagnostics.push(typeDiagnostic(file, "/parts", "Blender recipe parts must be a non-empty array.", data.parts));
  }
  const partIds = new Set<string>();
  parts.forEach((part, index) => {
    const path = `/parts/${index}`;
    if (!isRecord(part)) {
      diagnostics.push(typeDiagnostic(file, path, "Blender recipe part must be an object.", part));
      return;
    }
    diagnostics.push(...unknownBlenderKeys(file, path, part, blenderRecipePartKeys));
    const id = blenderLogicalId(diagnostics, file, `${path}/id`, part.id, "part");
    if (id !== undefined && partIds.has(id)) {
      diagnostics.push(blenderRecipeDiagnostic(file, `${path}/id`, "TN_AUTHORING_BLENDER_RECIPE_ID_DUPLICATE", `Blender recipe part id '${id}' must be unique.`, id, ["unique part ids"]));
    }
    validateEnumString(diagnostics, file, `${path}/primitive`, part.primitive, supportedBlenderRecipePrimitives, "Blender recipe primitive", `Use one of: ${[...supportedBlenderRecipePrimitives].join(", ")}.`);
    if (part.material !== undefined && (typeof part.material !== "string" || !materialIds.has(part.material))) {
      diagnostics.push(blenderRecipeDiagnostic(file, `${path}/material`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID", "Part material must reference a material declared earlier in the recipe.", part.material, [...materialIds]));
    }
    validateBlenderVec3(diagnostics, file, `${path}/position`, part.position, false, false);
    validateBlenderVec3(diagnostics, file, `${path}/rotation`, part.rotation, false, false);
    validateBlenderVec3(diagnostics, file, `${path}/scale`, part.scale, false, true);
    const maxSegments = blenderRequestedLimit(budgets, "maxSegments");
    validateBlenderBoundedInteger(diagnostics, file, `${path}/segments`, part.segments, 3, maxSegments, false);
    validateBlenderBoundedInteger(diagnostics, file, `${path}/rings`, part.rings, 2, maxSegments, false);
    if (part.shading !== undefined) validateEnumString(diagnostics, file, `${path}/shading`, part.shading, supportedBlenderRecipeShading, "Blender recipe shading", "Use 'flat' or 'smooth'.");
    const modifiers = Array.isArray(part.modifiers) ? part.modifiers : [];
    if (part.modifiers !== undefined && !Array.isArray(part.modifiers)) diagnostics.push(typeDiagnostic(file, `${path}/modifiers`, "Part modifiers must be an array.", part.modifiers));
    const maxModifiers = blenderRequestedLimit(budgets, "maxModifiersPerPart");
    if (modifiers.length > maxModifiers) diagnostics.push(blenderBudgetDiagnostic(file, `${path}/modifiers`, "modifiers per part", modifiers.length, maxModifiers));
    modifiers.forEach((modifier, modifierIndex) => validateBlenderModifier(diagnostics, file, `${path}/modifiers/${modifierIndex}`, modifier, partIds, maxSegments));
    if (id !== undefined) partIds.add(id);
  });
  const maxParts = blenderRequestedLimit(budgets, "maxParts");
  const maxMaterials = blenderRequestedLimit(budgets, "maxMaterials");
  if (parts.length > maxParts) diagnostics.push(blenderBudgetDiagnostic(file, "/parts", "parts", parts.length, maxParts));
  if (materials.length > maxMaterials) diagnostics.push(blenderBudgetDiagnostic(file, "/materials", "materials", materials.length, maxMaterials));

  const operationNodes = sourceMode
    ? validateBlenderSourceOperations(diagnostics, file, data.operations, budgets)
    : validateBlenderOperations(diagnostics, file, data.operations, partIds, budgets);
  validateBlenderAnimations(diagnostics, file, data.animations, operationNodes, budgets);
  const estimatedPolygons = estimateBlenderRecipePolygons(parts);
  const maxPolygons = blenderRequestedLimit(budgets, "maxPolygons");
  if (estimatedPolygons > maxPolygons) diagnostics.push(blenderBudgetDiagnostic(file, "/budgets/maxPolygons", "estimated polygons", estimatedPolygons, maxPolygons));
  validateBlenderBudgets(diagnostics, file, data.budgets);
  return sortAuthoringDiagnostics(diagnostics);
}

function validateBlenderSourceOperations(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: unknown,
  budgets: Record<string, unknown>,
): undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic(file, "/operations", "Source-backed Blender recipe operations must be an array.", value));
    return undefined;
  }
  const maxOperations = blenderRequestedLimit(budgets, "maxOperations");
  if (value.length > maxOperations) diagnostics.push(blenderBudgetDiagnostic(file, "/operations", "operations", value.length, maxOperations));
  const outputIds = new Set<string>();
  value.forEach((operation, index) => {
    const path = `/operations/${index}`;
    if (!isRecord(operation)) {
      diagnostics.push(typeDiagnostic(file, path, "Source-backed Blender recipe operation must be an object.", operation));
      return;
    }
    const kind = typeof operation.kind === "string" ? operation.kind : "";
    const operationKeys = kind === "split-by-axis"
      ? new Set(["kind", "node", "axis", "threshold", "negative", "positive"])
      : kind === "transform"
        ? new Set(["kind", "node", "position", "rotation", "scale"])
        : kind === "decimate"
          ? new Set(["kind", "ratio"])
          : new Set(["kind"]);
    diagnostics.push(...unknownBlenderKeys(file, path, operation, operationKeys));
    validateEnumString(
      diagnostics,
      file,
      `${path}/kind`,
      operation.kind,
      supportedBlenderSourceRecipeOperations,
      "Source-backed Blender recipe operation",
      `Use one of: ${[...supportedBlenderSourceRecipeOperations].join(", ")}.`,
    );
    if (kind === "decimate") {
      if (typeof operation.ratio !== "number" || !Number.isFinite(operation.ratio) || operation.ratio <= 0 || operation.ratio > 1) {
        diagnostics.push(blenderRecipeDiagnostic(file, `${path}/ratio`, "TN_AUTHORING_BLENDER_RECIPE_VALUE_INVALID", "Source decimate ratio must be finite and greater than zero through one.", operation.ratio, ["number in (0, 1]"]));
      }
      return;
    }
    if (typeof operation.node !== "string" || operation.node.length === 0 || operation.node.length > 128 || /[\u0000-\u001f]/u.test(operation.node)) {
      diagnostics.push(blenderRecipeDiagnostic(file, `${path}/node`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID", "Source operation node must be an exact non-empty imported node name of at most 128 characters.", operation.node, ["exact imported node name"]));
    }
    if (kind === "transform") {
      const fields = ["position", "rotation", "scale"] as const;
      if (!fields.some((field) => operation[field] !== undefined)) {
        diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_VALUE_INVALID", "Source transform must declare position, rotation, or scale.", operation, fields));
      }
      validateBlenderVec3(diagnostics, file, `${path}/position`, operation.position, false, false);
      validateBlenderVec3(diagnostics, file, `${path}/rotation`, operation.rotation, false, false);
      validateBlenderVec3(diagnostics, file, `${path}/scale`, operation.scale, false, true);
      return;
    }
    if (kind !== "split-by-axis") return;
    validateEnumString(diagnostics, file, `${path}/axis`, operation.axis, new Set(["x", "y", "z"]), "source split axis", "Use 'x', 'y', or 'z'.");
    if (typeof operation.threshold !== "number" || !Number.isFinite(operation.threshold)) {
      diagnostics.push(blenderRecipeDiagnostic(file, `${path}/threshold`, "TN_AUTHORING_BLENDER_RECIPE_VALUE_INVALID", "Source split threshold must be a finite authored-space number.", operation.threshold, ["finite number"]));
    }
    const negative = blenderLogicalId(diagnostics, file, `${path}/negative`, operation.negative, "negative split output");
    const positive = blenderLogicalId(diagnostics, file, `${path}/positive`, operation.positive, "positive split output");
    for (const [field, id] of [["negative", negative], ["positive", positive]] as const) {
      if (id !== undefined && outputIds.has(id)) {
        diagnostics.push(blenderRecipeDiagnostic(file, `${path}/${field}`, "TN_AUTHORING_BLENDER_RECIPE_ID_DUPLICATE", `Source split output id '${id}' must be unique.`, id, ["unique split output ids"]));
      }
      if (id !== undefined) outputIds.add(id);
    }
    if (negative !== undefined && negative === positive) {
      diagnostics.push(blenderRecipeDiagnostic(file, `${path}/positive`, "TN_AUTHORING_BLENDER_RECIPE_ID_DUPLICATE", "Source split outputs must have different ids.", positive, ["distinct split output id"]));
    }
  });
  return undefined;
}

function validateBlenderModifier(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, earlierPartIds: ReadonlySet<string>, maxSegments: number): void {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "Blender recipe modifier must be an object.", value));
    return;
  }
  const kind = typeof value.kind === "string" ? value.kind : "";
  const modifierKeys = kind === "bevel" ? new Set(["kind", "width", "segments"])
    : kind === "array" ? new Set(["kind", "count", "offset"])
      : kind === "mirror" ? new Set(["kind", "axis"])
        : kind === "boolean" ? new Set(["kind", "target", "operation"])
          : kind === "solidify" ? new Set(["kind", "thickness"])
            : blenderRecipeModifierKeys;
  diagnostics.push(...unknownBlenderKeys(file, path, value, modifierKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedBlenderRecipeModifiers, "Blender recipe modifier", `Use one of: ${[...supportedBlenderRecipeModifiers].join(", ")}.`);
  if (kind === "bevel") {
    validateBlenderPositiveNumber(diagnostics, file, `${path}/width`, value.width, true);
    validateBlenderBoundedInteger(diagnostics, file, `${path}/segments`, value.segments, 1, maxSegments, false);
  } else if (kind === "array") {
    validateBlenderBoundedInteger(diagnostics, file, `${path}/count`, value.count, 2, 32, true);
    validateBlenderVec3(diagnostics, file, `${path}/offset`, value.offset, true, false);
  } else if (kind === "mirror") {
    if (value.axis !== undefined) validateEnumString(diagnostics, file, `${path}/axis`, value.axis, new Set(["x", "y", "z"]), "mirror axis", "Use 'x', 'y', or 'z'.");
  } else if (kind === "boolean") {
    if (typeof value.target !== "string" || !earlierPartIds.has(value.target)) diagnostics.push(blenderRecipeDiagnostic(file, `${path}/target`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_ORDER_INVALID", "Boolean target must reference a part declared earlier in the recipe.", value.target, [...earlierPartIds]));
    validateEnumString(diagnostics, file, `${path}/operation`, value.operation, supportedBlenderBooleanOperations, "boolean operation", "Use 'difference', 'intersect', or 'union'.");
  } else if (kind === "solidify") {
    validateBlenderPositiveNumber(diagnostics, file, `${path}/thickness`, value.thickness, true);
  }
}

function validateBlenderOperations(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, partIds: ReadonlySet<string>, budgets: Record<string, unknown>): ReadonlySet<string> {
  if (value === undefined) return new Set(partIds);
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic(file, "/operations", "Blender recipe operations must be an array.", value));
    return new Set(partIds);
  }
  const maxOperations = blenderRequestedLimit(budgets, "maxOperations");
  const maxJoinInputs = blenderRequestedLimit(budgets, "maxJoinInputs");
  if (value.length > maxOperations) diagnostics.push(blenderBudgetDiagnostic(file, "/operations", "operations", value.length, maxOperations));
  const resultIds = new Set(partIds);
  const parentByChild = new Map<string, string>();
  value.forEach((operation, index) => {
    const path = `/operations/${index}`;
    if (!isRecord(operation)) {
      diagnostics.push(typeDiagnostic(file, path, "Blender recipe operation must be an object.", operation));
      return;
    }
    if (typeof operation.kind !== "string" || !supportedBlenderRecipeOperations.has(operation.kind)) {
      diagnostics.push(...unknownBlenderKeys(file, path, operation, blenderRecipeOperationKeys));
      diagnostics.push(blenderRecipeDiagnostic(file, `${path}/kind`, "TN_AUTHORING_BLENDER_RECIPE_OPERATION_UNSUPPORTED", `Blender recipe operation '${String(operation.kind)}' is not supported.`, operation.kind, [...supportedBlenderRecipeOperations]));
      return;
    }
    diagnostics.push(...unknownBlenderKeys(file, path, operation, operation.kind === "join" ? new Set(["kind", "id", "inputs"]) : new Set(["kind", "parent", "child"])));
    if (operation.kind === "join") {
      const id = blenderLogicalId(diagnostics, file, `${path}/id`, operation.id, "join output");
      const inputs = Array.isArray(operation.inputs) ? operation.inputs : [];
      if (inputs.length < 2 || !inputs.every((input) => typeof input === "string" && resultIds.has(input))) diagnostics.push(blenderRecipeDiagnostic(file, `${path}/inputs`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID", "Join inputs must contain at least two previously declared part ids.", operation.inputs, [...resultIds]));
      if (new Set(inputs).size !== inputs.length) diagnostics.push(blenderRecipeDiagnostic(file, `${path}/inputs`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID", "Join inputs must be unique.", operation.inputs, [...resultIds]));
      if (inputs.length > maxJoinInputs) diagnostics.push(blenderBudgetDiagnostic(file, `${path}/inputs`, "join inputs", inputs.length, maxJoinInputs));
      if (id !== undefined && resultIds.has(id)) diagnostics.push(blenderRecipeDiagnostic(file, `${path}/id`, "TN_AUTHORING_BLENDER_RECIPE_ID_DUPLICATE", `Join output id '${id}' must be unique.`, id, ["unique operation output ids"]));
      if (id !== undefined && inputs.length >= 2 && inputs.every((input) => typeof input === "string" && resultIds.has(input))) {
        for (const input of inputs) resultIds.delete(input as string);
        resultIds.add(id);
      }
    } else {
      for (const field of ["parent", "child"] as const) if (typeof operation[field] !== "string" || !resultIds.has(operation[field] as string)) diagnostics.push(blenderRecipeDiagnostic(file, `${path}/${field}`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID", `Parent operation ${field} must reference an existing node.`, operation[field], [...resultIds]));
      if (operation.parent === operation.child && typeof operation.child === "string") diagnostics.push(blenderRecipeDiagnostic(file, `${path}/child`, "TN_AUTHORING_BLENDER_RECIPE_PARENT_CYCLE", "A node cannot be parented to itself.", operation.child, [...resultIds].filter((id) => id !== operation.child)));
      if (typeof operation.parent === "string" && typeof operation.child === "string" && resultIds.has(operation.parent) && resultIds.has(operation.child)) {
        let ancestor: string | undefined = operation.parent;
        while (ancestor !== undefined) {
          if (ancestor === operation.child) {
            diagnostics.push(blenderRecipeDiagnostic(file, `${path}/parent`, "TN_AUTHORING_BLENDER_RECIPE_PARENT_CYCLE", "Parent operations must not create a hierarchy cycle.", operation.parent, [...resultIds]));
            break;
          }
          ancestor = parentByChild.get(ancestor);
        }
        if (operation.parent !== operation.child) parentByChild.set(operation.child, operation.parent);
      }
    }
  });
  return resultIds;
}

function estimateBlenderRecipePolygons(parts: unknown[]): number {
  let total = 0;
  for (const value of parts) {
    if (!isRecord(value) || typeof value.primitive !== "string") continue;
    const segments = typeof value.segments === "number" && Number.isInteger(value.segments) ? value.segments : 32;
    const rings = typeof value.rings === "number" && Number.isInteger(value.rings) ? value.rings : 16;
    let polygons = value.primitive === "cube" ? 12
      : value.primitive === "sphere" || value.primitive === "torus" ? segments * rings * 2
        : value.primitive === "cylinder" ? segments * 4
          : value.primitive === "cone" ? segments * 2
            : 0;
    for (const modifier of Array.isArray(value.modifiers) ? value.modifiers : []) {
      if (!isRecord(modifier)) continue;
      if (modifier.kind === "array" && typeof modifier.count === "number") polygons *= Math.max(1, modifier.count);
      else if (modifier.kind === "mirror" || modifier.kind === "solidify") polygons *= 2;
      else if (modifier.kind === "bevel") polygons *= Math.max(2, typeof modifier.segments === "number" ? modifier.segments + 1 : 2);
    }
    total += polygons;
    if (!Number.isSafeInteger(total)) return Number.MAX_SAFE_INTEGER;
  }
  return total;
}

function validateBlenderAnimations(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, partIds: ReadonlySet<string> | undefined, budgets: Record<string, unknown>): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic(file, "/animations", "Blender recipe animations must be an array.", value));
    return;
  }
  const maxAnimations = blenderRequestedLimit(budgets, "maxAnimations");
  const maxTracks = blenderRequestedLimit(budgets, "maxTracksPerAnimation");
  const maxKeyframes = blenderRequestedLimit(budgets, "maxKeyframesPerTrack");
  if (value.length > maxAnimations) diagnostics.push(blenderBudgetDiagnostic(file, "/animations", "animation clips", value.length, maxAnimations));
  const clipIds = new Set<string>();
  value.forEach((clip, clipIndex) => {
    const path = `/animations/${clipIndex}`;
    if (!isRecord(clip)) { diagnostics.push(typeDiagnostic(file, path, "Animation clip must be an object.", clip)); return; }
    diagnostics.push(...unknownBlenderKeys(file, path, clip, blenderRecipeAnimationKeys));
    const id = blenderLogicalId(diagnostics, file, `${path}/id`, clip.id, "animation clip");
    if (id !== undefined && clipIds.has(id)) diagnostics.push(blenderRecipeDiagnostic(file, `${path}/id`, "TN_AUTHORING_BLENDER_RECIPE_ID_DUPLICATE", `Animation clip id '${id}' must be unique.`, id, ["unique animation clip ids"]));
    if (id !== undefined) clipIds.add(id);
    validateBlenderPositiveNumber(diagnostics, file, `${path}/duration`, clip.duration, true);
    validateOptionalBoolean(diagnostics, file, `${path}/loop`, clip.loop, "animation loop must be a boolean.");
    const tracks = Array.isArray(clip.tracks) ? clip.tracks : [];
    if (!Array.isArray(clip.tracks) || tracks.length === 0) diagnostics.push(typeDiagnostic(file, `${path}/tracks`, "Animation tracks must be a non-empty array.", clip.tracks));
    if (tracks.length > maxTracks) diagnostics.push(blenderBudgetDiagnostic(file, `${path}/tracks`, "tracks per animation", tracks.length, maxTracks));
    const trackKeys = new Set<string>();
    tracks.forEach((track, trackIndex) => {
      const trackPath = `${path}/tracks/${trackIndex}`;
      if (!isRecord(track)) { diagnostics.push(typeDiagnostic(file, trackPath, "Animation track must be an object.", track)); return; }
      diagnostics.push(...unknownBlenderKeys(file, trackPath, track, blenderRecipeAnimationTrackKeys));
      if (partIds === undefined) {
        if (typeof track.node !== "string" || track.node.length === 0 || track.node.length > 128 || /[\u0000-\u001f]/u.test(track.node)) diagnostics.push(blenderRecipeDiagnostic(file, `${trackPath}/node`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID", "Source-backed animation track node must be an exact non-empty imported node name of at most 128 characters.", track.node, ["exact imported node name"]));
      } else if (typeof track.node !== "string" || !partIds.has(track.node)) {
        diagnostics.push(blenderRecipeDiagnostic(file, `${trackPath}/node`, "TN_AUTHORING_BLENDER_RECIPE_REFERENCE_INVALID", "Animation track node must reference a declared part.", track.node, [...partIds]));
      }
      validateEnumString(diagnostics, file, `${trackPath}/property`, track.property, supportedBlenderAnimationProperties, "animation property", "Use 'position', 'rotation', or 'scale'.");
      if (track.pivot !== undefined) {
        if (partIds !== undefined || track.property !== "rotation") {
          diagnostics.push(blenderRecipeDiagnostic(
            file,
            `${trackPath}/pivot`,
            "TN_AUTHORING_BLENDER_RECIPE_ANIMATION_PIVOT_INVALID",
            "Animation pivots are supported only for source-backed rotation tracks.",
            track.pivot,
            ["source-backed rotation track pivot"],
          ));
        }
        validateBlenderVec3(diagnostics, file, `${trackPath}/pivot`, track.pivot, true, false);
      }
      const trackKey = `${String(track.node)}:${String(track.property)}`;
      if (trackKeys.has(trackKey)) diagnostics.push(blenderRecipeDiagnostic(file, trackPath, "TN_AUTHORING_BLENDER_RECIPE_ANIMATION_TRACK_DUPLICATE", "Animation clip may contain only one track per node property.", trackKey, ["unique node/property tracks"]));
      trackKeys.add(trackKey);
      const keyframes = Array.isArray(track.keyframes) ? track.keyframes : [];
      if (!Array.isArray(track.keyframes) || keyframes.length === 0) diagnostics.push(typeDiagnostic(file, `${trackPath}/keyframes`, "Animation keyframes must be a non-empty array.", track.keyframes));
      if (keyframes.length > maxKeyframes) diagnostics.push(blenderBudgetDiagnostic(file, `${trackPath}/keyframes`, "keyframes per track", keyframes.length, maxKeyframes));
      let priorTime = -1;
      keyframes.forEach((keyframe, keyframeIndex) => {
        const keyPath = `${trackPath}/keyframes/${keyframeIndex}`;
        if (!isRecord(keyframe)) { diagnostics.push(typeDiagnostic(file, keyPath, "Animation keyframe must be an object.", keyframe)); return; }
        diagnostics.push(...unknownBlenderKeys(file, keyPath, keyframe, blenderRecipeAnimationKeyframeKeys));
        if (typeof keyframe.time !== "number" || !Number.isFinite(keyframe.time) || keyframe.time < 0 || keyframe.time <= priorTime || (typeof clip.duration === "number" && keyframe.time > clip.duration)) diagnostics.push(blenderRecipeDiagnostic(file, `${keyPath}/time`, "TN_AUTHORING_BLENDER_RECIPE_ANIMATION_TIME_INVALID", "Keyframe time must be finite, strictly increasing, non-negative, and within clip duration.", keyframe.time, ["0..duration in increasing order"]));
        if (typeof keyframe.time === "number" && Number.isFinite(keyframe.time)) priorTime = keyframe.time;
        validateBlenderVec3(diagnostics, file, `${keyPath}/value`, keyframe.value, true, track.property === "scale");
        if (keyframe.interpolation !== undefined) validateEnumString(diagnostics, file, `${keyPath}/interpolation`, keyframe.interpolation, supportedBlenderAnimationInterpolations, "keyframe interpolation", "Use 'linear' or 'step'.");
      });
    });
  });
}

function validateBlenderBudgets(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, "/budgets", "Blender recipe budgets must be an object with explicit maxPolygons and maxOutputBytes.", value));
    return;
  }
  diagnostics.push(...unknownBlenderKeys(file, "/budgets", value, blenderRecipeBudgetKeys));
  for (const [key, limit] of Object.entries(blenderRecipeLimits)) validateBlenderBoundedInteger(diagnostics, file, `/budgets/${key}`, value[key], 1, limit, key === "maxPolygons" || key === "maxOutputBytes");
}

function unknownBlenderKeys(file: string, path: string, value: Record<string, unknown>, allowed: ReadonlySet<string>): IAuthoringDiagnostic[] {
  return Object.keys(value).filter((key) => !allowed.has(key)).sort().map((key) => blenderRecipeDiagnostic(file, `${path}/${escapeJsonPointer(key)}`, "TN_AUTHORING_BLENDER_RECIPE_FIELD_UNSUPPORTED", `Blender recipe field '${key}' is not supported.`, key, [...allowed]));
}

function rejectUnsafeBlenderRecipeFields(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, path = ""): void {
  if (typeof value === "string" && /^(?:https?|ftp):\/\//i.test(value)) {
    diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_REMOTE_URL_FORBIDDEN", "Blender recipes may reference only project-local structured data, not remote URLs.", value, ["project-local asset ids", "bounded recipe fields"]));
    return;
  }
  if (Array.isArray(value)) { value.forEach((item, index) => rejectUnsafeBlenderRecipeFields(diagnostics, file, item, `${path}/${index}`)); return; }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = `${path}/${escapeJsonPointer(key)}`;
    if (/^(?:python|code|script|module|addon|add-on|operator|driver)$/i.test(key)) diagnostics.push(blenderRecipeDiagnostic(file, childPath, "TN_AUTHORING_BLENDER_RECIPE_CODE_FORBIDDEN", `Blender recipe field '${key}' would allow general code or add-on execution and is forbidden.`, key, ["parts", "materials", "operations", "animations", "budgets"]));
    rejectUnsafeBlenderRecipeFields(diagnostics, file, child, childPath);
  }
}

function validateBlenderRecipePath(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (typeof value !== "string" || !/^content\/generators\/[a-z][a-z0-9._-]*\.recipe\.json$/.test(value) || value.includes("..")) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_PATH_INVALID", "Blender recipe path must be contained under content/generators/ and end in .recipe.json.", value, ["content/generators/<generator-id>.recipe.json"]));
}

function validateBlenderSourcePath(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (typeof value !== "string" || !/^assets\/(?!generated\/)[A-Za-z0-9._/-]+\.glb$/u.test(value) || value.includes("..") || value.includes("\\")) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_SOURCE_PATH_INVALID", "Blender recipe source must be a project-local GLB below assets/ and outside assets/generated/.", value, ["assets/source/<asset>.glb", "assets/imported/<asset>.glb"]));
}

function validateBlenderOutputPath(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (typeof value !== "string" || !/^assets\/generated\/[a-z][a-z0-9._-]*\.glb$/.test(value) || value.includes("..")) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_OUTPUT_PATH_INVALID", "Blender output must be a project-local GLB under assets/generated/.", value, ["assets/generated/<asset-id>.glb"]));
}

function generatorProviderFieldDiagnostic(file: string, path: string, field: string, provider: string, allowed: string[]): IAuthoringDiagnostic {
  return authoringDiagnostic({ code: "TN_AUTHORING_GENERATOR_PROVIDER_FIELD_INVALID", file, path, value: field, message: `Generator field '${field}' is not allowed for provider '${provider}'.`, fix: { instruction: `Remove '${field}' and use only fields allowed for the '${provider}' provider.`, allowed } });
}

function blenderRecipeDiagnostic(file: string, path: string, code: string, message: string, value: unknown, allowed: readonly string[]): IAuthoringDiagnostic {
  return authoringDiagnostic({ code, file, path, value, message, fix: { instruction: "Replace or remove this value using the allowed bounded Blender recipe fields.", allowed } });
}

function blenderBudgetDiagnostic(file: string, path: string, kind: string, actual: number, max: number): IAuthoringDiagnostic {
  return blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_BUDGET_EXCEEDED", `Blender recipe ${kind} count ${actual} exceeds the limit of ${max}.`, actual, [`maximum ${max}`]);
}

function blenderLogicalId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, kind: string): string | undefined {
  if (typeof value !== "string" || value.length > 128 || !logicalIdPattern.test(value)) { diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_ID_INVALID", `Blender recipe ${kind} id must be a lowercase logical id of at most 128 characters.`, value, ["lowercase letters", "numbers", ".", "_", "-", "maximum 128 characters"])); return undefined; }
  return value;
}

function blenderSourceMaterialName(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0 || value.length > 128 || /[\u0000-\u001f\u007f]/.test(value)) {
    diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_ID_INVALID", "Source material name must exactly match a non-empty imported material name of at most 128 characters.", value, ["exact imported material name", "maximum 128 characters"]));
    return undefined;
  }
  return value;
}

function validateBlenderColor(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, required: boolean): void {
  if (!required && value === undefined) return;
  if (!Array.isArray(value) || (value.length !== 3 && value.length !== 4) || !value.every((item) => typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1)) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_COLOR_INVALID", "Blender recipe color must contain three or four finite values from 0 to 1.", value, ["[red, green, blue]", "[red, green, blue, alpha]"]));
}

function validateBlenderVec3(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, required: boolean, nonZero: boolean): void {
  if (!required && value === undefined) return;
  if (!Array.isArray(value) || value.length !== 3 || !value.every((item) => typeof item === "number" && Number.isFinite(item) && (!nonZero || item !== 0))) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_TRANSFORM_INVALID", `Blender recipe vector must contain three finite numbers${nonZero ? " and scale components cannot be zero" : ""}.`, value, ["[x, y, z]"]));
}

function validateBlenderUnitNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, required: boolean): void {
  if (!required && value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_NUMBER_INVALID", "Value must be a finite number from 0 to 1.", value, ["0..1"]));
}

function validateBlenderPositiveNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, required: boolean): void {
  if (!required && value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_NUMBER_INVALID", "Value must be a finite positive number.", value, ["number > 0"]));
}

function validateBlenderBoundedInteger(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, min: number, max: number, required: boolean): void {
  if (!required && value === undefined) return;
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) diagnostics.push(blenderRecipeDiagnostic(file, path, "TN_AUTHORING_BLENDER_RECIPE_BUDGET_INVALID", `Budget value must be an integer from ${min} to ${max}.`, value, [`${min}..${max}`]));
}

function blenderRequestedLimit(budgets: Record<string, unknown>, key: keyof typeof blenderRecipeLimits): number {
  const requested = budgets[key];
  return Number.isInteger(requested) && (requested as number) > 0 && (requested as number) <= blenderRecipeLimits[key]
    ? requested as number
    : blenderRecipeLimits[key];
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
