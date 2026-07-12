import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { isGeneratedArtifactPath, normalizeRelativePath, writeAuthoringJsonDocument, type AuthoringDocumentKind, type IAuthoringDocument } from "../documents.js";
import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "../diagnostics.js";
import { validateMaterialDocument } from "./materialValidation.js";
import { buildUiSourceRecipe, mergeById } from "./uiRecipes.js";
import { generatedPathDiagnostic, typeDiagnostic, validateGeneratedPathString } from "./validationHelpers.js";
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
  systemCountdownKeys,
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
  authoringOperationResult,
  loadProjectForOperation,
  writeChangedProjectDocuments,
  emptyScene,
  sceneFromWorld,
  nextSceneCommands,
  mutateAsset,
  systemStringListMetadataKeys,
  defaultRuntimeConfigData,
  defaultProjectMetadataData,
  createSourceDocument,
  upsertSourceDocument,
  mutateSourceDocument,
  mutateLoadedSourceDocument,
  validateNewSourcePath,
  sourceExtensionForKind,
  mutateScene,
  validationContextForProject,
  validateAuthoringDocument,
  validateGeneratorDocument,
  validateProjectDocument,
} from "./sharedA.js";
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

export function validateResources(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
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

export function validateAssetDeclaration(diagnostics: IAuthoringDiagnostic[], path: string, item: Record<string, unknown>, file: string): void {
  const type = readString(item.type);
  if (type === "render-target") {
    validateRenderTargetAssetDeclaration(diagnostics, file, path, item);
    return;
  }
  if (type === "heightmap") {
    validateHeightmapAssetDeclaration(diagnostics, file, path, item);
    return;
  }
  const sourcePath = readString(item.path);
  if (sourcePath === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/path`, "asset path must be a non-empty source path.", item.path));
    return;
  }
  validateGeneratedPathString(diagnostics, file, `${path}/path`, item.path, "asset path must be a non-empty source path.");
  if (type === "texture") {
    validateOptionalVec2(diagnostics, file, `${path}/repeat`, item.repeat, "texture repeat must be a pair of finite numbers.");
    validateOptionalVec2(diagnostics, file, `${path}/offset`, item.offset, "texture offset must be a pair of finite numbers.");
    validateOptionalVec2(diagnostics, file, `${path}/center`, item.center, "texture center must be a pair of finite numbers.");
    validateOptionalNumber(diagnostics, file, `${path}/rotation`, item.rotation, "texture rotation must be finite.");
    normalizeTextureWrapAlias(diagnostics, file, `${path}/wrapS`, item, "wrapS");
    normalizeTextureWrapAlias(diagnostics, file, `${path}/wrapT`, item, "wrapT");
    validateOptionalStringEnum(diagnostics, file, `${path}/wrapS`, item.wrapS, new Set(["clampToEdge", "mirroredRepeat", "repeat"]), "texture wrapS must be clampToEdge, mirroredRepeat, or repeat.");
    validateOptionalStringEnum(diagnostics, file, `${path}/wrapT`, item.wrapT, new Set(["clampToEdge", "mirroredRepeat", "repeat"]), "texture wrapT must be clampToEdge, mirroredRepeat, or repeat.");
    validateOptionalStringEnum(diagnostics, file, `${path}/minFilter`, item.minFilter, new Set(["linear", "linearMipmapLinear", "linearMipmapNearest", "nearest", "nearestMipmapLinear", "nearestMipmapNearest"]), "texture minFilter must be a promoted texture filter.");
    validateOptionalStringEnum(diagnostics, file, `${path}/magFilter`, item.magFilter, new Set(["linear", "nearest"]), "texture magFilter must be linear or nearest.");
  }
}

function normalizeTextureWrapAlias(diagnostics: IAuthoringDiagnostic[], file: string, path: string, item: Record<string, unknown>, key: "wrapS" | "wrapT"): void {
  const aliases: Record<string, string> = { clamp: "clampToEdge", mirror: "mirroredRepeat" };
  const value = readString(item[key]);
  const normalized = value === undefined ? undefined : aliases[value];
  if (normalized === undefined) return;
  item[key] = normalized;
  diagnostics.push(authoringDiagnostic({
    code: "TN_AUTHORING_TEXTURE_WRAP_NORMALIZED",
    file,
    message: `Texture ${key} alias '${value}' was normalized to '${normalized}'.`,
    path,
    severity: "warning",
    suggestion: `Use '${normalized}' in durable source.`,
    value,
  }));
}

export function validateHeightmapAssetDeclaration(diagnostics: IAuthoringDiagnostic[], file: string, path: string, item: Record<string, unknown>): void {
  const sourcePath = readString(item.path);
  if (sourcePath === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/path`, "heightmap asset path must be a non-empty source path.", item.path));
  } else {
    validateGeneratedPathString(diagnostics, file, `${path}/path`, item.path, "heightmap asset path must be a non-empty source path.");
  }
  validatePositiveNumber(diagnostics, file, `${path}/width`, item.width, "heightmap width must be a positive finite number.");
  validatePositiveNumber(diagnostics, file, `${path}/height`, item.height, "heightmap height must be a positive finite number.");
  if (item.format !== "json") {
    diagnostics.push(typeDiagnostic(file, `${path}/format`, "heightmap format must be 'json'.", item.format));
  }
  if (item.encoding !== "float32" && item.encoding !== "u16-normalized") {
    diagnostics.push(typeDiagnostic(file, `${path}/encoding`, "heightmap encoding must be 'float32' or 'u16-normalized'.", item.encoding));
  }
  if (!isRecord(item.heightRange) || typeof item.heightRange.min !== "number" || typeof item.heightRange.max !== "number") {
    diagnostics.push(typeDiagnostic(file, `${path}/heightRange`, "heightmap heightRange must define numeric min and max.", item.heightRange));
  }
}

export function validateRenderTargetAssetDeclaration(diagnostics: IAuthoringDiagnostic[], file: string, path: string, item: Record<string, unknown>): void {
  validatePositiveNumber(diagnostics, file, `${path}/width`, item.width, "render target width must be a positive finite number.");
  validatePositiveNumber(diagnostics, file, `${path}/height`, item.height, "render target height must be a positive finite number.");
  const usage = readString(item.usage);
  if (usage !== undefined && usage !== "color" && usage !== "depth") {
    diagnostics.push(typeDiagnostic(file, `${path}/usage`, "render target usage must be 'color' or 'depth'.", item.usage));
  }
  const format = readString(item.format);
  if (format !== undefined && format !== "rgba8" && format !== "rgba16f" && format !== "depth24plus") {
    diagnostics.push(typeDiagnostic(file, `${path}/format`, "render target format must be 'rgba8', 'rgba16f', or 'depth24plus'.", item.format));
  }
  if (item.sampleCount !== undefined && (typeof item.sampleCount !== "number" || !Number.isInteger(item.sampleCount) || item.sampleCount < 1)) {
    diagnostics.push(typeDiagnostic(file, `${path}/sampleCount`, "render target sampleCount must be a positive integer.", item.sampleCount));
  }
}

export function validatePositiveNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function isPortableJson(value: unknown): boolean {
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

export async function validateSystems(
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
    validateOptionalString(diagnostics, file, `${path}/schedule`, system.schedule, "system schedule must be a non-empty string.");
    if (system.source !== undefined && system.source !== "behavior-metadata") {
      diagnostics.push(typeDiagnostic(file, `${path}/source`, "system source must be 'behavior-metadata' when present.", system.source));
    }
    for (const key of systemStringListMetadataKeys) {
      validateStringList(diagnostics, file, `${path}/${key}`, system[key], `system ${key} must be an array of non-empty strings.`);
    }
    validateSystemQueries(diagnostics, file, `${path}/queries`, system.queries);
    validateSystemCommands(diagnostics, file, `${path}/commands`, system.commands);
  }
}

export function validateSystemCountdowns(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const countdowns = readArray(value);
  if (value !== undefined && countdowns === undefined) {
    diagnostics.push(typeDiagnostic(file, "/countdowns", "countdowns must be an array.", value));
    return;
  }
  const ids = new Set<string>();
  for (const [index, countdown] of countdowns?.entries() ?? []) {
    const path = `/countdowns/${index}`;
    if (!isRecord(countdown)) {
      diagnostics.push(typeDiagnostic(file, path, "countdown must be an object.", countdown));
      continue;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, countdown, systemCountdownKeys));
    validateRequiredString(diagnostics, file, `${path}/id`, countdown.id, "countdown id must be a non-empty string.");
    if (typeof countdown.id === "string") {
      if (ids.has(countdown.id)) {
        diagnostics.push(typeDiagnostic(file, `${path}/id`, `countdown id '${countdown.id}' is duplicated.`, countdown.id));
      }
      ids.add(countdown.id);
    }
    if (countdown.direction !== "up" && countdown.direction !== "down") {
      diagnostics.push(typeDiagnostic(file, `${path}/direction`, "countdown direction must be 'up' or 'down'.", countdown.direction));
    }
    validateRequiredString(diagnostics, file, `${path}/resource`, countdown.resource, "countdown resource must be a non-empty resource id.");
    validateRequiredString(diagnostics, file, `${path}/field`, countdown.field, "countdown field must be a non-empty field name.");
    validateRequiredString(diagnostics, file, `${path}/event`, countdown.event, "countdown event must be a non-empty event id.");
    validateOptionalNumber(diagnostics, file, `${path}/limit`, countdown.limit, "countdown limit must be a finite non-negative number.");
    if (typeof countdown.limit === "number" && countdown.limit < 0) {
      diagnostics.push(typeDiagnostic(file, `${path}/limit`, "countdown limit must be non-negative.", countdown.limit));
    }
    validateOptionalBoolean(diagnostics, file, `${path}/autostart`, countdown.autostart, "countdown autostart must be boolean.");
  }
}

export async function validateScriptLifecycles(
  diagnostics: IAuthoringDiagnostic[],
  projectPath: string,
  file: string,
  value: unknown,
  _scriptLifecycleIds: readonly string[],
): Promise<void> {
  const lifecycles = readArray(value);
  if (value !== undefined && lifecycles === undefined) {
    diagnostics.push(typeDiagnostic(file, "/scriptLifecycles", "scriptLifecycles must be an array.", value));
    return;
  }

  for (const [index, lifecycle] of lifecycles?.entries() ?? []) {
    if (!isRecord(lifecycle)) {
      continue;
    }
    const path = `/scriptLifecycles/${index}`;
    validateRequiredString(diagnostics, file, `${path}/module`, lifecycle.module, "script lifecycle module must be a non-empty path.");
    validateOptionalString(diagnostics, file, `${path}/scene`, lifecycle.scene, "script lifecycle scene must be a non-empty scene id.");
    if (lifecycle.onEnter !== undefined || lifecycle.onExit !== undefined) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_SCRIPT_LIFECYCLE_HOOK_UNSUPPORTED",
          file,
          message: "Script lifecycle onEnter/onExit hooks are not supported until they can lower to the scene lifecycle contract.",
          path: lifecycle.onEnter !== undefined ? `${path}/onEnter` : `${path}/onExit`,
          suggestion: "Use awake, fixedUpdate, update, or lateUpdate script exports.",
        }),
      );
    }

    const exports = ["awake", "fixedUpdate", "update", "lateUpdate"] as const;
    let hasSupportedExport = false;
    for (const key of exports) {
      validateOptionalString(diagnostics, file, `${path}/${key}`, lifecycle[key], `script lifecycle ${key} export must be a non-empty name.`);
      if (readString(lifecycle[key]) !== undefined) {
        hasSupportedExport = true;
        await validateScriptReference(diagnostics, projectPath, file, `${path}/${key}`, { module: lifecycle.module, export: lifecycle[key] });
      }
    }
    if (!hasSupportedExport) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_SCRIPT_LIFECYCLE_EMPTY",
          file,
          message: "Script lifecycle must declare at least one supported lifecycle export.",
          path,
          suggestion: "Add awake, fixedUpdate, update, or lateUpdate.",
        }),
      );
    }

    for (const key of systemStringListMetadataKeys) {
      validateStringList(diagnostics, file, `${path}/${key}`, lifecycle[key], `script lifecycle ${key} must be an array of non-empty strings.`);
    }
    validateSystemQueries(diagnostics, file, `${path}/queries`, lifecycle.queries);
    validateSystemCommands(diagnostics, file, `${path}/commands`, lifecycle.commands);
  }
}

export function validateSystemQueries(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  const queries = readArray(value);
  if (value !== undefined && queries === undefined) {
    diagnostics.push(typeDiagnostic(file, path, "system queries must be an array.", value));
    return;
  }
  for (const [index, query] of queries?.entries() ?? []) {
    const queryPath = `${path}/${index}`;
    if (!isRecord(query)) {
      diagnostics.push(typeDiagnostic(file, queryPath, "system query must be an object.", query));
      continue;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, queryPath, query, systemQueryKeys));
    validateStringList(diagnostics, file, `${queryPath}/with`, query.with, "system query with must be an array of non-empty component names.");
    validateStringList(diagnostics, file, `${queryPath}/without`, query.without, "system query without must be an array of non-empty component names.");
    validateStringList(diagnostics, file, `${queryPath}/changed`, query.changed, "system query changed must be an array of non-empty component names.");
    validateOptionalNonNegativeInteger(diagnostics, file, `${queryPath}/limit`, query.limit, "system query limit must be a non-negative integer.");
    validateOptionalNonNegativeInteger(diagnostics, file, `${queryPath}/offset`, query.offset, "system query offset must be a non-negative integer.");
    if (query.orderBy !== undefined && query.orderBy !== "id") {
      diagnostics.push(typeDiagnostic(file, `${queryPath}/orderBy`, "system query orderBy must be 'id'.", query.orderBy));
    }
  }
}

export function validateSystemCommands(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  const commands = readArray(value);
  if (value !== undefined && commands === undefined) {
    diagnostics.push(typeDiagnostic(file, path, "system commands must be an array.", value));
    return;
  }
  for (const [index, command] of commands?.entries() ?? []) {
    const commandPath = `${path}/${index}`;
    if (!isRecord(command)) {
      diagnostics.push(typeDiagnostic(file, commandPath, "system command must be an object.", command));
      continue;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, commandPath, command, systemCommandKeys));
    const kind = readString(command.kind);
    if (kind === undefined) {
      diagnostics.push(typeDiagnostic(file, `${commandPath}/kind`, "system command kind must be a non-empty string.", command.kind));
      continue;
    }
    validateSystemCommandShape(diagnostics, file, commandPath, kind, command);
  }
}

export function validateSystemCommandShape(diagnostics: IAuthoringDiagnostic[], file: string, path: string, kind: string, command: Record<string, unknown>): void {
  if (kind === "spawn") {
    validateRequiredString(diagnostics, file, `${path}/entity`, command.entity, "spawn command entity must be a non-empty entity id.");
    validateStringList(diagnostics, file, `${path}/components`, command.components, "spawn command components must be an array of non-empty component names.");
    return;
  }
  if (kind === "despawn") {
    const hasEntity = typeof command.entity === "string" && command.entity.trim().length > 0;
    const hasTag = typeof command.tag === "string" && command.tag.trim().length > 0;
    if (!hasEntity && !hasTag) {
      diagnostics.push(typeDiagnostic(file, path, "despawn command requires a non-empty entity pattern or tag selector.", command));
    }
    return;
  }
  if (kind === "addComponent" || kind === "removeComponent" || kind === "setComponent") {
    validateRequiredString(diagnostics, file, `${path}/entity`, command.entity, `${kind} command entity must be a non-empty entity id.`);
    validateRequiredString(diagnostics, file, `${path}/component`, command.component, `${kind} command component must be a non-empty component name.`);
    return;
  }
  if (kind === "emitEvent") {
    validateRequiredString(diagnostics, file, `${path}/event`, command.event, "emitEvent command event must be a non-empty event name.");
    return;
  }
  if (kind === "instantiate") {
    validateRequiredString(diagnostics, file, `${path}/prefab`, command.prefab, "instantiate command prefab must be a non-empty prefab id.");
    validateRequiredString(diagnostics, file, `${path}/prefix`, command.prefix, "instantiate command prefix must be a non-empty entity id prefix.");
    return;
  }
  if (kind === "setParent") {
    validateRequiredString(diagnostics, file, `${path}/child`, command.child, "setParent command child must be a non-empty entity id.");
    validateRequiredString(diagnostics, file, `${path}/parent`, command.parent, "setParent command parent must be a non-empty entity id.");
    return;
  }
  if (kind === "clearParent") {
    validateRequiredString(diagnostics, file, `${path}/child`, command.child, "clearParent command child must be a non-empty entity id.");
    return;
  }
  diagnostics.push(typeDiagnostic(file, `${path}/kind`, "system command kind must be one of spawn, despawn, addComponent, removeComponent, setComponent, emitEvent, instantiate, setParent, or clearParent.", kind));
}

export async function validateScriptReference(
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

export function validateUi(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, uiNodeIds: readonly string[], resourceIds: readonly string[]): void {
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
    validateUiBindingFormat(diagnostics, file, path, binding);
  });
}

export function validateUiBindingFormat(diagnostics: IAuthoringDiagnostic[], file: string, path: string, binding: Record<string, unknown>): void {
  validateStringList(diagnostics, file, `${path}/fields`, binding.fields, "ui binding fields must be non-empty strings.");
  validateOptionalString(diagnostics, file, `${path}/format`, binding.format, "ui binding format must be a non-empty string.");
  const format = readString(binding.format);
  if (format === undefined) {
    return;
  }
  const fields = readArray(binding.fields)?.map((field) => readString(field)).filter((field): field is string => field !== undefined);
  const allowed = fields === undefined || fields.length === 0 ? undefined : new Set(fields);
  for (const token of format.matchAll(/\{([^{}]+)\}/g)) {
    const [fieldValue, formatter] = String(token[1] ?? "").split(":");
    const field = fieldValue ?? "";
    if (field.trim() === "" || (allowed !== undefined && !allowed.has(field))) {
      diagnostics.push(typeDiagnostic(file, `${path}/format`, "ui binding format placeholders must reference declared fields.", binding.format));
      continue;
    }
    if (formatter !== undefined && !/^fixed\d+$/.test(formatter) && !/^pad\d+$/.test(formatter)) {
      diagnostics.push(typeDiagnostic(file, `${path}/format`, "ui binding format supports fixedN and padN formatters.", binding.format));
    }
  }
}

export function inspectSceneDocument(file: string, data: unknown, sourceLineCount = 0): ISceneInspection | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const entities = idsFromArray(data.entities);
  const instances = idsFromArray(data.instances);
  const repeatedBlocks = repeatedComponentBlocks(data.entities);
  return {
    id: readString(data.id) ?? "",
    file,
    entities,
    expandedEntityCount: entities.length + instances.length,
    instances,
    prefabs: idsFromArray(data.prefabs),
    repeatedBlocks,
    resources: idsFromArray(data.resources),
    sourceLineCount,
    suggestedRefactors: repeatedBlocks.map((block) => ({
      kind: "compact-prefab-instances",
      message: `${block.count} entities share components ${block.componentKinds.join(", ")}; move shared defaults to a prefab document and keep per-instance transform overrides in scene.instances.`,
    })),
    systems: idsFromArray(data.systems),
    uiNodes: isRecord(data.ui) ? idsFromArray(data.ui.nodes) : [],
  };
}

export function inspectSceneNode(data: unknown, nodeId: string): ISceneNodeInspection | undefined {
  if (!isRecord(data)) {
    return undefined;
  }
  const matches: ISceneNodeInspection["matches"] = [];
  pushArrayIdMatches(matches, "entity", "/entities", data.entities, nodeId);
  pushArrayIdMatches(matches, "instance", "/instances", data.instances, nodeId);
  pushArrayIdMatches(matches, "prefab", "/prefabs", data.prefabs, nodeId);
  pushArrayIdMatches(matches, "resource", "/resources", data.resources, nodeId);
  pushArrayIdMatches(matches, "system", "/systems", data.systems, nodeId);
  if (isRecord(data.ui)) {
    pushArrayIdMatches(matches, "ui-node", "/ui/nodes", data.ui.nodes, nodeId);
    readArray(data.ui.bindings)?.forEach((binding, index) => {
      if (!isRecord(binding)) {
        return;
      }
      const node = readString(binding.node);
      const resource = readString(binding.resource);
      if (node === nodeId || resource === nodeId || resource?.startsWith(`${nodeId}.`) === true) {
        matches.push({
          kind: "ui-binding",
          path: `/ui/bindings/${index}`,
          value: cloneJson(binding),
        });
      }
    });
  }
  return { id: nodeId, matches };
}

export function pushArrayIdMatches(
  matches: ISceneNodeInspection["matches"],
  kind: ISceneNodeInspection["matches"][number]["kind"],
  path: string,
  value: unknown,
  nodeId: string,
): void {
  readArray(value)?.forEach((item, index) => {
    if (!isRecord(item) || readString(item.id) !== nodeId) {
      return;
    }
    matches.push({
      kind,
      path: `${path}/${index}`,
      value: cloneJson(item),
    });
  });
}

export function compactInstanceRecord(
  id: string,
  prefab: string,
  transform: IAddPrefabInstanceOptions["transform"],
  components: Record<string, unknown> | undefined,
): Record<string, unknown> {
  return {
    id,
    prefab,
    ...(transform === undefined ? {} : { transform: cloneJson(transform) }),
    ...(components === undefined ? {} : { components: cloneJson(components) }),
  };
}

export function tenPinLayout(prefix: string, origin: [number, number, number], spacing: number): Array<{ id: string; position: [number, number, number] }> {
  const rows = [
    [0],
    [-0.5, 0.5],
    [-1, 0, 1],
    [-1.5, -0.5, 0.5, 1.5],
  ];
  const pins: Array<{ id: string; position: [number, number, number] }> = [];
  let index = 1;
  for (const [rowIndex, offsets] of rows.entries()) {
    for (const offset of offsets) {
      pins.push({
        id: `${prefix}.${String(index).padStart(2, "0")}`,
        position: [
          roundNumber(origin[0] + offset * spacing),
          roundNumber(origin[1]),
          roundNumber(origin[2] - rowIndex * spacing),
        ],
      });
      index += 1;
    }
  }
  return pins;
}

export function roundNumber(value: number): number {
  return Number(value.toFixed(6));
}

export async function countSourceLines(file: string): Promise<number> {
  try {
    const text = await readFile(file, "utf8");
    return text.length === 0 ? 0 : text.split(/\r?\n/).length;
  } catch {
    return 0;
  }
}

export function repeatedComponentBlocks(value: unknown): Array<{ componentKinds: string[]; count: number; entityIds: string[] }> {
  const groups = new Map<string, { componentKinds: string[]; entityIds: string[] }>();
  for (const entity of readArray(value) ?? []) {
    const record = isRecord(entity) ? entity : undefined;
    const id = readString(record?.id);
    const components = isRecord(record?.components) ? record.components : undefined;
    const componentKinds = Object.keys(components ?? {}).filter((kind) => kind !== "camera").sort();
    if (id === undefined || componentKinds.length < 2) {
      continue;
    }
    const key = componentKinds.join("\u0000");
    const group = groups.get(key) ?? { componentKinds, entityIds: [] };
    group.entityIds.push(id);
    groups.set(key, group);
  }
  return [...groups.values()]
    .filter((group) => group.entityIds.length >= 3)
    .map((group) => ({ componentKinds: group.componentKinds, count: group.entityIds.length, entityIds: group.entityIds.sort() }))
    .sort((left, right) => right.count - left.count || left.componentKinds.join(",").localeCompare(right.componentKinds.join(",")));
}

export function idsFromArray(value: unknown): string[] {
  return (readArray(value) ?? [])
    .map((item) => (isRecord(item) ? readString(item.id) : undefined))
    .filter(isString)
    .sort();
}

export function sortedStringList(value: readonly string[]): string[] {
  return [...new Set(value)].sort((left, right) => left.localeCompare(right));
}

export function collectMaterialIdsForProject(project: IAuthoringProject): string[] {
  const ids: string[] = [];
  for (const document of project.documents) {
    if (document.kind === "material" && isRecord(document.data)) {
      ids.push(...idsFromArray(document.data.materials));
    }
  }
  return [...new Set(ids)].sort();
}

export function collectPrefabDocumentIdsForProject(project: IAuthoringProject): string[] {
  const ids: string[] = [];
  for (const document of project.documents) {
    if (document.kind === "prefab" && isRecord(document.data)) {
      const id = readString(document.data.id);
      if (id !== undefined) {
        ids.push(id);
      }
    }
  }
  return [...new Set(ids)].sort();
}

export function ensureArrayProperty(record: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const existing = record[key];
  if (Array.isArray(existing)) {
    return existing as Record<string, unknown>[];
  }
  const created: Record<string, unknown>[] = [];
  record[key] = created;
  return created;
}

export function findSceneItem(value: unknown, id: string): Record<string, unknown> | undefined {
  return (readArray(value) ?? []).find((item): item is Record<string, unknown> => isRecord(item) && item.id === id);
}

export function setOptionalString(target: Record<string, unknown>, key: string, value: string | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function setOptionalNumber(target: Record<string, unknown>, key: string, value: number | undefined): void {
  if (value !== undefined) {
    target[key] = value;
  }
}

export function inputControlsRowSortKey(value: Record<string, unknown>): string {
  return `${String(value.kind ?? "")}\0${String(value.actionOrAxisId ?? "")}\0${String(value.axisSlot ?? "")}`;
}

export function inputOverrideSortKey(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  return `${String(value.profileId ?? "")}\0${String(value.actionOrAxisId ?? "")}\0${String(value.axisSlot ?? "")}\0${String(value.device ?? "")}\0${String(value.control ?? "")}`;
}

export const schemaFieldKeys = new Set(["default", "kind", "required"]);

export function validateSchemaDocumentKind(file: string, value: unknown): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  validateEnumString(diagnostics, file, "/kind", value, supportedSchemaDocumentKinds, "schema document kind", "Use 'component', 'event', or 'resource'.");
  return diagnostics;
}

export function validateSchemaFields(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (!isRecord(value) || Object.keys(value).length === 0) {
    diagnostics.push(typeDiagnostic(file, path, "schema fields must be a non-empty object.", value));
    return;
  }
  for (const [fieldName, field] of Object.entries(value).sort(([left], [right]) => left.localeCompare(right))) {
    const fieldPath = `${path}/${escapeJsonPointer(fieldName)}`;
    if (fieldName.trim() === "") {
      diagnostics.push(typeDiagnostic(file, fieldPath, "schema field names must be non-empty strings.", fieldName));
      continue;
    }
    if (!isRecord(field)) {
      diagnostics.push(typeDiagnostic(file, fieldPath, "schema field declarations must be objects.", field));
      continue;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, fieldPath, field, schemaFieldKeys));
    validateEnumString(diagnostics, file, `${fieldPath}/kind`, field.kind, supportedSchemaFieldKinds, "schema field kind", "Use a supported IR schema field kind such as 'string', 'number', 'boolean', 'vec3', or 'json'.");
    validateOptionalBoolean(diagnostics, file, `${fieldPath}/required`, field.required, "schema field required flag must be a boolean.");
  }
}

export function formatKeyboardBinding(key: string): string {
  const bareCode = key.trim().replace(/^(?:keyboard\.)+/i, "");
  return `keyboard.${normalizeKeyboardCodeAlias(bareCode)}`;
}

export function validateInputMetadata(file: string, data: unknown): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return diagnostics;
  }
  const actionIds = new Set(idsFromArray(data.actions));
  const axisIds = new Set(idsFromArray(data.axes));
  validateInputBindingStrings(diagnostics, file, data);
  validateInputControlsSettings(diagnostics, file, data.controlsSettings, actionIds, axisIds);
  validateInputBindingOverrides(diagnostics, file, data.persistedBindingOverrides, actionIds, axisIds);
  return diagnostics;
}

export function validateInputBindingStrings(diagnostics: IAuthoringDiagnostic[], file: string, data: Record<string, unknown>): void {
  readArray(data.actions)?.forEach((action, actionIndex) => {
    if (!isRecord(action)) {
      return;
    }
    validateStructuredInputBindingList(diagnostics, file, `/actions/${actionIndex}/bindings`, action.bindings);
  });
  readArray(data.axes)?.forEach((axis, axisIndex) => {
    if (!isRecord(axis)) {
      return;
    }
    validateStructuredInputBindingList(diagnostics, file, `/axes/${axisIndex}/negative`, axis.negative);
    validateStructuredInputBindingList(diagnostics, file, `/axes/${axisIndex}/positive`, axis.positive);
    const value = readString(axis.value);
    if (value !== undefined) {
      validateStructuredInputBindingString(diagnostics, file, `/axes/${axisIndex}/value`, value);
    }
  });
}

export function validateStructuredInputBindingList(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  readArray(value)?.forEach((binding, index) => {
    const text = readString(binding);
    if (text !== undefined) {
      validateStructuredInputBindingString(diagnostics, file, `${path}/${index}`, text);
    } else if (isRecord(binding)) {
      const device = readString(binding.device);
      const control = typeof binding.button === "number" ? String(binding.button) : readString(binding.control);
      const snippet = device !== undefined && control !== undefined ? `${device}.${control}` : "keyboard.KeyW";
      diagnostics.push(authoringDiagnostic({
        code: "TN_AUTHORING_SHAPE_INVALID",
        file,
        fix: {
          docs: "docs/contracts/input-binding-syntax.md",
          instruction: "Replace the object-form binding with the portable input binding string micro-syntax.",
          snippet: JSON.stringify(snippet),
        },
        message: "Input bindings must use the portable string micro-syntax.",
        path: `${path}/${index}`,
        suggestion: `Use ${JSON.stringify(snippet)}.`,
        value: binding,
      }));
    }
  });
}

export function validateStructuredInputBindingString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: string): void {
  const [device, control] = value.split(".");
  if (device !== "keyboard" || control === undefined) {
    return;
  }
  const normalized = normalizeKeyboardCodeAlias(control);
  if (normalized !== control && isCanonicalKeyboardCode(normalized)) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_INPUT_KEYBOARD_CODE_NORMALIZED",
      file,
      message: `Keyboard binding '${value}' will be emitted as 'keyboard.${normalized}'.`,
      path,
      severity: "warning",
      suggestion: `Update this binding to 'keyboard.${normalized}' so source and emitted IR match.`,
      value,
    }));
    return;
  }
  if (!isCanonicalKeyboardCode(control)) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_INPUT_KEYBOARD_CODE_INVALID",
      file,
      message: `Keyboard binding '${value}' must use a canonical KeyboardEvent.code value.`,
      path,
      suggestion: "Use a binding such as 'keyboard.KeyW', 'keyboard.ArrowUp', 'keyboard.Space', or 'keyboard.Escape'.",
      value,
    }));
  }
}
