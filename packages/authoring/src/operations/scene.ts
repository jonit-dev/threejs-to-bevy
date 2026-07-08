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

export async function createScene(options: ICreateSceneOptions): Promise<ICreateSceneResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.sceneId, "scene");

  const requestedFile = options.file ?? `content/scenes/${options.sceneId}.scene.json`;
  const absoluteFile = resolve(projectPath, requestedFile);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteFile));

  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Scene source documents must be created inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/scenes/ such as content/scenes/main.scene.json.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_GENERATED_SOURCE_PATH",
        file: projectRelativePath,
        message: "Generated bundle artifacts cannot be used as authoring source documents.",
        suggestion: "Create scene source documents under content/scenes/ instead.",
      }),
    );
  } else if (!projectRelativePath.endsWith(".scene.json")) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: "Scene source documents must use the .scene.json extension.",
        value: projectRelativePath,
        suggestion: "Use a path such as content/scenes/main.scene.json.",
      }),
    );
  }

  const duplicateScene = project.documents.find((document) => document.kind === "scene" && readSceneId(document.data) === options.sceneId);
  if (duplicateScene !== undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_DUPLICATE_SCENE_ID",
        file: duplicateScene.projectRelativePath,
        message: `Scene id '${options.sceneId}' already exists.`,
        path: "/id",
        value: options.sceneId,
        suggestion: "Use a new scene id or mutate the existing scene document.",
      }),
    );
  }

  try {
    await access(absoluteFile);
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
        file: projectRelativePath,
        message: `Scene source document '${projectRelativePath}' already exists.`,
        suggestion: "Use a different --file path or mutate the existing scene document.",
      }),
    );
  } catch {
    // Missing is the only successful create path; other write errors surface when writing.
  }

  const scene: ISceneDocument = {
    schema: sceneDocumentSchema,
    version: "0.1.0",
    id: options.sceneId,
    entities: [],
    prefabs: [],
    resources: [],
    systems: [],
    ui: { nodes: [], bindings: [] },
  };

  if (!hasAuthoringErrors(diagnostics)) {
    diagnostics.push(...(await validateSceneDocument(projectPath, projectRelativePath, scene)));
  }

  if (hasAuthoringErrors(diagnostics)) {
    return {
      ...authoringOperationResult({ diagnostics, projectPath }),
      file: projectRelativePath,
      nextCommands: nextSceneCommands(options.sceneId),
      sceneId: options.sceneId,
    };
  }

  const document: IAuthoringDocument = {
    data: scene,
    file: absoluteFile,
    kind: "scene",
    projectRelativePath,
  };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);

  return {
    ...authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath }),
    file: projectRelativePath,
    nextCommands: nextSceneCommands(options.sceneId),
    sceneId: options.sceneId,
  };
}

export async function importWorld(options: IImportWorldOptions): Promise<IImportWorldResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const projectPath = project.projectPath;
  const diagnostics = [...project.diagnostics];
  validateLogicalId(diagnostics, "", "/id", options.sceneId, "scene");

  const requestedFile = options.file ?? `content/scenes/${options.sceneId}.scene.json`;
  const absoluteFile = resolve(projectPath, requestedFile);
  const projectRelativePath = normalizeRelativePath(relative(projectPath, absoluteFile));
  if (projectRelativePath === "" || projectRelativePath.startsWith("../") || projectRelativePath === "..") {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SOURCE_PATH_OUTSIDE_PROJECT",
        file: requestedFile,
        message: "Imported scene source documents must be written inside the project root.",
        value: requestedFile,
        suggestion: "Use a path under content/scenes/ such as content/scenes/imported.scene.json.",
      }),
    );
  } else if (isGeneratedArtifactPath(projectRelativePath)) {
    diagnostics.push(generatedPathDiagnostic(projectRelativePath, "", projectRelativePath));
  } else if (!projectRelativePath.endsWith(".scene.json")) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_FILE_EXTENSION_INVALID",
        file: projectRelativePath,
        message: "Imported scene source documents must use the .scene.json extension.",
        value: projectRelativePath,
        suggestion: "Use a path such as content/scenes/imported.scene.json.",
      }),
    );
  }

  if (!options.replace) {
    try {
      await access(absoluteFile);
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_SOURCE_FILE_EXISTS",
          file: projectRelativePath,
          message: `Scene source document '${projectRelativePath}' already exists.`,
          suggestion: "Pass --replace or use a different --file path.",
        }),
      );
    } catch {
      // Missing is OK.
    }
  }

  const worldPath = resolve(projectPath, options.worldFile);
  let world: unknown;
  try {
    world = JSON.parse(await readFile(worldPath, "utf8"));
  } catch (error) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_WORLD_IMPORT_FAILED",
        file: options.worldFile,
        message: `Could not read world IR JSON: ${error instanceof Error ? error.message : String(error)}`,
        value: options.worldFile,
      }),
    );
  }

  const scene = world === undefined ? emptyScene(options.sceneId) : sceneFromWorld(options.sceneId, world);
  diagnostics.push(...(await validateSceneDocument(projectPath, projectRelativePath, scene)));
  if (hasAuthoringErrors(diagnostics)) {
    return {
      ...authoringOperationResult({ diagnostics, projectPath }),
      entityCount: scene.entities?.length ?? 0,
      file: projectRelativePath,
      resourceCount: scene.resources?.length ?? 0,
      sceneId: options.sceneId,
    };
  }

  const document: IAuthoringDocument = {
    data: scene,
    file: absoluteFile,
    kind: "scene",
    projectRelativePath,
  };
  await mkdir(dirname(absoluteFile), { recursive: true });
  await writeAuthoringJsonDocument(document);

  return {
    ...authoringOperationResult({ changed: true, diagnostics, filesWritten: [projectRelativePath], projectPath }),
    entityCount: scene.entities?.length ?? 0,
    file: projectRelativePath,
    resourceCount: scene.resources?.length ?? 0,
    sceneId: options.sceneId,
  };
}

export async function validateScene(options: IValidateSceneOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const selectedScenes = options.sceneId === undefined ? sceneDocuments : sceneDocuments.filter((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const prefabDocumentIds = collectPrefabDocumentIdsForProject(project);

  if (options.sceneId !== undefined && selectedScenes.length === 0) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
  }

  for (const document of selectedScenes) {
    diagnostics.push(...(await validateSceneDocument(project.projectPath, document.projectRelativePath, document.data, { materialIds, prefabDocumentIds })));
  }

  return authoringOperationResult({
    diagnostics,
    projectPath: project.projectPath,
  });
}

export async function validateAuthoringProject(options: IValidateAuthoringProjectOptions): Promise<IAuthoringOperationResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const context = validationContextForProject(project);

  for (const document of project.documents) {
    diagnostics.push(
      ...(await validateAuthoringDocument(project.projectPath, document.projectRelativePath, document.kind, document.data, context)),
    );
  }

  return authoringOperationResult({
    diagnostics,
    projectPath: project.projectPath,
  });
}

export async function inspectScene(options: IValidateSceneOptions & { nodeId?: string; sceneId: string }): Promise<IInspectSceneResult> {
  const project = await loadAuthoringProject({ projectPath: options.projectPath });
  const diagnostics = [...project.diagnostics];
  const sceneDocuments = project.documents.filter((document) => document.kind === "scene");
  const sceneDocument = sceneDocuments.find((document) => readSceneId(document.data) === options.sceneId);
  const materialIds = collectMaterialIdsForProject(project);
  const prefabDocumentIds = collectPrefabDocumentIdsForProject(project);

  if (sceneDocument === undefined) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_MISSING",
        message: `No scene source document with id '${options.sceneId}' was found.`,
        value: options.sceneId,
        suggestion: closestIdSuggestion(options.sceneId, sceneDocuments.map((document) => readSceneId(document.data)).filter(isString)),
      }),
    );
    return {
      ...authoringOperationResult({ diagnostics, projectPath: project.projectPath }),
    };
  }

  diagnostics.push(...(await validateSceneDocument(project.projectPath, sceneDocument.projectRelativePath, sceneDocument.data, { materialIds, prefabDocumentIds })));
  const scene = inspectSceneDocument(sceneDocument.projectRelativePath, sceneDocument.data, await countSourceLines(sceneDocument.file));
  const node = options.nodeId === undefined ? undefined : inspectSceneNode(sceneDocument.data, options.nodeId);
  if (options.nodeId !== undefined && (node === undefined || node.matches.length === 0)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_SCENE_NODE_MISSING",
        file: sceneDocument.projectRelativePath,
        message: `No entity, prefab, resource, system, UI node, or UI binding with id '${options.nodeId}' was found in scene '${options.sceneId}'.`,
        value: options.nodeId,
        suggestion: "Run tn scene inspect <scene-id> --json to list available ids, then retry with --node <id>.",
      }),
    );
  }

  return {
    ...authoringOperationResult({ diagnostics, projectPath: project.projectPath }),
    ...(node === undefined ? { scene } : { node }),
  };
}

export async function addEntity(options: IAddEntityOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const entities = ensureArrayProperty(scene, "entities");
    entities.push({
      id: options.entityId,
      ...(options.prefabId === undefined ? {} : { prefab: options.prefabId }),
    });
  });
}

export async function addPrefabInstance(options: IAddPrefabInstanceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const instances = ensureArrayProperty(scene, "instances");
    const existing = findSceneItem(instances, options.instanceId);
    if (existing !== undefined && options.replace !== true) {
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_INSTANCE_EXISTS",
          file,
          message: `Compact instance '${options.instanceId}' already exists.`,
          path: `/instances/${instances.indexOf(existing)}/id`,
          value: options.instanceId,
          suggestion: "Pass --replace to update this compact instance intentionally.",
        }),
      ];
    }
    const instance = compactInstanceRecord(options.instanceId, options.prefabId, options.transform, options.components);
    if (existing === undefined) {
      instances.push(instance);
    } else {
      instances[instances.indexOf(existing)] = instance;
    }
    return [];
  });
}

export async function addTenPinLayout(options: IAddTenPinLayoutOptions): Promise<IAuthoringOperationResult> {
  const prefix = options.prefix ?? "pin";
  const origin = options.origin ?? [0, 0.6, 0];
  const spacing = options.spacing ?? 0.52;
  const layout = tenPinLayout(prefix, origin, spacing);
  return mutateScene(options, (scene, file) => {
    const instances = ensureArrayProperty(scene, "instances");
    const ids = new Set(layout.map((pin) => pin.id));
    const existing = instances.filter((instance) => typeof instance.id === "string" && ids.has(instance.id));
    if (existing.length > 0 && options.replace !== true) {
      const first = existing[0]!;
      return [
        authoringDiagnostic({
          code: "TN_AUTHORING_LAYOUT_EXISTS",
          file,
          message: `Compact ten-pin layout '${prefix}' would replace ${existing.length} existing instance id${existing.length === 1 ? "" : "s"}.`,
          path: `/instances/${instances.indexOf(first)}/id`,
          value: first.id,
          suggestion: "Pass --replace to regenerate this layout intentionally, or choose a different --prefix.",
        }),
      ];
    }
    if (options.replace === true) {
      for (let index = instances.length - 1; index >= 0; index -= 1) {
        const id = instances[index]?.id;
        if (typeof id === "string" && ids.has(id)) {
          instances.splice(index, 1);
        }
      }
    }
    for (const pin of layout) {
      instances.push(compactInstanceRecord(pin.id, options.prefabId, {
        position: pin.position,
      }, undefined));
    }
    return [];
  });
}

export async function addTag(options: IAddTagOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const diagnostics: IAuthoringDiagnostic[] = [];
    validateEcsId(diagnostics, file, "/tag", options.tag, "tag component");
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    const entity = findSceneItem(scene.entities, options.entityId);
    if (entity === undefined) {
      return [missingReferenceDiagnostic(file, "/entities", "entity", options.entityId, idsFromArray(scene.entities))];
    }
    entity.components = {
      ...(isRecord(entity.components) ? entity.components : {}),
      [options.tag]: {},
    };
    return [];
  });
}

export async function addGroup(options: IAddGroupOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const diagnostics: IAuthoringDiagnostic[] = [];
    validateEcsId(diagnostics, file, "/groupId", options.groupId, "group");
    if (options.name !== undefined && readString(options.name) === undefined) {
      diagnostics.push(typeDiagnostic(file, "/name", "group name must be a non-empty string.", options.name));
    }
    if (diagnostics.length > 0) {
      return diagnostics;
    }
    const entities = ensureArrayProperty(scene, "entities");
    entities.push({
      id: options.groupId,
      ...(options.position === undefined ? {} : { transform: { position: options.position } }),
      components: {
        SceneContainer: {
          kind: "group",
          ...(options.name === undefined ? {} : { name: options.name }),
        },
      },
    });
    return [];
  });
}

export async function addPrefab(options: IAddPrefabOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const prefabs = ensureArrayProperty(scene, "prefabs");
    prefabs.push({
      id: options.prefabId,
      ...(options.primitive === undefined ? {} : { primitive: options.primitive }),
      ...(options.color === undefined ? {} : { color: options.color }),
      ...(options.asset === undefined ? {} : { asset: options.asset }),
    });
  });
}

export async function setPrefabColor(options: ISetPrefabColorOptions): Promise<IAuthoringOperationResult> {
  return setPrefab({ color: options.color, prefabId: options.prefabId, projectPath: options.projectPath, sceneId: options.sceneId });
}

export async function setPrefab(options: ISetPrefabOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const prefab = findSceneItem(scene.prefabs, options.prefabId);
    if (prefab === undefined) {
      return [missingReferenceDiagnostic(file, "/prefabs", "prefab", options.prefabId, idsFromArray(scene.prefabs))];
    }
    if (options.asset !== undefined) {
      prefab.asset = options.asset;
    }
    if (options.color !== undefined) {
      prefab.color = options.color;
    }
    if (options.primitive !== undefined) {
      prefab.primitive = options.primitive;
    }
    return [];
  });
}

export async function addResource(options: IAddResourceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene) => {
    const resources = ensureArrayProperty(scene, "resources");
    resources.push({
      id: options.resourceId,
      ...(options.path === undefined ? {} : { path: options.path }),
      ...(options.value === undefined ? {} : { value: options.value }),
    });
  });
}

export async function setResource(options: ISetResourceOptions): Promise<IAuthoringOperationResult> {
  return mutateScene(options, (scene, file) => {
    const resource = findSceneItem(scene.resources, options.resourceId);
    if (resource === undefined) {
      return [missingReferenceDiagnostic(file, "/resources", "resource", options.resourceId, idsFromArray(scene.resources))];
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
