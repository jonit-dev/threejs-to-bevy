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
