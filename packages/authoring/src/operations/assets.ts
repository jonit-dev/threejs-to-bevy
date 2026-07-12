import { access, mkdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { ASSET_FORMATS_BY_KIND, type AssetFormat, type AssetKind } from "@threenative/sdk";
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

export async function addAsset(options: IAddAssetOptions): Promise<IAuthoringOperationResult> {
  const kind = options.type as AssetKind;
  if (!(kind in ASSET_FORMATS_BY_KIND)) {
    const extension = assetPathExtension(options.path);
    const inferred = extension === undefined ? undefined : assetKindForFormat(extension);
    return authoringOperationResult({
      diagnostics: [authoringDiagnostic({
        code: "TN_AUTHORING_ASSET_TYPE_INVALID",
        fix: {
          instruction: inferred === undefined ? "Use a supported asset type." : `Use asset type '${inferred}' for .${extension} files.`,
          snippet: inferred === undefined ? "--type model" : `--type ${inferred}`,
        },
        message: `Asset type '${options.type}' is unsupported. Supported types: ${Object.keys(ASSET_FORMATS_BY_KIND).join(", ")}.`,
        path: "/assets/0/type",
        value: options.type,
      })],
      projectPath: resolve(options.projectPath),
    });
  }
  if (kind !== "render-target" && options.path !== undefined) {
    const extension = assetPathExtension(options.path);
    const formats = ASSET_FORMATS_BY_KIND[kind] as readonly AssetFormat[];
    if (extension === undefined || !formats.includes(extension)) {
      return authoringOperationResult({
        diagnostics: [authoringDiagnostic({
          code: "TN_AUTHORING_ASSET_TYPE_INVALID",
          fix: {
            instruction: `Convert or import the source to a supported ${kind} format before registering it.`,
            snippet: `tn asset import ${options.path} --id ${options.assetId}`,
          },
          message: `Asset path '${options.path}' is not a supported ${kind} format. Supported formats: ${formats.join(", ")}.`,
          path: "/assets/0/path",
          value: options.path,
        })],
        projectPath: resolve(options.projectPath),
      });
    }
  }
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "asset",
    id: options.assetId,
    file: options.file ?? `content/assets/${options.assetId}.assets.json`,
    emptyData: { schema: assetDocumentSchema, version: "0.1.0", id: options.assetId, assets: [] },
    apply: (data) => {
      const assets = ensureArrayProperty(data, "assets");
      const existing = findSceneItem(assets, options.assetId);
      const asset = existing ?? { id: options.assetId };
      asset.type = options.type;
      if (options.type === "render-target") {
        delete asset.path;
        asset.width = options.width;
        asset.height = options.height;
        asset.usage = options.usage ?? "color";
        asset.format = options.format ?? (asset.usage === "depth" ? "depth24plus" : "rgba8");
        setOptionalNumber(asset, "sampleCount", options.sampleCount);
      } else {
        asset.path = options.path;
        delete asset.width;
        delete asset.height;
        delete asset.usage;
        delete asset.format;
        delete asset.sampleCount;
      }
      if (existing === undefined) {
        assets.push(asset);
      }
    },
  });
}

function assetPathExtension(path: string | undefined): AssetFormat | undefined {
  const extension = path?.split(/[?#]/u, 1)[0]?.split(".").pop()?.toLowerCase();
  return extension === undefined || extension === path ? undefined : extension as AssetFormat;
}

function assetKindForFormat(format: AssetFormat): AssetKind | undefined {
  return (Object.entries(ASSET_FORMATS_BY_KIND) as Array<[AssetKind, readonly AssetFormat[]]>).find(([, formats]) => formats.includes(format))?.[0];
}

export async function addAnimationClip(options: IAddAnimationClipOptions): Promise<IAuthoringOperationResult> {
  return mutateAsset(options.projectPath, options.assetId, (asset) => {
    const animations = ensureArrayProperty(asset, "animations");
    const existing = findSceneItem(animations, options.clipId);
    const clip = existing ?? { id: options.clipId };
    if (options.loop === undefined) {
      delete clip.loop;
    } else {
      clip.loop = options.loop;
    }
    setOptionalString(clip, "sourceClip", options.sourceClip);
    setOptionalNumber(clip, "speed", options.speed);
    if (existing === undefined) {
      animations.push(clip);
    }
  });
}

export async function addAnimationGraphState(options: IAddAnimationGraphStateOptions): Promise<IAuthoringOperationResult> {
  return mutateAsset(options.projectPath, options.assetId, (asset) => {
    const graph = isRecord(asset.animationGraph) ? asset.animationGraph : {};
    const states = Array.isArray(graph.states) ? graph.states : [];
    const existing = findSceneItem(states, options.stateId);
    const state = existing ?? { id: options.stateId };
    state.clip = options.clipId;
    if (existing === undefined) {
      states.push(state);
    }
    asset.animationGraph = {
      ...graph,
      initialState: options.initial === true || typeof graph.initialState !== "string" ? options.stateId : graph.initialState,
      states,
    };
  });
}

export async function addParticleEmitter(options: IAddParticleEmitterOptions): Promise<IAuthoringOperationResult> {
  return mutateAsset(options.projectPath, options.assetId, (asset) => {
    const particleEmitters = ensureArrayProperty(asset, "particleEmitters");
    const existing = findSceneItem(particleEmitters, options.emitterId);
    const emitter = existing ?? { id: options.emitterId };
    emitter.lifetimeSeconds = options.lifetimeSeconds;
    emitter.maxParticles = options.maxParticles;
    emitter.ratePerSecond = options.ratePerSecond;
    emitter.shape = options.shape ?? "point";
    if (options.radius === undefined) {
      delete emitter.radius;
    } else {
      emitter.radius = options.radius;
    }
    if (existing === undefined) {
      particleEmitters.push(emitter);
    }
  });
}

export async function createAudioDocument(options: ICreateAudioDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "audio",
    id: options.audioDocId,
    file: `content/audio/${options.audioDocId}.audio.json`,
    data: { schema: audioDocumentSchema, version: "0.1.0", id: options.audioDocId, sounds: [] },
  });
}

export async function addAudioSound(options: IAddAudioSoundOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "audio", options.audioDocId, (data) => {
    const sounds = ensureArrayProperty(data, "sounds");
    const existing = findSceneItem(sounds, options.soundId);
    const sound = existing ?? { id: options.soundId };
    sound.asset = options.asset;
    if (existing === undefined) {
      sounds.push(sound);
    }
  });
}
