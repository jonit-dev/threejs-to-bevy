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
  contactShadowsComponentKeys,
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
  patrolComponentKeys,
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
  stateMachineComponentKeys,
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

export function validatePrefabs(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): void {
  const prefabs = readArray(value);
  if (value !== undefined && prefabs === undefined) {
    diagnostics.push(typeDiagnostic(file, "/prefabs", "prefabs must be an array.", value));
    return;
  }
  prefabs?.forEach((prefab, index) => {
    if (!isRecord(prefab)) {
      return;
    }
    const primitive = readString(prefab.primitive);
    if (prefab.primitive !== undefined && (primitive === undefined || !supportedPrefabPrimitives.has(primitive))) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_PREFAB_PRIMITIVE_UNKNOWN",
          file,
          message: `Unknown prefab primitive '${String(prefab.primitive)}'.`,
          path: `/prefabs/${index}/primitive`,
          value: prefab.primitive,
          suggestion: "Use 'box', 'capsule', 'cone', 'cylinder', 'plane', or 'sphere'.",
        }),
      );
    }
    if (prefab.color !== undefined && readString(prefab.color) === undefined) {
      diagnostics.push(typeDiagnostic(file, `/prefabs/${index}/color`, "prefab color must be a non-empty string.", prefab.color));
    }
    if (prefab.asset !== undefined && readString(prefab.asset) === undefined) {
      diagnostics.push(typeDiagnostic(file, `/prefabs/${index}/asset`, "prefab asset must be a non-empty project-relative asset path.", prefab.asset));
    }
  });
}

export function collectEntityIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  const entities = readArray(value);
  if (value !== undefined && entities === undefined) {
    diagnostics.push(typeDiagnostic(file, "/entities", "entities must be an array.", value));
    return [];
  }
  return collectIds(diagnostics, file, "/entities", entities, "entity", entityKeys);
}

export function collectInstanceIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  const instances = readArray(value);
  if (value !== undefined && instances === undefined) {
    diagnostics.push(typeDiagnostic(file, "/instances", "instances must be an array.", value));
    return [];
  }
  return collectIds(diagnostics, file, "/instances", instances, "entity", instanceKeys);
}

export function collectUiNodeIds(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown): string[] {
  if (value === undefined) {
    return [];
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, "/ui", "ui must be an object.", value));
    return [];
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/ui", value, uiKeys));
  const nodes = readArray(value.nodes);
  if (value.nodes !== undefined && nodes === undefined) {
    diagnostics.push(typeDiagnostic(file, "/ui/nodes", "ui.nodes must be an array.", value.nodes));
    return [];
  }
  return collectIds(diagnostics, file, "/ui/nodes", nodes, "ui-node", uiNodeKeys);
}

export function collectIds(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  basePath: string,
  values: unknown[] | undefined,
  kind: string,
  allowedKeys: ReadonlySet<string>,
): string[] {
  const ids: string[] = [];
  if (values === undefined) {
    return ids;
  }

  const seen = new Map<string, string>();
  values.forEach((value, index) => {
    const path = `${basePath}/${index}`;
    if (!isRecord(value)) {
      diagnostics.push(typeDiagnostic(file, path, `${kind} declaration must be an object.`, value));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, value, allowedKeys));
    const id = kind === "resource"
      ? validateResourceId(diagnostics, file, `${path}/id`, value.id)
      : kind === "entity"
        ? validateEcsId(diagnostics, file, `${path}/id`, value.id, kind)
        : kind === "input axis"
          ? validateEcsId(diagnostics, file, `${path}/id`, value.id, kind)
          : kind === "schema"
            ? validateEcsId(diagnostics, file, `${path}/id`, value.id, kind)
          : validateLogicalId(diagnostics, file, `${path}/id`, value.id, kind);
    if (id === undefined) {
      return;
    }
    const existingPath = seen.get(id);
    if (existingPath !== undefined) {
      diagnostics.push(
        authoringDiagnostic({
          code: duplicateIdCode(kind),
          file,
          message: `Duplicate ${kind} id '${id}'.`,
          path: `${path}/id`,
          value: id,
          related: [{ file, path: existingPath, message: `First ${kind} declaration with this id.` }],
          suggestion: `Give each ${kind} a stable unique id.`,
        }),
      );
    } else {
      seen.set(id, `${path}/id`);
      ids.push(id);
    }
  });
  return ids;
}

export function validateEntities(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: unknown,
  entityIds: readonly string[],
  prefabIds: readonly string[],
  materialIds: readonly string[],
): void {
  const entities = readArray(value);
  if (entities === undefined) {
    return;
  }

  entities.forEach((entity, index) => {
    if (!isRecord(entity)) {
      return;
    }
    const path = `/entities/${index}`;
    const prefab = readString(entity.prefab);
    if (entity.prefab !== undefined && prefab === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/prefab`, "Entity prefab must be a non-empty string.", entity.prefab));
    } else if (prefab !== undefined && !prefabIds.includes(prefab)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/prefab`, "prefab", prefab, prefabIds));
    }

    validateTransform(diagnostics, file, `${path}/transform`, entity.transform);
    validateComponents(diagnostics, file, `${path}/components`, entity.components, entityIds, materialIds);
  });
}

export function validateInstances(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  value: unknown,
  entityIds: readonly string[],
  instanceIds: readonly string[],
  prefabIds: readonly string[],
  materialIds: readonly string[],
): void {
  const instances = readArray(value);
  if (instances === undefined) {
    return;
  }

  instances.forEach((instance, index) => {
    if (!isRecord(instance)) {
      return;
    }
    const path = `/instances/${index}`;
    const id = readString(instance.id);
    if (id !== undefined && entityIds.includes(id)) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_DUPLICATE_ENTITY_ID",
          file,
          message: `Duplicate entity id '${id}' after compact instance expansion.`,
          path: `${path}/id`,
          value: id,
          suggestion: "Use a stable instance id that does not collide with scene.entities.",
        }),
      );
    }
    const prefab = readString(instance.prefab);
    if (prefab === undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/prefab`, "Compact instance prefab must be a non-empty string.", instance.prefab));
    } else if (!prefabIds.includes(prefab)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/prefab`, "prefab", prefab, prefabIds));
    }

    validateTransform(diagnostics, file, `${path}/transform`, instance.transform);
    validateComponents(diagnostics, file, `${path}/components`, instance.components, [...entityIds, ...instanceIds], materialIds);
  });
}

export function validateTransform(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "Transform must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, transformKeys));
  for (const key of transformKeys) {
    let vector = value[key];
    if (vector === undefined) {
      continue;
    }
    if (key === "rotation" && Array.isArray(vector) && vector.length === 4 && vector.every((item) => typeof item === "number" && Number.isFinite(item))) {
      const [x, y, z, w] = vector as [number, number, number, number];
      const euler = [
        Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y)),
        Math.asin(Math.max(-1, Math.min(1, 2 * (w * y - z * x)))),
        Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z)),
      ];
      value.rotation = euler;
      vector = euler;
      diagnostics.push(authoringDiagnostic({
        code: "TN_AUTHORING_ROTATION_QUATERNION_CONVERTED",
        file,
        message: "Transform rotation quaternion was converted to XYZ Euler radians.",
        path: `${path}/rotation`,
        severity: "warning",
        suggestion: "Persist the emitted three-number Euler rotation in durable source.",
      }));
    }
    if (!Array.isArray(vector) || vector.length !== 3 || vector.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
      diagnostics.push(
        authoringDiagnostic({
          code: "TN_AUTHORING_VECTOR3_INVALID",
          file,
          message: `Transform ${key} must be a three-number vector.`,
          path: `${path}/${key}`,
          value: vector,
          suggestion: "Use [x, y, z] numeric values.",
        }),
      );
    }
  }
}

export function validateComponents(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  entityIds: readonly string[],
  materialIds: readonly string[],
): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "components must be an object keyed by component kind.", value));
    return;
  }

  for (const [kind, component] of Object.entries(value)) {
    if (!isRecord(component)) {
      diagnostics.push(typeDiagnostic(file, `${path}/${escapeJsonPointer(kind)}`, `component '${kind}' must be an object.`, component));
      continue;
    }
    if (kind === "camera") {
      validateCameraComponent(diagnostics, file, `${path}/camera`, component, entityIds);
    } else if (kind === "MeshRenderer" || kind === "meshRenderer") {
      validateMeshRendererComponent(diagnostics, file, `${path}/${escapeJsonPointer(kind)}`, component, materialIds);
    } else if (kind === "Light" || kind === "light") {
      validateLightComponent(diagnostics, file, `${path}/${escapeJsonPointer(kind)}`, component);
    } else if (kind === "RenderLayers") {
      validateRenderLayersComponent(diagnostics, file, `${path}/RenderLayers`, component);
    } else if (kind === "RigidBody") {
      validateRigidBodyComponent(diagnostics, file, `${path}/RigidBody`, component);
    } else if (kind === "Collider") {
      validateColliderComponent(diagnostics, file, `${path}/Collider`, component);
    } else if (kind === "ContactShadows") {
      validateContactShadowsComponent(diagnostics, file, `${path}/ContactShadows`, component);
    } else if (kind === "CharacterController") {
      validateCharacterControllerComponent(diagnostics, file, `${path}/CharacterController`, component);
    } else if (kind === "KinematicMover") {
      validateKinematicMoverComponent(diagnostics, file, `${path}/KinematicMover`, component);
    } else if (kind === "Spawner") {
      validateSpawnerComponent(diagnostics, file, `${path}/Spawner`, component);
    } else if (kind === "Patrol") {
      validatePatrolComponent(diagnostics, file, `${path}/Patrol`, component);
    } else if (kind === "StateMachine") {
      validateStateMachineComponent(diagnostics, file, `${path}/StateMachine`, component);
    } else if (kind === "Visibility") {
      validateVisibilityComponent(diagnostics, file, `${path}/Visibility`, component);
    }
  }
}

export function validatePatrolComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, patrolComponentKeys));
  validateEnumString(diagnostics, file, `${path}/mode`, value.mode, new Set(["loop", "ping-pong"]), "patrol mode", "Use 'loop' or 'ping-pong'.");
  if (typeof value.speed !== "number" || !Number.isFinite(value.speed) || value.speed < 0) {
    diagnostics.push(typeDiagnostic(file, `${path}/speed`, "patrol speed must be a finite non-negative number.", value.speed));
  }
  validateOptionalNonNegativeNumber(diagnostics, file, `${path}/pauseAtWaypoint`, value.pauseAtWaypoint, "patrol pauseAtWaypoint must be a finite non-negative number.");
  if (typeof value.pauseAtWaypoint === "number" && value.pauseAtWaypoint > 60) {
    diagnostics.push(typeDiagnostic(file, `${path}/pauseAtWaypoint`, "patrol pauseAtWaypoint must be at most 60 seconds.", value.pauseAtWaypoint));
  }
  validateOptionalBoolean(diagnostics, file, `${path}/faceHeading`, value.faceHeading, "patrol faceHeading must be boolean.");
  validateOptionalBoolean(diagnostics, file, `${path}/paused`, value.paused, "patrol paused must be boolean.");
  const waypoints = readArray(value.waypoints);
  if (waypoints === undefined || waypoints.length < 2 || waypoints.length > 32 || waypoints.some((waypoint) => !isVector3(waypoint))) {
    diagnostics.push(typeDiagnostic(file, `${path}/waypoints`, "patrol waypoints must contain between 2 and 32 three-number vectors.", value.waypoints));
  }
}

export function validateStateMachineComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, stateMachineComponentKeys));
  const states = readArray(value.states)?.filter((state): state is string => typeof state === "string" && state.trim() !== "") ?? [];
  if (states.length === 0 || states.length > 32) {
    diagnostics.push(typeDiagnostic(file, `${path}/states`, "state machine states must contain between 1 and 32 non-empty names.", value.states));
  }
  if (new Set(states).size !== states.length) {
    diagnostics.push(typeDiagnostic(file, `${path}/states`, "state machine state names must be unique.", value.states));
  }
  const stateSet = new Set(states);
  validateRequiredString(diagnostics, file, `${path}/initial`, value.initial, "state machine initial must name a state.");
  if (typeof value.initial === "string" && !stateSet.has(value.initial)) {
    diagnostics.push(typeDiagnostic(file, `${path}/initial`, "state machine initial must reference a declared state.", value.initial));
  }
  validateOptionalString(diagnostics, file, `${path}/current`, value.current, "state machine current must be a non-empty state name.");
  if (typeof value.current === "string" && !stateSet.has(value.current)) {
    diagnostics.push(typeDiagnostic(file, `${path}/current`, "state machine current must reference a declared state.", value.current));
  }
  validateOptionalBoolean(diagnostics, file, `${path}/enabled`, value.enabled, "state machine enabled must be boolean.");
  const transitions = readArray(value.transitions);
  if (transitions === undefined || transitions.length > 64) {
    diagnostics.push(typeDiagnostic(file, `${path}/transitions`, "state machine transitions must contain at most 64 entries.", value.transitions));
    return;
  }
  transitions.forEach((transition, index) => {
    const transitionPath = `${path}/transitions/${index}`;
    if (!isRecord(transition)) {
      diagnostics.push(typeDiagnostic(file, transitionPath, "state machine transition must be an object.", transition));
      return;
    }
    validateRequiredString(diagnostics, file, `${transitionPath}/from`, transition.from, "state machine transition from must be a state name.");
    validateRequiredString(diagnostics, file, `${transitionPath}/to`, transition.to, "state machine transition to must be a state name.");
    if (typeof transition.from === "string" && !stateSet.has(transition.from)) diagnostics.push(typeDiagnostic(file, `${transitionPath}/from`, "state machine transition from must reference a declared state.", transition.from));
    if (typeof transition.to === "string" && !stateSet.has(transition.to)) diagnostics.push(typeDiagnostic(file, `${transitionPath}/to`, "state machine transition to must reference a declared state.", transition.to));
    if (!isRecord(transition.trigger)) {
      diagnostics.push(typeDiagnostic(file, `${transitionPath}/trigger`, "state machine transition trigger must be an object.", transition.trigger));
      return;
    }
    const trigger = transition.trigger;
    if (trigger.kind === "event") {
      validateRequiredString(diagnostics, file, `${transitionPath}/trigger/event`, trigger.event, "event trigger event must be a non-empty id.");
    } else if (trigger.kind === "sensor") {
      validateRequiredString(diagnostics, file, `${transitionPath}/trigger/sensor`, trigger.sensor, "sensor trigger sensor must be a non-empty id.");
      validateEnumString(diagnostics, file, `${transitionPath}/trigger/phase`, trigger.phase, new Set(["enter", "exit", "stay"]), "sensor trigger phase", "Use 'enter', 'exit', or 'stay'.");
    } else if (trigger.kind === "timer") {
      validateOptionalPositiveInteger(diagnostics, file, `${transitionPath}/trigger/ticks`, trigger.ticks, "timer trigger ticks must be a positive integer.");
    } else {
      diagnostics.push(typeDiagnostic(file, `${transitionPath}/trigger/kind`, "state machine trigger kind must be event, sensor, or timer.", trigger.kind));
    }
  });
}

export function validateMeshRendererComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>, materialIds: readonly string[]): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, meshRendererComponentKeys));
  const mesh = readString(value.mesh);
  if (value.mesh !== undefined && mesh === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/mesh`, "mesh renderer mesh must be a non-empty mesh id.", value.mesh));
  }
  const material = readString(value.material);
  if (value.material !== undefined && material === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/material`, "mesh renderer material must be a non-empty material id.", value.material));
  } else if (material !== undefined && materialIds.length > 0 && !materialIds.includes(material)) {
    diagnostics.push(missingReferenceDiagnostic(file, `${path}/material`, "material", material, materialIds));
  }
  validateOptionalBoolean(diagnostics, file, `${path}/visible`, value.visible, "mesh renderer visible must be a boolean.");
  validateOptionalBoolean(diagnostics, file, `${path}/castShadow`, value.castShadow, "mesh renderer castShadow must be a boolean.");
  validateOptionalBoolean(diagnostics, file, `${path}/receiveShadow`, value.receiveShadow, "mesh renderer receiveShadow must be a boolean.");
}

export function validateLightComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, lightComponentKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedLightKinds, "light kind", "Use 'ambient', 'directional', 'point', or 'spot'.");
  validateRequiredNumber(diagnostics, file, `${path}/intensity`, value.intensity, "light intensity must be a finite number.");
  if (value.color === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/color`, "light color must be a non-empty string or RGB/RGBA number array.", value.color));
  } else if (readString(value.color) === undefined && !isNumberTuple(value.color, 3, 4)) {
    diagnostics.push(typeDiagnostic(file, `${path}/color`, "light color must be a non-empty string or RGB/RGBA number array.", value.color));
  }
  validateOptionalNumber(diagnostics, file, `${path}/range`, value.range, "light range must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/angle`, value.angle, "light angle must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/shadowBias`, value.shadowBias, "light shadowBias must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/shadowNormalBias`, value.shadowNormalBias, "light shadowNormalBias must be a finite number.");
}

export function validateRenderLayersComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, renderLayersComponentKeys));
  if (!Array.isArray(value.layers) || value.layers.length === 0 || value.layers.some((layer) => readString(layer) === undefined)) {
    diagnostics.push(typeDiagnostic(file, `${path}/layers`, "render layers must be a non-empty string array.", value.layers));
  }
}

export function validateContactShadowsComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, contactShadowsComponentKeys));
  if (!Array.isArray(value.size) || value.size.length !== 2 || value.size.some((entry) => typeof entry !== "number" || !Number.isFinite(entry) || entry < 0.1 || entry > 500)) {
    diagnostics.push(typeDiagnostic(file, `${path}/size`, "contact shadows size must contain two finite extents from 0.1 through 500.", value.size));
  }
  validateBoundedRequiredNumber(diagnostics, file, `${path}/height`, value.height, 0.1, 50, "contact shadows height");
  if (![128, 256, 512, 1024].includes(value.resolution as number)) {
    diagnostics.push(typeDiagnostic(file, `${path}/resolution`, "contact shadows resolution must be 128, 256, 512, or 1024.", value.resolution));
  }
  validateBoundedRequiredNumber(diagnostics, file, `${path}/softness`, value.softness, 0, 10, "contact shadows softness");
  validateBoundedRequiredNumber(diagnostics, file, `${path}/opacity`, value.opacity, 0, 1, "contact shadows opacity");
  if (value.updateMode !== "static" && value.updateMode !== "dynamic") {
    diagnostics.push(typeDiagnostic(file, `${path}/updateMode`, "contact shadows updateMode must be 'static' or 'dynamic'.", value.updateMode));
  }
}

function validateBoundedRequiredNumber(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push(typeDiagnostic(file, path, `${label} must be a finite number from ${minimum} through ${maximum}.`, value));
  }
}

export function validateRigidBodyComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, rigidBodyComponentKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedRigidBodyKinds, "rigid body kind", "Use 'dynamic', 'kinematic', or 'static'. Use 'static' for immovable fixed objects.", {
    allowed: ["dynamic", "kinematic", "static"],
    docs: "docs/contracts/ir.md",
    instruction: "Replace RigidBody.kind with 'dynamic', 'kinematic', or 'static'. If you wrote 'fixed', use 'static'.",
    snippet: "{ \"RigidBody\": { \"kind\": \"static\" } }",
  });
  if (value.angularVelocity !== undefined && !isVector3(value.angularVelocity)) {
    diagnostics.push(typeDiagnostic(file, `${path}/angularVelocity`, "rigid body angularVelocity must be a three-number vector.", value.angularVelocity));
  }
  if (value.enabledRotations !== undefined && !isBooleanVector3(value.enabledRotations)) {
    diagnostics.push(typeDiagnostic(file, `${path}/enabledRotations`, "rigid body enabledRotations must be a three-boolean vector.", value.enabledRotations));
  }
  if (value.enabledTranslations !== undefined && !isBooleanVector3(value.enabledTranslations)) {
    diagnostics.push(typeDiagnostic(file, `${path}/enabledTranslations`, "rigid body enabledTranslations must be a three-boolean vector.", value.enabledTranslations));
  }
  validateCcdComponent(diagnostics, file, `${path}/ccd`, value.ccd);
  validateOptionalNumber(diagnostics, file, `${path}/mass`, value.mass, "rigid body mass must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/inverseMass`, value.inverseMass, "rigid body inverseMass must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/damping`, value.damping, "rigid body damping must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/gravityScale`, value.gravityScale, "rigid body gravityScale must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/sleepThreshold`, value.sleepThreshold, "rigid body sleepThreshold must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/solverIterations`, value.solverIterations, "rigid body solverIterations must be a finite number.");
  if (value.velocity !== undefined && !isVector3(value.velocity)) {
    diagnostics.push(typeDiagnostic(file, `${path}/velocity`, "rigid body velocity must be a three-number vector.", value.velocity));
  }
}

export function validateCcdComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "rigid body ccd must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, new Set(["enabled", "maxSubsteps", "mode"])));
  validateOptionalBoolean(diagnostics, file, `${path}/enabled`, value.enabled, "rigid body ccd enabled must be a boolean.");
  validateEnumString(diagnostics, file, `${path}/mode`, value.mode, new Set(["linear", "swept-aabb"]), "ccd mode", "Use 'linear' or 'swept-aabb'.");
  validateOptionalNumber(diagnostics, file, `${path}/maxSubsteps`, value.maxSubsteps, "rigid body ccd maxSubsteps must be a finite number.");
}

export function validateColliderComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, colliderComponentKeys));
  validateEnumString(diagnostics, file, `${path}/kind`, value.kind, supportedColliderKinds, "collider kind", "Use 'box', 'capsule', 'cylinder', 'mesh', or 'sphere'.");
  if (value.center !== undefined && !isVector3(value.center)) {
    diagnostics.push(typeDiagnostic(file, `${path}/center`, "collider center must be a three-number vector.", value.center));
  }
  if (value.size !== undefined && !isVector3(value.size)) {
    diagnostics.push(typeDiagnostic(file, `${path}/size`, "collider size must be a three-number vector.", value.size));
  }
  validateOptionalNumber(diagnostics, file, `${path}/radius`, value.radius, "collider radius must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/height`, value.height, "collider height must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/friction`, value.friction, "collider friction must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/restitution`, value.restitution, "collider restitution must be a finite number.");
  validateOptionalBoolean(diagnostics, file, `${path}/trigger`, value.trigger, "collider trigger must be a boolean.");
  validateColliderSlope(diagnostics, file, `${path}/slope`, value.slope);
}

export function validateCharacterControllerComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, characterControllerComponentKeys));
  validateRequiredString(diagnostics, file, `${path}/moveXAxis`, value.moveXAxis, "character controller moveXAxis must be a non-empty input axis id.");
  validateRequiredString(diagnostics, file, `${path}/moveZAxis`, value.moveZAxis, "character controller moveZAxis must be a non-empty input axis id.");
  validateRequiredNumber(diagnostics, file, `${path}/speed`, value.speed, "character controller speed must be a finite number.");
  validateEnumString(diagnostics, file, `${path}/grounding`, value.grounding, supportedCharacterControllerGrounding, "character controller grounding", "Use 'none' or 'raycast'.");
  validateOptionalBoolean(diagnostics, file, `${path}/blocking`, value.blocking, "character controller blocking must be a boolean.");
  validateOptionalNumber(diagnostics, file, `${path}/slopeLimit`, value.slopeLimit, "character controller slopeLimit must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/stepOffset`, value.stepOffset, "character controller stepOffset must be a finite number.");
  validateOptionalString(diagnostics, file, `${path}/interactAction`, value.interactAction, "character controller interactAction must be a non-empty input action id.");
  validateCharacterPushPolicy(diagnostics, file, `${path}/pushPolicy`, value.pushPolicy);
}

export function validateColliderSlope(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "collider slope must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, new Set(["axis", "direction", "rise", "run"])));
  validateOptionalStringEnum(diagnostics, file, `${path}/axis`, value.axis, new Set(["x", "z"]), "collider slope axis must be 'x' or 'z'.");
  if (value.direction !== -1 && value.direction !== 1) {
    diagnostics.push(typeDiagnostic(file, `${path}/direction`, "collider slope direction must be -1 or 1.", value.direction));
  }
  validateRequiredPositiveNumber(diagnostics, file, `${path}/rise`, value.rise, "collider slope rise must be a positive finite number.");
  validateRequiredPositiveNumber(diagnostics, file, `${path}/run`, value.run, "collider slope run must be a positive finite number.");
}

export function validateCharacterPushPolicy(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "character controller pushPolicy must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, new Set(["allowedLayers", "blockedWhenTooHeavy", "enabled", "impulseScale", "maxPushMass", "minMoveSpeed"])));
  validateOptionalStringArray(diagnostics, file, `${path}/allowedLayers`, value.allowedLayers, "character controller pushPolicy allowedLayers must be an array of non-empty layer strings.");
  validateOptionalBoolean(diagnostics, file, `${path}/blockedWhenTooHeavy`, value.blockedWhenTooHeavy, "character controller pushPolicy blockedWhenTooHeavy must be a boolean.");
  validateOptionalBoolean(diagnostics, file, `${path}/enabled`, value.enabled, "character controller pushPolicy enabled must be a boolean.");
  validateOptionalNonNegativeNumber(diagnostics, file, `${path}/impulseScale`, value.impulseScale, "character controller pushPolicy impulseScale must be a finite non-negative number.");
  validateOptionalNonNegativeNumber(diagnostics, file, `${path}/maxPushMass`, value.maxPushMass, "character controller pushPolicy maxPushMass must be a finite non-negative number.");
  validateOptionalNonNegativeNumber(diagnostics, file, `${path}/minMoveSpeed`, value.minMoveSpeed, "character controller pushPolicy minMoveSpeed must be a finite non-negative number.");
}

export function validateKinematicMoverComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, kinematicMoverComponentKeys));
  validateEnumString(diagnostics, file, `${path}/mode`, value.mode, supportedKinematicMoverModes, "kinematic mover mode", "Use 'sine' or 'waypoints'.");
  validateRequiredNumber(diagnostics, file, `${path}/speed`, value.speed, "kinematic mover speed must be a finite number.");
  validateOptionalStringEnum(diagnostics, file, `${path}/axis`, value.axis, supportedKinematicMoverAxes, "kinematic mover axis must be 'x', 'y', or 'z'.");
  validateOptionalNumber(diagnostics, file, `${path}/phase`, value.phase, "kinematic mover phase must be a finite number.");
  validateOptionalNumber(diagnostics, file, `${path}/radius`, value.radius, "kinematic mover radius must be a finite number.");
  if (typeof value.radius === "number" && value.radius < 0) {
    diagnostics.push(typeDiagnostic(file, `${path}/radius`, "kinematic mover radius must be non-negative.", value.radius));
  }
  validateOptionalBoolean(diagnostics, file, `${path}/loop`, value.loop, "kinematic mover loop must be a boolean.");
  if (value.direction !== undefined && !isVector3(value.direction)) {
    diagnostics.push(typeDiagnostic(file, `${path}/direction`, "kinematic mover direction must be a three-number vector.", value.direction));
  }
  const waypoints = readArray(value.waypoints);
  if (value.waypoints !== undefined && (waypoints === undefined || waypoints.some((waypoint) => !isVector3(waypoint)))) {
    diagnostics.push(typeDiagnostic(file, `${path}/waypoints`, "kinematic mover waypoints must be an array of three-number vectors.", value.waypoints));
  }
}

export function validateSpawnerComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, spawnerComponentKeys));
  validateRequiredString(diagnostics, file, `${path}/prefab`, value.prefab, "spawner prefab must be a non-empty prefab id.");
  validateEnumString(diagnostics, file, `${path}/mode`, value.mode, supportedSpawnerModes, "spawner mode", "Use 'once', 'interval', or 'wave'.");
  validateOptionalBoolean(diagnostics, file, `${path}/enabled`, value.enabled, "spawner enabled must be a boolean.");
  validateOptionalPositiveNumber(diagnostics, file, `${path}/interval`, value.interval, "spawner interval must be a positive finite number.");
  validateOptionalPositiveInteger(diagnostics, file, `${path}/waveSize`, value.waveSize, "spawner waveSize must be a positive integer.");
  validateOptionalPositiveInteger(diagnostics, file, `${path}/maxAlive`, value.maxAlive, "spawner maxAlive must be a positive integer.");
  validateOptionalPositiveInteger(diagnostics, file, `${path}/maxTotal`, value.maxTotal, "spawner maxTotal must be a positive integer.");
  validateOptionalNumber(diagnostics, file, `${path}/jitterSeed`, value.jitterSeed, "spawner jitterSeed must be a finite number.");
  validateSpawnerArea(diagnostics, file, `${path}/area`, value.area);
  validateSpawnerDespawnPolicy(diagnostics, file, `${path}/despawnPolicy`, value.despawnPolicy);
}

export function validateSpawnerArea(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "spawner area must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, spawnerAreaKeys));
  validateEnumString(diagnostics, file, `${path}/shape`, value.shape, supportedSpawnerAreaShapes, "spawner area shape", "Use 'point', 'box', or 'circle'.");
  if (value.size !== undefined && (typeof value.size !== "number" || !Number.isFinite(value.size)) && !isVector2(value.size) && !isVector3(value.size)) {
    diagnostics.push(typeDiagnostic(file, `${path}/size`, "spawner area size must be a finite number, vec2, or vec3.", value.size));
  }
}

export function validateSpawnerDespawnPolicy(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "spawner despawnPolicy must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, spawnerDespawnPolicyKeys));
  validateOptionalPositiveNumber(diagnostics, file, `${path}/afterSeconds`, value.afterSeconds, "spawner despawnPolicy afterSeconds must be a positive finite number.");
  validateOptionalPositiveNumber(diagnostics, file, `${path}/beyondDistance`, value.beyondDistance, "spawner despawnPolicy beyondDistance must be a positive finite number.");
}

export function validateVisibilityComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: Record<string, unknown>): void {
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, visibilityComponentKeys));
  if (typeof value.visible !== "boolean") {
    diagnostics.push(typeDiagnostic(file, `${path}/visible`, "visibility visible must be a boolean.", value.visible));
  }
}

export function validateEnumString(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
  suggestion: string,
  fix?: IAuthoringDiagnostic["fix"],
): void {
  const text = readString(value);
  if (text === undefined || !allowed.has(text)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_COMPONENT_VALUE_INVALID",
        file,
        message: `Unknown ${label} '${String(value)}'.`,
        path,
        value,
        suggestion,
        ...(fix === undefined ? {} : { fix }),
      }),
    );
  }
}

export function validateRequiredNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateCustomMeshSource(diagnostics: IAuthoringDiagnostic[], file: string, path: string, item: Record<string, unknown>): void {
  if (item.primitive !== undefined && item.primitive !== "custom") {
    diagnostics.push(typeDiagnostic(file, `${path}/primitive`, "custom mesh primitive must be 'custom' when present.", item.primitive));
  }
  if (item.storage !== undefined && item.storage !== "binary") {
    diagnostics.push(typeDiagnostic(file, `${path}/storage`, "custom mesh storage must be 'binary' when present.", item.storage));
  }
  if (!Array.isArray(item.attributes) || item.attributes.length === 0) {
    diagnostics.push(typeDiagnostic(file, `${path}/attributes`, "custom mesh attributes must be a non-empty array.", item.attributes));
    return;
  }
  let hasPosition = false;
  let vertexCount: number | undefined;
  let positionVertexCount: number | undefined;
  const seenAttributes = new Set<string>();
  for (const [index, attribute] of item.attributes.entries()) {
    const attributePath = `${path}/attributes/${index}`;
    if (!isRecord(attribute)) {
      diagnostics.push(typeDiagnostic(file, attributePath, "custom mesh attribute must be an object.", attribute));
      continue;
    }
    validateRequiredString(diagnostics, file, `${attributePath}/name`, attribute.name, "custom mesh attribute name must be a non-empty string.");
    if (typeof attribute.name === "string") {
      if (seenAttributes.has(attribute.name)) {
        diagnostics.push(typeDiagnostic(file, `${attributePath}/name`, "custom mesh attribute names must be unique.", attribute.name));
      }
      seenAttributes.add(attribute.name);
    }
    if (attribute.name === "position") {
      hasPosition = true;
    }
    if (![1, 2, 3, 4].includes(Number(attribute.itemSize))) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, "custom mesh attribute itemSize must be 1, 2, 3, or 4.", attribute.itemSize));
    } else if ((attribute.name === "position" || attribute.name === "normal") && attribute.itemSize !== 3) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, `custom mesh ${String(attribute.name)} attribute itemSize must be 3.`, attribute.itemSize));
    } else if ((attribute.name === "uv" || attribute.name === "uv1") && attribute.itemSize !== 2) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, `custom mesh ${String(attribute.name)} attribute itemSize must be 2.`, attribute.itemSize));
    } else if (attribute.name === "color" && attribute.itemSize !== 4) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/itemSize`, "custom mesh color attribute itemSize must be 4.", attribute.itemSize));
    }
    if (!Array.isArray(attribute.values) || attribute.values.length === 0 || attribute.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/values`, "custom mesh attribute values must be non-empty finite numbers.", attribute.values));
    } else if (typeof attribute.itemSize === "number" && Number.isInteger(attribute.itemSize) && attribute.values.length % attribute.itemSize !== 0) {
      diagnostics.push(typeDiagnostic(file, `${attributePath}/values`, "custom mesh attribute values length must be divisible by itemSize.", attribute.values));
    } else if (typeof attribute.itemSize === "number" && Number.isInteger(attribute.itemSize)) {
      const count = attribute.values.length / attribute.itemSize;
      vertexCount ??= count;
      if (count !== vertexCount) {
        diagnostics.push(typeDiagnostic(file, `${attributePath}/values`, "custom mesh attributes must have matching vertex counts.", attribute.values));
      }
      if (attribute.name === "position") {
        positionVertexCount = count;
      }
    }
  }
  if (!hasPosition) {
    diagnostics.push(typeDiagnostic(file, `${path}/attributes`, "custom mesh attributes must include a position attribute.", item.attributes));
  }
  if (item.indices !== undefined) {
    if (!Array.isArray(item.indices) || item.indices.length === 0 || item.indices.length % 3 !== 0 || item.indices.some((value) => !Number.isInteger(value) || Number(value) < 0)) {
      diagnostics.push(typeDiagnostic(file, `${path}/indices`, "custom mesh indices must be non-negative integers in complete triangles.", item.indices));
    } else if (positionVertexCount !== undefined) {
      for (const [index, value] of item.indices.entries()) {
        if (Number(value) >= positionVertexCount) {
          diagnostics.push(typeDiagnostic(file, `${path}/indices/${index}`, "custom mesh indices must be within the position vertex count.", value));
        }
      }
    }
  }
}

export function validateOptionalNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateRequiredPositiveNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalPositiveInteger(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (!Number.isInteger(value) || Number(value) <= 0)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalNonNegativeNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalNonNegativeInteger(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (!Number.isInteger(value) || Number(value) < 0)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalVec2(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.length !== 2 || value.some((item) => typeof item !== "number" || !Number.isFinite(item)))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function isVector2(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

export function validateOptionalStringEnum(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, allowed: ReadonlySet<string>, message: string): void {
  const text = readString(value);
  if (value !== undefined && (text === undefined || !allowed.has(text))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateRequiredString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (readString(value) === undefined) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalString(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && readString(value) === undefined) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalStringArray(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (!Array.isArray(value) || value.some((item) => readString(item) === undefined))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalBoolean(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && typeof value !== "boolean") {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function isVector3(value: unknown): value is [number, number, number] {
  return isNumberTuple(value, 3, 3);
}

export function isBooleanVector3(value: unknown): value is [boolean, boolean, boolean] {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => typeof entry === "boolean");
}

export function isNumberTuple(value: unknown, minLength: number, maxLength: number): boolean {
  return Array.isArray(value)
    && value.length >= minLength
    && value.length <= maxLength
    && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));
}

export function validateCameraComponent(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, entityIds: readonly string[]): void {
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, path, "camera component must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, path, value, cameraComponentKeys));
  const mode = readString(value.mode);
  if (value.mode !== undefined && (mode === undefined || !supportedCameraModes.has(mode))) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_CAMERA_MODE_UNKNOWN",
        file,
        message: `Unknown camera mode '${String(value.mode)}'.`,
        path: `${path}/mode`,
        value: value.mode,
        suggestion: "Use 'third-person-follow', 'perspective', or 'orthographic'.",
      }),
    );
  }
  const target = readString(value.target);
  if (value.target !== undefined && target === undefined) {
    diagnostics.push(typeDiagnostic(file, `${path}/target`, "camera target must be a non-empty entity id.", value.target));
  } else if (target !== undefined && !entityIds.includes(target)) {
    diagnostics.push(missingReferenceDiagnostic(file, `${path}/target`, "entity", target, entityIds));
  }
  for (const key of ["far", "fovY", "near", "size"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]) || value[key] <= 0)) {
      diagnostics.push(typeDiagnostic(file, `${path}/${key}`, `camera ${key} must be a positive finite number.`, value[key]));
    }
  }
}
