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
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const document = project.documents.find((candidate) => candidate.kind === "material" && isRecord(candidate.data) && idsFromArray(candidate.data.materials).includes(options.materialId));
  const mutateMaterial = (data: Record<string, unknown>, file: string): void | IAuthoringDiagnostic[] => {
    const materials = ensureArrayProperty(data, "materials");
    const material = findSceneItem(materials, options.materialId);
    if (material === undefined) {
      return [missingReferenceDiagnostic(file, "/materials", "material", options.materialId, idsFromArray(materials))];
    }
    setOptionalString(material, "alphaMode", options.alphaMode);
    setOptionalString(material, "baseColorTexture", options.baseColorTexture);
    setOptionalString(material, "clearcoatRoughnessTexture", options.clearcoatRoughnessTexture);
    setOptionalString(material, "clearcoatTexture", options.clearcoatTexture);
    if (options.color !== undefined) {
      material.color = options.color;
    }
    setOptionalString(material, "emissive", options.emissive);
    setOptionalString(material, "emissiveTexture", options.emissiveTexture);
    setOptionalString(material, "metallicRoughnessTexture", options.metallicRoughnessTexture);
    setOptionalString(material, "normalTexture", options.normalTexture);
    setOptionalString(material, "occlusionTexture", options.occlusionTexture);
    setOptionalString(material, "transmissionTexture", options.transmissionTexture);
    setOptionalNumber(material, "alphaCutoff", options.alphaCutoff);
    setOptionalNumber(material, "clearcoat", options.clearcoat);
    setOptionalNumber(material, "clearcoatRoughness", options.clearcoatRoughness);
    setOptionalNumber(material, "emissiveIntensity", options.emissiveIntensity);
    setOptionalNumber(material, "metalness", options.metalness);
    setOptionalNumber(material, "opacity", options.opacity);
    setOptionalNumber(material, "roughness", options.roughness);
    setOptionalNumber(material, "transmission", options.transmission);
    return [];
  };

  if (document !== undefined) {
    return mutateLoadedSourceDocument(project, document, mutateMaterial);
  }

  return mutateSourceDocument(options, "material", options.materialId, mutateMaterial);
}

export async function createMeshPrimitive(options: ICreateMeshPrimitiveOptions): Promise<IAuthoringOperationResult> {
  return upsertSourceDocument({
    projectPath: options.projectPath,
    kind: "mesh",
    id: options.meshId,
    file: options.file ?? `content/meshes/${options.meshId}.meshes.json`,
    emptyData: { schema: meshDocumentSchema, version: "0.1.0", id: options.meshId, meshes: [] },
    apply: (data) => {
      const meshes = ensureArrayProperty(data, "meshes");
      const existing = findSceneItem(meshes, options.meshId);
      const mesh = existing ?? { id: options.meshId };
      mesh.kind = "primitive";
      mesh.primitive = options.kind;
      if (options.size !== undefined) {
        mesh.size = options.size;
      } else {
        delete mesh.size;
      }
      delete mesh.attributes;
      delete mesh.indices;
      delete mesh.storage;
      if (existing === undefined) {
        meshes.push(mesh);
      }
    },
  });
}

export async function createMeshCustom(options: ICreateMeshCustomOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "mesh",
    id: options.meshId,
    file: `content/meshes/${options.meshId}.meshes.json`,
    data: {
      schema: meshDocumentSchema,
      version: "0.1.0",
      id: options.meshId,
      meshes: [{
        attributes: options.attributes.map((attribute) => ({ itemSize: attribute.itemSize, name: attribute.name, values: [...attribute.values] })),
        id: options.meshId,
        ...(options.indices === undefined ? {} : { indices: [...options.indices] }),
        kind: "custom",
        primitive: "custom",
        ...(options.storage === undefined ? {} : { storage: options.storage }),
      }],
    },
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

export async function setPrefabMaterial(options: ISetPrefabMaterialOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "prefab", options.prefabId, (data, file) => {
    const entities = ensureArrayProperty(data, "entities");
    const sameIdEntity = findSceneItem(entities, options.prefabId);
    const fallbackEntity = entities.find(isRecord);
    const entity = sameIdEntity ?? fallbackEntity;
    if (entity === undefined) {
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_REF_MISSING",
          file,
          message: `No root entity exists in prefab '${options.prefabId}'.`,
          path: "/entities",
          suggestion: "Add an entity to the prefab document before assigning a material.",
          value: options.prefabId,
        }),
      ];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      MeshRenderer: { material: options.materialId },
    };
    return [];
  });
}
