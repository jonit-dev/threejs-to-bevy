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

export async function createUiDocument(options: ICreateUiDocumentOptions): Promise<IAuthoringOperationResult> {
  return createSourceDocument({
    projectPath: options.projectPath,
    kind: "ui",
    id: options.uiDocId,
    file: `content/ui/${options.uiDocId}.ui.json`,
    data: { schema: uiDocumentSchema, version: "0.1.0", id: options.uiDocId, nodes: [], bindings: [] },
  });
}

export async function addUiText(options: IAddUiTextOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const existing = findSceneItem(nodes, options.nodeId);
    const node = existing ?? { id: options.nodeId };
    node.type = "text";
    node.text = options.text;
    if (existing === undefined) {
      nodes.push(node);
    }
  });
}

export async function addUiNodeDocument(options: IAddUiNodeDocumentOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const existing = findSceneItem(nodes, options.nodeId);
    const node = existing ?? { id: options.nodeId };
    node.type = options.type;
    if (options.action !== undefined) {
      node.action = options.action;
    }
    if (options.label !== undefined) {
      node.label = options.label;
    }
    if (options.src !== undefined) {
      node.src = options.src;
    }
    if (options.text !== undefined) {
      node.text = options.text;
    }
    if (options.value !== undefined) {
      node.value = options.value;
    }
    if (existing === undefined) {
      nodes.push(node);
    }
  });
}

export async function addUiComponentInstance(options: IAddUiComponentInstanceOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const existing = findSceneItem(nodes, options.nodeId);
    const node = existing ?? { id: options.nodeId };
    node.type = "component";
    node.component = {
      ref: options.componentId,
      ...(options.props === undefined ? {} : { props: cloneJson(options.props) }),
    };
    if (existing === undefined) {
      nodes.push(node);
    }
  });
}

export async function applyUiRecipe(options: IApplyUiRecipeOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const recipe = buildUiSourceRecipe(options.recipe, options.recipeId ?? options.recipe, options);
    const nodes = ensureArrayProperty(data, "nodes");
    for (const recipeNode of recipe.nodes) {
      const existing = findSceneItem(nodes, recipeNode.id);
      if (existing === undefined) {
        nodes.push(recipeNode);
      } else {
        Object.assign(existing, recipeNode);
      }
    }
    const bindings = ensureArrayProperty(data, "bindings");
    for (const binding of recipe.bindings) {
      const existing = bindings.find((candidate) => candidate.node === binding.node);
      if (existing === undefined) {
        bindings.push(binding);
      } else {
        existing.resource = binding.resource;
      }
    }
    data.components = mergeById(readArray(data.components) ?? [], recipe.components);
    data.screens = mergeById(readArray(data.screens) ?? [], recipe.screens);
    data.focusOrder = [...new Set([...(Array.isArray(data.focusOrder) ? data.focusOrder.filter((id): id is string => typeof id === "string") : []), ...recipe.focusOrder])];
    data.recipes = mergeById(readArray(data.recipes) ?? [], [{ id: recipe.id, kind: options.recipe, props: cloneJson(options.props ?? {}) }]);
    data.provenance = { ...(isRecord(data.provenance) ? data.provenance : {}), ...recipe.provenance };
  });
}

export async function removeUiComponentInstance(options: IRemoveUiComponentInstanceOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data, file) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const index = nodes.findIndex((node) => node.id === options.nodeId);
    if (index === -1) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    const node = nodes[index];
    if (node === undefined) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    if (node.type !== "component") {
      return [
        typeDiagnostic(
          file,
          `/nodes/${index}/type`,
          "UI node must be a component instance to remove it with remove-component.",
          node.type,
        ),
      ];
    }
    nodes.splice(index, 1);
    return [];
  });
}

export async function setUiLayout(options: ISetUiLayoutOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data, file) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const node = findSceneItem(nodes, options.nodeId);
    if (node === undefined) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    node.layout = {
      ...(isRecord(node.layout) ? node.layout : {}),
      ...(options.align === undefined ? {} : { align: options.align }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...(options.justify === undefined ? {} : { justify: options.justify }),
      ...(options.top === undefined ? {} : { top: options.top }),
      ...(options.width === undefined ? {} : { width: options.width }),
    };
    return [];
  });
}

export async function setUiStyle(options: ISetUiStyleOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data, file) => {
    const nodes = ensureArrayProperty(data, "nodes");
    const node = findSceneItem(nodes, options.nodeId);
    if (node === undefined) {
      return [missingReferenceDiagnostic(file, "/nodes", "ui-node", options.nodeId, idsFromArray(nodes))];
    }
    node.style = {
      ...(isRecord(node.style) ? node.style : {}),
      ...(options.backgroundColor === undefined ? {} : { backgroundColor: options.backgroundColor }),
      ...(options.borderColor === undefined ? {} : { borderColor: options.borderColor }),
      ...(options.borderRadius === undefined ? {} : { borderRadius: options.borderRadius }),
      ...(options.borderWidth === undefined ? {} : { borderWidth: options.borderWidth }),
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.fontSize === undefined ? {} : { fontSize: options.fontSize }),
      ...(options.fontWeight === undefined ? {} : { fontWeight: options.fontWeight }),
      ...(options.opacity === undefined ? {} : { opacity: options.opacity }),
      ...(options.textAlign === undefined ? {} : { textAlign: options.textAlign }),
      ...(options.textDecoration === undefined ? {} : { textDecoration: options.textDecoration }),
      ...(options.wrap === undefined ? {} : { wrap: options.wrap }),
    };
    return [];
  });
}

export async function bindUiDocument(options: IBindUiDocumentOptions): Promise<IAuthoringOperationResult> {
  return mutateSourceDocument(options, "ui", options.uiDocId, (data) => {
    const bindings = ensureArrayProperty(data, "bindings");
    bindings.push({ node: options.nodeId, resource: options.resourcePath });
  });
}
