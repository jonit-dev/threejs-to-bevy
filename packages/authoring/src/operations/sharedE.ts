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

export const canonicalKeyboardCodes = new Set([
  "AltLeft",
  "AltRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backquote",
  "Backslash",
  "Backspace",
  "BracketLeft",
  "BracketRight",
  "CapsLock",
  "Comma",
  "ContextMenu",
  "ControlLeft",
  "ControlRight",
  "Delete",
  "End",
  "Enter",
  "Equal",
  "Escape",
  "Home",
  "Insert",
  "IntlBackslash",
  "IntlRo",
  "IntlYen",
  "MetaLeft",
  "MetaRight",
  "Minus",
  "PageDown",
  "PageUp",
  "Pause",
  "Period",
  "Quote",
  "ScrollLock",
  "Semicolon",
  "ShiftLeft",
  "ShiftRight",
  "Slash",
  "Space",
  "Tab",
]);

export const keyboardCodeAliases = new Map<string, string>([
  ["alt", "AltLeft"],
  ["arrowdown", "ArrowDown"],
  ["arrow-down", "ArrowDown"],
  ["arrowleft", "ArrowLeft"],
  ["arrow-left", "ArrowLeft"],
  ["arrowright", "ArrowRight"],
  ["arrow-right", "ArrowRight"],
  ["arrowup", "ArrowUp"],
  ["arrow-up", "ArrowUp"],
  ["control", "ControlLeft"],
  ["ctrl", "ControlLeft"],
  ["down", "ArrowDown"],
  ["esc", "Escape"],
  ["left", "ArrowLeft"],
  ["meta", "MetaLeft"],
  ["right", "ArrowRight"],
  ["shift", "ShiftLeft"],
  ["spacebar", "Space"],
  ["up", "ArrowUp"],
  ...[...canonicalKeyboardCodes].map((code) => [code.toLowerCase(), code] as const),
]);

export function isCanonicalKeyboardCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code)
    || /^Digit[0-9]$/.test(code)
    || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)
    || /^Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma|ParenLeft|ParenRight|Backspace)$/.test(code)
    || canonicalKeyboardCodes.has(code);
}

export function normalizeKeyboardCodeAlias(code: string): string {
  if (isCanonicalKeyboardCode(code)) {
    return code;
  }
  if (/^[a-z]$/i.test(code)) {
    return `Key${code.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(code)) {
    return `Digit${code}`;
  }
  return keyboardCodeAliases.get(code.toLowerCase()) ?? code;
}

export function validateInputControlsSettings(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, actionIds: ReadonlySet<string>, axisIds: ReadonlySet<string>): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push(typeDiagnostic(file, "/controlsSettings", "controlsSettings must be an object.", value));
    return;
  }
  diagnostics.push(...unknownKeyDiagnostics(file, "/controlsSettings", value, inputControlsSettingsKeys));
  validateRequiredString(diagnostics, file, "/controlsSettings/profileId", value.profileId, "controls settings profileId must be a non-empty string.");
  const rows = readArray(value.rows);
  if (!Array.isArray(value.rows)) {
    diagnostics.push(typeDiagnostic(file, "/controlsSettings/rows", "controls settings rows must be an array.", value.rows));
    return;
  }
  const seenRows = new Set<string>();
  rows?.forEach((row, index) => {
    const path = `/controlsSettings/rows/${index}`;
    if (!isRecord(row)) {
      diagnostics.push(typeDiagnostic(file, path, "controls settings row must be an object.", row));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, row, inputControlsSettingsRowKeys));
    validateEnumString(diagnostics, file, `${path}/kind`, row.kind, supportedInputRebindKinds, "controls settings row kind", "Use 'action' or 'axis'.");
    const target = validateEcsId(diagnostics, file, `${path}/actionOrAxisId`, row.actionOrAxisId, "input rebind target");
    if (row.kind === "action" && row.axisSlot !== undefined) {
      diagnostics.push(typeDiagnostic(file, `${path}/axisSlot`, "action controls rows cannot declare axisSlot.", row.axisSlot));
    } else if (row.kind === "axis") {
      validateEnumString(diagnostics, file, `${path}/axisSlot`, row.axisSlot, supportedInputAxisSlots, "controls settings axis slot", "Use 'negative', 'positive', or 'value'.");
    }
    if (target !== undefined && row.kind === "action" && !actionIds.has(target)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/actionOrAxisId`, "input action", target, [...actionIds].sort()));
    }
    if (target !== undefined && row.kind === "axis" && !axisIds.has(target)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/actionOrAxisId`, "input axis", target, [...axisIds].sort()));
    }
    validateStringList(diagnostics, file, `${path}/defaultBindings`, row.defaultBindings, "controls settings defaultBindings must be non-empty binding strings.");
    validateStructuredInputBindingList(diagnostics, file, `${path}/defaultBindings`, row.defaultBindings);
    validateOptionalString(diagnostics, file, `${path}/uiNodeId`, row.uiNodeId, "controls settings uiNodeId must be a non-empty UI node id.");
    if (row.captureState !== undefined) {
      validateEnumString(diagnostics, file, `${path}/captureState`, row.captureState, supportedInputCaptureStates, "controls settings capture state", "Use a supported capture state such as 'idle' or 'waiting-for-input'.");
    }
    const key = inputControlsRowSortKey(row);
    if (seenRows.has(key)) {
      diagnostics.push(typeDiagnostic(file, path, "controls settings rows must be unique by kind, actionOrAxisId, and axisSlot.", row));
    }
    seenRows.add(key);
  });
}

export function validateInputBindingOverrides(diagnostics: IAuthoringDiagnostic[], file: string, value: unknown, actionIds: ReadonlySet<string>, axisIds: ReadonlySet<string>): void {
  if (value === undefined) {
    return;
  }
  const overrides = readArray(value);
  if (overrides === undefined) {
    diagnostics.push(typeDiagnostic(file, "/persistedBindingOverrides", "persistedBindingOverrides must be an array.", value));
    return;
  }
  overrides.forEach((override, index) => {
    const path = `/persistedBindingOverrides/${index}`;
    if (!isRecord(override)) {
      diagnostics.push(typeDiagnostic(file, path, "persisted binding override must be an object.", override));
      return;
    }
    diagnostics.push(...unknownKeyDiagnostics(file, path, override, inputPersistedBindingOverrideKeys));
    validateRequiredString(diagnostics, file, `${path}/profileId`, override.profileId, "persisted binding override profileId must be a non-empty string.");
    const target = validateEcsId(diagnostics, file, `${path}/actionOrAxisId`, override.actionOrAxisId, "input override target");
    if (target !== undefined && !actionIds.has(target) && !axisIds.has(target)) {
      diagnostics.push(missingReferenceDiagnostic(file, `${path}/actionOrAxisId`, "input action or axis", target, [...actionIds, ...axisIds].sort()));
    }
    validateEnumString(diagnostics, file, `${path}/device`, override.device, supportedInputOverrideDevices, "input override device", "Use 'keyboard', 'gamepad', 'pointer', or 'touch'.");
    validateRequiredString(diagnostics, file, `${path}/control`, override.control, "persisted binding override control must be a non-empty string.");
    if (override.device === "keyboard") {
      const control = readString(override.control);
      if (control !== undefined) {
        validateStructuredInputBindingString(diagnostics, file, `${path}/control`, `keyboard.${control}`);
      }
    }
    if (override.axisSlot !== undefined) {
      validateEnumString(diagnostics, file, `${path}/axisSlot`, override.axisSlot, supportedInputAxisSlots, "input override axis slot", "Use 'negative', 'positive', or 'value'.");
    }
    validateOptionalNumber(diagnostics, file, `${path}/deadzone`, override.deadzone, "persisted binding override deadzone must be a finite number.");
    validateOptionalNumber(diagnostics, file, `${path}/scale`, override.scale, "persisted binding override scale must be a finite number.");
    validateOptionalString(diagnostics, file, `${path}/updatedAt`, override.updatedAt, "persisted binding override updatedAt must be a non-empty timestamp string.");
    validateStringList(diagnostics, file, `${path}/modifiers`, override.modifiers, "persisted binding override modifiers must be non-empty strings.");
  });
}

export function validateStringList(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  message: string,
): void {
  const items = readArray(value);
  if (value !== undefined && (items === undefined || items.some((item) => readString(item) === undefined))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateSupportedStringList(
  diagnostics: IAuthoringDiagnostic[],
  file: string,
  path: string,
  value: unknown,
  allowed: ReadonlySet<string>,
  message: string,
): void {
  const items = readArray(value);
  if (value !== undefined && (items === undefined || items.some((item) => readString(item) === undefined || !allowed.has(readString(item) ?? "")))) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function validateOptionalPositiveNumber(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, message: string): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    diagnostics.push(typeDiagnostic(file, path, message, value));
  }
}

export function cloneJson(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value)) as unknown;
}

export function validateEcsId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, kind: string): string | undefined {
  const id = readString(value);
  if (id === undefined || !ecsIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: `${kind} id must be a non-empty ECS id using letters, numbers, '.', '_' or '-'.`,
        path,
        value,
        suggestion: "Use a stable id such as 'kart.player.oobi' or 'track.arrow.-1.1'.",
      }),
    );
    return undefined;
  }
  return id;
}

export function validateEntityId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): string | undefined {
  const id = readString(value);
  if (id === undefined || !id.split("/").every((segment) => ecsIdPattern.test(segment))) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: "entity id must use ECS id segments separated by optional '/'.",
        path,
        value,
        suggestion: "Use a stable id such as 'kart.player' or the derived child id 'wall/piece.northwest'.",
      }),
    );
    return undefined;
  }
  return id;
}

export function validateEventId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): string | undefined {
  const id = readString(value);
  if (id === undefined || !/^[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9][A-Za-z0-9._-]*)*$/.test(id)) {
    diagnostics.push(authoringDiagnostic({
      code: "TN_AUTHORING_ID_INVALID",
      file,
      message: "event schema id must use letters, numbers, '.', '_', '-', and optional ':' namespace separators.",
      path,
      value,
      suggestion: "Use a stable id such as 'damage.applied' or 'inventory:use-item'.",
    }));
    return undefined;
  }
  return id;
}

export function validateResourceId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown): string | undefined {
  const id = readString(value);
  if (id === undefined || !resourceIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: "resource id must be a non-empty ECS resource id using letters, numbers, '.', '_' or '-'.",
        path,
        value,
        suggestion: "Use a stable id such as 'RaceState', 'MinimapState', or 'hud.score'.",
      }),
    );
    return undefined;
  }
  return id;
}

export function validateLogicalId(diagnostics: IAuthoringDiagnostic[], file: string, path: string, value: unknown, kind: string): string | undefined {
  const id = readString(value);
  if (id === undefined || !logicalIdPattern.test(id)) {
    diagnostics.push(
      authoringDiagnostic({
        code: "TN_AUTHORING_ID_INVALID",
        file,
        message: `${kind} id must be a non-empty logical id using lowercase letters, numbers, '.', '_' or '-'.`,
        path,
        value,
        suggestion: "Use a stable id such as 'player-kart' or 'scene.arena'.",
      }),
    );
    return undefined;
  }
  return id;
}

export function unknownKeyDiagnostics(file: string, path: string, value: Record<string, unknown>, allowedKeys: ReadonlySet<string>): IAuthoringDiagnostic[] {
  return Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .sort()
    .map((key) =>
      authoringDiagnostic({
        code: "TN_AUTHORING_UNKNOWN_FIELD",
        file,
        message: `Unknown field '${key}' is not supported in this authoring document shape.`,
        path: `${path}/${escapeJsonPointer(key)}`,
        value: key,
        suggestion: "Remove the field or use a supported structured authoring property.",
      }),
    );
}

export function missingReferenceDiagnostic(file: string, path: string, kind: string, value: string, candidates: readonly string[]): IAuthoringDiagnostic {
  return authoringDiagnostic({
    code: "TN_AUTHORING_REF_MISSING",
    file,
    message: `No ${kind} with id '${value}' exists.`,
    path,
    value,
    suggestion: closestIdSuggestion(value, candidates),
  });
}

export function closestIdSuggestion(value: string, candidates: readonly string[]): string | undefined {
  const closest = candidates
    .map((candidate) => ({ candidate, distance: levenshtein(value, candidate) }))
    .sort((left, right) => left.distance - right.distance || left.candidate.localeCompare(right.candidate))[0];
  if (closest === undefined || closest.distance > 3) {
    return undefined;
  }
  return `Did you mean '${closest.candidate}'?`;
}

export function duplicateIdCode(kind: string): string {
  return `TN_AUTHORING_DUPLICATE_${kind.toUpperCase().replaceAll("-", "_")}_ID`;
}

export function readSceneId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.id) : undefined;
}

export function readDocumentId(value: unknown): string | undefined {
  return isRecord(value) ? readString(value.id) : undefined;
}

export function hasNamedExport(source: string, exportName: string): boolean {
  const escaped = escapeRegExp(exportName);
  return new RegExp(`\\bexport\\s+(?:async\\s+)?(?:function|const|let|var|class)\\s+${escaped}\\b`).test(source) || new RegExp(`\\bexport\\s*\\{[^}]*\\b${escaped}\\b[^}]*\\}`).test(source);
}

export function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function levenshtein(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    const current = [leftIndex + 1];
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex] === right[rightIndex] ? 0 : 1;
      current[rightIndex + 1] = Math.min(
        (current[rightIndex] ?? 0) + 1,
        (previous[rightIndex + 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + substitutionCost,
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? 0;
}

export function isString(value: unknown): value is string {
  return typeof value === "string";
}
