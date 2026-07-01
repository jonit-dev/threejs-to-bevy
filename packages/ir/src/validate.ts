import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type IAssetsManifest,
  type IAnimationsIr,
  type IAudioIr,
  type IBundleManifest,
  type IEnvironmentSceneIr,
  type ILocalDataIr,
  type IMaterialsIr,
  type IPrefabsIr,
  type ISceneLifecycleIr,
  type IScenesIr,
  type ISceneTransitionIr,
  type ITargetProfile,
  type IUiIr,
  type IUiNodeIr,
  type IWorldIr,
  type IWorldEntity,
} from "./types.js";
import type { ISystemsIr } from "./systems.js";
import { isCanonicalKeyboardCode, keyboardCodeSuggestion, sortedPersistedBindingOverrides, type IInputIr, type IPersistedBindingOverrideIr, type InputBinding } from "./input.js";
import { validatePerformanceProfile } from "./performanceProfile.js";
import { validateEnvironmentSceneIr } from "./environment.js";
import { validateOverlaysIr } from "./overlays.js";
import { validateCameraViews } from "./camera.js";
import { IR_DOCUMENTS, IR_SCHEMA_IDS, IR_VERSION } from "./documents.js";
import { validateGltfSceneMetadata } from "./gltfScene.js";
import { validateAudio } from "./audioValidation.js";
import { validateUi } from "./uiValidation.js";
import { validateAssets } from "./assetValidation.js";
import { validateMaterials, validateMaterialTextureRefs } from "./materialValidation.js";
import { validateSystems, validateSystemAudioContract } from "./systemsValidation.js";
import { validatePrefabs } from "./prefabValidation.js";
import { readBundleDocuments, readJson } from "./bundleDocuments.js";
import {
  validateResources,
  validateSchemaFile,
  validateWorldComponents,
  validateWorldEvents,
} from "./schemaValidation.js";
import {
  isRecord,
  validateFiniteMinimum,
  validateFiniteNumber,
  validateFiniteRange,
  validateFiniteVec3,
  validateFiniteVec3Range,
  validateIntegerRange,
  validateOptionalFiniteNumber,
  validatePositiveFinite,
  validatePositiveVec3,
  validateUniqueIds,
} from "./validationPrimitives.js";

export interface IIrDiagnostic {
  code: string;
  limit?: number | readonly string[];
  message: string;
  path: string;
  severity?: "error" | "warning";
  suggestion?: string;
  target?: string;
  value?: number | string;
}

export interface IBundleValidationResult {
  diagnostics: IIrDiagnostic[];
  ok: boolean;
}

const MAX_RESIDUAL_ANIMATION_TIME_SECONDS = 600;
const MAX_DYNAMIC_NAV_REGIONS = 64;
const MAX_DYNAMIC_NAV_OBSTACLES = 32;
const MAX_CROWD_AGENTS = 16;

/**
 * Validates a generated ThreeNative bundle directory.
 *
 * The validator reads `manifest.json`, follows its bundle-relative document
 * paths, and returns stable diagnostics with codes, paths, and suggestions when
 * serialized IR is missing, malformed, or references unsupported features.
 */
export async function validateBundle(bundlePath: string): Promise<IBundleValidationResult> {
  const diagnostics: IIrDiagnostic[] = [];
  const manifest = await readJson<unknown>(resolve(bundlePath, IR_DOCUMENTS.manifest.fileName), diagnostics);

  if (manifest === undefined) {
    return { diagnostics, ok: false };
  }

  if (!validateManifest(manifest, "manifest.json", diagnostics)) {
    return { diagnostics, ok: false };
  }
  validateV10BoundaryCapabilities(manifest, "manifest.json/requiredCapabilities", diagnostics);

  const {
    animations,
    assets,
    audio,
    componentSchemas,
    environmentScene,
    eventSchemas,
    gltfScene,
    input,
    localData,
    materials,
    overlays,
    prefabs,
    resourceSchemas,
    runtimeConfig,
    scenes,
    systems,
    targetProfile,
    ui,
    world,
  } = await readBundleDocuments(bundlePath, manifest, diagnostics);

  if (world !== undefined) {
    validateWorld(world, manifest.entry.world, diagnostics, input);
    validateMeshRendererReferences(world, materials, assets, manifest.entry.world, diagnostics);
    const entityIds = new Set(world.entities.map((entity) => entity.id));
    if (componentSchemas !== undefined) {
      validateSchemaFile(componentSchemas, manifest.files.componentSchemas ?? IR_DOCUMENTS.componentSchemas.fileName, IR_SCHEMA_IDS.componentSchemas, diagnostics);
      validateWorldComponents(world, componentSchemas.schemas, entityIds, diagnostics);
    }
    if (resourceSchemas !== undefined) {
      validateSchemaFile(resourceSchemas, manifest.files.resourceSchemas ?? IR_DOCUMENTS.resourceSchemas.fileName, IR_SCHEMA_IDS.resourceSchemas, diagnostics);
      validateResources(world, resourceSchemas.schemas, entityIds, diagnostics);
    }
    if (eventSchemas !== undefined) {
      validateSchemaFile(eventSchemas, manifest.files.eventSchemas ?? IR_DOCUMENTS.eventSchemas.fileName, IR_SCHEMA_IDS.eventSchemas, diagnostics);
      validateWorldEvents(world, eventSchemas.schemas, diagnostics);
    }
  }
  if (materials !== undefined) {
    validateUniqueIds(materials.materials, `${manifest.files.materials}/materials`, "TN_IR_DUPLICATE_MATERIAL_ID", diagnostics);
    validateMaterials(materials, manifest.files.materials, diagnostics);
    validateMaterialTextureRefs(materials, assets, manifest.files.materials, diagnostics);
  }
  if (assets !== undefined) {
    validateUniqueIds(assets.assets, `${manifest.files.assets}/assets`, "TN_IR_DUPLICATE_ASSET_ID", diagnostics);
    await validateAssets(assets, targetProfile, bundlePath, manifest.files.assets, diagnostics);
  }
  if (environmentScene !== undefined) {
    diagnostics.push(...validateEnvironmentSceneIr(environmentScene, assets, manifest.entry.environmentScene ?? IR_DOCUMENTS.environmentScene.fileName, input));
  }
  if (audio !== undefined) {
    validateAudio(audio, assets, manifest.entry.audio ?? IR_DOCUMENTS.audio.fileName, diagnostics);
  }
  if (animations !== undefined) {
    validateAnimations(animations, world, manifest.entry.animations ?? IR_DOCUMENTS.animations.fileName, diagnostics);
  }
  if (gltfScene !== undefined) {
    diagnostics.push(...validateGltfSceneMetadata(gltfScene, manifest.files.gltfScene ?? IR_DOCUMENTS.gltfScene.fileName));
  }
  if (localData !== undefined) {
    validateLocalData(localData, manifest.entry.localData ?? IR_DOCUMENTS.localData.fileName, diagnostics);
  }
  if (scenes !== undefined) {
    validateScenes(scenes, manifest.entry.scenes ?? IR_DOCUMENTS.scenes.fileName, world, assets, input, audio, ui, systems, diagnostics);
  }
  if (targetProfile !== undefined) {
    if (targetProfile.targets.length === 0) {
      diagnostics.push({
        code: "TN_IR_TARGETS_EMPTY",
        message: "Target profile must include at least one target.",
        path: `${manifest.files.targetProfile}/targets`,
      });
    }
    await validateTargetBudgets(targetProfile, assets, bundlePath, manifest.files.targetProfile, diagnostics);
    diagnostics.push(...validatePerformanceProfile(targetProfile.performance, `${manifest.files.targetProfile}/performance`));
  }
  if (systems !== undefined) {
    validateSystems(
      systems,
      manifest.entry.systems ?? IR_DOCUMENTS.systems.fileName,
      componentSchemas?.schemas ?? {},
      resourceSchemas?.schemas ?? {},
      eventSchemas?.schemas ?? {},
      prefabs,
      diagnostics,
    );
    validateSystemAudioContract(
      systems,
      audio,
      manifest.entry.systems ?? IR_DOCUMENTS.systems.fileName,
      diagnostics,
    );
  }
  if (input !== undefined) {
    validateInput(input, manifest.files.input ?? IR_DOCUMENTS.input.fileName, diagnostics);
  }
  if (runtimeConfig !== undefined) {
    validateRuntimeConfig(runtimeConfig, manifest.files.runtimeConfig ?? IR_DOCUMENTS.runtimeConfig.fileName, diagnostics);
  }
  if (ui !== undefined) {
    validateUi(ui, manifest.entry.ui ?? IR_DOCUMENTS.ui.fileName, diagnostics);
  }
  if (overlays !== undefined) {
    diagnostics.push(...validateOverlaysIr(overlays, manifest.entry.overlays ?? IR_DOCUMENTS.overlays.fileName));
  }
  if (prefabs !== undefined) {
    validatePrefabs(prefabs, manifest.entry.prefabs ?? manifest.files.prefabs ?? "prefabs.ir.json", diagnostics);
  }
  if (world !== undefined) {
    validateCameraViews(world, materials, assets, manifest.entry.world, diagnostics);
  }

  return { diagnostics, ok: diagnostics.length === 0 };
}

async function validateTargetBudgets(
  targetProfile: ITargetProfile,
  assets: IAssetsManifest | undefined,
  bundlePath: string,
  path: string,
  diagnostics: IIrDiagnostic[],
): Promise<void> {
  const budgets = targetProfile.budgets;
  if (budgets === undefined || assets === undefined) {
    return;
  }
  const files = assets.assets.filter((asset): asset is IAssetsManifest["assets"][number] & { path: string } => "path" in asset && typeof asset.path === "string");
  const sizes = await Promise.all(
    files.map(async (asset) => {
      try {
        const stats = await stat(resolve(bundlePath, asset.path));
        return { asset, bytes: stats.size };
      } catch {
        return { asset, bytes: 0 };
      }
    }),
  );
  const bundleBytes = sizes.reduce((total, item) => total + item.bytes, 0);
  if (budgets.maxBundleBytes !== undefined && bundleBytes > budgets.maxBundleBytes) {
    diagnostics.push({
      code: "TN_IR_BUDGET_BUNDLE_BYTES_EXCEEDED",
      limit: budgets.maxBundleBytes,
      message: `Bundle assets use ${bundleBytes} bytes, exceeding budget ${budgets.maxBundleBytes}.`,
      path: `${path}/budgets/maxBundleBytes`,
      severity: "error",
      suggestion: "Reduce copied assets, raise maxBundleBytes, or move non-runtime files out of the emitted bundle.",
      value: bundleBytes,
    });
  }
  sizes.forEach(({ asset, bytes }, index) => {
    if (budgets.maxAssetBytes !== undefined && bytes > budgets.maxAssetBytes) {
      diagnostics.push({
        code: "TN_IR_BUDGET_ASSET_BYTES_EXCEEDED",
        limit: budgets.maxAssetBytes,
        message: `Asset '${asset.id}' uses ${bytes} bytes, exceeding per-asset budget ${budgets.maxAssetBytes}.`,
        path: `${path}/budgets/maxAssetBytes/${index}`,
        severity: "error",
        suggestion: "Optimize or replace the asset, or raise maxAssetBytes for this target profile.",
        value: bytes,
      });
    }
    if (asset.kind === "model" && budgets.supportedModelFormats !== undefined && !budgets.supportedModelFormats.includes(asset.format)) {
      diagnostics.push({
        code: "TN_IR_BUDGET_MODEL_FORMAT_UNSUPPORTED",
        limit: budgets.supportedModelFormats,
        message: `Asset '${asset.id}' uses unsupported model format '${asset.format}' for this target profile.`,
        path: `${path}/budgets/supportedModelFormats`,
        severity: "error",
        suggestion: "Convert the model to a supported format or add the format to supportedModelFormats.",
        value: asset.format,
      });
    }
    if (asset.kind === "texture" && budgets.supportedTextureFormats !== undefined && !budgets.supportedTextureFormats.includes(asset.format)) {
      diagnostics.push({
        code: "TN_IR_BUDGET_TEXTURE_FORMAT_UNSUPPORTED",
        limit: budgets.supportedTextureFormats,
        message: `Asset '${asset.id}' uses unsupported texture format '${asset.format}' for this target profile.`,
        path: `${path}/budgets/supportedTextureFormats`,
        severity: "error",
        suggestion: "Convert the texture to a supported format or add the format to supportedTextureFormats.",
        value: asset.format,
      });
    }
  });
}

function validateAnimations(
  animations: IAnimationsIr,
  world: IWorldIr | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (animations.schema !== "threenative.animations" || animations.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_ANIMATIONS_VERSION_UNSUPPORTED",
      message: "Animations IR must use threenative.animations version 0.1.0.",
      path,
    });
  }
  const raw = animations as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["schema", "transformClips", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_ANIMATIONS_FIELD_UNSUPPORTED",
        message: `Animations IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use transformClips for portable transform animation; keep IK, morph targets, masks, and engine controllers out of portable IR.",
      });
    }
  }
  if (!Array.isArray(raw.transformClips)) {
    diagnostics.push({
      code: "TN_IR_TRANSFORM_ANIMATION_CLIPS_INVALID",
      message: "Animations IR transformClips must be an array.",
      path: `${path}/transformClips`,
    });
    return;
  }
  const entityIds = new Set((world?.entities ?? []).map((entity) => entity.id));
  const seen = new Set<string>();
  raw.transformClips.forEach((clip, index) => {
    const clipPath = `${path}/transformClips/${index}`;
    if (!isRecord(clip)) {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_CLIP_INVALID", message: "Transform animation clips must be objects.", path: clipPath });
      return;
    }
    for (const key of Object.keys(clip)) {
      if (!["id", "loop", "tracks"].includes(key)) {
        diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_FIELD_UNSUPPORTED", message: `Transform animation clip uses unsupported field '${key}'.`, path: `${clipPath}/${key}` });
      }
    }
    if (typeof clip.id !== "string" || clip.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_CLIP_ID_INVALID", message: "Transform animation clip ID must be a non-empty string.", path: `${clipPath}/id` });
    } else if (seen.has(clip.id)) {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_CLIP_DUPLICATE", message: `Transform animation clip ID '${clip.id}' is duplicated.`, path: `${clipPath}/id` });
    } else {
      seen.add(clip.id);
    }
    if (clip.loop !== undefined && clip.loop !== "none" && clip.loop !== "repeat") {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_LOOP_UNSUPPORTED", message: "Transform animation loop must be 'none' or 'repeat'.", path: `${clipPath}/loop` });
    }
    validateTransformAnimationTracks(clip.tracks, entityIds, `${clipPath}/tracks`, diagnostics);
  });
}

function validateTransformAnimationTracks(
  value: unknown,
  entityIds: ReadonlySet<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({
      code: "TN_IR_TRANSFORM_ANIMATION_TRACKS_INVALID",
      message: "Transform animation clips must declare at least one track.",
      path,
    });
    return;
  }
  value.forEach((track, index) => {
    const trackPath = `${path}/${index}`;
    if (!isRecord(track)) {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_TRACK_INVALID", message: "Transform animation tracks must be objects.", path: trackPath });
      return;
    }
    const channel = track.channel;
    if (typeof track.target !== "string" || track.target.trim() === "" || !entityIds.has(track.target)) {
      diagnostics.push({
        code: "TN_IR_TRANSFORM_ANIMATION_TARGET_MISSING",
        message: "Transform animation target must reference a world entity.",
        path: `${trackPath}/target`,
        severity: "error",
        suggestion: "Use a stable entity id from world.ir.json as the transform animation target.",
      });
    }
    if (channel !== "position" && channel !== "rotation" && channel !== "scale") {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_CHANNEL_UNSUPPORTED", message: "Transform animation channel must be position, rotation, or scale.", path: `${trackPath}/channel` });
    }
    if (track.easing !== undefined && track.easing !== "linear" && track.easing !== "step") {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_EASING_UNSUPPORTED", message: "Transform animation easing must be linear or step.", path: `${trackPath}/easing` });
    }
    validateTransformAnimationKeyframes(track.keyframes, channel, `${trackPath}/keyframes`, diagnostics);
  });
}

function validateTransformAnimationKeyframes(
  value: unknown,
  channel: unknown,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!Array.isArray(value) || value.length < 2) {
    diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_KEYFRAMES_TOO_FEW", message: "Transform animation tracks require at least two keyframes.", path });
    return;
  }
  let previous = -Infinity;
  value.forEach((keyframe, index) => {
    const keyframePath = `${path}/${index}`;
    if (!isRecord(keyframe)) {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_KEYFRAME_INVALID", message: "Transform animation keyframes must be objects.", path: keyframePath });
      return;
    }
    if (typeof keyframe.timeSeconds !== "number" || !Number.isFinite(keyframe.timeSeconds) || keyframe.timeSeconds < 0) {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_TIME_INVALID", message: "Transform animation keyframe time must be a non-negative finite number.", path: `${keyframePath}/timeSeconds` });
    } else if (keyframe.timeSeconds <= previous) {
      diagnostics.push({ code: "TN_IR_TRANSFORM_ANIMATION_TIME_NON_MONOTONIC", message: "Transform animation keyframe times must be strictly increasing.", path: `${keyframePath}/timeSeconds` });
    } else {
      previous = keyframe.timeSeconds;
    }
    const expectedLength = channel === "rotation" ? 4 : 3;
    if (!Array.isArray(keyframe.value) || keyframe.value.length !== expectedLength || keyframe.value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
      diagnostics.push({
        code: "TN_IR_TRANSFORM_ANIMATION_VALUE_INVALID",
        message: `Transform animation keyframe value must be a finite ${expectedLength}-component vector.`,
        path: `${keyframePath}/value`,
      });
    }
  });
}

function validateInput(input: IInputIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (input.schema !== "threenative.input" || input.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_INPUT_VERSION_UNSUPPORTED",
      message: "Input IR must use threenative.input version 0.1.0.",
      path,
    });
  }
  const raw = input as unknown as Record<string, unknown>;
  for (const key of ["gamepadGestures", "gestureRecognizers", "gestures", "touchGestures"]) {
    if (raw[key] !== undefined) {
      diagnostics.push({
        code: "TN_IR_INPUT_GESTURE_UNSUPPORTED",
        message: `Input gesture recognizer field '${key}' is outside the portable input contract.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use promoted direct input bindings and runtime tap, swipe, or pinch gesture reports until richer gestures are promoted.",
      });
    }
  }
  validateUniqueIds(input.actions, `${path}/actions`, "TN_IR_INPUT_ACTION_DUPLICATE", diagnostics);
  validateUniqueIds(input.axes, `${path}/axes`, "TN_IR_INPUT_AXIS_DUPLICATE", diagnostics);

  input.actions.forEach((action, actionIndex) => {
    validateBindings(action.bindings, `${path}/actions/${actionIndex}/bindings`, diagnostics);
  });
  input.axes.forEach((axis, axisIndex) => {
    validateBindings(axis.negative, `${path}/axes/${axisIndex}/negative`, diagnostics);
    validateBindings(axis.positive, `${path}/axes/${axisIndex}/positive`, diagnostics);
    if (axis.value !== undefined) {
      validateBinding(axis.value, `${path}/axes/${axisIndex}/value`, diagnostics);
    }
  });
  validateControlsSettings(input, path, diagnostics);
  validatePersistedBindingOverrides(input, path, diagnostics);
}

function validateControlsSettings(input: IInputIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const settings = input.controlsSettings;
  if (settings === undefined) {
    return;
  }
  if (settings.profileId.trim() === "") {
    diagnostics.push({
      code: "TN_IR_INPUT_CONTROLS_PROFILE_INVALID",
      message: "Controls settings profileId must not be empty.",
      path: `${path}/controlsSettings/profileId`,
      suggestion: "Use a stable profile id such as 'default'.",
    });
  }
  const actionIds = new Set(input.actions.map((action) => action.id));
  const axisIds = new Set(input.axes.map((axis) => axis.id));
  const rowKeys = new Set<string>();
  settings.rows.forEach((row, index) => {
    const rowPath = `${path}/controlsSettings/rows/${index}`;
    const exists = row.kind === "action" ? actionIds.has(row.actionOrAxisId) : axisIds.has(row.actionOrAxisId);
    if (!exists) {
      diagnostics.push({
        code: row.kind === "action" ? "TN_IR_INPUT_CONTROLS_ACTION_MISSING" : "TN_IR_INPUT_CONTROLS_AXIS_MISSING",
        message: `Controls settings row references missing ${row.kind} '${row.actionOrAxisId}'.`,
        path: `${rowPath}/actionOrAxisId`,
        suggestion: `Declare '${row.actionOrAxisId}' in input.${row.kind === "action" ? "actions" : "axes"} before adding a rebind row.`,
      });
    }
    if (row.kind === "axis" && row.axisSlot === undefined) {
      diagnostics.push({
        code: "TN_IR_INPUT_CONTROLS_AXIS_SLOT_MISSING",
        message: `Controls settings row for axis '${row.actionOrAxisId}' must declare an axisSlot.`,
        path: `${rowPath}/axisSlot`,
        suggestion: "Set axisSlot to 'negative', 'positive', or 'value'.",
      });
    }
    if (row.kind === "action" && row.axisSlot !== undefined) {
      diagnostics.push({
        code: "TN_IR_INPUT_CONTROLS_ACTION_AXIS_SLOT_INVALID",
        message: `Controls settings row for action '${row.actionOrAxisId}' cannot declare an axisSlot.`,
        path: `${rowPath}/axisSlot`,
        suggestion: "Remove axisSlot for action rebind rows.",
      });
    }
    validateBindings(row.defaultBindings, `${rowPath}/defaultBindings`, diagnostics);
    const key = `${row.kind}:${row.actionOrAxisId}:${row.axisSlot ?? ""}`;
    if (rowKeys.has(key)) {
      diagnostics.push({
        code: "TN_IR_INPUT_CONTROLS_ROW_DUPLICATE",
        message: `Controls settings row '${key}' is declared more than once.`,
        path: rowPath,
        suggestion: "Keep one rebind row per action or axis slot.",
      });
    }
    rowKeys.add(key);
  });
}

function validatePersistedBindingOverrides(input: IInputIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const overrides = input.persistedBindingOverrides;
  if (overrides === undefined) {
    return;
  }
  if (input.controlsSettings === undefined) {
    diagnostics.push({
      code: "TN_IR_INPUT_CONTROLS_SETTINGS_MISSING",
      message: "Persisted binding overrides require controlsSettings metadata.",
      path: `${path}/persistedBindingOverrides`,
      suggestion: "Declare controlsSettings rows for actions or axes that can be rebound.",
    });
  }
  const actionIds = new Set(input.actions.map((action) => action.id));
  const axisIds = new Set(input.axes.map((axis) => axis.id));
  const rowKeys = new Set(input.controlsSettings?.rows.map((row) => `${row.kind}:${row.actionOrAxisId}:${row.axisSlot ?? ""}`) ?? []);
  const sorted = sortedPersistedBindingOverrides(overrides);
  overrides.forEach((override, index) => {
    const overridePath = `${path}/persistedBindingOverrides/${index}`;
    const sortedOverride = sorted[index];
    if (sortedOverride !== undefined && overrideSortKey(override) !== overrideSortKey(sortedOverride)) {
      diagnostics.push({
        code: "TN_IR_INPUT_OVERRIDE_ORDER_UNSTABLE",
        message: "Persisted binding overrides must be sorted deterministically.",
        path: `${path}/persistedBindingOverrides`,
        suggestion: "Sort overrides by profileId, actionOrAxisId, axisSlot, device, and control before emitting input.ir.json.",
      });
    }
    const targetKind = actionIds.has(override.actionOrAxisId) ? "action" : axisIds.has(override.actionOrAxisId) ? "axis" : undefined;
    if (targetKind === undefined) {
      diagnostics.push({
        code: "TN_IR_INPUT_OVERRIDE_TARGET_MISSING",
        message: `Persisted binding override references missing action or axis '${override.actionOrAxisId}'.`,
        path: `${overridePath}/actionOrAxisId`,
        suggestion: `Declare '${override.actionOrAxisId}' in input.actions or input.axes, or remove this persisted override.`,
      });
      return;
    }
    if (targetKind === "action" && override.axisSlot !== undefined) {
      diagnostics.push({
        code: "TN_IR_INPUT_OVERRIDE_ACTION_AXIS_SLOT_INVALID",
        message: `Persisted binding override for action '${override.actionOrAxisId}' cannot declare an axisSlot.`,
        path: `${overridePath}/axisSlot`,
        suggestion: "Remove axisSlot for action overrides.",
      });
    }
    if (targetKind === "axis" && override.axisSlot === undefined) {
      diagnostics.push({
        code: "TN_IR_INPUT_OVERRIDE_AXIS_SLOT_MISSING",
        message: `Persisted binding override for axis '${override.actionOrAxisId}' must declare an axisSlot.`,
        path: `${overridePath}/axisSlot`,
        suggestion: "Set axisSlot to 'negative', 'positive', or 'value'.",
      });
    }
    if (!rowKeys.has(`${targetKind}:${override.actionOrAxisId}:${override.axisSlot ?? ""}`)) {
      diagnostics.push({
        code: "TN_IR_INPUT_OVERRIDE_CONTROLS_ROW_MISSING",
        message: `Persisted binding override for '${override.actionOrAxisId}' has no matching controls settings row.`,
        path: overridePath,
        suggestion: "Add a controlsSettings row for this target so players can inspect and reset the override.",
      });
    }
    validateBinding(overrideToBinding(override), overridePath, diagnostics);
    if (override.deadzone !== undefined && (!Number.isFinite(override.deadzone) || override.deadzone < 0 || override.deadzone > 1)) {
      diagnostics.push({
        code: "TN_IR_INPUT_OVERRIDE_DEADZONE_INVALID",
        message: "Persisted binding override deadzone must be between 0 and 1.",
        path: `${overridePath}/deadzone`,
        suggestion: "Clamp deadzone to a normalized value between 0 and 1.",
      });
    }
    if (override.scale !== undefined && !Number.isFinite(override.scale)) {
      diagnostics.push({
        code: "TN_IR_INPUT_OVERRIDE_SCALE_INVALID",
        message: "Persisted binding override scale must be finite.",
        path: `${overridePath}/scale`,
        suggestion: "Use a finite numeric scale or omit scale.",
      });
    }
  });
}

function overrideSortKey(override: IPersistedBindingOverrideIr): string {
  return `${override.profileId}\0${override.actionOrAxisId}\0${override.axisSlot ?? ""}\0${override.device}\0${override.control}`;
}

function overrideToBinding(override: IPersistedBindingOverrideIr): InputBinding {
  if (override.device === "keyboard") {
    return { code: override.control, device: "keyboard" };
  }
  if (override.device === "pointer") {
    if (override.control.startsWith("axis:")) {
      return { axis: override.control.slice(5) as "deltaX" | "deltaY" | "x" | "y", device: "pointer" };
    }
    return { button: Number.parseInt(override.control.replace(/^button:/, ""), 10), device: "pointer" };
  }
  if (override.device === "touch") {
    const [control, axis] = override.control.split(":");
    return { axis: axis as "x" | "y" | undefined, control: control ?? "", device: "touch" };
  }
  return { control: override.control, device: "gamepad", required: false };
}

function validateBindings(bindings: InputBinding[], path: string, diagnostics: IIrDiagnostic[]): void {
  const seen = new Set<string>();
  bindings.forEach((binding, index) => {
    const key = bindingKey(binding);
    if (seen.has(key)) {
      diagnostics.push({
        code: "TN_IR_INPUT_BINDING_DUPLICATE",
        message: `Input binding '${key}' is declared more than once.`,
        path: `${path}/${index}`,
      });
    }
    seen.add(key);
    validateBinding(binding, `${path}/${index}`, diagnostics);
  });
}

function validateBinding(binding: InputBinding, path: string, diagnostics: IIrDiagnostic[]): void {
  const raw = binding as unknown as Record<string, unknown>;
  for (const key of ["chord", "combo", "doubleTap", "gesture", "hold", "longPress", "rotate", "sequence"]) {
    if (raw[key] !== undefined) {
      diagnostics.push({
        code: "TN_IR_INPUT_GESTURE_UNSUPPORTED",
        message: `Input binding gesture option '${key}' is outside the portable input contract.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use direct keyboard, pointer, touch, or optional standard-gamepad bindings; keep richer gestures target-specific until promoted.",
      });
    }
  }
  if (binding.device === "gamepad" && binding.required !== false) {
    diagnostics.push({
      code: "TN_IR_INPUT_GAMEPAD_UNSUPPORTED_V2",
      message: "Gamepad bindings are V3 scope and cannot be required by a V2 bundle.",
      path,
    });
  }
  if (binding.device === "keyboard" && !isCanonicalKeyboardCode(binding.code)) {
    const suggestion = keyboardCodeSuggestion(binding.code);
    diagnostics.push({
      code: "TN_INPUT_KEYBOARD_CODE_INVALID",
      message: `Keyboard binding '${binding.code}' must use a canonical KeyboardEvent.code value.`,
      path: `${path}/code`,
      severity: "error",
      suggestion: suggestion === undefined ? "Use a browser KeyboardEvent.code value such as KeyW, ArrowUp, Space, or Escape." : `Use '${suggestion}' instead of '${binding.code}'.`,
    });
  }
}

function bindingKey(binding: InputBinding): string {
  if (binding.device === "keyboard") {
    return `keyboard:${binding.code}`;
  }
  if (binding.device === "pointer" && "button" in binding) {
    return `pointer:button:${binding.button}`;
  }
  if (binding.device === "pointer") {
    return `pointer:axis:${binding.axis}`;
  }
  if (binding.device === "touch") {
    return `touch:${binding.control}:${binding.axis ?? ""}`;
  }
  return `gamepad:${binding.control}`;
}

function validateRuntimeConfig(config: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(config)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_CONFIG_INVALID",
      message: "Runtime config IR must be a JSON object.",
      path,
      severity: "error",
      suggestion: "Regenerate runtime.config.json from defineRuntimeConfig or remove the manifest reference.",
    });
    return;
  }
  if (config.schema !== "threenative.runtime-config" || config.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_RUNTIME_CONFIG_VERSION_UNSUPPORTED",
      message: "Runtime config IR must use threenative.runtime-config version 0.1.0.",
      path,
    });
  }
  const time = config.time;
  if (!isRecord(time)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_TIME_INVALID",
      message: "Runtime config time must define fixedDelta and paused.",
      path: `${path}/time`,
    });
  } else {
    if (typeof time.fixedDelta !== "number" || !Number.isFinite(time.fixedDelta) || time.fixedDelta <= 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_FIXED_DELTA_INVALID",
        message: "Fixed timestep must be a positive finite number.",
        path: `${path}/time/fixedDelta`,
      });
    }
    if (typeof time.paused !== "boolean") {
      diagnostics.push({
        code: "TN_IR_RUNTIME_PAUSED_INVALID",
        message: "Runtime paused flag must be a boolean.",
        path: `${path}/time/paused`,
      });
    }
  }

  const renderer = config.renderer;
  if (renderer !== undefined && !isRecord(renderer)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_INVALID",
      message: "Runtime renderer config must be an object.",
      path: `${path}/renderer`,
    });
  }
  if (isRecord(renderer)) {
    validateUnsupportedRendererFields(renderer, `${path}/renderer`, diagnostics);
  }
  if (isRecord(renderer) && !["none", "msaa2", "msaa4", "msaa8", "fxaa", "taa", "smaa"].includes(renderer.antialias as string)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_ANTIALIAS_INVALID",
      message: "Renderer antialias mode must be one of none, msaa2, msaa4, msaa8, fxaa, taa, or smaa.",
      path: `${path}/renderer/antialias`,
      severity: "error",
      suggestion: "Use a promoted MSAA or post-process antialiasing mode.",
    });
  }
  const bloom = isRecord(renderer) ? renderer.bloom : undefined;
  if (bloom !== undefined) {
    if (!isRecord(bloom)) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
        message: "Renderer bloom config must be an object.",
        path: `${path}/renderer/bloom`,
      });
    } else {
      if (typeof bloom.enabled !== "boolean") {
        diagnostics.push({
          code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
          message: "Renderer bloom enabled must be a boolean.",
          path: `${path}/renderer/bloom/enabled`,
        });
      }
      if (typeof bloom.intensity !== "number" || !Number.isFinite(bloom.intensity) || bloom.intensity < 0) {
        diagnostics.push({
          code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
          message: "Renderer bloom intensity must be a non-negative finite number.",
          path: `${path}/renderer/bloom/intensity`,
        });
      }
      if (typeof bloom.threshold !== "number" || !Number.isFinite(bloom.threshold) || bloom.threshold < 0) {
        diagnostics.push({
          code: "TN_IR_RUNTIME_RENDERER_BLOOM_INVALID",
          message: "Renderer bloom threshold must be a non-negative finite number.",
          path: `${path}/renderer/bloom/threshold`,
        });
      }
    }
  }
  const renderPath = isRecord(renderer) ? renderer.renderPath : undefined;
  if (renderPath !== undefined && renderPath !== "forward") {
    diagnostics.push({
      code: "TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED",
      message: "Runtime renderer renderPath only supports 'forward' in V9; deferred rendering is explicitly unsupported.",
      path: `${path}/renderer/renderPath`,
      severity: "error",
      suggestion: "Use renderPath: 'forward' or omit renderPath.",
    });
  }
  const colorGrading = isRecord(renderer) ? renderer.colorGrading : undefined;
  if (colorGrading !== undefined) {
    validateColorGrading(colorGrading, `${path}/renderer/colorGrading`, diagnostics);
  }
  const depthOfField = isRecord(renderer) ? renderer.depthOfField : undefined;
  if (depthOfField !== undefined) {
    validateDepthOfField(depthOfField, `${path}/renderer/depthOfField`, diagnostics);
  }

  const window = config.window;
  if (!isRecord(window)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_WINDOW_INVALID",
      message: "Runtime config window must define width and height.",
      path: `${path}/window`,
    });
  } else {
    if (typeof window.width !== "number" || !Number.isFinite(window.width) || window.width <= 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_WINDOW_INVALID",
        message: "Window width must be a positive finite number.",
        path: `${path}/window/width`,
      });
    }
    if (typeof window.height !== "number" || !Number.isFinite(window.height) || window.height <= 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_WINDOW_INVALID",
        message: "Window height must be a positive finite number.",
        path: `${path}/window/height`,
      });
    }
    if (window.title !== undefined && (typeof window.title !== "string" || window.title.length === 0)) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_WINDOW_INVALID",
        message: "Window title must be a non-empty string when present.",
        path: `${path}/window/title`,
      });
    }
  }
}

function validateUnsupportedRendererFields(renderer: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  const supported = new Set(["antialias", "bloom", "colorGrading", "depthOfField", "renderPath"]);
  const advanced = new Map([
    ["autoExposure", "Auto exposure is explicitly deferred in V9."],
    ["customPasses", "Custom post-processing passes are explicitly deferred in V9."],
    ["decals", "Decals are diagnostic-only until both runtimes prove a portable mapping."],
    ["deferred", "Deferred rendering is explicitly deferred in V9; use renderPath: 'forward'."],
    ["motionBlur", "Motion blur and motion vectors are explicitly deferred in V9."],
    ["motionVectors", "Motion blur and motion vectors are explicitly deferred in V9."],
    ["screenSpaceReflections", "Screen-space reflections and mirrors are explicitly deferred in V9."],
    ["ssr", "Screen-space reflections and mirrors are explicitly deferred in V9."],
    ["virtualGeometry", "Virtual geometry and meshlets are explicitly deferred in V9."],
    ["volumetricFog", "Volumetric fog and lighting are explicitly deferred in V9."],
    ["volumetricLighting", "Volumetric fog and lighting are explicitly deferred in V9."],
  ]);
  for (const key of Object.keys(renderer)) {
    if (supported.has(key)) {
      continue;
    }
    diagnostics.push({
      code: advanced.has(key) ? "TN_IR_RENDERER_ADVANCED_FEATURE_UNSUPPORTED" : "TN_IR_RENDERER_POST_EFFECT_UNSUPPORTED",
      message: advanced.get(key) ?? `Runtime renderer field '${key}' is not promoted in V9.`,
      path: `${path}/${key}`,
      severity: "error",
      suggestion: "Remove the field or wait for a PRD that promotes it with cross-runtime evidence.",
    });
  }
}

function validateColorGrading(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading config must be an object.",
      path,
      severity: "error",
      suggestion: "Use a colorGrading object with portable numeric controls.",
    });
    return;
  }
  const toneMapping = value.toneMapping;
  if (toneMapping !== undefined && !["aces", "linear", "none", "reinhard"].includes(toneMapping as string)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer toneMapping must be one of aces, linear, none, or reinhard.",
      path: `${path}/toneMapping`,
      severity: "error",
    });
  }
  for (const key of ["contrast", "temperature", "tint"] as const) {
    if (value[key] !== undefined && (typeof value[key] !== "number" || !Number.isFinite(value[key]))) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
        message: `Renderer colorGrading ${key} must be finite.`,
        path: `${path}/${key}`,
        severity: "error",
      });
    }
  }
  if (value.exposure !== undefined && (typeof value.exposure !== "number" || !Number.isFinite(value.exposure) || value.exposure <= 0)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading exposure must be positive and finite.",
      path: `${path}/exposure`,
      severity: "error",
    });
  }
  if (value.saturation !== undefined && (typeof value.saturation !== "number" || !Number.isFinite(value.saturation) || value.saturation < 0)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading saturation must be non-negative and finite.",
      path: `${path}/saturation`,
      severity: "error",
    });
  }
  if (value.lut !== undefined && (typeof value.lut !== "string" || value.lut.trim().length === 0)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_COLOR_GRADING_INVALID",
      message: "Renderer colorGrading LUT must reference a non-empty bundle asset id.",
      path: `${path}/lut`,
      severity: "error",
    });
  }
}

function validateDepthOfField(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
      message: "Renderer depthOfField config must be an object.",
      path,
      severity: "error",
      suggestion: "Use depthOfField with enabled, focusDistance, aperture, and maxBlur.",
    });
    return;
  }
  if (typeof value.enabled !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
      message: "Renderer depthOfField enabled must be a boolean.",
      path: `${path}/enabled`,
      severity: "error",
      suggestion: "Set depthOfField.enabled to true or false.",
    });
  }
  if (typeof value.focusDistance !== "number" || !Number.isFinite(value.focusDistance) || value.focusDistance <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
      message: "Renderer depthOfField focusDistance must be a positive finite number.",
      path: `${path}/focusDistance`,
      severity: "error",
      suggestion: "Use a positive scene-space focus distance.",
    });
  }
  for (const key of ["aperture", "maxBlur"] as const) {
    const fieldValue = value[key];
    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue) || fieldValue < 0) {
      diagnostics.push({
        code: "TN_IR_RUNTIME_RENDERER_DOF_INVALID",
        message: `Renderer depthOfField ${key} must be a non-negative finite number.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: `Use a non-negative finite ${key} value.`,
      });
    }
  }
}

function validateRenderingLightBudget(value: unknown, path: string, diagnostics: IIrDiagnostic[], entities: IWorldIr["entities"]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget resource must be an object.",
      path,
      severity: "error",
      suggestion: "Use maximumVisibleDynamicLights, maximumShadowedPointLights, cullingPolicy, and overBudgetSeverity.",
    });
    return;
  }
  validateNonNegativeInteger(value.maximumVisibleDynamicLights, `${path}/maximumVisibleDynamicLights`, diagnostics);
  validateNonNegativeInteger(value.maximumShadowedPointLights, `${path}/maximumShadowedPointLights`, diagnostics);
  if (value.cullingPolicy !== "nearest" && value.cullingPolicy !== "none") {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget cullingPolicy must be 'nearest' or 'none'.",
      path: `${path}/cullingPolicy`,
      severity: "error",
      suggestion: "Use nearest for deterministic culling, or none for diagnostics-only budget reporting.",
    });
  }
  if (value.overBudgetSeverity !== "error" && value.overBudgetSeverity !== "warning") {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget overBudgetSeverity must be 'warning' or 'error'.",
      path: `${path}/overBudgetSeverity`,
      severity: "error",
    });
  }
  if (
    value.overBudgetSeverity === "error" &&
    typeof value.maximumVisibleDynamicLights === "number" &&
    Number.isInteger(value.maximumVisibleDynamicLights) &&
    value.maximumVisibleDynamicLights >= 0 &&
    typeof value.maximumShadowedPointLights === "number" &&
    Number.isInteger(value.maximumShadowedPointLights) &&
    value.maximumShadowedPointLights >= 0
  ) {
    const dynamicLights = entities.filter((entity) => entity.components.Light !== undefined);
    const shadowedPointLights = dynamicLights.filter((entity) => {
      const light = entity.components.Light;
      return light?.kind === "point" && light.shadowFilter !== undefined;
    });
    if (dynamicLights.length > value.maximumVisibleDynamicLights || shadowedPointLights.length > value.maximumShadowedPointLights) {
      diagnostics.push({
        code: "TN_IR_LIGHT_BUDGET_EXCEEDED",
        limit: [`maximumVisibleDynamicLights=${value.maximumVisibleDynamicLights}`, `maximumShadowedPointLights=${value.maximumShadowedPointLights}`],
        message: "RenderingLightBudget is exceeded by authored dynamic lights.",
        path,
        severity: "error",
        suggestion: "Reduce dynamic or shadowed point lights, raise the budget, or use overBudgetSeverity: 'warning' for reporting-only fixtures.",
        value: `dynamicLights=${dynamicLights.length}; shadowedPointLights=${shadowedPointLights.length}`,
      });
    }
  }
}

function validateNonNegativeInteger(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    diagnostics.push({
      code: "TN_IR_LIGHT_BUDGET_INVALID",
      message: "RenderingLightBudget counts must be non-negative integers.",
      path,
      severity: "error",
    });
  }
}

function validateLocalData(localData: ILocalDataIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(localData)) {
    diagnostics.push({
      code: "TN_IR_LOCAL_DATA_INVALID",
      message: "Local data IR must be a JSON object.",
      path,
      severity: "error",
      suggestion: "Regenerate local-data.ir.json from SDK persistence declarations.",
    });
    return;
  }
  if (localData.schema !== "threenative.local-data" || localData.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_LOCAL_DATA_VERSION_UNSUPPORTED",
      message: "Local data IR must use threenative.local-data version 0.1.0.",
      path,
      severity: "error",
    });
  }
  for (const key of Object.keys(localData)) {
    if (!["autosave", "components", "migration", "resources", "saveSlots", "schema", "settings", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED",
        message: `Local data IR field '${key}' is not supported.`,
        path: `${path}/${key}`,
        suggestion: "Remove runtime-specific persistence fields from local-data.ir.json.",
      });
    }
  }
  validateLocalDataSchemaEntries(localData.resources, `${path}/resources`, "resource", diagnostics);
  validateLocalDataSchemaEntries(localData.components, `${path}/components`, "component", diagnostics);
  validateLocalDataSettings(localData.settings, `${path}/settings`, diagnostics);
  validateLocalDataSaveSlots(localData.saveSlots, `${path}/saveSlots`, diagnostics);
  validateLocalDataMigration(localData.migration, `${path}/migration`, diagnostics);
  validateLocalDataAutosave(localData.autosave, `${path}/autosave`, diagnostics);
}

function validateLocalDataSchemaEntries(value: unknown, path: string, label: "component" | "resource", diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "TN_IR_LOCAL_DATA_SCHEMA_LIST_INVALID",
      message: `Local data ${label}s must be an array.`,
      path,
      severity: "error",
    });
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}/${index}`;
    if (!isRecord(entry)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SCHEMA_INVALID", message: `Local data ${label} declaration must be an object.`, path: entryPath });
      return;
    }
    if (typeof entry.id !== "string" || entry.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_ID_INVALID", message: `Local data ${label} id must be a non-empty string.`, path: `${entryPath}/id` });
    } else if (ids.has(entry.id)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_ID_DUPLICATE", message: `Local data ${label} id '${entry.id}' is duplicated.`, path: `${entryPath}/id` });
    } else {
      ids.add(entry.id);
    }
    if (!isRecord(entry.schema)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SCHEMA_INVALID", message: `Local data ${label} schema must be an object.`, path: `${entryPath}/schema` });
    } else if (containsPortableHandle(entry.schema)) {
      diagnostics.push({
        code: "TN_IR_LOCAL_DATA_RUNTIME_HANDLE_UNSUPPORTED",
        message: `Local data ${label} '${String(entry.id)}' schema must not include runtime handles.`,
        path: `${entryPath}/schema`,
        severity: "error",
        suggestion: "Persist portable ids and scalar data instead of renderer, runtime, native, or platform handles.",
      });
    }
  });
}

function validateLocalDataSettings(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTINGS_INVALID", message: "Local data settings must be an array.", path });
    return;
  }
  const keys = new Set<string>();
  value.forEach((setting, index) => {
    const settingPath = `${path}/${index}`;
    if (!isRecord(setting)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_INVALID", message: "Local data setting must be an object.", path: settingPath });
      return;
    }
    const key = setting.key;
    if (typeof key !== "string" || key.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_KEY_INVALID", message: "Local data setting key must be a non-empty string.", path: `${settingPath}/key` });
    } else if (keys.has(key)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DUPLICATE", message: `Local data setting '${key}' is duplicated.`, path: `${settingPath}/key` });
    } else {
      keys.add(key);
    }
    if (!["accessibility", "audio", "controls", "video"].includes(String(setting.group))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_GROUP_INVALID", message: "Local data setting group must be accessibility, audio, controls, or video.", path: `${settingPath}/group` });
    }
    if (!["boolean", "number", "string"].includes(String(setting.kind))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_KIND_INVALID", message: "Local data setting kind must be boolean, number, or string.", path: `${settingPath}/kind` });
      return;
    }
    if (typeof setting.defaultValue !== setting.kind) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DEFAULT_INVALID", message: `Local data setting '${String(key)}' default value must match kind '${String(setting.kind)}'.`, path: `${settingPath}/defaultValue` });
    }
    if (setting.kind === "number") {
      validateOptionalFiniteNumber(setting.min, `${settingPath}/min`, "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", diagnostics);
      validateOptionalFiniteNumber(setting.max, `${settingPath}/max`, "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", diagnostics);
      if (typeof setting.min === "number" && typeof setting.max === "number" && setting.max < setting.min) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", message: "Local data setting max must be greater than or equal to min.", path: `${settingPath}/max` });
      }
    }
    if (setting.enumValues !== undefined && (setting.kind !== "string" || !Array.isArray(setting.enumValues) || setting.enumValues.length === 0 || setting.enumValues.some((item) => typeof item !== "string" || item.trim() === ""))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_ENUM_INVALID", message: "Local data setting enum values require non-empty string choices.", path: `${settingPath}/enumValues` });
    }
  });
}

function validateLocalDataSaveSlots(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOTS_INVALID", message: "Local data saveSlots must be an array.", path });
    return;
  }
  const ids = new Set<string>();
  value.forEach((slot, index) => {
    const slotPath = `${path}/${index}`;
    if (!isRecord(slot)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_INVALID", message: "Local data save slot must be an object.", path: slotPath });
      return;
    }
    if (typeof slot.id !== "string" || slot.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_ID_INVALID", message: "Local data save slot id must be a non-empty string.", path: `${slotPath}/id` });
    } else if (ids.has(slot.id)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_DUPLICATE", message: `Local data save slot '${slot.id}' is duplicated.`, path: `${slotPath}/id` });
    } else {
      ids.add(slot.id);
    }
    if (typeof slot.appVersion !== "string" || slot.appVersion.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_APP_VERSION_INVALID", message: "Local data save slot appVersion must be a non-empty string.", path: `${slotPath}/appVersion` });
    }
    if (!Number.isInteger(slot.schemaVersion) || Number(slot.schemaVersion) <= 0) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_SCHEMA_VERSION_INVALID", message: "Local data save slot schemaVersion must be a positive integer.", path: `${slotPath}/schemaVersion` });
    }
  });
}

function validateLocalDataMigration(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_INVALID", message: "Local data migration must be an object.", path });
    return;
  }
  if (!Number.isInteger(value.currentVersion) || Number(value.currentVersion) <= 0) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_VERSION_INVALID", message: "Local data currentVersion must be a positive integer.", path: `${path}/currentVersion` });
  }
  if (!Array.isArray(value.migrators) || value.migrators.some((entry) => !Number.isInteger(entry) || Number(entry) <= 0)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATORS_INVALID", message: "Local data migrators must be positive integer versions.", path: `${path}/migrators` });
    return;
  }
  if (Number.isInteger(value.currentVersion) && Number(value.currentVersion) > 1) {
    const required = Number(value.currentVersion) - 1;
    if (!value.migrators.includes(required)) {
      diagnostics.push({
        code: "TN_IR_LOCAL_DATA_MIGRATOR_MISSING",
        message: `Local data migration to version ${String(value.currentVersion)} must declare a migrator from version ${required}.`,
        path: `${path}/migrators`,
        suggestion: "Add the missing migrator metadata or lower currentVersion.",
      });
    }
  }
}

function validateLocalDataAutosave(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_INVALID", message: "Local data autosave must be an object.", path });
    return;
  }
  if (typeof value.debounceMs !== "number" || !Number.isFinite(value.debounceMs) || value.debounceMs < 0) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_DEBOUNCE_INVALID", message: "Local data autosave debounceMs must be a non-negative finite number.", path: `${path}/debounceMs` });
  }
  if (value.intervalSeconds !== undefined && (typeof value.intervalSeconds !== "number" || !Number.isFinite(value.intervalSeconds) || value.intervalSeconds <= 0)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_INTERVAL_INVALID", message: "Local data autosave intervalSeconds must be positive when provided.", path: `${path}/intervalSeconds` });
  }
  if (value.checkpointEvents !== undefined && (!Array.isArray(value.checkpointEvents) || value.checkpointEvents.some((entry) => typeof entry !== "string" || entry.trim() === ""))) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_EVENT_INVALID", message: "Local data autosave checkpointEvents must be non-empty event names.", path: `${path}/checkpointEvents` });
  }
}

function containsPortableHandle(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsPortableHandle);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([key, child]) => ["nativeHandle", "platformPath", "rendererObject", "runtimeHandle"].includes(key) || containsPortableHandle(child));
  }
  return false;
}

function validateScenes(
  scenes: IScenesIr,
  path: string,
  world: IWorldIr | undefined,
  assets: IAssetsManifest | undefined,
  input: IInputIr | undefined,
  audio: IAudioIr | undefined,
  ui: IUiIr | undefined,
  systems: ISystemsIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  if (scenes.schema !== IR_SCHEMA_IDS.scenes || scenes.version !== IR_VERSION) {
    diagnostics.push({ code: "TN_IR_SCENE_VERSION_UNSUPPORTED", message: `Scenes document must use ${IR_SCHEMA_IDS.scenes} version ${IR_VERSION}.`, path });
  }
  if (typeof scenes.initialScene !== "string" || scenes.initialScene.trim() === "") {
    diagnostics.push({ code: "TN_IR_SCENE_INITIAL_INVALID", message: "Scenes initialScene must be a non-empty string.", path: `${path}/initialScene` });
  }
  if (!Array.isArray(scenes.scenes) || scenes.scenes.length === 0) {
    diagnostics.push({ code: "TN_IR_SCENES_EMPTY", message: "Scenes document must include at least one scene.", path: `${path}/scenes` });
    return;
  }

  const sceneIds = new Set<string>();
  scenes.scenes.forEach((scene, index) => {
    const scenePath = `${path}/scenes/${index}`;
    validateSceneShape(scene, scenePath, diagnostics);
    if (typeof scene.id === "string" && scene.id.trim() !== "") {
      if (sceneIds.has(scene.id)) {
        diagnostics.push({ code: "TN_IR_SCENE_ID_DUPLICATE", message: `Scene '${scene.id}' is duplicated.`, path: `${scenePath}/id` });
      }
      sceneIds.add(scene.id);
    }
  });
  if (typeof scenes.initialScene === "string" && scenes.initialScene.trim() !== "" && !sceneIds.has(scenes.initialScene)) {
    diagnostics.push({ code: "TN_IR_SCENE_INITIAL_UNKNOWN", message: `Initial scene '${scenes.initialScene}' is not declared.`, path: `${path}/initialScene` });
  }

  const entityIds = new Set((world?.entities ?? []).map((entity) => entity.id));
  const assetGroupIds = new Set((assets?.groups ?? []).map((group) => group.id));
  const inputIds = new Set<string>([
    ...(input?.actions ?? []).map((action) => action.id),
    ...(input?.axes ?? []).map((axis) => axis.id),
  ]);
  const musicIds = new Set((audio?.music ?? []).map((music) => music.id));
  const uiIds = collectUiNodeIds(ui);
  const systemIds = new Set((systems?.systems ?? []).map((system) => system.name));
  const exclusiveOwners = new Map<string, string>();

  scenes.scenes.forEach((scene, index) => {
    const scenePath = `${path}/scenes/${index}`;
    validateSceneReferences(scene, scenePath, { assetGroupIds, entityIds, inputIds, musicIds, sceneIds, systemIds, uiIds }, diagnostics);
    for (const entityId of scene.entities ?? []) {
      if (scene.activation === "exclusive") {
        const owner = exclusiveOwners.get(entityId);
        if (owner !== undefined && owner !== scene.id) {
          diagnostics.push({
            code: "TN_IR_SCENE_OWNERSHIP_CONFLICT",
            message: `Entity '${entityId}' is owned by multiple exclusive scenes.`,
            path: `${scenePath}/entities`,
            target: entityId,
          });
        } else {
          exclusiveOwners.set(entityId, scene.id);
        }
      }
    }
  });
}

function validateSceneShape(scene: ISceneLifecycleIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(scene)) {
    diagnostics.push({ code: "TN_IR_SCENE_INVALID", message: "Scene entry must be an object.", path });
    return;
  }
  if (typeof scene.id !== "string" || scene.id.trim() === "") {
    diagnostics.push({ code: "TN_IR_SCENE_ID_INVALID", message: "Scene ID must be a non-empty string.", path: `${path}/id` });
  }
  if (!["credits", "cutscene", "level", "loading", "menu", "overlay", "system"].includes(String(scene.kind))) {
    diagnostics.push({ code: "TN_IR_SCENE_KIND_INVALID", message: `Scene '${String(scene.id)}' uses unsupported kind '${String(scene.kind)}'.`, path: `${path}/kind` });
  }
  if (!["additive", "exclusive", "loading", "overlay", "persistent"].includes(String(scene.activation))) {
    diagnostics.push({ code: "TN_IR_SCENE_ACTIVATION_INVALID", message: `Scene '${String(scene.id)}' uses unsupported activation '${String(scene.activation)}'.`, path: `${path}/activation` });
  }
  validateStringList(scene.entities, `${path}/entities`, "TN_IR_SCENE_ENTITY_ID_INVALID", diagnostics);
  validateStringList(scene.assetGroups, `${path}/assetGroups`, "TN_IR_SCENE_ASSET_GROUP_ID_INVALID", diagnostics);
  validateStringList(scene.systems, `${path}/systems`, "TN_IR_SCENE_SYSTEM_ID_INVALID", diagnostics);
  validateStringList(scene.ui, `${path}/ui`, "TN_IR_SCENE_UI_ID_INVALID", diagnostics);
  validateSceneTransition(scene.transitions?.enter, `${path}/transitions/enter`, diagnostics);
  validateSceneTransition(scene.transitions?.exit, `${path}/transitions/exit`, diagnostics);
  validateSceneTransition(scene.audio?.transition, `${path}/audio/transition`, diagnostics);
}

function validateSceneReferences(
  scene: ISceneLifecycleIr,
  path: string,
  refs: {
    assetGroupIds: Set<string>;
    entityIds: Set<string>;
    inputIds: Set<string>;
    musicIds: Set<string>;
    sceneIds: Set<string>;
    systemIds: Set<string>;
    uiIds: Set<string>;
  },
  diagnostics: IIrDiagnostic[],
): void {
  validateReferenceList(scene.entities, refs.entityIds, `${path}/entities`, "TN_IR_SCENE_ENTITY_MISSING", "entity", diagnostics);
  validateReferenceList(scene.assetGroups, refs.assetGroupIds, `${path}/assetGroups`, "TN_IR_SCENE_ASSET_GROUP_MISSING", "asset group", diagnostics);
  validateReferenceList(scene.systems, refs.systemIds, `${path}/systems`, "TN_IR_SCENE_SYSTEM_MISSING", "system", diagnostics);
  validateReferenceList(scene.ui, refs.uiIds, `${path}/ui`, "TN_IR_SCENE_UI_MISSING", "UI node", diagnostics);
  validateReference(scene.input, refs.inputIds, `${path}/input`, "TN_IR_SCENE_INPUT_MISSING", "input action or axis", diagnostics);
  validateReference(scene.audio?.music, refs.musicIds, `${path}/audio/music`, "TN_IR_SCENE_AUDIO_MISSING", "audio music", diagnostics);
  validateLoadingSceneReference(scene.transitions?.enter, refs.sceneIds, `${path}/transitions/enter/loadingScene`, diagnostics);
  validateLoadingSceneReference(scene.transitions?.exit, refs.sceneIds, `${path}/transitions/exit/loadingScene`, diagnostics);
  validateLoadingSceneReference(scene.audio?.transition, refs.sceneIds, `${path}/audio/transition/loadingScene`, diagnostics);
}

function validateStringList(value: readonly string[] | undefined, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code, message: "Expected an array of non-empty strings.", path });
    return;
  }
  value.forEach((entry, index) => {
    if (typeof entry !== "string" || entry.trim() === "") {
      diagnostics.push({ code, message: "Expected a non-empty string.", path: `${path}/${index}` });
    }
  });
}

function validateReferenceList(value: readonly string[] | undefined, ids: Set<string>, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  value.forEach((entry, index) => validateReference(entry, ids, `${path}/${index}`, code, label, diagnostics));
}

function validateReference(value: string | undefined, ids: Set<string>, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "" || !ids.has(value)) {
    diagnostics.push({ code, message: `Scene references unknown ${label} '${String(value)}'.`, path, target: String(value) });
  }
}

function validateLoadingSceneReference(transition: ISceneTransitionIr | undefined, sceneIds: Set<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (transition?.kind !== "loadingScreen") {
    return;
  }
  validateReference(transition.loadingScene, sceneIds, path, "TN_IR_SCENE_TRANSITION_LOADING_UNKNOWN", "loading scene", diagnostics);
}

function validateSceneTransition(transition: ISceneTransitionIr | undefined, path: string, diagnostics: IIrDiagnostic[]): void {
  if (transition === undefined) {
    return;
  }
  if (!["crossfade", "fade", "instant", "loadingScreen"].includes(String(transition.kind))) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_KIND_INVALID", message: `Unsupported scene transition kind '${String(transition.kind)}'.`, path: `${path}/kind` });
  }
  if (typeof transition.durationMs !== "number" || !Number.isFinite(transition.durationMs) || transition.durationMs < 0 || transition.durationMs > 60000) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_DURATION_INVALID", message: "Scene transition durationMs must be finite between 0 and 60000.", path: `${path}/durationMs` });
  }
  if (transition.color !== undefined && (typeof transition.color !== "string" || !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(transition.color))) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_COLOR_INVALID", message: "Scene transition color must be #RRGGBB or #RRGGBBAA.", path: `${path}/color` });
  }
  if (transition.kind === "loadingScreen" && (typeof transition.loadingScene !== "string" || transition.loadingScene.trim() === "")) {
    diagnostics.push({ code: "TN_IR_SCENE_TRANSITION_LOADING_INVALID", message: "Loading-screen transition must reference a loading scene.", path: `${path}/loadingScene` });
  }
}

function collectUiNodeIds(ui: IUiIr | undefined): Set<string> {
  const ids = new Set<string>();
  const visit = (node: IUiNodeIr): void => {
    ids.add(node.id);
    for (const child of node.children ?? []) {
      visit(child);
    }
  };
  if (ui !== undefined) {
    visit(ui.root);
  }
  return ids;
}

function validateManifest(manifest: unknown, path: string, diagnostics: IIrDiagnostic[]): manifest is IBundleManifest {
  if (!isRecord(manifest)) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_INVALID",
      message: "Manifest must be a JSON object.",
      path,
      severity: "error",
      suggestion: "Regenerate the bundle so manifest.json contains a threenative.bundle object.",
    });
    return false;
  }

  if (manifest.schema !== IR_SCHEMA_IDS.bundle || manifest.version !== IR_VERSION) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_VERSION_UNSUPPORTED",
      message: `Manifest must use ${IR_SCHEMA_IDS.bundle} version ${IR_VERSION}.`,
      path,
    });
  }

  const entry = manifest.entry;
  if (!isRecord(entry)) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_ENTRY_INVALID",
      message: "Manifest entry must be an object with a world document path.",
      path: `${path}/entry`,
      severity: "error",
      suggestion: `Regenerate the bundle or add entry.world: '${IR_DOCUMENTS.world.fileName}'.`,
    });
  } else if (entry.world !== IR_DOCUMENTS.world.fileName) {
    diagnostics.push({
      code: "TN_IR_WORLD_ENTRY_INVALID",
      message: `V1 manifest entry.world must be ${IR_DOCUMENTS.world.fileName}.`,
      path: "manifest.json/entry/world",
    });
  }
  if (isRecord(entry) && entry.overlays !== undefined) {
    validateManifestPath(entry.overlays, `${path}/entry/overlays`, IR_DOCUMENTS.overlays.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.animations !== undefined) {
    validateManifestPath(entry.animations, `${path}/entry/animations`, IR_DOCUMENTS.animations.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.localData !== undefined) {
    validateManifestPath(entry.localData, `${path}/entry/localData`, IR_DOCUMENTS.localData.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.scenes !== undefined) {
    validateManifestPath(entry.scenes, `${path}/entry/scenes`, IR_DOCUMENTS.scenes.fileName, diagnostics);
  }
  if (isRecord(entry) && entry.prefabs !== undefined) {
    validateManifestPath(entry.prefabs, `${path}/entry/prefabs`, IR_DOCUMENTS.prefabs.fileName, diagnostics);
  }

  const files = manifest.files;
  if (!isRecord(files)) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_FILES_INVALID",
      message: "Manifest files must be an object with assets, materials, and targetProfile document paths.",
      path: `${path}/files`,
      severity: "error",
      suggestion: "Regenerate the bundle so manifest.json includes all required bundle file references.",
    });
  } else {
    validateManifestPath(files.assets, `${path}/files/assets`, IR_DOCUMENTS.assets.fileName, diagnostics);
    validateManifestPath(files.materials, `${path}/files/materials`, IR_DOCUMENTS.materials.fileName, diagnostics);
    validateManifestPath(files.targetProfile, `${path}/files/targetProfile`, IR_DOCUMENTS.targetProfile.fileName, diagnostics);
    for (const key of ["animations", "componentSchemas", "eventSchemas", "gltfScene", "input", "localData", "prefabs", "resourceSchemas", "runtimeConfig"] as const) {
      if (files[key] !== undefined) {
        validateManifestPath(files[key], `${path}/files/${key}`, undefined, diagnostics);
      }
    }
  }

  if (!isRecord(entry) || !isRecord(files)) {
    return false;
  }
  return (
    typeof entry.world === "string" &&
    typeof files.assets === "string" &&
    typeof files.materials === "string" &&
    typeof files.targetProfile === "string" &&
    (entry.audio === undefined || typeof entry.audio === "string") &&
    (entry.animations === undefined || typeof entry.animations === "string") &&
    (entry.environmentScene === undefined || typeof entry.environmentScene === "string") &&
    (entry.localData === undefined || typeof entry.localData === "string") &&
    (entry.scenes === undefined || typeof entry.scenes === "string") &&
    (entry.systems === undefined || typeof entry.systems === "string") &&
    (entry.overlays === undefined || typeof entry.overlays === "string") &&
    (entry.prefabs === undefined || typeof entry.prefabs === "string") &&
    (entry.ui === undefined || typeof entry.ui === "string") &&
    (files.componentSchemas === undefined || typeof files.componentSchemas === "string") &&
    (files.animations === undefined || typeof files.animations === "string") &&
    (files.eventSchemas === undefined || typeof files.eventSchemas === "string") &&
    (files.gltfScene === undefined || typeof files.gltfScene === "string") &&
    (files.input === undefined || typeof files.input === "string") &&
    (files.localData === undefined || typeof files.localData === "string") &&
    (files.prefabs === undefined || typeof files.prefabs === "string") &&
    (files.resourceSchemas === undefined || typeof files.resourceSchemas === "string") &&
    (files.runtimeConfig === undefined || typeof files.runtimeConfig === "string")
  );
}

const v10BoundaryCapabilities: Array<{
  code: string;
  match: RegExp;
  message: string;
  suggestion: string;
}> = [
  {
    code: "TN_IR_NATIVE_AUTHORING_UNSUPPORTED",
    match: /(?:^|[.:/-])(?:bevy|native-authoring)(?:$|[.:/-])/i,
    message: "Direct Bevy/native authoring is outside the portable ThreeNative IR boundary.",
    suggestion: "Author behavior through the TypeScript SDK and emit portable ECS/IR declarations instead of Bevy-specific code.",
  },
  {
    code: "TN_IR_RAW_THREE_SOURCE_UNSUPPORTED",
    match: /(?:^|[.:/-])(?:three|raw-three|threejs)(?:$|[.:/-])/i,
    message: "Raw Three.js authoring cannot be the source of truth for a portable bundle.",
    suggestion: "Represent scene data through SDK objects, ECS declarations, and versioned IR consumed by both runtimes.",
  },
  {
    code: "TN_IR_RENDERER_PLUGIN_UNSUPPORTED",
    match: /(?:renderer-plugin|runtime-plugin|plugin-escape|render-phase|storage-buffer)/i,
    message: "Public renderer/runtime plugin escape hatches are not portable across web Three.js and native Bevy.",
    suggestion: "Use promoted SDK/IR extension points or wait for a PRD that defines a portable plugin contract.",
  },
  {
    code: "TN_IR_NETWORKING_UNSUPPORTED",
    match: /(?:network|websocket|replication|collaboration|online-service|cloud-save)/i,
    message: "Online services, networking, replication, and collaboration are outside the current portable runtime contract.",
    suggestion: "Keep data local or model synchronization as deterministic resources/events until a networking PRD defines a portable contract.",
  },
  {
    code: "TN_IR_2D_WORKFLOW_UNSUPPORTED",
    match: /(?:sprite|tilemap|ldtk|tiled|2d-collision)/i,
    message: "2D-only authoring workflows are outside the current ThreeNative 3D product scope.",
    suggestion: "Use promoted 3D mesh, material, camera, and physics declarations, or wait for a dedicated 2D scope PRD.",
  },
  {
    code: "TN_IR_PLATFORM_API_UNSUPPORTED",
    match: /(?:npm|filesystem|worker|timer|platform-api|backend-only|node-api)/i,
    message: "Arbitrary npm, filesystem, worker, timer, platform, and backend-only APIs cannot be represented in portable IR.",
    suggestion: "Use portable scripts with declared resources, events, services, target profiles, and bundle-local assets.",
  },
];

function validateV10BoundaryCapabilities(manifest: IBundleManifest, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(manifest.requiredCapabilities)) {
    diagnostics.push({
      code: "TN_IR_REQUIRED_CAPABILITIES_INVALID",
      message: "Manifest requiredCapabilities must be an object.",
      path,
      severity: "error",
      suggestion: "Regenerate the bundle so capability declarations are grouped by portable domain.",
    });
    return;
  }
  for (const [domain, values] of Object.entries(manifest.requiredCapabilities)) {
    const candidates = [domain, ...(Array.isArray(values) ? values.filter((value): value is string => typeof value === "string") : [])];
    for (const candidate of candidates) {
      const boundary = v10BoundaryCapabilities.find((item) => item.match.test(candidate));
      if (boundary === undefined) {
        continue;
      }
      diagnostics.push({
        code: boundary.code,
        message: boundary.message,
        path: `${path}/${domain}`,
        severity: "error",
        suggestion: boundary.suggestion,
        target: "portable-web-native",
        value: candidate,
      });
      break;
    }
  }
}

function validateManifestPath(value: unknown, path: string, expected: string | undefined, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({
      code: "TN_IR_MANIFEST_PATH_INVALID",
      message: "Manifest file references must be non-empty bundle-relative paths.",
      path,
      severity: "error",
      suggestion: expected === undefined ? "Regenerate the bundle or remove the optional manifest entry." : `Regenerate the bundle or set this path to '${expected}'.`,
    });
    return;
  }
  if (expected !== undefined && value !== expected) {
    diagnostics.push({
      code: "TN_IR_MANIFEST_PATH_INVALID",
      message: `Manifest file reference must be ${expected}.`,
      path,
      severity: "error",
      suggestion: `Regenerate the bundle or set this path to '${expected}'.`,
    });
  }
}

function validateWorld(world: IWorldIr, path: string, diagnostics: IIrDiagnostic[], input: IInputIr | undefined): void {
  if (world.schema !== "threenative.world" || world.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_WORLD_VERSION_UNSUPPORTED",
      message: "World IR must use threenative.world version 0.1.0.",
      path,
    });
  }

  validateUniqueIds(world.entities, `${path}/entities`, "TN_IR_DUPLICATE_ENTITY_ID", diagnostics);
  validateNavigationResources(world, `${path}/resources`, diagnostics);
  validateRenderingLightBudget(world.resources?.RenderingLightBudget, `${path}/resources/RenderingLightBudget`, diagnostics, world.entities);
  world.entities.forEach((entity, index) => validateTransformComponents(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validateRenderComponents(entity, `${path}/entities/${index}`, diagnostics));
  const entityIds = new Set(world.entities.map((entity) => entity.id));
  world.entities.forEach((entity, index) => validatePhysicsComponents(entity, `${path}/entities/${index}`, entityIds, diagnostics));
  world.entities.forEach((entity, index) => validateCharacterComponents(entity, `${path}/entities/${index}`, input, diagnostics));
}

function validateMeshRendererReferences(
  world: IWorldIr,
  materials: IMaterialsIr | undefined,
  assets: IAssetsManifest | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const materialIds = new Set((materials?.materials ?? []).map((material) => material.id));
  const assetIds = new Set((assets?.assets ?? []).map((asset) => asset.id));
  world.entities.forEach((entity, entityIndex) => {
    const renderer = entity.components.MeshRenderer;
    if (renderer === undefined) {
      return;
    }
    if (renderer.material !== undefined && !materialIds.has(renderer.material)) {
      diagnostics.push({
        code: "TN_IR_MESH_RENDERER_MATERIAL_MISSING",
        message: `Entity '${entity.id}' references missing material '${renderer.material}'.`,
        path: `${path}/entities/${entityIndex}/components/MeshRenderer/material`,
        severity: "error",
        suggestion: "Add the material to materials.ir.json or update the MeshRenderer material reference.",
        value: renderer.material,
      });
    }
    if (renderer.mesh !== undefined && !assetIds.has(renderer.mesh)) {
      diagnostics.push({
        code: "TN_IR_MESH_RENDERER_MESH_MISSING",
        message: `Entity '${entity.id}' references missing mesh '${renderer.mesh}'.`,
        path: `${path}/entities/${entityIndex}/components/MeshRenderer/mesh`,
        severity: "error",
        suggestion: "Add the mesh to assets.manifest.json or update the MeshRenderer mesh reference.",
        value: renderer.mesh,
      });
    }
  });
}

function validateTransformComponents(entity: IWorldEntity, path: string, diagnostics: IIrDiagnostic[]): void {
  const transform = entity.components.Transform;
  if (transform === undefined) {
    return;
  }
  for (const key of ["position", "rotation", "scale"] as const) {
    const values = transform[key];
    if (values !== undefined && (!Array.isArray(values) || values.some((value) => typeof value !== "number" || !Number.isFinite(value)))) {
      diagnostics.push({
        code: "TN_IR_TRANSFORM_VALUE_INVALID",
        message: `Entity '${entity.id}' has an invalid Transform.${key} value.`,
        path: `${path}/components/Transform/${key}`,
        severity: "error",
        suggestion: "Use only finite numeric transform values.",
      });
    }
  }
}

function validateNavigationResources(world: IWorldIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const navigation = world.resources?.Navigation;
  if (navigation === undefined) {
    return;
  }
  if (!isRecord(navigation)) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_INVALID", message: "Navigation resource must be an object.", path: `${path}/Navigation`, severity: "error" });
    return;
  }
  for (const key of Object.keys(navigation)) {
    if (!["agentRadius", "areaCosts", "crowd", "dynamicRebake", "offMeshLinks", "queries", "regions"].includes(key)) {
      diagnostics.push({
        code: hasNavigationBackendHandle(key) ? "TN_IR_NAVIGATION_BACKEND_UNSUPPORTED" : "TN_IR_NAVIGATION_FIELD_UNSUPPORTED",
        message: `Navigation uses unsupported field '${key}'.`,
        path: `${path}/Navigation/${key}`,
        severity: "error",
        suggestion: "Use portable navigation regions, bounded rebake policies, off-mesh links, and small crowd fixtures; keep backend navmesh handles out of the IR.",
      });
    }
  }
  validateFiniteRange(navigation.agentRadius, 0, V9_MAX_NAV_AGENT_RADIUS, `${path}/Navigation/agentRadius`, "TN_IR_NAVIGATION_AGENT_RADIUS_INVALID", diagnostics);
  if (!Array.isArray(navigation.regions) || navigation.regions.length === 0) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_REGIONS_INVALID", message: "Navigation.regions must be a non-empty array.", path: `${path}/Navigation/regions`, severity: "error" });
  } else {
    const regionIds = new Set<string>();
    navigation.regions.forEach((region, index) => validateNavigationRegion(region, `${path}/Navigation/regions/${index}`, regionIds, diagnostics));
  }
  if (navigation.areaCosts !== undefined) {
    if (!isRecord(navigation.areaCosts)) {
      diagnostics.push({ code: "TN_IR_NAVIGATION_AREA_COST_INVALID", message: "Navigation.areaCosts must be an object.", path: `${path}/Navigation/areaCosts`, severity: "error" });
    } else {
      for (const [area, cost] of Object.entries(navigation.areaCosts)) {
        if (area.trim() === "") {
          diagnostics.push({ code: "TN_IR_NAVIGATION_AREA_COST_INVALID", message: "Navigation area cost keys must be non-empty.", path: `${path}/Navigation/areaCosts`, severity: "error" });
        }
        validateFiniteRange(cost, 0, V9_MAX_NAV_AREA_COST, `${path}/Navigation/areaCosts/${area}`, "TN_IR_NAVIGATION_AREA_COST_INVALID", diagnostics);
      }
    }
  }
  if (navigation.queries !== undefined) {
    if (!Array.isArray(navigation.queries)) {
      diagnostics.push({ code: "TN_IR_NAVIGATION_QUERIES_INVALID", message: "Navigation.queries must be an array.", path: `${path}/Navigation/queries`, severity: "error" });
    } else {
      navigation.queries.forEach((query, index) => validateNavigationQuery(query, `${path}/Navigation/queries/${index}`, diagnostics));
    }
  }
  validateDynamicNavigation(navigation.dynamicRebake, `${path}/Navigation/dynamicRebake`, diagnostics);
  validateOffMeshLinks(navigation.offMeshLinks, `${path}/Navigation/offMeshLinks`, diagnostics);
  validateCrowdNavigation(navigation.crowd, `${path}/Navigation/crowd`, diagnostics);
}

function validateDynamicNavigation(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_DYNAMIC_REBAKE_INVALID", message: "Navigation.dynamicRebake must be a bounded policy object.", path, severity: "error" });
    return;
  }
  validateIntegerRange(value.maxRegions, 1, MAX_DYNAMIC_NAV_REGIONS, `${path}/maxRegions`, "TN_IR_NAVIGATION_DYNAMIC_REBAKE_BUDGET_INVALID", diagnostics);
  validateIntegerRange(value.maxObstacles, 0, MAX_DYNAMIC_NAV_OBSTACLES, `${path}/maxObstacles`, "TN_IR_NAVIGATION_DYNAMIC_REBAKE_BUDGET_INVALID", diagnostics);
  validateIntegerRange(value.intervalMs, 16, 10_000, `${path}/intervalMs`, "TN_IR_NAVIGATION_DYNAMIC_REBAKE_INTERVAL_INVALID", diagnostics);
}

function validateOffMeshLinks(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_OFF_MESH_LINKS_INVALID", message: "Navigation.offMeshLinks must be an array.", path, severity: "error" });
    return;
  }
  value.forEach((link, index) => {
    const linkPath = `${path}/${index}`;
    if (!isRecord(link)) {
      diagnostics.push({ code: "TN_IR_NAVIGATION_OFF_MESH_LINK_INVALID", message: "Off-mesh link must be an object.", path: linkPath, severity: "error" });
      return;
    }
    if (typeof link.id !== "string" || link.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_NAVIGATION_OFF_MESH_LINK_ID_INVALID", message: "Off-mesh link id must be a non-empty string.", path: `${linkPath}/id`, severity: "error" });
    }
    if (typeof link.from !== "string" || link.from.trim() === "" || typeof link.to !== "string" || link.to.trim() === "") {
      diagnostics.push({ code: "TN_IR_NAVIGATION_OFF_MESH_LINK_REGION_INVALID", message: "Off-mesh links must reference source and target region ids.", path: linkPath, severity: "error" });
    }
    validateFiniteRange(link.cost, 0, V9_MAX_NAV_AREA_COST, `${linkPath}/cost`, "TN_IR_NAVIGATION_OFF_MESH_LINK_COST_INVALID", diagnostics);
  });
}

function validateCrowdNavigation(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_CROWD_INVALID", message: "Navigation.crowd must be an object.", path, severity: "error" });
    return;
  }
  validateIntegerRange(value.maxAgents, 1, MAX_CROWD_AGENTS, `${path}/maxAgents`, "TN_IR_NAVIGATION_CROWD_BUDGET_INVALID", diagnostics);
  validateFiniteRange(value.separationRadius, 0, V9_MAX_NAV_AGENT_RADIUS * 4, `${path}/separationRadius`, "TN_IR_NAVIGATION_CROWD_SEPARATION_INVALID", diagnostics);
  if (value.agents !== undefined) {
    if (!Array.isArray(value.agents)) {
      diagnostics.push({ code: "TN_IR_NAVIGATION_CROWD_AGENTS_INVALID", message: "Navigation.crowd.agents must be an array.", path: `${path}/agents`, severity: "error" });
      return;
    }
    if (typeof value.maxAgents === "number" && value.agents.length > value.maxAgents) {
      diagnostics.push({ code: "TN_IR_NAVIGATION_CROWD_BUDGET_INVALID", message: "Navigation crowd agent count exceeds maxAgents.", path: `${path}/agents`, severity: "error" });
    }
    value.agents.forEach((agent, index) => {
      const agentPath = `${path}/agents/${index}`;
      if (!isRecord(agent)) {
        diagnostics.push({ code: "TN_IR_NAVIGATION_CROWD_AGENT_INVALID", message: "Crowd agent must be an object.", path: agentPath, severity: "error" });
        return;
      }
      if (typeof agent.id !== "string" || agent.id.trim() === "") {
        diagnostics.push({ code: "TN_IR_NAVIGATION_CROWD_AGENT_ID_INVALID", message: "Crowd agent id must be a non-empty string.", path: `${agentPath}/id`, severity: "error" });
      }
      validateFiniteVec3(agent.position, `${agentPath}/position`, "TN_IR_NAVIGATION_CROWD_AGENT_POSITION_INVALID", diagnostics);
      validateFiniteVec3(agent.goal, `${agentPath}/goal`, "TN_IR_NAVIGATION_CROWD_AGENT_GOAL_INVALID", diagnostics);
    });
  }
}

function validateNavigationRegion(value: unknown, path: string, regionIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_INVALID", message: "Navigation region must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["area", "center", "id", "neighbors", "points"].includes(key)) {
      diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_FIELD_UNSUPPORTED", message: `Navigation region uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_ID_INVALID", message: "Navigation region id must be a non-empty string.", path: `${path}/id`, severity: "error" });
  } else if (regionIds.has(value.id)) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_ID_DUPLICATE", message: `Navigation region id '${value.id}' is duplicated.`, path: `${path}/id`, severity: "error" });
  } else {
    regionIds.add(value.id);
  }
  validateFiniteVec3(value.center, `${path}/center`, "TN_IR_NAVIGATION_REGION_CENTER_INVALID", diagnostics);
  if (!Array.isArray(value.points) || value.points.length < 3) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_POINTS_INVALID", message: "Navigation region points must contain at least three [x,z] vertices.", path: `${path}/points`, severity: "error" });
  } else {
    value.points.forEach((point, index) => {
      if (!Array.isArray(point) || point.length !== 2 || point.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
        diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_POINTS_INVALID", message: "Navigation region points must be finite [x,z] tuples.", path: `${path}/points/${index}`, severity: "error" });
      }
    });
  }
  if (value.neighbors !== undefined && (!Array.isArray(value.neighbors) || value.neighbors.some((neighbor) => typeof neighbor !== "string" || neighbor.trim() === ""))) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_NEIGHBORS_INVALID", message: "Navigation region neighbors must be an array of non-empty IDs.", path: `${path}/neighbors`, severity: "error" });
  }
  if (value.area !== undefined && (typeof value.area !== "string" || value.area.trim() === "")) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_REGION_AREA_INVALID", message: "Navigation region area must be a non-empty string.", path: `${path}/area`, severity: "error" });
  }
}

function validateNavigationQuery(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_NAVIGATION_QUERY_INVALID", message: "Navigation query must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["goal", "id", "start"].includes(key)) {
      diagnostics.push({ code: "TN_IR_NAVIGATION_QUERY_FIELD_UNSUPPORTED", message: `Navigation query uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.id !== "string" || value.id.trim() === "") {
    diagnostics.push({ code: "TN_IR_NAVIGATION_QUERY_ID_INVALID", message: "Navigation query id must be a non-empty string.", path: `${path}/id`, severity: "error" });
  }
  validateFiniteVec3(value.start, `${path}/start`, "TN_IR_NAVIGATION_QUERY_POINT_INVALID", diagnostics);
  validateFiniteVec3(value.goal, `${path}/goal`, "TN_IR_NAVIGATION_QUERY_POINT_INVALID", diagnostics);
}

function hasNavigationBackendHandle(key: string): boolean {
  return /(?:navmesh|backend|rapier|bevy|native|crowd|offMesh|obstacle)/i.test(key);
}

function validateRenderComponents(entity: IWorldIr["entities"][number], path: string, diagnostics: IIrDiagnostic[]): void {
  const camera = entity.components.Camera;
  if (camera !== undefined) {
    if (camera.kind === "perspective" && camera.fovY === undefined) {
      diagnostics.push({
        code: "TN_IR_CAMERA_FIELD_MISSING",
        message: `Perspective camera '${entity.id}' must define fovY.`,
        path: `${path}/components/Camera/fovY`,
      });
    }
    if (camera.kind === "orthographic" && camera.size === undefined) {
      diagnostics.push({
        code: "TN_IR_CAMERA_FIELD_MISSING",
        message: `Orthographic camera '${entity.id}' must define size.`,
        path: `${path}/components/Camera/size`,
      });
    }
  }

  const light = entity.components.Light;
  if (light !== undefined) {
    if (!["ambient", "directional", "point", "spot"].includes(String(light.kind))) {
      diagnostics.push({
        code: "TN_IR_LIGHT_ADVANCED_UNSUPPORTED",
        message: `Light '${entity.id}' uses unsupported kind '${String(light.kind)}'.`,
        path: `${path}/components/Light/kind`,
        severity: "error",
        suggestion: "Use ambient, directional, point, or spot lights until spherical/area-light approximation policy is promoted.",
      });
    }
    for (const key of ["shadowBias", "shadowNormalBias"] as const) {
      const value = light[key];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
        diagnostics.push({
          code: "TN_IR_LIGHT_SHADOW_BIAS_INVALID",
          message: `Light ${key} for '${entity.id}' must be a finite number.`,
          path: `${path}/components/Light/${key}`,
          severity: "error",
          suggestion: "Use finite portable shadow bias values or omit the field to use runtime defaults.",
        });
      }
    }
    const filter = light.shadowFilter;
    if (filter !== undefined && (filter.mode !== "pcf" || !["low", "medium", "high"].includes(filter.quality))) {
      diagnostics.push({
        code: "TN_IR_LIGHT_SHADOW_FILTER_UNSUPPORTED",
        message: `Light shadowFilter for '${entity.id}' must use portable PCF quality low, medium, or high.`,
        path: `${path}/components/Light/shadowFilter`,
        severity: "error",
        suggestion: "Use { mode: 'pcf', quality: 'low' | 'medium' | 'high' } or omit the field.",
      });
    }
    if (light.debug?.gizmo !== undefined && typeof light.debug.gizmo !== "boolean") {
      diagnostics.push({
        code: "TN_IR_LIGHT_DEBUG_GIZMO_INVALID",
        message: `Light debug gizmo flag for '${entity.id}' must be boolean.`,
        path: `${path}/components/Light/debug/gizmo`,
        severity: "error",
        suggestion: "Use debug: { gizmo: true } only for opt-in debug visualization.",
      });
    }
  }

  const renderer = entity.components.MeshRenderer;
  const renderLayers = entity.components.RenderLayers;
  if (renderLayers !== undefined) {
    if (!Array.isArray(renderLayers.layers) || renderLayers.layers.length === 0) {
      diagnostics.push({
        code: "TN_IR_RENDER_LAYERS_INVALID",
        message: `RenderLayers for '${entity.id}' must include at least one layer name.`,
        path: `${path}/components/RenderLayers/layers`,
      });
    }
  }
  if (renderer?.castShadow !== undefined && typeof renderer.castShadow !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RENDER_SHADOW_FLAG_INVALID",
      message: `MeshRenderer castShadow for '${entity.id}' must be boolean.`,
      path: `${path}/components/MeshRenderer/castShadow`,
      severity: "error",
      suggestion: "Set MeshRenderer.castShadow to true or false, or omit it to use runtime defaults.",
    });
  }
  if (renderer?.receiveShadow !== undefined && typeof renderer.receiveShadow !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RENDER_SHADOW_FLAG_INVALID",
      message: `MeshRenderer receiveShadow for '${entity.id}' must be boolean.`,
      path: `${path}/components/MeshRenderer/receiveShadow`,
      severity: "error",
      suggestion: "Set MeshRenderer.receiveShadow to true or false, or omit it to use runtime defaults.",
    });
  }
  if (renderer?.visible !== undefined && typeof renderer.visible !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RENDER_VISIBILITY_INVALID",
      message: `MeshRenderer visibility for '${entity.id}' must be boolean.`,
      path: `${path}/components/MeshRenderer/visible`,
      severity: "error",
      suggestion: "Set MeshRenderer.visible to true or false, or omit it to inherit visibility.",
    });
  }

  const visibility = entity.components.Visibility;
  if (visibility !== undefined && typeof visibility.visible !== "boolean") {
    diagnostics.push({
      code: "TN_IR_RENDER_VISIBILITY_INVALID",
      message: `Visibility component for '${entity.id}' must be boolean.`,
      path: `${path}/components/Visibility/visible`,
      severity: "error",
      suggestion: "Set Visibility.visible to true or false.",
    });
  }
}

const V9_MAX_PHYSICS_DAMPING = 1000;
const V9_MAX_PHYSICS_GRAVITY_SCALE = 100;
const V9_MAX_PHYSICS_MASS = 1_000_000;
const V9_MAX_PHYSICS_SLEEP_THRESHOLD = 100;
const V9_MAX_PHYSICS_SOLVER_ITERATIONS = 64;
const V9_MAX_PHYSICS_SPEED = 10_000;
const V9_MAX_PHYSICS_FRICTION = 10;
const V9_MAX_SENSOR_OCCUPANTS = 128;
const V9_MAX_CHARACTER_PUSH_MASS = 1_000_000;
const V9_MAX_CHARACTER_PUSH_IMPULSE = 1000;
const V9_MAX_NAV_AGENT_RADIUS = 100;
const V9_MAX_NAV_AREA_COST = 1000;

function validatePhysicsComponents(entity: IWorldIr["entities"][number], path: string, entityIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
  const collider = entity.components.Collider as unknown;
  const body = entity.components.RigidBody as unknown;
  const joint = entity.components.PhysicsJoint as unknown;
  if (collider === undefined && body === undefined && joint === undefined) {
    return;
  }
  if (collider !== undefined && !isRecord(collider)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COLLIDER_INVALID",
      message: `Collider '${entity.id}' must be an object.`,
      path: `${path}/components/Collider`,
    });
  }
  if (body !== undefined && !isRecord(body)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVALID",
      message: `RigidBody '${entity.id}' must be an object.`,
      path: `${path}/components/RigidBody`,
    });
  }
  if (joint !== undefined && !isRecord(joint)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_JOINT_INVALID",
      message: `PhysicsJoint '${entity.id}' must be an object.`,
      path: `${path}/components/PhysicsJoint`,
      severity: "error",
    });
  }

  const colliderRecord = isRecord(collider) ? collider : undefined;
  const bodyRecord = isRecord(body) ? body : undefined;
  const jointRecord = isRecord(joint) ? joint : undefined;

  if (colliderRecord !== undefined) {
    if (!["box", "capsule", "mesh", "sphere"].includes(colliderRecord.kind as string)) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_COLLIDER_UNSUPPORTED",
        message: `Collider '${entity.id}' uses unsupported shape '${String(colliderRecord.kind)}'.`,
        path: `${path}/components/Collider/kind`,
        suggestion: "Use a V6 portable collider shape: box, sphere, capsule, or static mesh.",
      });
    }
    if (hasEnginePhysicsHandle(colliderRecord)) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED",
        message: "Collider must not expose backend-specific physics handles.",
        path: `${path}/components/Collider`,
        suggestion: "Use portable Collider.layer and Collider.mask filter metadata instead of Rapier, Bevy, or native physics handles.",
      });
    }
    validatePhysicsFilter(colliderRecord, `${path}/components/Collider`, diagnostics);
    if (colliderRecord.trigger !== undefined && typeof colliderRecord.trigger !== "boolean") {
      diagnostics.push({
        code: "TN_IR_PHYSICS_TRIGGER_INVALID",
        message: `Collider trigger flag for '${entity.id}' must be boolean.`,
        path: `${path}/components/Collider/trigger`,
      });
    }
    validatePhysicsSensor(colliderRecord.sensor, colliderRecord.kind, `${path}/components/Collider/sensor`, diagnostics);
    if (colliderRecord.friction !== undefined) {
      validateFiniteRange(colliderRecord.friction, 0, V9_MAX_PHYSICS_FRICTION, `${path}/components/Collider/friction`, "TN_IR_PHYSICS_COLLIDER_FRICTION_INVALID", diagnostics);
    }
    if (colliderRecord.restitution !== undefined) {
      validateFiniteRange(colliderRecord.restitution, 0, 1, `${path}/components/Collider/restitution`, "TN_IR_PHYSICS_COLLIDER_RESTITUTION_INVALID", diagnostics);
    }
    if (colliderRecord.kind === "box") {
      validatePositiveVec3(colliderRecord.size, `${path}/components/Collider/size`, "TN_IR_PHYSICS_COLLIDER_SIZE_INVALID", diagnostics);
      validateColliderSlope(colliderRecord.slope, `${path}/components/Collider/slope`, diagnostics);
    } else if (colliderRecord.slope !== undefined) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_COLLIDER_SLOPE_UNSUPPORTED",
        message: "Collider.slope is supported only for box colliders.",
        path: `${path}/components/Collider/slope`,
      });
    }
    if (colliderRecord.kind === "sphere") {
      validatePositiveFinite(colliderRecord.radius, `${path}/components/Collider/radius`, "TN_IR_PHYSICS_COLLIDER_RADIUS_INVALID", diagnostics);
    }
    if (colliderRecord.kind === "capsule") {
      validatePositiveFinite(colliderRecord.radius, `${path}/components/Collider/radius`, "TN_IR_PHYSICS_COLLIDER_RADIUS_INVALID", diagnostics);
      validatePositiveFinite(colliderRecord.height, `${path}/components/Collider/height`, "TN_IR_PHYSICS_COLLIDER_HEIGHT_INVALID", diagnostics);
    }
    if (colliderRecord.kind === "mesh" && colliderRecord.trigger === true) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_MESH_TRIGGER_UNSUPPORTED",
        message: "Mesh trigger colliders are not supported in the portable physics contract.",
        path: `${path}/components/Collider/kind`,
        suggestion: "Use a primitive trigger collider or a static mesh collider without trigger semantics.",
      });
    }
    if (colliderRecord.kind === "mesh") {
      validateMeshColliderMetadata(colliderRecord.mesh, `${path}/components/Collider/mesh`, diagnostics);
    } else if (colliderRecord.mesh !== undefined) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_MESH_COLLIDER_INVALID",
        message: "Collider.mesh metadata is supported only when Collider.kind is mesh.",
        path: `${path}/components/Collider/mesh`,
        severity: "error",
        suggestion: "Set Collider.kind to mesh or remove Collider.mesh metadata.",
      });
    }
  }
  if (bodyRecord !== undefined && !["dynamic", "kinematic", "static"].includes(bodyRecord.kind as string)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_UNSUPPORTED",
      message: `RigidBody '${entity.id}' uses unsupported body kind '${String(bodyRecord.kind)}'.`,
      path: `${path}/components/RigidBody/kind`,
    });
  }
  if (bodyRecord !== undefined && hasEnginePhysicsHandle(bodyRecord)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_ENGINE_HANDLE_UNSUPPORTED",
      message: "RigidBody must not expose backend-specific physics handles.",
      path: `${path}/components/RigidBody`,
      suggestion: "Use portable body and query metadata instead of Rapier, Bevy, or native physics handles.",
    });
  }
  if (bodyRecord !== undefined) {
    validateUnsupportedPhysicsSolverFields(bodyRecord, `${path}/components/RigidBody`, diagnostics);
    validateCcd(bodyRecord.ccd, `${path}/components/RigidBody/ccd`, diagnostics);
  }
  if (bodyRecord?.mass !== undefined) {
    validateFiniteRange(bodyRecord.mass, Number.MIN_VALUE, V9_MAX_PHYSICS_MASS, `${path}/components/RigidBody/mass`, "TN_IR_PHYSICS_BODY_MASS_INVALID", diagnostics);
  }
  if (bodyRecord?.damping !== undefined) {
    validateFiniteRange(bodyRecord.damping, 0, V9_MAX_PHYSICS_DAMPING, `${path}/components/RigidBody/damping`, "TN_IR_PHYSICS_BODY_DAMPING_INVALID", diagnostics);
  }
  if (bodyRecord?.gravityScale !== undefined) {
    validateFiniteRange(bodyRecord.gravityScale, -V9_MAX_PHYSICS_GRAVITY_SCALE, V9_MAX_PHYSICS_GRAVITY_SCALE, `${path}/components/RigidBody/gravityScale`, "TN_IR_PHYSICS_BODY_GRAVITY_SCALE_INVALID", diagnostics);
  }
  if (bodyRecord?.velocity !== undefined) {
    validateFiniteVec3Range(bodyRecord.velocity, -V9_MAX_PHYSICS_SPEED, V9_MAX_PHYSICS_SPEED, `${path}/components/RigidBody/velocity`, "TN_IR_PHYSICS_BODY_VELOCITY_INVALID", diagnostics);
  }
  if (bodyRecord?.angularVelocity !== undefined) {
    validateFiniteVec3Range(bodyRecord.angularVelocity, -V9_MAX_PHYSICS_SPEED, V9_MAX_PHYSICS_SPEED, `${path}/components/RigidBody/angularVelocity`, "TN_IR_PHYSICS_BODY_ANGULAR_VELOCITY_INVALID", diagnostics);
  }
  if (bodyRecord?.sleepThreshold !== undefined) {
    validateFiniteRange(bodyRecord.sleepThreshold, 0, V9_MAX_PHYSICS_SLEEP_THRESHOLD, `${path}/components/RigidBody/sleepThreshold`, "TN_IR_PHYSICS_BODY_SLEEP_THRESHOLD_INVALID", diagnostics);
  }
  if (bodyRecord?.solverIterations !== undefined) {
    validateIntegerRange(bodyRecord.solverIterations, 1, V9_MAX_PHYSICS_SOLVER_ITERATIONS, `${path}/components/RigidBody/solverIterations`, "TN_IR_PHYSICS_BODY_SOLVER_ITERATIONS_INVALID", diagnostics);
  }
  if (bodyRecord?.inverseMass !== undefined) {
    validateInverseMass(bodyRecord, `${path}/components/RigidBody`, diagnostics);
  }
  if (colliderRecord?.kind === "mesh" && bodyRecord?.kind !== undefined && bodyRecord.kind !== "static" && colliderRecord.mesh === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_DYNAMIC_MESH_COLLIDER_INVALID",
      message: "Dynamic and kinematic mesh colliders require explicit bounded Collider.mesh metadata.",
      path: `${path}/components/Collider/mesh`,
      severity: "error",
      suggestion: "Author Collider.mesh.bounds and Collider.mesh.triangleCount so adapters can use deterministic bounded AABB behavior.",
    });
  }
  if (bodyRecord !== undefined && collider === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COLLIDER_MISSING",
      message: `RigidBody '${entity.id}' must have a Collider in the V6 portable physics contract.`,
      path: `${path}/components/Collider`,
    });
  }
  if (jointRecord !== undefined) {
    validatePhysicsJoint(jointRecord, `${path}/components/PhysicsJoint`, entity.id, entityIds, diagnostics);
  }
}

function validateMeshColliderMetadata(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_MESH_COLLIDER_INVALID",
      message: "Mesh colliders require Collider.mesh metadata with bounds and triangleCount.",
      path,
      severity: "error",
      suggestion: "Provide bounds.size, optional bounds.center, source asset id, and a bounded triangleCount.",
    });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["bounds", "source", "triangleCount"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_MESH_COLLIDER_FIELD_UNSUPPORTED", message: `Collider.mesh uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (value.source !== undefined && (typeof value.source !== "string" || value.source.trim() === "")) {
    diagnostics.push({ code: "TN_IR_PHYSICS_MESH_COLLIDER_INVALID", message: "Collider.mesh.source must be a non-empty asset id when authored.", path: `${path}/source`, severity: "error" });
  }
  validateIntegerRange(value.triangleCount, 1, 10000, `${path}/triangleCount`, "TN_IR_PHYSICS_MESH_COLLIDER_TRIANGLE_COUNT_INVALID", diagnostics);
  if (!isRecord(value.bounds)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_MESH_COLLIDER_BOUNDS_INVALID", message: "Collider.mesh.bounds must be an object.", path: `${path}/bounds`, severity: "error" });
    return;
  }
  validatePositiveVec3(value.bounds.size, `${path}/bounds/size`, "TN_IR_PHYSICS_MESH_COLLIDER_BOUNDS_INVALID", diagnostics);
  if (value.bounds.center !== undefined) {
    validateFiniteVec3(value.bounds.center, `${path}/bounds/center`, "TN_IR_PHYSICS_MESH_COLLIDER_BOUNDS_INVALID", diagnostics);
  }
}

function validateCcd(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_CCD_INVALID", message: "RigidBody.ccd must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["enabled", "maxSubsteps", "mode"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_CCD_FIELD_UNSUPPORTED", message: `RigidBody.ccd uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.enabled !== "boolean") {
    diagnostics.push({ code: "TN_IR_PHYSICS_CCD_INVALID", message: "RigidBody.ccd.enabled must be boolean.", path: `${path}/enabled`, severity: "error" });
  }
  if (value.mode !== "linear" && value.mode !== "swept-aabb") {
    diagnostics.push({ code: "TN_IR_PHYSICS_CCD_INVALID", message: "RigidBody.ccd.mode must be linear or swept-aabb.", path: `${path}/mode`, severity: "error" });
  }
  if (value.maxSubsteps !== undefined) {
    validateIntegerRange(value.maxSubsteps, 1, 16, `${path}/maxSubsteps`, "TN_IR_PHYSICS_CCD_SUBSTEPS_INVALID", diagnostics);
  }
}

function validatePhysicsJoint(joint: Record<string, unknown>, path: string, entityId: string, entityIds: Set<string>, diagnostics: IIrDiagnostic[]): void {
  for (const key of Object.keys(joint)) {
    if (!["anchor", "axis", "connectedEntity", "damping", "kind", "limits", "stiffness", "travel"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_FIELD_UNSUPPORTED", message: `PhysicsJoint uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (!["hinge", "slider", "suspension"].includes(joint.kind as string)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_UNSUPPORTED", message: "PhysicsJoint.kind must be hinge, slider, or suspension.", path: `${path}/kind`, severity: "error" });
  }
  if (typeof joint.connectedEntity !== "string" || joint.connectedEntity.trim() === "" || joint.connectedEntity === entityId || !entityIds.has(joint.connectedEntity)) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_JOINT_TARGET_INVALID",
      message: "PhysicsJoint.connectedEntity must reference a different existing entity.",
      path: `${path}/connectedEntity`,
      severity: "error",
      suggestion: "Connect suspension, hinge, or slider joints to another rigid-body entity in the same world.",
    });
  }
  if (joint.anchor !== undefined) {
    validateFiniteVec3(joint.anchor, `${path}/anchor`, "TN_IR_PHYSICS_JOINT_INVALID", diagnostics);
  }
  if (joint.axis !== undefined) {
    validateFiniteVec3(joint.axis, `${path}/axis`, "TN_IR_PHYSICS_JOINT_INVALID", diagnostics);
  }
  for (const key of ["damping", "stiffness", "travel"]) {
    const value = joint[key];
    if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value < 0)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_INVALID", message: `PhysicsJoint.${key} must be a non-negative finite number.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (joint.limits !== undefined) {
    if (!isRecord(joint.limits) || typeof joint.limits.min !== "number" || typeof joint.limits.max !== "number" || !Number.isFinite(joint.limits.min) || !Number.isFinite(joint.limits.max) || joint.limits.min > joint.limits.max) {
      diagnostics.push({ code: "TN_IR_PHYSICS_JOINT_LIMITS_INVALID", message: "PhysicsJoint.limits must have finite min <= max.", path: `${path}/limits`, severity: "error" });
    }
  }
}

function validatePhysicsSensor(value: unknown, colliderKind: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (colliderKind === "mesh") {
    diagnostics.push({
      code: "TN_IR_PHYSICS_SENSOR_MESH_UNSUPPORTED",
      message: "Mesh sensor colliders are not supported in the V9 portable broad sensor contract.",
      path,
      severity: "error",
      suggestion: "Use a primitive box, sphere, or capsule sensor volume.",
    });
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_INVALID", message: "Collider.sensor must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["interactionKind", "occupantLimit", "phases", "trackOccupants"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_FIELD_UNSUPPORTED", message: `Collider.sensor uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (value.interactionKind !== undefined && !["checkpoint", "hazard", "pickup", "prompt", "zone"].includes(value.interactionKind as string)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_INVALID", message: "Collider.sensor.interactionKind must be checkpoint, hazard, pickup, prompt, or zone.", path: `${path}/interactionKind`, severity: "error" });
  }
  if (value.occupantLimit !== undefined) {
    validateIntegerRange(value.occupantLimit, 1, V9_MAX_SENSOR_OCCUPANTS, `${path}/occupantLimit`, "TN_IR_PHYSICS_SENSOR_OCCUPANT_LIMIT_INVALID", diagnostics);
  }
  if (value.trackOccupants !== undefined && typeof value.trackOccupants !== "boolean") {
    diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_INVALID", message: "Collider.sensor.trackOccupants must be boolean.", path: `${path}/trackOccupants`, severity: "error" });
  }
  if (value.phases !== undefined) {
    if (!Array.isArray(value.phases) || value.phases.length === 0 || value.phases.some((phase) => !["enter", "stay", "exit"].includes(phase as string))) {
      diagnostics.push({ code: "TN_IR_PHYSICS_SENSOR_PHASES_INVALID", message: "Collider.sensor.phases must be a non-empty array containing enter, stay, or exit.", path: `${path}/phases`, severity: "error" });
    }
  }
}

function validateUnsupportedPhysicsSolverFields(body: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const key of ["constraint", "constraints", "joint", "joints", "randomSeed", "solverRandomSeed", "nondeterministic", "backendSolver"] as const) {
    if (body[key] !== undefined) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_SOLVER_FIELD_UNSUPPORTED",
        message: `RigidBody uses unsupported solver field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Use portable primitive body metadata only; joints, constraints, backend solvers, and nondeterministic settings are deferred.",
      });
    }
  }
}

function validateInverseMass(body: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  const value = body.inverseMass;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > V9_MAX_PHYSICS_MASS) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: `RigidBody.inverseMass must be a finite number from 0 to ${V9_MAX_PHYSICS_MASS}.`,
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Use 0 for static or kinematic bodies, or a positive reciprocal of mass for dynamic primitive bodies.",
    });
    return;
  }
  if (body.kind !== "dynamic" && value !== 0) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: "RigidBody.inverseMass must be 0 for static and kinematic bodies.",
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Set inverseMass to 0 or omit it for non-dynamic bodies.",
    });
  }
  if (body.kind === "dynamic" && value <= 0) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: "Dynamic RigidBody.inverseMass must be greater than 0.",
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Use a positive reciprocal of mass for dynamic primitive bodies.",
    });
  }
  if (typeof body.mass === "number" && Number.isFinite(body.mass) && Math.abs(value - 1 / body.mass) > 0.000001) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_BODY_INVERSE_MASS_INVALID",
      message: "RigidBody.inverseMass must match 1 / RigidBody.mass when both are authored.",
      path: `${path}/inverseMass`,
      severity: "error",
      suggestion: "Omit inverseMass and let adapters derive it, or set it to the reciprocal of mass.",
    });
  }
}

function validateColliderSlope(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: "Collider.slope must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["axis", "direction", "rise", "run"].includes(key)) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_FIELD_UNSUPPORTED", message: `Collider.slope uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (value.axis !== "x" && value.axis !== "z") {
    diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: "Collider.slope.axis must be x or z.", path: `${path}/axis` });
  }
  if (value.direction !== -1 && value.direction !== 1) {
    diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: "Collider.slope.direction must be -1 or 1.", path: `${path}/direction` });
  }
  for (const key of ["rise", "run"]) {
    const item = value[key];
    if (typeof item !== "number" || !Number.isFinite(item) || item <= 0) {
      diagnostics.push({ code: "TN_IR_PHYSICS_COLLIDER_SLOPE_INVALID", message: `Collider.slope.${key} must be a positive finite number.`, path: `${path}/${key}` });
    }
  }
}

function hasEnginePhysicsHandle(value: Record<string, unknown>): boolean {
  return Object.keys(value).some((key) => /(?:rapier|bevy|native|engine).*(?:handle|body|collider)|(?:handle|rawHandle)$/i.test(key));
}

function validatePhysicsFilter(value: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value.layer !== undefined && (typeof value.layer !== "string" || value.layer.trim() === "")) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_FILTER_INVALID",
      message: "Collider.layer must be a non-empty portable filter layer string.",
      path: `${path}/layer`,
      suggestion: "Use a stable gameplay layer name such as 'world', 'player', or 'sensor'.",
    });
  }
  if (value.mask !== undefined) {
    if (!Array.isArray(value.mask) || value.mask.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
      diagnostics.push({
        code: "TN_IR_PHYSICS_FILTER_INVALID",
        message: "Collider.mask must be an array of non-empty portable filter layer strings.",
        path: `${path}/mask`,
        suggestion: "Use stable gameplay layer names and keep backend bitmasks adapter-private.",
      });
    }
  }
}

function validateCharacterComponents(
  entity: IWorldIr["entities"][number],
  path: string,
  input: IInputIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  const controller = entity.components.CharacterController as unknown;
  if (controller === undefined) {
    return;
  }
  if (!isRecord(controller)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_CONTROLLER_INVALID",
      message: `CharacterController '${entity.id}' must be an object.`,
      path: `${path}/components/CharacterController`,
    });
    return;
  }

  for (const key of Object.keys(controller)) {
    if (!["blocking", "grounding", "interactAction", "moveXAxis", "moveZAxis", "pushPolicy", "slopeLimit", "speed", "stepOffset"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_CHARACTER_FIELD_UNSUPPORTED",
        message: `CharacterController '${entity.id}' uses unsupported field '${key}'.`,
        path: `${path}/components/CharacterController/${key}`,
        suggestion: "Navmesh and engine-specific controller fields are deferred.",
      });
    }
  }
  validateCharacterPushPolicy(controller.pushPolicy, `${path}/components/CharacterController/pushPolicy`, diagnostics);
  if (entity.components.Collider === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_COLLIDER_MISSING",
      message: `CharacterController '${entity.id}' must have a Collider.`,
      path: `${path}/components/Collider`,
    });
  }
  if (entity.components.Transform === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_TRANSFORM_MISSING",
      message: `CharacterController '${entity.id}' must have a Transform.`,
      path: `${path}/components/Transform`,
    });
  }
  if (entity.components.RigidBody === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_BODY_MISSING",
      message: `CharacterController '${entity.id}' must have a RigidBody.`,
      path: `${path}/components/RigidBody`,
    });
  }
  if (typeof controller.speed !== "number" || !Number.isFinite(controller.speed) || controller.speed <= 0) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_SPEED_INVALID",
      message: "CharacterController.speed must be a positive finite number.",
      path: `${path}/components/CharacterController/speed`,
    });
  }
  if (controller.slopeLimit !== undefined && (typeof controller.slopeLimit !== "number" || !Number.isFinite(controller.slopeLimit) || controller.slopeLimit < 0 || controller.slopeLimit > 90)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_SLOPE_INVALID",
      message: "CharacterController.slopeLimit must be a finite angle from 0 to 90 degrees.",
      path: `${path}/components/CharacterController/slopeLimit`,
    });
  }
  if (typeof controller.blocking !== "boolean") {
    diagnostics.push({
      code: "TN_IR_CHARACTER_BLOCKING_INVALID",
      message: "CharacterController.blocking must be boolean.",
      path: `${path}/components/CharacterController/blocking`,
    });
  }
  if (controller.stepOffset !== undefined && (typeof controller.stepOffset !== "number" || !Number.isFinite(controller.stepOffset) || controller.stepOffset < 0)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_STEP_INVALID",
      message: "CharacterController.stepOffset must be a finite non-negative number.",
      path: `${path}/components/CharacterController/stepOffset`,
    });
  }
  if (!["none", "raycast"].includes(controller.grounding as string)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_GROUNDING_UNSUPPORTED",
      message: `CharacterController '${entity.id}' uses unsupported grounding mode '${String(controller.grounding)}'.`,
      path: `${path}/components/CharacterController/grounding`,
      suggestion: "Use 'raycast' or 'none'.",
    });
  }

  const axisIds = new Set(input?.axes.map((axis) => axis.id) ?? []);
  const actionIds = new Set(input?.actions.map((action) => action.id) ?? []);
  validateInputRef(controller.moveXAxis, axisIds, input, `${path}/components/CharacterController/moveXAxis`, "axis", diagnostics);
  validateInputRef(controller.moveZAxis, axisIds, input, `${path}/components/CharacterController/moveZAxis`, "axis", diagnostics);
  if (controller.interactAction !== undefined) {
    validateInputRef(controller.interactAction, actionIds, input, `${path}/components/CharacterController/interactAction`, "action", diagnostics);
  }
}

function validateCharacterPushPolicy(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_POLICY_INVALID", message: "CharacterController.pushPolicy must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["allowedLayers", "blockedWhenTooHeavy", "enabled", "impulseScale", "maxPushMass", "minMoveSpeed"].includes(key)) {
      diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_FIELD_UNSUPPORTED", message: `CharacterController.pushPolicy uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.enabled !== "boolean") {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_POLICY_INVALID", message: "CharacterController.pushPolicy.enabled must be boolean.", path: `${path}/enabled`, severity: "error" });
  }
  if (value.maxPushMass !== undefined) {
    validateFiniteRange(value.maxPushMass, 0, V9_MAX_CHARACTER_PUSH_MASS, `${path}/maxPushMass`, "TN_IR_CHARACTER_PUSH_MASS_INVALID", diagnostics);
  }
  if (value.impulseScale !== undefined) {
    validateFiniteRange(value.impulseScale, 0, V9_MAX_CHARACTER_PUSH_IMPULSE, `${path}/impulseScale`, "TN_IR_CHARACTER_PUSH_IMPULSE_INVALID", diagnostics);
  }
  if (value.minMoveSpeed !== undefined) {
    validateFiniteRange(value.minMoveSpeed, 0, V9_MAX_PHYSICS_SPEED, `${path}/minMoveSpeed`, "TN_IR_CHARACTER_PUSH_SPEED_INVALID", diagnostics);
  }
  if (value.blockedWhenTooHeavy !== undefined && typeof value.blockedWhenTooHeavy !== "boolean") {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_POLICY_INVALID", message: "CharacterController.pushPolicy.blockedWhenTooHeavy must be boolean.", path: `${path}/blockedWhenTooHeavy`, severity: "error" });
  }
  if (value.allowedLayers !== undefined && (!Array.isArray(value.allowedLayers) || value.allowedLayers.some((layer) => typeof layer !== "string" || layer.trim() === ""))) {
    diagnostics.push({ code: "TN_IR_CHARACTER_PUSH_LAYERS_INVALID", message: "CharacterController.pushPolicy.allowedLayers must be an array of non-empty layer strings.", path: `${path}/allowedLayers`, severity: "error" });
  }
}

function validateInputRef(
  value: unknown,
  ids: ReadonlySet<string>,
  input: IInputIr | undefined,
  path: string,
  kind: "action" | "axis",
  diagnostics: IIrDiagnostic[],
): void {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({
      code: "TN_IR_CHARACTER_INPUT_REF_INVALID",
      message: `CharacterController ${kind} reference must be a non-empty string.`,
      path,
    });
    return;
  }
  if (input === undefined) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_INPUT_MISSING",
      message: "CharacterController requires an input map for movement and interaction references.",
      path,
    });
    return;
  }
  if (!ids.has(value)) {
    diagnostics.push({
      code: kind === "axis" ? "TN_IR_CHARACTER_AXIS_MISSING" : "TN_IR_CHARACTER_ACTION_MISSING",
      message: `CharacterController references unknown input ${kind} '${value}'.`,
      path,
    });
  }
}
