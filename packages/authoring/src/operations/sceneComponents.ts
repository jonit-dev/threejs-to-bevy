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

export async function setSceneLifecycle(options: ISetSceneLifecycleOptions): Promise<IAuthoringOperationResult> {
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

  for (const document of sceneDocuments) {
    const documentDiagnostics = await validateSceneDocument(project.projectPath, document.projectRelativePath, document.data, { materialIds, prefabDocumentIds });
    if (hasAuthoringErrors(documentDiagnostics)) {
      return authoringOperationResult({ diagnostics: documentDiagnostics, projectPath: project.projectPath });
    }
  }

  const changedDocuments: IAuthoringDocument[] = [];
  for (const document of sceneDocuments) {
    const nextData = cloneJson(document.data);
    if (!isRecord(nextData)) {
      return authoringOperationResult({
        diagnostics: [
          authoringDiagnostic({
            code: "TN_AUTHORING_SCENE_SHAPE_INVALID",
            file: document.projectRelativePath,
            message: "Scene source document must be a JSON object before mutation.",
          }),
        ],
        projectPath: project.projectPath,
      });
    }

    const isTarget = document === sceneDocument;
    if (isTarget) {
      if (options.kind !== undefined) {
        nextData.kind = options.kind;
      }
      if (options.activation !== undefined) {
        nextData.activation = options.activation;
      }
      if (options.initial !== undefined) {
        nextData.initial = options.initial;
      }
    } else if (options.initial === true && nextData.initial === true) {
      nextData.initial = false;
    }

    const afterDiagnostics = await validateSceneDocument(project.projectPath, document.projectRelativePath, nextData, { materialIds, prefabDocumentIds });
    if (hasAuthoringErrors(afterDiagnostics)) {
      return authoringOperationResult({ diagnostics: afterDiagnostics, projectPath: project.projectPath });
    }
    if (JSON.stringify(nextData) !== JSON.stringify(document.data)) {
      document.data = nextData;
      changedDocuments.push(document);
    }
  }

  const filesWritten: string[] = [];
  for (const document of changedDocuments) {
    await writeAuthoringJsonDocument(document);
    filesWritten.push(document.projectRelativePath);
  }

  return authoringOperationResult({
    changed: changedDocuments.length > 0,
    filesWritten,
    projectPath: project.projectPath,
  });
}

export async function setComponent(options: ISetComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      [options.componentKind]: options.value,
    };
    return [];
  });
}

export async function setCameraComponent(options: ISetCameraComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "camera",
    value: {
      ...(options.far === undefined ? {} : { far: options.far }),
      ...(options.fovY === undefined ? {} : { fovY: options.fovY }),
      mode: options.mode ?? "perspective",
      ...(options.near === undefined ? {} : { near: options.near }),
      ...(options.size === undefined ? {} : { size: options.size }),
      ...(options.targetId === undefined ? {} : { target: options.targetId }),
    },
  });
}

export async function setLightComponent(options: ISetLightComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "Light",
    value: {
      color: options.color ?? "#ffffff",
      intensity: options.intensity ?? 1,
      kind: options.kind ?? "directional",
      ...(options.range === undefined ? {} : { range: options.range }),
      ...(options.angle === undefined ? {} : { angle: options.angle }),
      ...(options.shadowBias === undefined ? {} : { shadowBias: options.shadowBias }),
      ...(options.shadowNormalBias === undefined ? {} : { shadowNormalBias: options.shadowNormalBias }),
    },
  });
}

export async function setMeshRendererComponent(options: ISetMeshRendererComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "MeshRenderer",
    value: {
      material: options.material,
      mesh: options.mesh,
      ...(options.visible === undefined ? {} : { visible: options.visible }),
      ...(options.castShadow === undefined ? {} : { castShadow: options.castShadow }),
      ...(options.receiveShadow === undefined ? {} : { receiveShadow: options.receiveShadow }),
    },
  });
}

export async function setRenderLayersComponent(options: ISetRenderLayersComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "RenderLayers",
    value: {
      layers: [...options.layers],
    },
  });
}

export async function setRigidBodyComponent(options: ISetRigidBodyComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "RigidBody",
    value: {
      kind: options.kind ?? "dynamic",
      ...(options.mass === undefined ? {} : { mass: options.mass }),
      ...(options.damping === undefined ? {} : { damping: options.damping }),
      ...(options.gravityScale === undefined ? {} : { gravityScale: options.gravityScale }),
    },
  });
}

export async function setSpawnerComponent(options: ISetSpawnerComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "Spawner",
    value: {
      enabled: options.enabled ?? true,
      mode: options.mode ?? "once",
      prefab: options.prefab,
      ...(options.interval === undefined ? {} : { interval: options.interval }),
      ...(options.waveSize === undefined ? {} : { waveSize: options.waveSize }),
      ...(options.maxAlive === undefined ? {} : { maxAlive: options.maxAlive }),
      ...(options.maxTotal === undefined ? {} : { maxTotal: options.maxTotal }),
      ...(options.jitterSeed === undefined ? {} : { jitterSeed: options.jitterSeed }),
      ...(options.area === undefined ? {} : { area: options.area }),
      ...(options.despawnPolicy === undefined ? {} : { despawnPolicy: options.despawnPolicy }),
    },
  });
}

export async function setColliderComponent(options: ISetColliderComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "Collider",
    value: {
      kind: options.kind ?? "box",
      ...(options.size === undefined ? { size: [1, 1, 1] } : { size: options.size }),
      ...(options.center === undefined ? {} : { center: options.center }),
      ...(options.radius === undefined ? {} : { radius: options.radius }),
      ...(options.height === undefined ? {} : { height: options.height }),
      ...(options.trigger === undefined ? {} : { trigger: options.trigger }),
    },
  });
}

export async function setCharacterControllerComponent(options: ISetCharacterControllerComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "CharacterController",
    value: {
      blocking: options.blocking ?? true,
      grounding: options.grounding ?? "raycast",
      moveXAxis: options.moveXAxis ?? "move.x",
      moveZAxis: options.moveZAxis ?? "move.z",
      speed: options.speed ?? 4,
      ...(options.slopeLimit === undefined ? {} : { slopeLimit: options.slopeLimit }),
      ...(options.stepOffset === undefined ? {} : { stepOffset: options.stepOffset }),
    },
  });
}

export async function setVisibilityComponent(options: ISetVisibilityComponentOptions): Promise<IAuthoringOperationResult> {
  return setComponent({
    projectPath: options.projectPath,
    sceneId: options.sceneId,
    entityId: options.entityId,
    componentKind: "Visibility",
    value: {
      visible: options.visible ?? true,
    },
  });
}

export async function removeComponent(options: IRemoveComponentOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    if (!isRecord(entity.components)) {
      return [];
    }
    delete entity.components[options.componentKind];
    return [];
  });
}

export async function addUiNode(options: IAddUiNodeOptions): Promise<IAuthoringOperationResult> {
  const project = await loadProjectForOperation(options);
  const uiDocument = project.documents.find((document) => document.kind === "ui");
  if (uiDocument !== undefined) {
    return mutateLoadedSourceDocument(project, uiDocument, (data) => {
      const nodes = ensureArrayProperty(data, "nodes");
      if (findSceneItem(nodes, options.uiNodeId) === undefined) {
        nodes.push({ id: options.uiNodeId, type: "text", text: options.uiNodeId });
      }
    });
  }
  return mutateScene(options, (scene) => {
    const ui = isRecord(scene.ui) ? scene.ui : {};
    const nodes = ensureArrayProperty(ui, "nodes");
    scene.ui = ui;
    nodes.push({ id: options.uiNodeId });
  });
}

export async function setTransform(options: ISetTransformOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    const componentStyle = (readArray(scene.entities) ?? []).some((candidate) => {
      if (!isRecord(candidate) || !isRecord(candidate.components)) return false;
      return isRecord(candidate.components.Transform);
    });
    const current = componentStyle && isRecord(entity.components) && isRecord(entity.components.Transform)
      ? entity.components.Transform
      : entity.transform;
    const transform = {
      ...(isRecord(current) ? current : {}),
      ...(options.position === undefined ? {} : { position: options.position }),
      ...(options.rotation === undefined ? {} : { rotation: options.rotation }),
      ...(options.scale === undefined ? {} : { scale: options.scale }),
    };
    if (componentStyle) {
      const components = isRecord(entity.components) ? entity.components : {};
      components.Transform = transform;
      entity.components = components;
      delete entity.transform;
    } else {
      entity.transform = transform;
    }
    return [];
  });
}

export async function setCamera(options: ISetCameraOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const entity = findSceneItem(scene.entities, options.cameraId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.cameraId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      camera: {
        ...(options.far === undefined ? {} : { far: options.far }),
        ...(options.fovY === undefined ? {} : { fovY: options.fovY }),
        mode: options.mode,
        ...(options.near === undefined ? {} : { near: options.near }),
        ...(options.size === undefined ? {} : { size: options.size }),
        target: options.targetId,
      },
    };
    return [];
  });
}

export async function attachScript(options: IAttachScriptOptions): Promise<IAuthoringOperationResult> {
  const project = await loadProjectForOperation(options);
  const systemsDocument = project.documents.find((document) => document.kind === "systems");
  if (systemsDocument !== undefined) {
    return mutateLoadedSourceDocument(project, systemsDocument, (data) => {
      const systems = ensureArrayProperty(data, "systems");
      const existing = findSceneItem(systems, options.systemId);
      const system = existing ?? { id: options.systemId, schedule: "fixedUpdate" };
      system.script = { module: options.modulePath, export: options.exportName };
      if (options.source === undefined) delete system.source;
      else system.source = options.source;
      if (existing === undefined) {
        systems.push(system);
      }
    });
  }
  return mutateScene(options, (scene) => {
    const systems = ensureArrayProperty(scene, "systems");
    const existing = findSceneItem(systems, options.systemId);
    const system = existing ?? { id: options.systemId };
    system.script = {
      module: options.modulePath,
      export: options.exportName,
    };
    if (options.source === undefined) delete system.source;
    else system.source = options.source;
    if (existing === undefined) {
      systems.push(system);
    }
  });
}

export async function bindUi(options: IBindUiOptions): Promise<IAuthoringOperationResult> {
  const project = await loadProjectForOperation(options);
  const uiDocument = project.documents.find((document) => document.kind === "ui");
  if (uiDocument !== undefined) {
    return mutateLoadedSourceDocument(project, uiDocument, (data) => {
      const bindings = ensureArrayProperty(data, "bindings");
      const existing = bindings.find((binding) => isRecord(binding) && binding.node === options.uiNodeId);
      if (existing === undefined) {
        bindings.push({ node: options.uiNodeId, resource: options.resourcePath });
      } else {
        existing.resource = options.resourcePath;
      }
    });
  }
  return mutateScene(options, (scene) => {
    const ui = isRecord(scene.ui) ? scene.ui : {};
    const bindings = ensureArrayProperty(ui, "bindings");
    scene.ui = ui;
    bindings.push({
      node: options.uiNodeId,
      resource: options.resourcePath,
    });
  });
}
