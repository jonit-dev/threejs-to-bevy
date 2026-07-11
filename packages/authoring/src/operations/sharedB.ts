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

export async function validateRuntimeDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [typeDiagnostic(file, "", "Runtime config source document must be a JSON object.", data)];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, runtimeDocumentKeys));
  if (data.schema !== runtimeDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_RUNTIME_SCHEMA_INVALID",
        file,
        message: `Runtime config source document must use schema '${runtimeDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, "runtime config document");

  const time = isRecord(data.time) ? data.time : undefined;
  if (time === undefined) {
    diagnostics.push(typeDiagnostic(file, "/time", "Runtime config time must define fixedDelta and paused.", data.time));
  } else {
    diagnostics.push(...unknownKeyDiagnostics(file, "/time", time, new Set(["fixedDelta", "paused"])));
    validateRequiredNumber(diagnostics, file, "/time/fixedDelta", time.fixedDelta, "runtime fixedDelta must be a finite number.");
    if (typeof time.fixedDelta === "number" && Number.isFinite(time.fixedDelta) && time.fixedDelta <= 0) {
      diagnostics.push(typeDiagnostic(file, "/time/fixedDelta", "runtime fixedDelta must be positive.", time.fixedDelta));
    }
    if (typeof time.paused !== "boolean") {
      diagnostics.push(typeDiagnostic(file, "/time/paused", "runtime paused must be a boolean.", time.paused));
    }
  }

  const window = isRecord(data.window) ? data.window : undefined;
  if (window === undefined) {
    diagnostics.push(typeDiagnostic(file, "/window", "Runtime config window must define width and height.", data.window));
  } else {
    diagnostics.push(...unknownKeyDiagnostics(file, "/window", window, new Set(["height", "title", "width"])));
    validateRequiredNumber(diagnostics, file, "/window/height", window.height, "runtime window height must be a finite number.");
    validateRequiredNumber(diagnostics, file, "/window/width", window.width, "runtime window width must be a finite number.");
    if (typeof window.height === "number" && Number.isFinite(window.height) && window.height <= 0) {
      diagnostics.push(typeDiagnostic(file, "/window/height", "runtime window height must be positive.", window.height));
    }
    if (typeof window.width === "number" && Number.isFinite(window.width) && window.width <= 0) {
      diagnostics.push(typeDiagnostic(file, "/window/width", "runtime window width must be positive.", window.width));
    }
    validateOptionalString(diagnostics, file, "/window/title", window.title, "runtime window title must be a non-empty string.");
  }

  const renderer = isRecord(data.renderer) ? data.renderer : undefined;
  if (data.renderer !== undefined && renderer === undefined) {
    diagnostics.push(typeDiagnostic(file, "/renderer", "Runtime renderer config must be a JSON object.", data.renderer));
  }
  if (renderer !== undefined) {
    diagnostics.push(...unknownKeyDiagnostics(file, "/renderer", renderer, new Set([
      "ambientOcclusion",
      "antialias",
      "bloom",
      "colorGrading",
      "motionBlur",
      "renderLook",
      "renderPath",
      "screenSpaceGlobalIllumination",
      "screenSpaceReflections",
    ])));
    const antialias = readString(renderer.antialias);
    if (renderer.antialias !== undefined && (antialias === undefined || !supportedRendererAntialiasModes.has(antialias))) {
      diagnostics.push(typeDiagnostic(file, "/renderer/antialias", "runtime renderer antialias must be one of none, msaa2, msaa4, msaa8, fxaa, taa, or smaa.", renderer.antialias));
    }
    if (renderer.renderPath !== undefined && renderer.renderPath !== "forward") {
      diagnostics.push(typeDiagnostic(file, "/renderer/renderPath", "runtime renderer renderPath must be 'forward'.", renderer.renderPath));
    }
    const ambientOcclusion = isRecord(renderer.ambientOcclusion) ? renderer.ambientOcclusion : undefined;
    if (renderer.ambientOcclusion !== undefined && ambientOcclusion === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/ambientOcclusion", "runtime renderer ambientOcclusion must be a JSON object.", renderer.ambientOcclusion));
    }
    if (ambientOcclusion !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/ambientOcclusion", ambientOcclusion, new Set(["enabled", "mode", "radius", "intensity", "quality"])));
      if (typeof ambientOcclusion.enabled !== "boolean") {
        diagnostics.push(typeDiagnostic(file, "/renderer/ambientOcclusion/enabled", "runtime renderer ambientOcclusion enabled must be a boolean.", ambientOcclusion.enabled));
      }
      if (ambientOcclusion.mode !== "screen-space") {
        diagnostics.push(typeDiagnostic(file, "/renderer/ambientOcclusion/mode", "runtime renderer ambientOcclusion mode must be 'screen-space'.", ambientOcclusion.mode));
      }
      validateRuntimeRendererNumber(diagnostics, file, ambientOcclusion, "radius", "/renderer/ambientOcclusion/radius", 0, 16);
      validateRuntimeRendererNumber(diagnostics, file, ambientOcclusion, "intensity", "/renderer/ambientOcclusion/intensity", 0, 4);
      validateRuntimeRendererQuality(diagnostics, file, ambientOcclusion.quality, "/renderer/ambientOcclusion/quality", ["low", "medium", "high"]);
    }
    const bloom = isRecord(renderer.bloom) ? renderer.bloom : undefined;
    if (renderer.bloom !== undefined && bloom === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/bloom", "runtime renderer bloom must be a JSON object.", renderer.bloom));
    }
    if (bloom !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/bloom", bloom, new Set(["enabled", "intensity", "threshold"])));
      if (typeof bloom.enabled !== "boolean") {
        diagnostics.push(typeDiagnostic(file, "/renderer/bloom/enabled", "runtime renderer bloom enabled must be a boolean.", bloom.enabled));
      }
      validateRequiredNumber(diagnostics, file, "/renderer/bloom/intensity", bloom.intensity, "runtime renderer bloom intensity must be a finite number.");
      validateRequiredNumber(diagnostics, file, "/renderer/bloom/threshold", bloom.threshold, "runtime renderer bloom threshold must be a finite number.");
      if (typeof bloom.intensity === "number" && Number.isFinite(bloom.intensity) && bloom.intensity < 0) {
        diagnostics.push(typeDiagnostic(file, "/renderer/bloom/intensity", "runtime renderer bloom intensity must be non-negative.", bloom.intensity));
      }
      if (typeof bloom.threshold === "number" && Number.isFinite(bloom.threshold) && bloom.threshold < 0) {
        diagnostics.push(typeDiagnostic(file, "/renderer/bloom/threshold", "runtime renderer bloom threshold must be non-negative.", bloom.threshold));
      }
    }
    const colorGrading = isRecord(renderer.colorGrading) ? renderer.colorGrading : undefined;
    if (renderer.colorGrading !== undefined && colorGrading === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/colorGrading", "runtime renderer colorGrading must be a JSON object.", renderer.colorGrading));
    }
    if (colorGrading !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/colorGrading", colorGrading, new Set(["contrast", "exposure", "lut", "saturation", "temperature", "tint", "toneMapping"])));
      for (const key of ["contrast", "temperature", "tint"]) {
        validateOptionalNumber(diagnostics, file, `/renderer/colorGrading/${key}`, colorGrading[key], `runtime renderer colorGrading ${key} must be finite.`);
      }
      validateOptionalPositiveNumber(diagnostics, file, "/renderer/colorGrading/exposure", colorGrading.exposure, "runtime renderer colorGrading exposure must be positive.");
      validateOptionalNonNegativeNumber(diagnostics, file, "/renderer/colorGrading/saturation", colorGrading.saturation, "runtime renderer colorGrading saturation must be non-negative.");
      const toneMapping = readString(colorGrading.toneMapping);
      if (colorGrading.toneMapping !== undefined && (toneMapping === undefined || !new Set(["aces", "linear", "none", "reinhard"]).has(toneMapping))) {
        diagnostics.push(typeDiagnostic(file, "/renderer/colorGrading/toneMapping", "runtime renderer colorGrading toneMapping must be aces, linear, none, or reinhard.", colorGrading.toneMapping));
      }
      validateOptionalString(diagnostics, file, "/renderer/colorGrading/lut", colorGrading.lut, "runtime renderer colorGrading LUT must be a non-empty asset id.");
    }
    if (renderer.renderLook !== undefined) {
      validateRuntimeRenderLook(diagnostics, file, renderer.renderLook);
    }
    const screenSpaceReflections = isRecord(renderer.screenSpaceReflections) ? renderer.screenSpaceReflections : undefined;
    if (renderer.screenSpaceReflections !== undefined && screenSpaceReflections === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/screenSpaceReflections", "runtime renderer screenSpaceReflections must be a JSON object.", renderer.screenSpaceReflections));
    }
    if (screenSpaceReflections !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/screenSpaceReflections", screenSpaceReflections, new Set(["enabled", "quality", "roughnessLimit"])));
      if (typeof screenSpaceReflections.enabled !== "boolean") {
        diagnostics.push(typeDiagnostic(file, "/renderer/screenSpaceReflections/enabled", "runtime renderer screenSpaceReflections enabled must be a boolean.", screenSpaceReflections.enabled));
      }
      validateRuntimeRendererQuality(diagnostics, file, screenSpaceReflections.quality, "/renderer/screenSpaceReflections/quality", ["low", "medium", "high"]);
      validateRuntimeRendererNumber(diagnostics, file, screenSpaceReflections, "roughnessLimit", "/renderer/screenSpaceReflections/roughnessLimit", 0, 1);
    }
    const motionBlur = isRecord(renderer.motionBlur) ? renderer.motionBlur : undefined;
    if (renderer.motionBlur !== undefined && motionBlur === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/motionBlur", "runtime renderer motionBlur must be a JSON object.", renderer.motionBlur));
    }
    if (motionBlur !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/motionBlur", motionBlur, new Set(["enabled", "shutterAngle"])));
      if (typeof motionBlur.enabled !== "boolean") {
        diagnostics.push(typeDiagnostic(file, "/renderer/motionBlur/enabled", "runtime renderer motionBlur enabled must be a boolean.", motionBlur.enabled));
      }
      validateRuntimeRendererNumber(diagnostics, file, motionBlur, "shutterAngle", "/renderer/motionBlur/shutterAngle", 0, 1);
    }
    const screenSpaceGlobalIllumination = isRecord(renderer.screenSpaceGlobalIllumination) ? renderer.screenSpaceGlobalIllumination : undefined;
    if (renderer.screenSpaceGlobalIllumination !== undefined && screenSpaceGlobalIllumination === undefined) {
      diagnostics.push(typeDiagnostic(file, "/renderer/screenSpaceGlobalIllumination", "runtime renderer screenSpaceGlobalIllumination must be a JSON object.", renderer.screenSpaceGlobalIllumination));
    }
    if (screenSpaceGlobalIllumination !== undefined) {
      diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/screenSpaceGlobalIllumination", screenSpaceGlobalIllumination, new Set(["enabled", "intensity", "quality", "radius"])));
      if (typeof screenSpaceGlobalIllumination.enabled !== "boolean") {
        diagnostics.push(typeDiagnostic(file, "/renderer/screenSpaceGlobalIllumination/enabled", "runtime renderer screenSpaceGlobalIllumination enabled must be a boolean.", screenSpaceGlobalIllumination.enabled));
      }
      validateRuntimeRendererNumber(diagnostics, file, screenSpaceGlobalIllumination, "intensity", "/renderer/screenSpaceGlobalIllumination/intensity", 0, 2);
      validateRuntimeRendererQuality(diagnostics, file, screenSpaceGlobalIllumination.quality, "/renderer/screenSpaceGlobalIllumination/quality", ["low", "medium", "high"]);
      validateRuntimeRendererNumber(diagnostics, file, screenSpaceGlobalIllumination, "radius", "/renderer/screenSpaceGlobalIllumination/radius", 0.01, 100);
    }
  }

  return diagnostics;
}

function validateRuntimeRendererNumber(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
  maximum: number,
): void {
  const fieldValue = value[key];
  validateRequiredNumber(diagnostics, file, path, fieldValue, `runtime renderer ${key} must be a finite number.`);
  if (typeof fieldValue === "number" && Number.isFinite(fieldValue) && (fieldValue < minimum || fieldValue > maximum)) {
    diagnostics.push(typeDiagnostic(file, path, `runtime renderer ${key} must be between ${minimum} and ${maximum}.`, fieldValue));
  }
}

function validateRuntimeRendererQuality(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: unknown,
  path: string,
  allowed: readonly string[],
): void {
  const quality = readString(value);
  if (quality === undefined || !allowed.includes(quality)) {
    diagnostics.push(typeDiagnostic(file, path, `runtime renderer quality must be one of ${allowed.join(", ")}.`, value));
  }
}

export function validateRuntimeRenderLook(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const renderLook = isRecord(value) ? value : undefined;
  if (renderLook === undefined) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook", "runtime renderer renderLook must be a JSON object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/renderLook", renderLook, new Set(["version", "profile", "overrides"])));
  if (renderLook.version !== 1) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/version", "runtime renderer renderLook version must be 1.", renderLook.version));
  }
  const profile = readString(renderLook.profile);
  if (profile === undefined || (!supportedRenderLookProfiles.has(profile) && !supportedRenderLookReservedProfiles.has(profile))) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/profile", "runtime renderer renderLook profile must be 'parity', 'balanced', 'cinematic', or 'stylized'.", renderLook.profile));
  } else if (supportedRenderLookReservedProfiles.has(profile)) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/profile", "runtime renderer renderLook profile is reserved until runtime screenshot proof promotes it.", renderLook.profile));
  }
  const overrides = isRecord(renderLook.overrides) ? renderLook.overrides : undefined;
  if (renderLook.overrides !== undefined && overrides === undefined) {
    diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/overrides", "runtime renderer renderLook overrides must be a JSON object.", renderLook.overrides));
  }
  if (overrides !== undefined) {
    diagnostics.push(...unknownKeyDiagnostics(file, "/renderer/renderLook/overrides", overrides, new Set(["bloomIntensity", "contrast", "environmentIntensity", "exposure", "saturation", "shadowQuality"])));
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "bloomIntensity", 0, 2);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "contrast", -0.5, 0.5);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "environmentIntensity", 0, 4);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "exposure", 0.25, 4);
    validateRuntimeRenderLookNumber(diagnostics, file, overrides, "saturation", 0, 2);
    if (overrides.shadowQuality !== undefined) {
      const shadowQuality = readString(overrides.shadowQuality);
      if (shadowQuality === undefined || !supportedRenderLookShadowQualities.has(shadowQuality)) {
        diagnostics.push(typeDiagnostic(file, "/renderer/renderLook/overrides/shadowQuality", "runtime renderer renderLook shadowQuality must be off, low, medium, or high.", overrides.shadowQuality));
      }
    }
  }
}

export function validateRuntimeRenderLookNumber(diagnostics: IAuthoringDiagnostic[], file: string, overrides: Record<string, unknown>, key: string, minimum: number, maximum: number): void {
  const value = overrides[key];
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push(typeDiagnostic(file, `/renderer/renderLook/overrides/${key}`, `runtime renderer renderLook ${key} must be between ${minimum} and ${maximum}.`, value));
  }
}

export async function validateTargetProfileDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [typeDiagnostic(file, "", "Target profile source document must be a JSON object.", data)];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, targetProfileDocumentKeys));
  if (data.schema !== targetProfileDocumentSchema) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_TARGET_PROFILE_SCHEMA_INVALID",
        file,
        message: `Target profile source document must use schema '${targetProfileDocumentSchema}'.`,
        path: "/schema",
        value: data.schema,
      }),
    );
  }
  validateLogicalId(diagnostics, file, "/id", data.id, "target profile document");

  const targets = readArray(data.targets);
  const supportedTargets = new Set(["web", "desktop"]);
  if (targets === undefined || targets.length === 0 || targets.some((target) => readString(target) === undefined || !supportedTargets.has(readString(target) ?? ""))) {
    diagnostics.push(typeDiagnostic(file, "/targets", "target profile targets must be a non-empty array of 'web' or 'desktop'.", data.targets));
  }

  const budgets = isRecord(data.budgets) ? data.budgets : undefined;
  if (data.budgets !== undefined && budgets === undefined) {
    diagnostics.push(typeDiagnostic(file, "/budgets", "target profile budgets must be a JSON object.", data.budgets));
  }
  if (budgets !== undefined) {
    diagnostics.push(...unknownKeyDiagnostics(file, "/budgets", budgets, new Set(["maxAssetBytes", "maxBundleBytes", "supportedModelFormats", "supportedTextureFormats"])));
    validateOptionalPositiveNumber(diagnostics, file, "/budgets/maxAssetBytes", budgets.maxAssetBytes, "target profile maxAssetBytes must be a positive finite number.");
    validateOptionalPositiveNumber(diagnostics, file, "/budgets/maxBundleBytes", budgets.maxBundleBytes, "target profile maxBundleBytes must be a positive finite number.");
    validateSupportedStringList(diagnostics, file, "/budgets/supportedModelFormats", budgets.supportedModelFormats, new Set(["glb", "gltf"]), "target profile supportedModelFormats must only include 'glb' or 'gltf'.");
    validateSupportedStringList(diagnostics, file, "/budgets/supportedTextureFormats", budgets.supportedTextureFormats, new Set(["jpeg", "png", "webp"]), "target profile supportedTextureFormats must only include 'jpeg', 'png', or 'webp'.");
  }

  if (data.performance !== undefined && !isRecord(data.performance)) {
    diagnostics.push(typeDiagnostic(file, "/performance", "target profile performance must be a JSON object.", data.performance));
  }

  return diagnostics;
}

export async function validateSceneDocument(
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
  if (data.kind !== undefined) {
    validateEnumString(diagnostics, file, "/kind", data.kind, supportedSceneLifecycleKinds, "scene lifecycle kind", "Use 'credits', 'cutscene', 'level', 'loading', 'menu', 'overlay', or 'system'.");
  }
  if (data.activation !== undefined) {
    validateEnumString(diagnostics, file, "/activation", data.activation, supportedSceneActivationPolicies, "scene activation policy", "Use 'additive', 'exclusive', 'loading', 'overlay', or 'persistent'.");
  }
  validateOptionalBoolean(diagnostics, file, "/initial", data.initial, "scene initial flag must be a boolean.");

  const prefabs = collectIds(diagnostics, file, "/prefabs", readArray(data.prefabs), "prefab", prefabKeys);
  const resources = collectIds(diagnostics, file, "/resources", readArray(data.resources), "resource", resourceKeys);
  const systems = collectIds(diagnostics, file, "/systems", readArray(data.systems), "system", systemKeys);
  const scriptLifecycles = collectIds(diagnostics, file, "/scriptLifecycles", readArray(data.scriptLifecycles), "script lifecycle", scriptLifecycleKeys);
  const uiNodes = collectUiNodeIds(diagnostics, file, data.ui);
  const entities = collectEntityIds(diagnostics, file, data.entities);
  const instances = collectInstanceIds(diagnostics, file, data.instances);

  validateEntities(diagnostics, file, data.entities, entities, prefabs, context.materialIds);
  validateInstances(diagnostics, file, data.instances, entities, instances, [...prefabs, ...(context.prefabDocumentIds ?? [])], context.materialIds);
  validatePrefabs(diagnostics, file, data.prefabs);
  validateResources(diagnostics, file, data.resources);
  await validateSystems(diagnostics, projectPath, file, data.systems, systems);
  await validateScriptLifecycles(diagnostics, projectPath, file, data.scriptLifecycles, scriptLifecycles);
  validateUi(diagnostics, file, data.ui, uiNodes, resources);

  return sortAuthoringDiagnostics(diagnostics);
}

export async function validateDeclarationDocument(
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
  options.validateRoot?.(diagnostics);

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

export function validateRootDocument(
  file: string,
  data: unknown,
  expectedSchema: string,
  idKind: string,
  rootKeys: ReadonlySet<string>,
): IAuthoringDiagnostic[] {
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
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, rootKeys));
  validateDocumentHeader(diagnostics, file, data, expectedSchema, idKind);
  return sortAuthoringDiagnostics(diagnostics);
}

export function validateFlowDocument(file: string, data: unknown): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [authoringDiagnostic({ code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID", file, message: "Flow source document must be a JSON object.", path: "", value: data })];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, flowDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, flowDocumentSchema, "flow document");
  validateRequiredString(diagnostics, file, "/initial", data.initial, "flow initial state must be a non-empty string.");
  const states = readArray(data.states);
  if (states === undefined) {
    diagnostics.push(typeDiagnostic(file, "/states", "flow states must be an array.", data.states));
  } else {
    collectIds(diagnostics, file, "/states", states, "flow state", flowStateKeys);
    for (const [index, state] of states.entries()) {
      if (!isRecord(state)) {
        continue;
      }
      diagnostics.push(...unknownKeyDiagnostics(file, `/states/${index}`, state, flowStateKeys));
      validateRequiredString(diagnostics, file, `/states/${index}/id`, state.id, "flow state id must be a non-empty string.");
      validateFlowActions(diagnostics, file, `/states/${index}/actions`, state.actions);
    }
  }
  const stateIds = new Set((states ?? []).filter(isRecord).map((state) => state.id).filter(isString));
  if (isString(data.initial) && !stateIds.has(data.initial)) {
    diagnostics.push(missingReferenceDiagnostic(file, "/initial", "flow state", data.initial, [...stateIds]));
  }
  if (data.transitions !== undefined && !Array.isArray(data.transitions)) {
    diagnostics.push(typeDiagnostic(file, "/transitions", "flow transitions must be an array.", data.transitions));
  }
  const transitions = readArray(data.transitions) ?? [];
  collectIds(diagnostics, file, "/transitions", transitions, "flow transition", flowTransitionKeys);
  for (const [index, transition] of transitions.entries()) {
    if (!isRecord(transition)) {
      continue;
    }
    const path = `/transitions/${index}`;
    diagnostics.push(...unknownKeyDiagnostics(file, path, transition, flowTransitionKeys));
    validateRequiredString(diagnostics, file, `${path}/id`, transition.id, "flow transition id must be a non-empty string.");
    validateFlowStateRef(diagnostics, file, `${path}/from`, transition.from, stateIds);
    validateFlowStateRef(diagnostics, file, `${path}/to`, transition.to, stateIds);
    validateFlowTrigger(diagnostics, file, `${path}/trigger`, transition.trigger);
    validateFlowActions(diagnostics, file, `${path}/actions`, transition.actions);
  }
  return sortAuthoringDiagnostics(diagnostics);
}

export function validateSequenceDocument(file: string, data: unknown): IAuthoringDiagnostic[] {
  const diagnostics: IAuthoringDiagnostic[] = [];
  if (!isRecord(data)) {
    return [authoringDiagnostic({ code: "TN_AUTHORING_DOCUMENT_SHAPE_INVALID", file, message: "Sequence source document must be a JSON object.", path: "", value: data })];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", data, sequenceDocumentKeys));
  validateDocumentHeader(diagnostics, file, data, sequenceDocumentSchema, "sequence document");
  validatePositiveNumber(diagnostics, file, "/duration", data.duration, "sequence duration must be a positive finite number.");
  validateOptionalBoolean(diagnostics, file, "/skippable", data.skippable, "sequence skippable flag must be a boolean.");
  const tracks = readArray(data.tracks);
  if (tracks === undefined) {
    diagnostics.push(typeDiagnostic(file, "/tracks", "sequence tracks must be an array.", data.tracks));
    return sortAuthoringDiagnostics(diagnostics);
  }
  collectIds(diagnostics, file, "/tracks", tracks, "sequence track", sequenceTrackKeys);
  for (const [trackIndex, track] of tracks.entries()) {
    if (!isRecord(track)) {
      continue;
    }
    const trackPath = `/tracks/${trackIndex}`;
    diagnostics.push(...unknownKeyDiagnostics(file, trackPath, track, sequenceTrackKeys));
    validateRequiredString(diagnostics, file, `${trackPath}/id`, track.id, "sequence track id must be a non-empty string.");
    validateEnumString(diagnostics, file, `${trackPath}/kind`, track.kind, supportedSequenceTrackKinds, "sequence track kind", "Use cameraPose, transform, event, ui, audio, or timeScale.");
    validateOptionalString(diagnostics, file, `${trackPath}/entity`, track.entity, "sequence track entity must be a non-empty string.");
    const keyframes = readArray(track.keyframes);
    if (keyframes === undefined) {
      diagnostics.push(typeDiagnostic(file, `${trackPath}/keyframes`, "sequence track keyframes must be an array.", track.keyframes));
      continue;
    }
    let previousTime = -Infinity;
    for (const [keyIndex, keyframe] of keyframes.entries()) {
      if (!isRecord(keyframe)) {
        continue;
      }
      const keyPath = `${trackPath}/keyframes/${keyIndex}`;
      diagnostics.push(...unknownKeyDiagnostics(file, keyPath, keyframe, sequenceKeyframeKeys));
      validateOptionalStringEnum(diagnostics, file, `${keyPath}/easing`, keyframe.easing, supportedSequenceEasings, "sequence keyframe easing must be linear or step.");
      if (typeof keyframe.time !== "number" || !Number.isFinite(keyframe.time) || keyframe.time < 0) {
        diagnostics.push(typeDiagnostic(file, `${keyPath}/time`, "sequence keyframe time must be a non-negative finite number.", keyframe.time));
        continue;
      }
      if (keyframe.time < previousTime) {
        diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_SEQUENCE_KEYFRAMES_NOT_MONOTONIC", file, message: "sequence keyframe times must be monotonic per track.", path: `${keyPath}/time`, value: keyframe.time, suggestion: "Sort keyframes by ascending time." }));
      }
      previousTime = keyframe.time;
    }
  }
  return sortAuthoringDiagnostics(diagnostics);
}

export function validateFlowStateRef(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  stateIds: Set<string>,
): void {
  validateRequiredString(diagnostics, file, path, value, "flow transition state reference must be a non-empty string.");
  if (isString(value) && !stateIds.has(value)) {
    diagnostics.push(missingReferenceDiagnostic(file, path, "flow state", value, [...stateIds]));
  }
}

export function validateFlowTrigger(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "flow trigger must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, flowTriggerKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedFlowTriggerKinds, "flow trigger kind", "Use event, timer, resourceEquals, or allCollected.");
  if (value.kind === "timer") {
    validateOptionalNonNegativeNumber(diagnostics, file, `${path}/seconds`, value.seconds, "timer trigger seconds must be a non-negative finite number.");
  }
  validateOptionalString(diagnostics, file, `${path}/event`, value.event, "flow trigger event must be a non-empty string.");
  validateOptionalString(diagnostics, file, `${path}/resource`, value.resource, "flow trigger resource must be a non-empty string.");
}

export function validateFlowActions(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push(typeDiagnostic(file, path, "flow actions must be an array.", value));
    return;
  }
  for (const [index, action] of value.entries()) {
    if (!isRecord(action)) {
      diagnostics.push(typeDiagnostic(file, `${path}/${index}`, "flow action must be an object.", action));
      continue;
    }
    const actionPath = `${path}/${index}`;
    diagnostics.push(...unknownKeyDiagnostics(file, actionPath, action, flowActionKeys));
    validateEnumString(diagnostics, file, `${actionPath}/kind`, action.kind, supportedFlowActionKinds, "flow action kind", "Use emitEvent, playSequence, setResource, sceneChange, activateUiScreen, setTimeScale, or spawnerEnable.");
    validateOptionalString(diagnostics, file, `${actionPath}/event`, action.event, "flow action event must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${actionPath}/resource`, action.resource, "flow action resource must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${actionPath}/scene`, action.scene, "flow action scene must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${actionPath}/screen`, action.screen, "flow action screen must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${actionPath}/sequence`, action.sequence, "flow action sequence must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${actionPath}/spawner`, action.spawner, "flow action spawner must be a non-empty string.");
    validateOptionalNumber(diagnostics, file, `${actionPath}/timeScale`, action.timeScale, "flow action timeScale must be a finite number.");
  }
}

export async function validateUiDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
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
  validateUiNodes(diagnostics, file, data.nodes);
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
    validateUiBindingFormat(diagnostics, file, path, binding);
  });
  return sortAuthoringDiagnostics(diagnostics);
}

export async function validatePrefabDocument(file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
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

export async function validateSystemsDocument(projectPath: string, file: string, data: unknown): Promise<IAuthoringDiagnostic[]> {
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
  const scriptLifecycles = collectIds(diagnostics, file, "/scriptLifecycles", readArray(data.scriptLifecycles), "script lifecycle", scriptLifecycleKeys);
  await validateSystems(diagnostics, projectPath, file, data.systems, systems);
  await validateScriptLifecycles(diagnostics, projectPath, file, data.scriptLifecycles, scriptLifecycles);
  return sortAuthoringDiagnostics(diagnostics);
}

export function validateUiNodes(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  for (const [index, node] of readArray(value)?.entries() ?? []) {
    if (!isRecord(node)) {
      continue;
    }
    const path = `/nodes/${index}`;
    const type = readString(node.type);
    if (node.type !== undefined && (type === undefined || !supportedUiNodeTypes.has(type))) {
      validateEnumString(diagnostics, file, `${path}/type`, node.type, supportedUiNodeTypes, "UI node type", "Use 'text', 'textInput', 'button', 'image', 'bar', 'slider', 'row', 'column', 'stack', or 'component'.");
    }
    validateOptionalString(diagnostics, file, `${path}/text`, node.text, "UI node text must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${path}/label`, node.label, "UI node label must be a non-empty string.");
    validateOptionalString(diagnostics, file, `${path}/action`, node.action, "UI node action must be a non-empty action id.");
    validateOptionalString(diagnostics, file, `${path}/src`, node.src, "UI image src must be a non-empty asset id or source path.");
    validateOptionalNumber(diagnostics, file, `${path}/value`, node.value, "UI node value must be a finite number.");
    validateUiComponentInstance(diagnostics, file, `${path}/component`, node.component);
    validateUiStyle(diagnostics, file, `${path}/style`, node.style);
    validateUiResponsiveRules(diagnostics, file, `${path}/responsive`, node.responsive);
    validateUiVirtualRange(diagnostics, file, `${path}/virtualRange`, node.virtualRange);
  }
}

export function validateUiResponsiveRules(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  const rules = readArray(value);
  if (rules === undefined) {
    diagnostics.push(typeDiagnostic(file, path, "UI responsive rules must be an array.", value));
    return;
  }
  const seen = new Set<string>();
  for (const [index, rule] of rules.entries()) {
    const rulePath = `${path}/${index}`;
    if (!isRecord(rule)) {
      diagnostics.push(typeDiagnostic(file, rulePath, "UI responsive rule must be an object.", rule));
      continue;
    }
    const target = readString(rule.target);
    if (target === undefined || !["desktop", "mobile", "tablet"].includes(target)) {
      diagnostics.push(typeDiagnostic(file, `${rulePath}/target`, "UI responsive target must be desktop, mobile, or tablet.", rule.target));
    } else if (seen.has(target)) {
      diagnostics.push(typeDiagnostic(file, `${rulePath}/target`, `UI responsive target '${target}' is duplicated.`, rule.target));
    } else {
      seen.add(target);
    }
    if (rule.layout !== undefined && !isRecord(rule.layout)) {
      diagnostics.push(typeDiagnostic(file, `${rulePath}/layout`, "UI responsive layout must be an object when present.", rule.layout));
    }
  }
}

export function validateUiVirtualRange(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "UI virtual range must be an object.", value));
    return;
  }
  for (const key of ["itemCount", "itemExtent", "viewportExtent"] as const) {
    if (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `UI virtual range ${key} must be a finite positive number.`, value[key]));
    }
  }
  if (value.buffer !== undefined && (typeof value.buffer !== "number" || !Number.isFinite(value.buffer) || value.buffer < 0)) {
    diagnostics.push(typeDiagnostic(file, `${path}/buffer`, "UI virtual range buffer must be a finite non-negative number.", value.buffer));
  }
  if (value.orientation !== undefined && value.orientation !== "horizontal" && value.orientation !== "vertical") {
    diagnostics.push(typeDiagnostic(file, `${path}/orientation`, "UI virtual range orientation must be horizontal or vertical.", value.orientation));
  }
}

export function validateUiComponentInstance(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "UI component instance must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, uiComponentInstanceKeys));
  if (readString(value.ref) === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/ref`, "UI component ref must be a non-empty component id.", value.ref));
  }
  if (value.props !== undefined && !isRecord(value.props)) {
    diagnostics.push(typeDiagnostic(file, `${path}/props`, "UI component props must be an object when present.", value.props));
  }
}

export function validateUiStyle(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "UI style must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, uiStyleKeys));
  for (const key of ["backgroundColor", "borderColor", "color"] as const) {
    validateOptionalString(diagnostics, file, `${path}/${key}`, value[key], `UI style ${key} must be a non-empty color string.`);
  }
  for (const key of ["borderRadius", "borderWidth", "fontSize", "opacity"] as const) {
    validateOptionalNumber(diagnostics, file, `${path}/${key}`, value[key], `UI style ${key} must be a finite number.`);
  }
  if (value.textAlign !== undefined) {
    validateEnumString(diagnostics, file, `${path}/textAlign`, value.textAlign, supportedUiTextAlignments, "UI text alignment", "Use 'left', 'center', or 'right'.");
  }
  if (value.textDecoration !== undefined) {
    validateEnumString(diagnostics, file, `${path}/textDecoration`, value.textDecoration, supportedUiTextDecorations, "UI text decoration", "Use 'none', 'underline', or 'lineThrough'.");
  }
  validateOptionalString(diagnostics, file, `${path}/fontWeight`, value.fontWeight, "UI style fontWeight must be a non-empty string.");
  validateOptionalBoolean(diagnostics, file, `${path}/wrap`, value.wrap, "UI style wrap must be a boolean.");
}

export function validateDocumentHeader(
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
