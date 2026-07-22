import { createHash } from "node:crypto";
import { access, mkdir, readFile, realpath, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import {
  normalizeDistribution,
  validateDistribution,
  validateDistributionProjectPaths,
  type DistributionArchitecture,
  type DistributionCapability,
  type DistributionChannel,
  type DistributionFormat,
  type DistributionPlatform,
  type DistributionRuntime,
  type IDistributionSource,
} from "@threenative/ir";
import { isGeneratedArtifactPath, normalizeRelativePath, writeAuthoringJsonDocument, type AuthoringDocumentKind, type IAuthoringDocument } from "../documents.js";
import { authoringDiagnostic, hasAuthoringErrors, sortAuthoringDiagnostics, type IAuthoringDiagnostic } from "../diagnostics.js";
import { validateMaterialDocument } from "./materialValidation.js";
import { buildUiSourceRecipe, mergeById } from "./uiRecipes.js";
import { generatedPathDiagnostic, typeDiagnostic, validateGeneratedPathString } from "./validationHelpers.js";
import { loadAuthoringProject, type IAuthoringProject } from "../project.js";
import { validateGeneratorOutputClaim } from "../generatorProvenance.js";
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
  blenderRecipeLimits,
  blenderRecipeSchema,
  img2ThreejsBudgetKeys,
  img2ThreejsExportKeys,
  img2ThreejsFactoryKeys,
  img2ThreejsProviderManifest,
  img2ThreejsRecipeKeys,
  img2ThreejsRecipeLimits,
  img2ThreejsRecipeSchema,
  img2ThreejsUpstreamKeys,
  img2ThreejsValidationKeys,
  img2ThreejsValidationResultKeys,
  img2ThreejsValidationSchema,
  img2ThreejsValidationSummaryKeys,
  img2ThreejsValidationValidatorKeys,
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
  type IImg2ThreejsAcceptedPass,
  type IImg2ThreejsRecipe,
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
  validateBlenderRecipe,
  validateProjectDocument,
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
} from "./shared.js";

export async function createRuntimeConfig(options: ICreateRuntimeConfigOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "runtime",
    id: options.runtimeId,
    file: `content/runtime/${options.runtimeId}.runtime.json`,
    data: defaultRuntimeConfigData(options.runtimeId, options.renderProfile),
  });
}

export async function createResourcesDocument(options: ICreateResourcesDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "resources",
    id: options.resourcesDocId,
    file: `content/resources/${options.resourcesDocId}.resources.json`,
    data: { schema: resourcesDocumentSchema, version: "0.1.0", id: options.resourcesDocId, resources: [] },
  });
}

export async function createFlowDocument(options: ICreateFlowDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "flow",
    id: options.flowId,
    file: `content/flow/${options.flowId}.flow.json`,
    data: {
      schema: flowDocumentSchema,
      version: "0.1.0",
      id: options.flowId,
      ...(options.scene === undefined ? {} : { scene: options.scene }),
      initial: options.initial,
      states: [{ id: options.initial }],
      transitions: [],
    },
  });
}

export async function addFlowState(options: IAddFlowStateOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "flow", options.flowId, (data, file) => {
    const states = ensureArrayProperty(data, "states");
    const existing = findSceneItem(states, options.stateId);
    const next = {
      id: options.stateId,
      ...(options.actions === undefined ? {} : { actions: options.actions.map((action) => cloneJson(action)) }),
    };
    if (existing === undefined) {
      states.push(next);
    } else {
      Object.assign(existing, next);
    }
    return validateFlowDocument(file, data);
  });
}

export async function addFlowTransition(options: IAddFlowTransitionOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "flow", options.flowId, (data, file) => {
    const transitions = ensureArrayProperty(data, "transitions");
    const existing = findSceneItem(transitions, options.transitionId);
    const next = {
      id: options.transitionId,
      from: options.from,
      to: options.to,
      trigger: cloneJson(options.trigger),
      ...(options.actions === undefined ? {} : { actions: options.actions.map((action) => cloneJson(action)) }),
    };
    if (existing === undefined) {
      transitions.push(next);
    } else {
      Object.assign(existing, next);
    }
    return validateFlowDocument(file, data);
  });
}

export async function createSequenceDocument(options: ICreateSequenceDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "sequence",
    id: options.sequenceId,
    file: `content/sequences/${options.sequenceId}.sequence.json`,
    data: {
      schema: sequenceDocumentSchema,
      version: "0.1.0",
      id: options.sequenceId,
      duration: options.duration,
      ...(options.skippable === undefined ? {} : { skippable: options.skippable }),
      tracks: [],
    },
  });
}

export async function addSequenceTrack(options: IAddSequenceTrackOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "sequence", options.sequenceId, (data, file) => {
    const tracks = ensureArrayProperty(data, "tracks");
    const existing = findSceneItem(tracks, options.trackId);
    const next = {
      id: options.trackId,
      kind: options.kind,
      ...(options.entity === undefined ? {} : { entity: options.entity }),
      keyframes: isRecord(existing) && Array.isArray(existing.keyframes) ? existing.keyframes : [],
    };
    if (existing === undefined) {
      tracks.push(next);
    } else {
      Object.assign(existing, next);
    }
    return validateSequenceDocument(file, data);
  });
}

export async function addSequenceKey(options: IAddSequenceKeyOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "sequence", options.sequenceId, (data, file) => {
    const tracks = ensureArrayProperty(data, "tracks");
    const track = findSceneItem(tracks, options.trackId);
    if (track === undefined) {
      return [missingReferenceDiagnostic(file, "/tracks", "sequence track", options.trackId, idsFromArray(tracks))];
    }
    const keyframes = ensureArrayProperty(track, "keyframes");
    keyframes.push({
      time: options.time,
      ...(options.easing === undefined ? {} : { easing: options.easing }),
      ...(options.value === undefined ? {} : { value: options.value }),
    });
    keyframes.sort((left, right) => {
      const leftTime = isRecord(left) && typeof left.time === "number" ? left.time : 0;
      const rightTime = isRecord(right) && typeof right.time === "number" ? right.time : 0;
      return leftTime - rightTime;
    });
    return validateSequenceDocument(file, data);
  });
}

export async function addResourceDocumentEntry(options: IAddResourceDocumentEntryOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "resources",
    id: options.resourcesDocId,
    file: `content/resources/${options.resourcesDocId}.resources.json`,
    emptyData: { schema: resourcesDocumentSchema, version: "0.1.0", id: options.resourcesDocId, resources: [] },
    apply: (data, file) => {
      const resources = ensureArrayProperty(data, "resources");
      if (findSceneItem(resources, options.resourceId) !== undefined) {
        return [
          authoringDiagnostic({
            code: duplicateIdCode("resource"),
            file,
            message: `Duplicate resource id '${options.resourceId}'.`,
            path: "/resources",
            value: options.resourceId,
            suggestion: "Use a new resource id or update the existing resource.",
          }),
        ];
      }
      resources.push({
        id: options.resourceId,
        ...(options.path === undefined ? {} : { path: options.path }),
        ...(options.value === undefined ? {} : { value: options.value }),
      });
      resources.sort((left, right) => String(isRecord(left) ? left.id : "").localeCompare(String(isRecord(right) ? right.id : "")));
      return [];
    },
  });
}

export async function setResourceDocumentEntry(options: ISetResourceDocumentEntryOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "resources", options.resourcesDocId, (data, file) => {
    const resources = ensureArrayProperty(data, "resources");
    const resource = findSceneItem(resources, options.resourceId);
    if (resource === undefined) {
      return [missingReferenceDiagnostic(file, "/resources", "resource", options.resourceId, idsFromArray(resources))];
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

export async function createSchemaDocument(options: ICreateSchemaDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "schema",
    id: options.schemaDocId,
    file: `content/schemas/${options.schemaDocId}.schema.json`,
    data: { schema: schemaDocumentSchema, version: "0.1.0", id: options.schemaDocId, kind: options.kind, schemas: [] },
  });
}

export async function setSchemaEntry(options: ISetSchemaEntryOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "schema",
    id: options.schemaDocId,
    file: `content/schemas/${options.schemaDocId}.schema.json`,
    emptyData: { schema: schemaDocumentSchema, version: "0.1.0", id: options.schemaDocId, kind: options.kind, schemas: [] },
    apply: (data, file) => {
      data.kind = options.kind;
      const schemas = ensureArrayProperty(data, "schemas");
      const existing = findSceneItem(schemas, options.schemaId);
      if (existing === undefined) {
        schemas.push({ id: options.schemaId, fields: options.fields });
      } else {
        existing.fields = options.fields;
      }
      schemas.sort((left, right) => String(isRecord(left) ? left.id : "").localeCompare(String(isRecord(right) ? right.id : "")));
      return validateSchemaDocumentKind(file, data.kind);
    },
  });
}

export async function createProjectMetadata(options: ICreateProjectMetadataOptions): Promise<IAuthoringOperationResult> {
  const projectId = options.projectId;
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "project",
    id: projectId,
    file: options.file ?? "content/project.authoring.json",
    emptyData: defaultProjectMetadataData(projectId),
    apply: (data) => {
      data.id = projectId;
      data.authoringVersion = options.authoringVersion ?? "0.1.0";
      data.sourceRoots = [...(options.sourceRoots ?? ["content", "src"])];
      data.buildTargets = [...(options.buildTargets ?? ["web", "desktop"])];
    },
  });
}

export async function setRuntimeWindow(options: ISetRuntimeWindowOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "runtime",
    id: options.runtimeId,
    file: `content/runtime/${options.runtimeId}.runtime.json`,
    emptyData: defaultRuntimeConfigData(options.runtimeId),
    apply: (data) => {
      const window = isRecord(data.window) ? data.window : {};
      data.window = {
        ...window,
        ...(options.height === undefined ? {} : { height: options.height }),
        ...(options.title === undefined ? {} : { title: options.title }),
        ...(options.width === undefined ? {} : { width: options.width }),
      };
    },
  });
}

export async function setRuntimeRendering(options: ISetRuntimeRenderingOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "runtime",
    id: options.runtimeId,
    file: `content/runtime/${options.runtimeId}.runtime.json`,
    emptyData: defaultRuntimeConfigData(options.runtimeId),
    apply: (data) => {
      const renderer = isRecord(data.renderer) ? data.renderer : {};
      const ambientOcclusion = isRecord(renderer.ambientOcclusion) ? renderer.ambientOcclusion : {};
      const bloom = isRecord(renderer.bloom) ? renderer.bloom : {};
      const motionBlur = isRecord(renderer.motionBlur) ? renderer.motionBlur : {};
      const renderLook = isRecord(renderer.renderLook) ? renderer.renderLook : {};
      const renderLookOverrides = isRecord(renderLook.overrides) ? renderLook.overrides : {};
      const screenSpaceGlobalIllumination = isRecord(renderer.screenSpaceGlobalIllumination) ? renderer.screenSpaceGlobalIllumination : {};
      const screenSpaceReflections = isRecord(renderer.screenSpaceReflections) ? renderer.screenSpaceReflections : {};
      const nextRenderLookOverrides = {
        ...renderLookOverrides,
        ...(options.renderLookBloomIntensity === undefined ? {} : { bloomIntensity: options.renderLookBloomIntensity }),
        ...(options.renderLookContrast === undefined ? {} : { contrast: options.renderLookContrast }),
        ...(options.renderLookEnvironmentIntensity === undefined ? {} : { environmentIntensity: options.renderLookEnvironmentIntensity }),
        ...(options.renderLookExposure === undefined ? {} : { exposure: options.renderLookExposure }),
        ...(options.renderLookSaturation === undefined ? {} : { saturation: options.renderLookSaturation }),
        ...(options.renderLookShadowQuality === undefined ? {} : { shadowQuality: options.renderLookShadowQuality }),
      };
      const shouldSetRenderLook = options.renderProfile !== undefined
        || options.renderLookBloomIntensity !== undefined
        || options.renderLookContrast !== undefined
        || options.renderLookEnvironmentIntensity !== undefined
        || options.renderLookExposure !== undefined
        || options.renderLookSaturation !== undefined
        || options.renderLookShadowQuality !== undefined;
      data.renderer = {
        ...renderer,
        ...(options.antialias === undefined ? {} : { antialias: options.antialias }),
        ...(shouldSetRenderLook
          ? {
              renderLook: {
                ...renderLook,
                version: 1,
                profile: options.renderProfile ?? renderLook.profile ?? "cinematic",
                ...(Object.keys(nextRenderLookOverrides).length === 0 ? {} : { overrides: nextRenderLookOverrides }),
              },
            }
          : {}),
        ...(options.renderPath === undefined ? {} : { renderPath: options.renderPath }),
        ...(options.ambientOcclusionEnabled === undefined
          && options.ambientOcclusionMode === undefined
          && options.ambientOcclusionRadius === undefined
          && options.ambientOcclusionIntensity === undefined
          && options.ambientOcclusionQuality === undefined
          ? {}
          : {
              ambientOcclusion: {
                ...ambientOcclusion,
                ...(options.ambientOcclusionEnabled === undefined ? {} : { enabled: options.ambientOcclusionEnabled }),
                ...(options.ambientOcclusionMode === undefined ? {} : { mode: options.ambientOcclusionMode }),
                ...(options.ambientOcclusionRadius === undefined ? {} : { radius: options.ambientOcclusionRadius }),
                ...(options.ambientOcclusionIntensity === undefined ? {} : { intensity: options.ambientOcclusionIntensity }),
                ...(options.ambientOcclusionQuality === undefined ? {} : { quality: options.ambientOcclusionQuality }),
              },
            }),
        ...(options.bloomEnabled === undefined && options.bloomIntensity === undefined && options.bloomThreshold === undefined
          ? {}
          : {
              bloom: {
                ...bloom,
                ...(options.bloomEnabled === undefined ? {} : { enabled: options.bloomEnabled }),
                ...(options.bloomIntensity === undefined ? {} : { intensity: options.bloomIntensity }),
                ...(options.bloomThreshold === undefined ? {} : { threshold: options.bloomThreshold }),
              },
            }),
        ...(options.screenSpaceReflectionsEnabled === undefined
          && options.screenSpaceReflectionsQuality === undefined
          && options.screenSpaceReflectionsRoughnessLimit === undefined
          ? {}
          : {
              screenSpaceReflections: {
                ...screenSpaceReflections,
                ...(options.screenSpaceReflectionsEnabled === undefined ? {} : { enabled: options.screenSpaceReflectionsEnabled }),
                ...(options.screenSpaceReflectionsQuality === undefined ? {} : { quality: options.screenSpaceReflectionsQuality }),
                ...(options.screenSpaceReflectionsRoughnessLimit === undefined ? {} : { roughnessLimit: options.screenSpaceReflectionsRoughnessLimit }),
              },
            }),
        ...(options.motionBlurEnabled === undefined && options.motionBlurShutterAngle === undefined
          ? {}
          : {
              motionBlur: {
                ...motionBlur,
                ...(options.motionBlurEnabled === undefined ? {} : { enabled: options.motionBlurEnabled }),
                ...(options.motionBlurShutterAngle === undefined ? {} : { shutterAngle: options.motionBlurShutterAngle }),
              },
            }),
        ...(options.screenSpaceGlobalIlluminationEnabled === undefined
          && options.screenSpaceGlobalIlluminationIntensity === undefined
          && options.screenSpaceGlobalIlluminationQuality === undefined
          && options.screenSpaceGlobalIlluminationRadius === undefined
          ? {}
          : {
              screenSpaceGlobalIllumination: {
                ...screenSpaceGlobalIllumination,
                ...(options.screenSpaceGlobalIlluminationEnabled === undefined ? {} : { enabled: options.screenSpaceGlobalIlluminationEnabled }),
                ...(options.screenSpaceGlobalIlluminationIntensity === undefined ? {} : { intensity: options.screenSpaceGlobalIlluminationIntensity }),
                ...(options.screenSpaceGlobalIlluminationQuality === undefined ? {} : { quality: options.screenSpaceGlobalIlluminationQuality }),
                ...(options.screenSpaceGlobalIlluminationRadius === undefined ? {} : { radius: options.screenSpaceGlobalIlluminationRadius }),
              },
            }),
      };
    },
  });
}

export async function setTargetProfile(options: ISetTargetProfileOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "target",
    id: options.targetProfileId,
    file: `content/targets/${options.targetProfileId}.target.json`,
    emptyData: { schema: targetProfileDocumentSchema, version: "0.1.0", id: options.targetProfileId, targets: ["web", "desktop"] },
    apply: (data) => {
      data.targets = [...options.targets];
      if (options.budgets !== undefined) {
        data.budgets = cloneJson(options.budgets);
      }
      if (options.performance !== undefined) {
        data.performance = cloneJson(options.performance);
      }
    },
  });
}

export interface ISetDistributionAppOptions extends IAuthoringOperationContext {
  appId: string;
  buildNumber?: number;
  displayName: string;
  icons?: string;
  privacyPolicyUrl?: string;
  splash?: string;
  version?: string;
}

export interface ISetDistributionTargetOptions extends IAuthoringOperationContext {
  architecture?: DistributionArchitecture;
  capabilities?: DistributionCapability[];
  channel?: DistributionChannel;
  formats: DistributionFormat[];
  minimumOs?: string;
  platform: DistributionPlatform;
  runtime: DistributionRuntime;
}

export async function setDistributionApp(options: ISetDistributionAppOptions): Promise<IAuthoringOperationResult> {
  const current = await readDistributionSource(options.projectPath);
  if (current.diagnostics.length > 0) return authoringOperationResult({ diagnostics: current.diagnostics, projectPath: options.projectPath });
  const existing = current.source === undefined ? undefined : normalizeDistribution(current.source);
  const next: IDistributionSource = {
    app: {
      buildNumber: options.buildNumber ?? existing?.app.buildNumber ?? 1,
      displayName: options.displayName,
      icons: options.icons ?? existing?.app.icons ?? "assets/distribution/icons",
      id: options.appId,
      version: options.version ?? existing?.app.version ?? "0.1.0",
      ...(options.privacyPolicyUrl === undefined ? existing?.app.privacyPolicyUrl === undefined ? {} : { privacyPolicyUrl: existing.app.privacyPolicyUrl } : { privacyPolicyUrl: options.privacyPolicyUrl }),
      ...(options.splash === undefined ? existing?.app.splash === undefined ? {} : { splash: existing.app.splash } : { splash: options.splash }),
    },
    schema: "threenative.distribution",
    ...(existing?.signing === undefined ? {} : { signing: existing.signing }),
    targets: existing?.targets ?? [{ formats: ["static", "zip", "pwa"], platform: "web", runtime: "web" }],
    version: "0.1.0",
  };
  return writeDistributionSource(options.projectPath, next);
}

export async function setDistributionTarget(options: ISetDistributionTargetOptions): Promise<IAuthoringOperationResult> {
  const current = await readDistributionSource(options.projectPath);
  if (current.diagnostics.length > 0) return authoringOperationResult({ diagnostics: current.diagnostics, projectPath: options.projectPath });
  if (current.source === undefined) {
    return authoringOperationResult({
      diagnostics: [authoringDiagnostic({
        code: "TN_AUTHORING_DISTRIBUTION_APP_REQUIRED",
        file: "content/distribution.json",
        message: "Distribution app identity must be declared before adding targets.",
        fix: { instruction: "Run distribution.set_app with a stable reverse-DNS app id and display name." },
      })],
      projectPath: options.projectPath,
    });
  }
  const next = normalizeDistribution(current.source);
  const target = {
    architecture: options.architecture,
    capabilities: options.capabilities,
    channel: options.channel,
    formats: options.formats,
    minimumOs: options.minimumOs,
    platform: options.platform,
    runtime: options.runtime,
  };
  const index = next.targets.findIndex((candidate) => candidate.platform === options.platform && candidate.runtime === options.runtime);
  const normalizedTarget = normalizeDistribution({ ...next, targets: [target] }).targets[0]!;
  if (index === -1) next.targets.push(normalizedTarget);
  else next.targets[index] = normalizedTarget;
  return writeDistributionSource(options.projectPath, next);
}

async function readDistributionSource(projectPath: string): Promise<{ diagnostics: IAuthoringDiagnostic[]; source?: unknown }> {
  const file = resolve(projectPath, "content/distribution.json");
  try {
    const source = JSON.parse(await readFile(file, "utf8")) as unknown;
    const diagnostics = distributionAuthoringDiagnostics(validateDistribution(source));
    diagnostics.push(...distributionAuthoringDiagnostics(await validateDistributionProjectPaths(source, projectPath)));
    return { diagnostics, source };
  } catch (error) {
    if (typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT") return { diagnostics: [] };
    return {
      diagnostics: [authoringDiagnostic({
        code: "TN_AUTHORING_DISTRIBUTION_READ_FAILED",
        file: "content/distribution.json",
        message: "Could not read distribution source as JSON.",
        value: error instanceof Error ? error.message : String(error),
        fix: { instruction: "Repair content/distribution.json or remove it and rerun distribution.set_app." },
      })],
    };
  }
}

async function writeDistributionSource(projectPath: string, source: IDistributionSource): Promise<IAuthoringOperationResult> {
  const normalized = normalizeDistribution(source);
  const diagnostics = distributionAuthoringDiagnostics(validateDistribution(normalized));
  diagnostics.push(...distributionAuthoringDiagnostics(await validateDistributionProjectPaths(normalized, projectPath)));
  if (hasAuthoringErrors(diagnostics)) return authoringOperationResult({ diagnostics, projectPath });
  const file = resolve(projectPath, "content/distribution.json");
  let previous = "";
  try {
    previous = await readFile(file, "utf8");
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT")) throw error;
  }
  const next = `${JSON.stringify(normalized, null, 2)}\n`;
  if (previous === next) return authoringOperationResult({ changed: false, diagnostics, projectPath });
  await mkdir(dirname(file), { recursive: true });
  await writeAuthoringJsonDocument({ data: normalized, file, kind: "distribution", projectRelativePath: "content/distribution.json" });
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: ["content/distribution.json"], projectPath });
}

function distributionAuthoringDiagnostics(diagnostics: ReturnType<typeof validateDistribution>): IAuthoringDiagnostic[] {
  return diagnostics.map((diagnostic) => authoringDiagnostic({
    code: diagnostic.code,
    file: "content/distribution.json",
    fix: diagnostic.fix,
    message: diagnostic.message,
    path: diagnostic.path,
    severity: diagnostic.severity,
    suggestion: diagnostic.suggestion,
    value: diagnostic.value,
  }));
}

export async function recordGeneratorProvenance(options: IRecordGeneratorProvenanceOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "generator",
    id: options.generatorId,
    file: `content/generators/${options.generatorId}.generator.json`,
    emptyData: { schema: generatorDocumentSchema, version: "0.1.0", id: options.generatorId, module: options.modulePath, export: options.exportName, outputs: [] },
    apply: (data) => {
      data.module = options.modulePath;
      data.export = options.exportName;
      data.outputs = [...options.outputs];
      if (options.overwritePolicy !== undefined) {
        data.overwritePolicy = options.overwritePolicy;
      }
      if (options.inputHash !== undefined) {
        data.inputHash = options.inputHash;
      }
      if (options.outputHash !== undefined) {
        data.outputHash = options.outputHash;
      }
    },
  });
}

export interface IRecordBlenderGeneratorOptions extends IAuthoringOperationContext {
  generatorId: string;
  output: string;
  overwritePolicy?: string;
  projectPath: string;
  providerVersion: string;
  recipe?: Record<string, unknown>;
  recipePath?: string;
  requestedBudgets?: Record<string, unknown>;
}

export interface IRecordBlenderGeneratorDependencies {
  writeDocument(options: Parameters<typeof writeAuthoringJsonDocument>[0]): ReturnType<typeof writeAuthoringJsonDocument>;
}

export async function recordBlenderGenerator(
  options: IRecordBlenderGeneratorOptions,
  dependencies: IRecordBlenderGeneratorDependencies = { writeDocument: writeAuthoringJsonDocument },
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const recipePath = options.recipePath ?? `content/generators/${options.generatorId}.recipe.json`;
  const provenancePath = `content/generators/${options.generatorId}.generator.json`;
  const recipeAbsolute = resolve(project.projectPath, recipePath);
  const provenanceAbsolute = resolve(project.projectPath, provenancePath);
  const normalizedRecipePath = normalizeRelativePath(relative(project.projectPath, recipeAbsolute));

  if ((options.recipe === undefined) === (options.recipePath === undefined)) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_BLENDER_RECIPE_INPUT_INVALID",
      message: "Record Blender generator requires exactly one of recipe or recipePath.",
      path: "/recipe",
      value: { recipe: options.recipe !== undefined, recipePath: options.recipePath !== undefined },
      fix: { instruction: "Provide one inline recipe object or one project-local recipe path.", allowed: ["recipe", "recipePath"] },
    }));
  }
  validateLogicalId(diagnostics, "", "/generatorId", options.generatorId, "generator");
  const recipePathContained = normalizedRecipePath === recipePath
    && normalizedRecipePath.startsWith("content/generators/")
    && normalizedRecipePath.endsWith(".recipe.json");
  if (!recipePathContained) {
    diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_PATH_INVALID", file: normalizedRecipePath, path: "/recipePath", value: options.recipePath, message: "Blender recipe path must remain inside content/generators/ and end in .recipe.json.", fix: { instruction: "Move the recipe to the durable generator source directory.", allowed: ["content/generators/<generator-id>.recipe.json"] } }));
  }

  let recipeData: unknown = options.recipe;
  if (options.recipePath !== undefined && recipePathContained) {
    try {
      const [projectRealPath, recipeRealPath] = await Promise.all([realpath(project.projectPath), realpath(recipeAbsolute)]);
      const realRelativePath = normalizeRelativePath(relative(projectRealPath, recipeRealPath));
      if (realRelativePath.startsWith("../") || realRelativePath === "..") {
        diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_PATH_INVALID", file: normalizedRecipePath, path: "/recipePath", value: options.recipePath, message: "Blender recipe path must not escape the project through a symbolic link.", fix: { instruction: "Replace the symlink with a project-local recipe file.", allowed: ["content/generators/<generator-id>.recipe.json"] } }));
      } else {
        recipeData = JSON.parse(await readFile(recipeRealPath, "utf8")) as unknown;
      }
    } catch (error) {
      diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_READ_FAILED", file: normalizedRecipePath, message: `Could not read Blender recipe '${normalizedRecipePath}'.`, value: error instanceof Error ? error.message : String(error), fix: { instruction: "Create a valid JSON recipe at the project-local path or pass an inline recipe.", allowed: ["recipe", "recipePath"] } }));
    }
  } else if (isRecord(recipeData)) {
    if (recipeData.schema !== undefined && recipeData.schema !== blenderRecipeSchema) {
      diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_SCHEMA_INVALID", file: normalizedRecipePath, path: "/schema", value: recipeData.schema, message: `Blender recipe must use schema '${blenderRecipeSchema}'.`, fix: { instruction: "Use the supported bounded recipe schema.", allowed: [blenderRecipeSchema] } }));
    }
    if (recipeData.version !== undefined && recipeData.version !== "0.1.0") {
      diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_VERSION_INVALID", file: normalizedRecipePath, path: "/version", value: recipeData.version, message: "Blender recipe version must be '0.1.0'.", fix: { instruction: "Use the supported bounded recipe version.", allowed: ["0.1.0"] } }));
    }
    if (recipeData.id !== undefined && recipeData.id !== options.generatorId) {
      diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_ID_MISMATCH", file: normalizedRecipePath, path: "/id", value: recipeData.id, message: "Blender recipe id must match its generator id.", fix: { instruction: "Use the same stable logical id in the recipe and generator provenance.", allowed: [options.generatorId] } }));
    }
    const authoredBudgets = isRecord(recipeData.budgets) ? recipeData.budgets : {};
    const requestedBudgets = options.requestedBudgets ?? {};
    if (authoredBudgets.maxPolygons === undefined && requestedBudgets.maxPolygons === undefined) {
      diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_BUDGET_REQUIRED", file: normalizedRecipePath, path: "/budgets/maxPolygons", message: "Blender recipe must explicitly request a polygon budget.", fix: { instruction: "Set a conservative maximum polygon count.", allowed: [`1..${blenderRecipeLimits.maxPolygons}`] } }));
    }
    if (authoredBudgets.maxOutputBytes === undefined && requestedBudgets.maxOutputBytes === undefined) {
      diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_BUDGET_REQUIRED", file: normalizedRecipePath, path: "/budgets/maxOutputBytes", message: "Blender recipe must explicitly request an output-size budget.", fix: { instruction: "Set a conservative maximum GLB byte size.", allowed: [`1..${blenderRecipeLimits.maxOutputBytes}`] } }));
    }
    recipeData = {
      ...cloneJson(recipeData) as Record<string, unknown>,
      budgets: { ...blenderRecipeLimits, ...authoredBudgets, ...requestedBudgets },
      id: recipeData.id ?? options.generatorId,
      schema: recipeData.schema ?? blenderRecipeSchema,
      version: recipeData.version ?? "0.1.0",
    };
  }

  diagnostics.push(...validateBlenderRecipe(normalizedRecipePath, recipeData));
  if (isRecord(recipeData) && recipeData.id !== options.generatorId) {
    diagnostics.push(authoringDiagnostic({ code: "TN_AUTHORING_BLENDER_RECIPE_ID_MISMATCH", file: normalizedRecipePath, path: "/id", value: recipeData.id, message: "Blender recipe id must match its generator id.", fix: { instruction: "Use the same stable logical id in the recipe and generator provenance.", allowed: [options.generatorId] } }));
  }
  const provenanceData: Record<string, unknown> = {
    schema: generatorDocumentSchema,
    version: "0.1.0",
    id: options.generatorId,
    provider: "blender",
    providerVersion: options.providerVersion,
    recipe: normalizedRecipePath,
    outputs: [options.output],
    overwritePolicy: options.overwritePolicy ?? "manual",
  };
  diagnostics.push(...await validateGeneratorDocument(provenancePath, provenanceData));
  if (hasAuthoringErrors(diagnostics)) return authoringOperationResult({ diagnostics, projectPath: project.projectPath });

  const filesWritten = [provenancePath];
  let previousRecipe: string | undefined;
  let previousProvenance: string | undefined;
  try {
    await mkdir(dirname(provenanceAbsolute), { recursive: true });
    previousRecipe = options.recipePath === undefined ? await readOptionalFile(recipeAbsolute) : undefined;
    previousProvenance = await readOptionalFile(provenanceAbsolute);
    if (options.recipePath === undefined) {
      await dependencies.writeDocument({ data: recipeData, file: recipeAbsolute, kind: "unknown", projectRelativePath: normalizedRecipePath });
      filesWritten.push(normalizedRecipePath);
    }
    await dependencies.writeDocument({ data: provenanceData, file: provenanceAbsolute, kind: "generator", projectRelativePath: provenancePath });
  } catch (error) {
    const restoreResults = await Promise.allSettled([
      ...(options.recipePath === undefined ? [restoreOptionalFile(recipeAbsolute, previousRecipe)] : []),
      restoreOptionalFile(provenanceAbsolute, previousProvenance),
    ]);
    const restoreFailures = restoreResults
      .filter((result): result is PromiseRejectedResult => result.status === "rejected")
      .map((result) => errorMessage(result.reason));
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_BLENDER_RECORD_WRITE_FAILED",
      file: provenancePath,
      message: `Could not atomically record Blender generator '${options.generatorId}'. Prior recipe and provenance files were restored.`,
      value: { cause: errorMessage(error), restoreFailures },
      fix: { instruction: "Check project file permissions and retry the bounded generator record operation.", allowed: [normalizedRecipePath, provenancePath] },
    }));
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: filesWritten.sort(), projectPath: project.projectPath });
}

export interface IRecordImg2ThreejsGeneratorOptions extends IAuthoringOperationContext {
  generatorId: string;
  output: string;
  overwritePolicy?: string;
  projectPath: string;
  recipePath: string;
}

export interface IRecordImg2ThreejsGeneratorDependencies {
  writeDocument(options: Parameters<typeof writeAuthoringJsonDocument>[0]): ReturnType<typeof writeAuthoringJsonDocument>;
}

interface IContainedImg2ThreejsResource {
  bytes: Buffer;
  path: string;
  sha256: string;
}

interface IValidatedImg2ThreejsWorkspace {
  acceptedPasses: IImg2ThreejsAcceptedPass[];
  evidenceResources: IContainedImg2ThreejsResource[];
  factory: IContainedImg2ThreejsResource;
  recipe: IImg2ThreejsRecipe;
  recipeResource: IContainedImg2ThreejsResource;
  sculptSpec: IContainedImg2ThreejsResource;
  sourceImage: IContainedImg2ThreejsResource;
  textureResources: IContainedImg2ThreejsResource[];
  validationReport: IContainedImg2ThreejsResource;
}

const img2ThreejsVisualPasses = new Set(["blockout", "structural-pass", "form-refinement", "material-pass", "surface-pass", "lighting-pass", "interaction-pass"]);

export async function recordImg2ThreejsGenerator(
  options: IRecordImg2ThreejsGeneratorOptions,
  dependencies: IRecordImg2ThreejsGeneratorDependencies = { writeDocument: writeAuthoringJsonDocument },
): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/generatorId", options.generatorId, "generator");
  const overwritePolicy = options.overwritePolicy === "replace" || options.overwritePolicy === "skip" || options.overwritePolicy === "manual"
    ? options.overwritePolicy
    : "manual";
  if (options.overwritePolicy !== undefined && overwritePolicy !== options.overwritePolicy) {
    diagnostics.push(img2ThreejsDiagnostic(options.recipePath, "/overwritePolicy", "TN_IMG2THREEJS_RECIPE_INVALID", "Overwrite policy must be manual, replace, or skip.", options.overwritePolicy, ["manual", "replace", "skip"]));
  }

  const workspace = await validateImg2ThreejsWorkspace(project.projectPath, options, diagnostics);
  diagnostics.push(...await validateGeneratorOutputClaim({
    generatorId: options.generatorId,
    output: options.output,
    overwritePolicy,
    projectPath: project.projectPath,
    provider: "img2threejs",
  }));
  if (workspace === undefined || hasAuthoringErrors(diagnostics)) {
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }

  const sourceHashes = {
    factory: workspace.factory.sha256,
    recipe: workspace.recipeResource.sha256,
    resources: workspace.textureResources.map((resource) => ({ path: resource.path, sha256: resource.sha256 })),
    sculptSpec: workspace.sculptSpec.sha256,
    sourceImage: workspace.sourceImage.sha256,
    validationReport: workspace.validationReport.sha256,
  };
  const inputHash = hashImg2ThreejsInput([
    ["recipe", workspace.recipeResource],
    ["sourceImage", workspace.sourceImage],
    ["sculptSpec", workspace.sculptSpec],
    ["factory", workspace.factory],
    ["validationReport", workspace.validationReport],
    ...workspace.textureResources.map((resource): [string, IContainedImg2ThreejsResource] => ["resource", resource]),
    ...workspace.evidenceResources.map((resource): [string, IContainedImg2ThreejsResource] => ["reviewEvidence", resource]),
  ]);
  const provenancePath = `content/generators/${options.generatorId}.generator.json`;
  const provenanceAbsolute = resolve(project.projectPath, provenancePath);
  const normalizedOutput = normalizeRelativePath(options.output);
  const previousDocument = project.documents.find((document) => document.kind === "generator" && document.projectRelativePath === provenancePath);
  const previousData = isRecord(previousDocument?.data) ? previousDocument.data : undefined;
  const preserveAcceptedRun = previousData?.provider === "img2threejs"
    && previousData.id === options.generatorId
    && Array.isArray(previousData.outputs)
    && previousData.outputs.length === 1
    && previousData.outputs[0] === normalizedOutput;
  const provenanceData = {
    acceptedPasses: workspace.acceptedPasses,
    budgets: workspace.recipe.budgets,
    export: workspace.recipe.factory.export,
    id: options.generatorId,
    inputHash,
    module: workspace.recipe.factory.module,
    outputs: [normalizedOutput],
    overwritePolicy,
    provider: "img2threejs",
    providerVersion: workspace.recipe.upstream.skillVersion,
    recipe: workspace.recipeResource.path,
    schema: generatorDocumentSchema,
    sculptSpec: workspace.sculptSpec.path,
    sourceHashes,
    sourceImage: workspace.sourceImage.path,
    upstream: {
      commit: workspace.recipe.upstream.commit,
      internalForkTree: img2ThreejsProviderManifest.internalForkTree,
      repository: workspace.recipe.upstream.repository,
      skillVersion: workspace.recipe.upstream.skillVersion,
    },
    version: "0.1.0",
    ...(preserveAcceptedRun && typeof previousData.outputHash === "string" && /^sha256:[a-f0-9]{64}$/u.test(previousData.outputHash) ? { outputHash: previousData.outputHash } : {}),
    ...(preserveAcceptedRun && isRecord(previousData.lastRun) ? { lastRun: structuredClone(previousData.lastRun) } : {}),
  };
  diagnostics.push(...await validateGeneratorDocument(provenancePath, provenanceData));
  if (hasAuthoringErrors(diagnostics)) return authoringOperationResult({ diagnostics, projectPath: project.projectPath });

  const previousProvenance = await readOptionalFile(provenanceAbsolute);
  try {
    await mkdir(dirname(provenanceAbsolute), { recursive: true });
    await dependencies.writeDocument({ data: provenanceData, file: provenanceAbsolute, kind: "generator", projectRelativePath: provenancePath });
  } catch (error) {
    const restoreFailures: string[] = [];
    try {
      await restoreOptionalFile(provenanceAbsolute, previousProvenance);
    } catch (restoreError) {
      restoreFailures.push(errorMessage(restoreError));
    }
    diagnostics.push(img2ThreejsDiagnostic(provenancePath, "", "TN_IMG2THREEJS_RECIPE_INVALID", `Could not atomically record img2threejs generator '${options.generatorId}'. Prior provenance was restored.`, { cause: errorMessage(error), restoreFailures }, [provenancePath]));
    return authoringOperationResult({ diagnostics, projectPath: project.projectPath });
  }
  return authoringOperationResult({ changed: true, diagnostics, filesWritten: [provenancePath], projectPath: project.projectPath });
}

async function validateImg2ThreejsWorkspace(
  projectPath: string,
  options: IRecordImg2ThreejsGeneratorOptions,
  diagnostics: IAuthoringDiagnostic[],
): Promise<IValidatedImg2ThreejsWorkspace | undefined> {
  const recipeResource = await readImg2ThreejsResource(projectPath, options.recipePath, "/recipePath", ["content/generators/"], diagnostics, ".img2threejs.json");
  await validateImg2ThreejsOutputPath(projectPath, options.output, diagnostics);
  if (recipeResource === undefined) return undefined;
  let parsedRecipe: unknown;
  try {
    parsedRecipe = JSON.parse(recipeResource.bytes.toString("utf8")) as unknown;
  } catch (error) {
    diagnostics.push(img2ThreejsDiagnostic(recipeResource.path, "", "TN_IMG2THREEJS_RECIPE_INVALID", "img2threejs recipe must contain valid JSON.", errorMessage(error), ["Regenerate the provider recipe through the internal img2threejs skill."]));
    return undefined;
  }
  const recipe = validateImg2ThreejsRecipe(recipeResource.path, parsedRecipe, options.generatorId, diagnostics);
  if (recipe === undefined) return undefined;

  if (recipe.upstream.repository !== img2ThreejsProviderManifest.repository
    || recipe.upstream.commit !== img2ThreejsProviderManifest.reviewedCommit
    || recipe.upstream.skillVersion !== img2ThreejsProviderManifest.skillVersion) {
    diagnostics.push(img2ThreejsDiagnostic(recipeResource.path, "/upstream/commit", "TN_IMG2THREEJS_UPSTREAM_UNREVIEWED", `Recipe names an unreviewed img2threejs upstream. Supported commit is '${img2ThreejsProviderManifest.reviewedCommit}' from skill ${img2ThreejsProviderManifest.skillVersion}.`, recipe.upstream, ["Use the supported internal skill or complete docs/vendor/img2threejs.md upgrade gates."]));
  }

  const [sourceImage, sculptSpec, factory, validationReport] = await Promise.all([
    readImg2ThreejsResource(projectPath, recipe.sourceImage, "/sourceImage", ["content/references/"], diagnostics),
    readImg2ThreejsResource(projectPath, recipe.sculptSpec, "/sculptSpec", ["content/generators/"], diagnostics, ".sculpt-spec.json"),
    readImg2ThreejsResource(projectPath, recipe.factory.module, "/factory/module", ["src/generators/"], diagnostics, ".ts"),
    readImg2ThreejsResource(projectPath, recipe.validationReport, "/validationReport", ["content/generators/"], diagnostics, ".validation.json"),
  ]);
  if (sourceImage === undefined || sculptSpec === undefined || factory === undefined || validationReport === undefined) return undefined;

  let spec: unknown;
  try {
    spec = JSON.parse(sculptSpec.bytes.toString("utf8")) as unknown;
  } catch (error) {
    diagnostics.push(img2ThreejsDiagnostic(sculptSpec.path, "", "TN_IMG2THREEJS_SPEC_INVALID", "Sculpt spec must contain valid JSON.", errorMessage(error), [img2ThreejsValidatorCommand(sculptSpec.path)]));
    return undefined;
  }
  if (!isRecord(spec)) {
    diagnostics.push(img2ThreejsDiagnostic(sculptSpec.path, "", "TN_IMG2THREEJS_SPEC_INVALID", "Sculpt spec must be a JSON object.", spec, [img2ThreejsValidatorCommand(sculptSpec.path)]));
    return undefined;
  }
  validateImg2ThreejsSpecShape(sculptSpec.path, spec, recipe, diagnostics);
  validateImg2ThreejsValidationReport(validationReport.path, validationReport.bytes, sculptSpec, spec, diagnostics);
  const texturePaths = collectImg2ThreejsTexturePaths(sculptSpec.path, spec, diagnostics);
  const textureResources = (await Promise.all(texturePaths.map((path, index) => readImg2ThreejsResource(projectPath, path, `/materials/resources/${index}`, ["content/", "assets/"], diagnostics)))).filter((resource): resource is IContainedImg2ThreejsResource => resource !== undefined);
  const review = await deriveImg2ThreejsAcceptedPasses(projectPath, sculptSpec.path, spec, diagnostics);
  if (hasAuthoringErrors(diagnostics) || review === undefined) return undefined;
  return { acceptedPasses: review.acceptedPasses, evidenceResources: review.evidenceResources, factory, recipe, recipeResource, sculptSpec, sourceImage, textureResources, validationReport };
}

function validateImg2ThreejsRecipe(file: string, value: unknown, generatorId: string, diagnostics: IAuthoringDiagnostic[]): IImg2ThreejsRecipe | undefined {
  if (!isRecord(value)) {
    diagnostics.push(img2ThreejsDiagnostic(file, "", "TN_IMG2THREEJS_RECIPE_INVALID", "img2threejs recipe must be a JSON object.", value, ["Regenerate the recipe through the internal img2threejs skill."]));
    return undefined;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", value, img2ThreejsRecipeKeys).map(asImg2ThreejsRecipeDiagnostic));
  const nested: Array<[string, unknown, ReadonlySet<string>]> = [
    ["/factory", value.factory, img2ThreejsFactoryKeys],
    ["/upstream", value.upstream, img2ThreejsUpstreamKeys],
    ["/export", value.export, img2ThreejsExportKeys],
    ["/budgets", value.budgets, img2ThreejsBudgetKeys],
  ];
  for (const [path, item, keys] of nested) {
    if (!isRecord(item)) diagnostics.push(img2ThreejsDiagnostic(file, path, "TN_IMG2THREEJS_RECIPE_INVALID", `${path.slice(1)} must be an object.`, item, ["Regenerate the recipe through the internal img2threejs skill."]));
    else diagnostics.push(...unknownKeyDiagnostics(file, path, item, keys).map(asImg2ThreejsRecipeDiagnostic));
  }
  if (value.schema !== img2ThreejsRecipeSchema) diagnostics.push(img2ThreejsDiagnostic(file, "/schema", "TN_IMG2THREEJS_RECIPE_INVALID", `Recipe schema must be '${img2ThreejsRecipeSchema}'.`, value.schema, [img2ThreejsRecipeSchema]));
  if (value.version !== "0.1.0") diagnostics.push(img2ThreejsDiagnostic(file, "/version", "TN_IMG2THREEJS_RECIPE_INVALID", "Recipe version must be '0.1.0'.", value.version, ["0.1.0"]));
  if (value.id !== generatorId) diagnostics.push(img2ThreejsDiagnostic(file, "/id", "TN_IMG2THREEJS_RECIPE_INVALID", "Recipe id must match the generator id.", value.id, [generatorId]));
  for (const [path, item] of [["/sourceImage", value.sourceImage], ["/sculptSpec", value.sculptSpec], ["/validationReport", value.validationReport]] as const) {
    if (typeof item !== "string" || item.trim() === "") diagnostics.push(img2ThreejsDiagnostic(file, path, "TN_IMG2THREEJS_RECIPE_INVALID", `${path.slice(1)} must be a non-empty project-relative path.`, item, ["Use a durable project-local path."]));
  }
  if (isRecord(value.factory)) {
    for (const field of ["module", "export"] as const) if (typeof value.factory[field] !== "string" || value.factory[field].trim() === "") diagnostics.push(img2ThreejsDiagnostic(file, `/factory/${field}`, "TN_IMG2THREEJS_RECIPE_INVALID", `factory.${field} must be a non-empty string.`, value.factory[field], ["Declare the named project-local factory export."]));
  }
  if (isRecord(value.upstream)) for (const field of ["repository", "commit", "skillVersion"] as const) if (typeof value.upstream[field] !== "string" || value.upstream[field].trim() === "") diagnostics.push(img2ThreejsDiagnostic(file, `/upstream/${field}`, "TN_IMG2THREEJS_RECIPE_INVALID", `upstream.${field} must be a non-empty string.`, value.upstream[field], ["Regenerate the recipe through the supported internal skill."]));
  if (isRecord(value.export)) {
    if (typeof value.export.rootNode !== "string" || value.export.rootNode.trim() === "") diagnostics.push(img2ThreejsDiagnostic(file, "/export/rootNode", "TN_IMG2THREEJS_RECIPE_INVALID", "export.rootNode must be a non-empty stable node name.", value.export.rootNode, [generatorId]));
    if (value.export.embedTextures !== true) diagnostics.push(img2ThreejsDiagnostic(file, "/export/embedTextures", "TN_IMG2THREEJS_RECIPE_INVALID", "Initial provider output must embed supported textures.", value.export.embedTextures, ["true"]));
    if (typeof value.export.includeRuntimeExtras !== "boolean") diagnostics.push(img2ThreejsDiagnostic(file, "/export/includeRuntimeExtras", "TN_IMG2THREEJS_RECIPE_INVALID", "export.includeRuntimeExtras must be a boolean.", value.export.includeRuntimeExtras, ["true", "false"]));
  }
  if (isRecord(value.budgets)) {
    for (const [key, hardLimit] of Object.entries(img2ThreejsRecipeLimits)) {
      const requested = value.budgets[key];
      if (!Number.isInteger(requested) || typeof requested !== "number" || requested <= 0 || requested > hardLimit) diagnostics.push(img2ThreejsDiagnostic(file, `/budgets/${key}`, "TN_IMG2THREEJS_RECIPE_INVALID", `Budget '${key}' must be a positive integer no greater than ${hardLimit}.`, requested, [`1..${hardLimit}`]));
    }
  }
  return hasAuthoringErrors(diagnostics) ? undefined : value as unknown as IImg2ThreejsRecipe;
}

function validateImg2ThreejsSpecShape(file: string, spec: Record<string, unknown>, recipe: IImg2ThreejsRecipe, diagnostics: IAuthoringDiagnostic[]): void {
  const required: Array<[string, "array" | "object" | "string"]> = [
    ["targetName", "string"], ["suitability", "string"], ["coordinateFrame", "object"], ["silhouette", "object"],
    ["componentTree", "array"], ["materials", "array"], ["proceduralStrategy", "array"], ["buildPasses", "array"], ["reviewHistory", "array"], ["sculptPipeline", "object"],
  ];
  for (const [key, kind] of required) {
    const item = spec[key];
    const valid = kind === "array" ? Array.isArray(item) && item.length > 0 : kind === "object" ? isRecord(item) && Object.keys(item).length > 0 : typeof item === "string" && item.trim() !== "";
    if (!valid) diagnostics.push(img2ThreejsDiagnostic(file, `/${key}`, "TN_IMG2THREEJS_SPEC_INVALID", `Strict img2threejs spec requires ${key} to be a non-empty ${kind === "string" ? "string" : kind}.`, item, [img2ThreejsValidatorCommand(file)]));
  }
  if (typeof spec.sourceImage !== "string" || normalizeRelativePath(spec.sourceImage) !== normalizeRelativePath(recipe.sourceImage)) diagnostics.push(img2ThreejsDiagnostic(file, "/sourceImage", "TN_IMG2THREEJS_SPEC_INVALID", "Sculpt spec sourceImage must match the provider recipe.", spec.sourceImage, [recipe.sourceImage]));
  if (Array.isArray(spec.buildPasses) && spec.buildPasses.length === 0) diagnostics.push(img2ThreejsDiagnostic(file, "/buildPasses", "TN_IMG2THREEJS_SPEC_INVALID", "Sculpt spec must declare at least one ordered build pass.", spec.buildPasses, [img2ThreejsValidatorCommand(file)]));
}

function validateImg2ThreejsValidationReport(file: string, bytes: Buffer, sculptSpec: IContainedImg2ThreejsResource, spec: Record<string, unknown>, diagnostics: IAuthoringDiagnostic[]): void {
  let value: unknown;
  try {
    value = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    diagnostics.push(img2ThreejsDiagnostic(file, "", "TN_IMG2THREEJS_SPEC_INVALID", "Strict validator report must contain valid JSON.", errorMessage(error), [img2ThreejsValidatorCommand(sculptSpec.path)]));
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(img2ThreejsDiagnostic(file, "", "TN_IMG2THREEJS_SPEC_INVALID", "Strict validator report must be a JSON object.", value, [img2ThreejsValidatorCommand(sculptSpec.path)]));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "", value, img2ThreejsValidationKeys).map(asImg2ThreejsSpecDiagnostic));
  if (value.schema !== img2ThreejsValidationSchema || value.version !== "0.1.0") diagnostics.push(img2ThreejsDiagnostic(file, "/schema", "TN_IMG2THREEJS_SPEC_INVALID", `Strict validator report must use ${img2ThreejsValidationSchema} version 0.1.0.`, { schema: value.schema, version: value.version }, [img2ThreejsValidatorCommand(sculptSpec.path)]));
  if (value.sculptSpecHash !== sculptSpec.sha256) diagnostics.push(img2ThreejsDiagnostic(file, "/sculptSpecHash", "TN_IMG2THREEJS_SPEC_INVALID", "Strict validator report is stale for the current sculpt spec bytes.", value.sculptSpecHash, [img2ThreejsValidatorCommand(sculptSpec.path)]));
  const validator = value.validator;
  if (!isRecord(validator)) diagnostics.push(img2ThreejsDiagnostic(file, "/validator", "TN_IMG2THREEJS_SPEC_INVALID", "Strict validator identity must be an object.", validator, [img2ThreejsValidatorCommand(sculptSpec.path)]));
  else {
    diagnostics.push(...unknownKeyDiagnostics(file, "/validator", validator, img2ThreejsValidationValidatorKeys).map(asImg2ThreejsSpecDiagnostic));
    const expected = { command: img2ThreejsValidatorCommand(sculptSpec.path), commit: img2ThreejsProviderManifest.reviewedCommit, repository: img2ThreejsProviderManifest.repository, skillVersion: img2ThreejsProviderManifest.skillVersion };
    for (const [key, expectedValue] of Object.entries(expected)) if (validator[key] !== expectedValue) diagnostics.push(img2ThreejsDiagnostic(file, `/validator/${key}`, "TN_IMG2THREEJS_SPEC_INVALID", `Strict validator ${key} must match the reviewed provider contract.`, validator[key], [expectedValue]));
  }
  const result = value.result;
  if (!isRecord(result)) {
    diagnostics.push(img2ThreejsDiagnostic(file, "/result", "TN_IMG2THREEJS_SPEC_INVALID", "Strict validator result must be an object.", result, [img2ThreejsValidatorCommand(sculptSpec.path)]));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/result", result, img2ThreejsValidationResultKeys).map(asImg2ThreejsSpecDiagnostic));
  if (result.ok !== true || !Array.isArray(result.errors) || result.errors.length !== 0 || !Array.isArray(result.warnings) || !result.warnings.every((warning) => typeof warning === "string")) diagnostics.push(img2ThreejsDiagnostic(file, "/result", "TN_IMG2THREEJS_SPEC_INVALID", "Pinned strict-quality validation must report ok=true, no errors, and structured warnings.", result, [img2ThreejsValidatorCommand(sculptSpec.path)]));
  const summary = result.summary;
  if (!isRecord(summary)) diagnostics.push(img2ThreejsDiagnostic(file, "/result/summary", "TN_IMG2THREEJS_SPEC_INVALID", "Strict validator summary must be an object.", summary, [img2ThreejsValidatorCommand(sculptSpec.path)]));
  else {
    diagnostics.push(...unknownKeyDiagnostics(file, "/result/summary", summary, img2ThreejsValidationSummaryKeys).map(asImg2ThreejsSpecDiagnostic));
    const expected = { components: Array.isArray(spec.componentTree) ? spec.componentTree.length : 0, materials: Array.isArray(spec.materials) ? spec.materials.length : 0, suitability: spec.suitability, targetName: spec.targetName };
    for (const [key, expectedValue] of Object.entries(expected)) if (summary[key] !== expectedValue) diagnostics.push(img2ThreejsDiagnostic(file, `/result/summary/${key}`, "TN_IMG2THREEJS_SPEC_INVALID", `Strict validator summary ${key} is stale.`, summary[key], [String(expectedValue)]));
  }
}

async function deriveImg2ThreejsAcceptedPasses(projectPath: string, file: string, spec: Record<string, unknown>, diagnostics: IAuthoringDiagnostic[]): Promise<{ acceptedPasses: IImg2ThreejsAcceptedPass[]; evidenceResources: IContainedImg2ThreejsResource[] } | undefined> {
  if (!Array.isArray(spec.buildPasses) || !Array.isArray(spec.reviewHistory) || !isRecord(spec.sculptPipeline)) return undefined;
  const buildPasses: Array<{ id: string; value: Record<string, unknown> }> = [];
  const ids = new Set<string>();
  spec.buildPasses.forEach((value, index) => {
    if (!isRecord(value) || typeof value.id !== "string" || value.id.trim() === "" || ids.has(value.id)) {
      diagnostics.push(img2ThreejsDiagnostic(file, `/buildPasses/${index}/id`, "TN_IMG2THREEJS_SPEC_INVALID", "Every build pass must have a unique non-empty id.", isRecord(value) ? value.id : value, [img2ThreejsValidatorCommand(file)]));
      return;
    }
    ids.add(value.id);
    buildPasses.push({ id: value.id, value });
  });
  const passOrder = spec.sculptPipeline.passOrder;
  if (spec.sculptPipeline.passGateMode !== "locked-sequential" || !Array.isArray(passOrder) || !sameStringArray(passOrder, buildPasses.map((pass) => pass.id))) {
    diagnostics.push(img2ThreejsDiagnostic(file, "/sculptPipeline", "TN_IMG2THREEJS_SPEC_INVALID", "Sculpt pipeline must use locked-sequential mode with passOrder matching buildPasses.", spec.sculptPipeline, ["python3 forge/stage3_build/orchestrate_passes.py sync <spec> --in-place --json"]));
  }
  const acceptedPasses: IImg2ThreejsAcceptedPass[] = [];
  const evidenceByPath = new Map<string, IContainedImg2ThreejsResource>();
  let previousIndex = -1;
  for (const pass of buildPasses) {
    const matching = spec.reviewHistory.map((entry, index) => ({ entry, index })).filter((candidate) => isRecord(candidate.entry) && candidate.entry.passId === pass.id);
    const selected = matching.at(-1);
    if (selected === undefined || !isRecord(selected.entry)) {
      diagnostics.push(img2ThreejsDiagnostic(file, "/reviewHistory", "TN_IMG2THREEJS_REVIEW_INCOMPLETE", `Build pass '${pass.id}' is incomplete: no review exists.`, { passId: pass.id }, [`Resume '${pass.id}' in the internal img2threejs skill and append an accepted review.`]));
      return undefined;
    }
    const failure = selected.index <= previousIndex ? "review order is not contiguous" : reviewCompletionFailure(spec, selected.entry, pass.id);
    if (failure !== undefined) {
      diagnostics.push(img2ThreejsDiagnostic(file, `/reviewHistory`, "TN_IMG2THREEJS_REVIEW_INCOMPLETE", `Build pass '${pass.id}' is incomplete: ${failure}.`, { passId: pass.id }, [`Resume '${pass.id}' in the internal img2threejs skill and append an accepted review.`]));
      return undefined;
    }
    previousIndex = selected.index;
    const evidence: Array<{ path: string; sha256: string }> = [];
    if (img2ThreejsVisualPasses.has(pass.id)) {
      const visual = selected.entry.visualEvidence as Record<string, unknown>;
      for (const [field, path] of [["referenceScreenshot", visual.referenceScreenshot], ["renderScreenshot", visual.renderScreenshot], ["comparisonImage", visual.comparisonImage]] as const) {
        const resource = typeof path === "string" ? await readImg2ThreejsResource(projectPath, path, `/reviewHistory/${selected.index}/visualEvidence/${field}`, ["content/", "artifacts/"], diagnostics) : undefined;
        if (resource !== undefined) {
          evidenceByPath.set(resource.path, resource);
          evidence.push({ path: resource.path, sha256: resource.sha256 });
        }
      }
    }
    acceptedPasses.push({ evidence, id: pass.id, reviewHash: sha256(Buffer.from(stableImg2ThreejsJson({ buildPass: pass.value, review: selected.entry }), "utf8")) });
  }
  if (spec.sculptPipeline.currentPass !== "complete" || !sameStringArray(spec.sculptPipeline.completedPasses, acceptedPasses.map((pass) => pass.id))) {
    diagnostics.push(img2ThreejsDiagnostic(file, "/sculptPipeline", "TN_IMG2THREEJS_SPEC_INVALID", "Sculpt pipeline completion metadata is out of sync with accepted review history.", spec.sculptPipeline, ["python3 forge/stage3_build/orchestrate_passes.py sync <spec> --in-place --json"]));
  }
  return hasAuthoringErrors(diagnostics) ? undefined : { acceptedPasses, evidenceResources: [...evidenceByPath.values()].sort((left, right) => left.path.localeCompare(right.path)) };
}

function reviewCompletionFailure(spec: Record<string, unknown>, review: Record<string, unknown>, passId: string): string | undefined {
  if (review.action !== "continue") return `latest decision is '${String(review.action)}', not 'continue'`;
  if (!img2ThreejsVisualPasses.has(passId)) return undefined;
  if (!isRecord(review.visualEvidence) || typeof review.visualEvidence.referenceScreenshot !== "string" || review.visualEvidence.referenceScreenshot === "" || typeof review.visualEvidence.renderScreenshot !== "string" || review.visualEvidence.renderScreenshot === "" || typeof review.visualEvidence.comparisonImage !== "string" || review.visualEvidence.comparisonImage === "") return "reference, render, and comparison evidence are required";
  const score = review.aiVisionScore;
  const threshold = review.visualAcceptanceThreshold ?? 0.7;
  if (typeof score !== "number" || typeof threshold !== "number" || !Number.isFinite(score) || !Number.isFinite(threshold) || score < threshold) return "AI vision score does not meet its threshold";
  const loop = isRecord(spec.selfCorrectLoop) ? spec.selfCorrectLoop : {};
  const acceptance = isRecord(loop.visualAcceptance) ? loop.visualAcceptance : {};
  if (acceptance.layerScoresRequired === true) {
    const layerScores = isRecord(review.layerScores) ? review.layerScores : undefined;
    if (layerScores === undefined || Object.keys(layerScores).length === 0) return "required layer scores are missing";
    if (Array.isArray(acceptance.requiredLayerScores) && acceptance.requiredLayerScores.some((layer) => typeof layer === "string" && !(layer in layerScores))) return "one or more required layer scores are missing";
  }
  return img2ThreejsFeatureGateFailure(spec, review, passId);
}

function img2ThreejsFeatureGateFailure(spec: Record<string, unknown>, review: Record<string, unknown>, passId: string): string | undefined {
  const loop = isRecord(spec.selfCorrectLoop) ? spec.selfCorrectLoop : {};
  const acceptance = isRecord(loop.visualAcceptance) ? loop.visualAcceptance : {};
  const policy = isRecord(acceptance.featureReviewPolicy) ? acceptance.featureReviewPolicy : {};
  if (policy.enabled !== true) return undefined;
  const targets = Array.isArray(spec.featureReviewTargets) ? spec.featureReviewTargets.filter((target): target is Record<string, unknown> => isRecord(target) && Array.isArray(target.passIds) && target.passIds.includes(passId)) : [];
  const reviews = new Map((Array.isArray(review.featureReviews) ? review.featureReviews : []).filter(isRecord).map((item) => [item.id, item]));
  const defaultThreshold = typeof policy.criticalDefaultThreshold === "number" ? policy.criticalDefaultThreshold : 0.8;
  for (const target of targets.filter((item) => item.tier === "critical" || item.mustPass === true)) {
    const item = reviews.get(target.id);
    const threshold = typeof target.minimumScore === "number" ? target.minimumScore : defaultThreshold;
    if (!isRecord(item) || item.visible === false || typeof item.score !== "number" || item.score < threshold) return `critical feature '${String(target.id)}' did not meet threshold ${threshold}`;
  }
  const important = targets.filter((item) => item.tier === "important").map((target) => reviews.get(target.id)).filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.score === "number");
  if (important.length > 0 && typeof policy.importantAverageThreshold === "number" && important.reduce((sum, item) => sum + Number(item.score), 0) / important.length < policy.importantAverageThreshold) return "important feature average is below threshold";
  return undefined;
}

function collectImg2ThreejsTexturePaths(file: string, spec: Record<string, unknown>, diagnostics: IAuthoringDiagnostic[]): string[] {
  const paths = new Set<string>();
  if (!Array.isArray(spec.materials)) return [];
  spec.materials.forEach((material, materialIndex) => {
    if (!isRecord(material) || !isRecord(material.referencePbr) || !isRecord(material.referencePbr.maps)) return;
    for (const [channel, value] of Object.entries(material.referencePbr.maps)) {
      if (!isRecord(value)) continue;
      const path = typeof value.path === "string" ? value.path : typeof value.url === "string" ? value.url : undefined;
      if (path === undefined || path.trim() === "") continue;
      if (typeof value.url === "string" || isRemoteImg2ThreejsPath(path)) diagnostics.push(img2ThreejsDiagnostic(file, `/materials/${materialIndex}/referencePbr/maps/${channel}`, "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT", "Texture resources must be project-local files, not URLs.", path, ["Move the texture under content/ and record its project-relative path."]));
      else paths.add(path);
    }
  });
  return [...paths].sort();
}

async function readImg2ThreejsResource(projectPath: string, inputPath: string, jsonPath: string, allowedPrefixes: readonly string[], diagnostics: IAuthoringDiagnostic[], suffix?: string): Promise<IContainedImg2ThreejsResource | undefined> {
  const normalized = normalizeRelativePath(inputPath);
  if (inputPath !== normalized || normalized.startsWith("../") || normalized === ".." || normalized.startsWith("/") || isRemoteImg2ThreejsPath(inputPath) || !allowedPrefixes.some((prefix) => normalized.startsWith(prefix)) || (suffix !== undefined && !normalized.endsWith(suffix)) || isGeneratedArtifactPath(normalized)) {
    diagnostics.push(img2ThreejsDiagnostic(normalized || inputPath, jsonPath, "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT", "img2threejs resource must remain in its prescribed project-local source directory.", inputPath, allowedPrefixes.map((prefix) => `${prefix}<file>${suffix ?? ""}`)));
    return undefined;
  }
  try {
    const [projectRealPath, resourceRealPath] = await Promise.all([realpath(projectPath), realpath(resolve(projectPath, normalized))]);
    const contained = normalizeRelativePath(relative(projectRealPath, resourceRealPath));
    if (contained.startsWith("../") || contained === ".." || !allowedPrefixes.some((prefix) => contained.startsWith(prefix)) || (suffix !== undefined && !contained.endsWith(suffix)) || isGeneratedArtifactPath(contained)) throw new Error("symbolic link resolves outside its prescribed source root");
    const info = await stat(resourceRealPath);
    if (!info.isFile()) throw new Error("resource is not a regular file");
    const bytes = await readFile(resourceRealPath);
    return { bytes, path: normalized, sha256: sha256(bytes) };
  } catch (error) {
    diagnostics.push(img2ThreejsDiagnostic(normalized, jsonPath, "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT", `Could not read contained img2threejs resource '${normalized}'.`, errorMessage(error), ["Restore the file beneath the prescribed project path and remove escaping symlinks."]));
    return undefined;
  }
}

async function validateImg2ThreejsOutputPath(projectPath: string, output: string, diagnostics: IAuthoringDiagnostic[]): Promise<void> {
  const normalized = normalizeRelativePath(output);
  if (normalized !== output || !normalized.startsWith("assets/generated/") || !normalized.endsWith(".glb") || normalized.includes("/../") || normalized.startsWith("/")) {
    diagnostics.push(img2ThreejsDiagnostic(normalized || output, "/output", "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT", "img2threejs output must be a project-relative GLB beneath assets/generated/.", output, ["assets/generated/<asset-id>.glb"]));
    return;
  }
  const outputAbsolute = resolve(projectPath, normalized);
  let ancestor = dirname(outputAbsolute);
  while (ancestor !== dirname(ancestor)) {
    try {
      const [projectRealPath, ancestorRealPath] = await Promise.all([realpath(projectPath), realpath(ancestor)]);
      const contained = normalizeRelativePath(relative(projectRealPath, ancestorRealPath));
      const lexical = normalizeRelativePath(relative(resolve(projectPath), ancestor));
      if (contained !== lexical || contained.startsWith("../") || contained === "..") throw new Error("output parent symlink leaves its prescribed assets/generated path");
      try {
        const outputRealPath = await realpath(outputAbsolute);
        const resolvedOutput = normalizeRelativePath(relative(projectRealPath, outputRealPath));
        if (!resolvedOutput.startsWith("assets/generated/") || !resolvedOutput.endsWith(".glb")) throw new Error("output symlink leaves assets/generated");
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
      }
      return;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        ancestor = dirname(ancestor);
        continue;
      }
      diagnostics.push(img2ThreejsDiagnostic(normalized, "/output", "TN_IMG2THREEJS_RESOURCE_OUTSIDE_PROJECT", "img2threejs output parent must remain inside the project after symlink resolution.", errorMessage(error), ["assets/generated/<asset-id>.glb"]));
      return;
    }
  }
}

function img2ThreejsDiagnostic(file: string, path: string, code: string, message: string, value: unknown, allowed: readonly string[]): IAuthoringDiagnostic {
  return authoringDiagnostic({ code, file, fix: { instruction: allowed[0] ?? "Repair the referenced img2threejs source and retry.", allowed }, message, path, value });
}

function asImg2ThreejsRecipeDiagnostic(diagnostic: IAuthoringDiagnostic): IAuthoringDiagnostic {
  return img2ThreejsDiagnostic(diagnostic.file ?? "", diagnostic.path ?? "", "TN_IMG2THREEJS_RECIPE_INVALID", diagnostic.message, diagnostic.value, ["Remove unknown fields and regenerate the recipe through the internal img2threejs skill."]);
}

function asImg2ThreejsSpecDiagnostic(diagnostic: IAuthoringDiagnostic): IAuthoringDiagnostic {
  return img2ThreejsDiagnostic(diagnostic.file ?? "", diagnostic.path ?? "", "TN_IMG2THREEJS_SPEC_INVALID", diagnostic.message, diagnostic.value, ["Regenerate the strict validator report through the reviewed internal img2threejs skill."]);
}

function img2ThreejsValidatorCommand(path: string): string {
  return `python3 forge/stage2_spec/validate_sculpt_spec.py ${path} --strict-quality --json`;
}

function isRemoteImg2ThreejsPath(path: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/iu.test(path) || path.startsWith("//");
}

function sameStringArray(value: unknown, expected: readonly string[]): boolean {
  return Array.isArray(value) && value.length === expected.length && value.every((item, index) => item === expected[index]);
}

function sha256(bytes: Uint8Array): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function stableImg2ThreejsJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableImg2ThreejsJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableImg2ThreejsJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}

function hashImg2ThreejsInput(entries: ReadonlyArray<readonly [string, IContainedImg2ThreejsResource]>): string {
  const hash = createHash("sha256");
  for (const [role, resource] of [...entries].sort((left, right) => `${left[0]}:${left[1].path}`.localeCompare(`${right[0]}:${right[1].path}`))) {
    hash.update(role); hash.update("\0"); hash.update(resource.path); hash.update("\0"); hash.update(resource.sha256); hash.update("\0");
  }
  return `sha256:${hash.digest("hex")}`;
}

async function readOptionalFile(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function restoreOptionalFile(path: string, contents: string | undefined): Promise<void> {
  if (contents === undefined) {
    await rm(path, { force: true });
    return;
  }
  await writeFile(path, contents, "utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
