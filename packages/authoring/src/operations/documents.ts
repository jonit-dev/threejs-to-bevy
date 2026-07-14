import { access, mkdir, readFile, realpath, rm, writeFile } from "node:fs/promises";
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
