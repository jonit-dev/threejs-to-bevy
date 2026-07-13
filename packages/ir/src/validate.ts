import { stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type IAssetsManifest,
  type IAnimationsIr,
  type IAudioIr,
  type IEnvironmentSceneIr,
  type IMaterialsIr,
  type IPrefabsIr,
  type ITargetProfile,
  type IUiIr,
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
import { validateLocalData } from "./localDataValidation.js";
import { validateGameFlow } from "./gameFlowValidation.js";
import { validateManifest, validateV10BoundaryCapabilities } from "./manifestValidation.js";
import { validateScenes } from "./scenesValidation.js";
import { validateSequences } from "./sequencesValidation.js";
import { validateCharacterComponents, validatePhysicsComponents } from "./physicsValidation.js";
import { validateRenderingLightBudget, validateRuntimeConfig } from "./runtimeConfigValidation.js";
import { validateContactShadows } from "./rendering.js";
import { validateInteractions } from "./interactionsValidation.js";
import { readBundleDocuments, readJson } from "./bundleDocuments.js";
import {
  validateResources,
  validateSchemaFile,
  validateWorldComponents,
  validateWorldEvents,
} from "./schemaValidation.js";
import {
  isRecord,
  isNumberTuple,
  validateFiniteMinimum,
  validateFiniteNumber,
  validateFiniteRange,
  validateFiniteVec3,
  validateIntegerRange,
  validatePositiveFinite,
  validateUniqueIds,
} from "./validationPrimitives.js";
import { validateUnsupportedFields } from "./validationDiagnostics.js";
import { validateEntityTags } from "./tagValidation.js";

export interface IIrDiagnostic {
  code: string;
  fix?: {
    allowed?: readonly string[];
    cookbook?: string;
    docs?: string;
    instruction: string;
    snippet?: string;
  };
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
const V9_MAX_NAV_AGENT_RADIUS = 100;
const V9_MAX_NAV_AREA_COST = 1000;
const TARGET_PROFILE_TARGETS = new Set(["desktop", "web"]);

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
    gameFlow,
    gltfScene,
    input,
    interactions,
    localData,
    materials,
    overlays,
    prefabs,
    resourceSchemas,
    runtimeConfig,
    scenes,
    sequences,
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
    diagnostics.push(...validateEnvironmentSceneIr(environmentScene, assets, manifest.entry.environmentScene ?? IR_DOCUMENTS.environmentScene.fileName, input, { budgets: targetProfile?.budgets }));
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
  if (gameFlow !== undefined) {
    validateGameFlow(gameFlow, manifest.entry.gameFlow ?? IR_DOCUMENTS.gameFlow.fileName, diagnostics);
  }
  if (scenes !== undefined) {
    validateScenes(scenes, manifest.entry.scenes ?? IR_DOCUMENTS.scenes.fileName, world, assets, input, audio, ui, systems, diagnostics);
  }
  if (sequences !== undefined) {
    validateSequences(sequences, manifest.entry.sequences ?? IR_DOCUMENTS.sequences.fileName, diagnostics);
  }
  if (targetProfile !== undefined) {
    validateTargetProfile(targetProfile, manifest.files.targetProfile, diagnostics);
    if (Array.isArray(targetProfile.targets) && targetProfile.targets.length === 0) {
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
  if (interactions !== undefined) {
    validateInteractions(interactions, manifest.entry.interactions ?? IR_DOCUMENTS.interactions.fileName, {
      componentSchemas: componentSchemas?.schemas ?? {},
      eventSchemas: eventSchemas?.schemas ?? {},
      feedbackPresets: systems?.feedbackPresets ?? [],
      gameFlow,
      prefabs,
      resourceSchemas: resourceSchemas?.schemas ?? {},
      world,
    }, diagnostics);
  }
  if (input !== undefined) {
    validateInput(input, manifest.files.input ?? IR_DOCUMENTS.input.fileName, diagnostics);
  }
  if (runtimeConfig !== undefined) {
    validateRuntimeConfig(runtimeConfig, manifest.files.runtimeConfig ?? IR_DOCUMENTS.runtimeConfig.fileName, diagnostics);
  }
  if (ui !== undefined) {
    validateUi(ui, manifest.entry.ui ?? IR_DOCUMENTS.ui.fileName, diagnostics, new Set((world?.entities ?? []).map((entity) => entity.id)));
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

function validateTargetProfile(targetProfile: ITargetProfile, path: string, diagnostics: IIrDiagnostic[]): void {
  const profile = targetProfile as unknown as Record<string, unknown>;
  if (profile.schema !== IR_SCHEMA_IDS.targetProfile) {
    diagnostics.push({
      code: "TN_IR_TARGET_PROFILE_SCHEMA_UNSUPPORTED",
      message: `Target profile schema must be '${IR_SCHEMA_IDS.targetProfile}'.`,
      path: `${path}/schema`,
      severity: "error",
      suggestion: "Update target.profile.json to use the canonical target-profile schema literal.",
      value: typeof profile.schema === "string" ? profile.schema : undefined,
    });
  }
  if (profile.version !== IR_VERSION) {
    diagnostics.push({
      code: "TN_IR_TARGET_PROFILE_VERSION_UNSUPPORTED",
      message: `Target profile version must be '${IR_VERSION}'.`,
      path: `${path}/version`,
      severity: "error",
      suggestion: "Regenerate the bundle or update target.profile.json to the supported IR version.",
      value: typeof profile.version === "string" ? profile.version : undefined,
    });
  }
  if (!Array.isArray(profile.targets)) {
    diagnostics.push({
      code: "TN_IR_TARGETS_INVALID",
      message: "Target profile targets must be an array.",
      path: `${path}/targets`,
      severity: "error",
      suggestion: "Declare one or more supported target profile names.",
    });
    return;
  }
  profile.targets.forEach((target, index) => {
    if (typeof target !== "string" || !TARGET_PROFILE_TARGETS.has(target)) {
      diagnostics.push({
        code: "TN_IR_TARGET_PROFILE_TARGET_UNSUPPORTED",
        limit: [...TARGET_PROFILE_TARGETS].sort(),
        message: `Unsupported target profile target '${String(target)}'.`,
        path: `${path}/targets/${index}`,
        severity: "error",
        suggestion: "Use 'desktop' for native desktop bundles; Bevy remains an adapter-private runtime name.",
        value: typeof target === "string" ? target : undefined,
      });
    }
  });
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
  validateUnsupportedFields(diagnostics, raw, ["schema", "transformClips", "version"], (key) => ({
    code: "TN_IR_ANIMATIONS_FIELD_UNSUPPORTED",
    message: `Animations IR uses unsupported field '${key}'.`,
    path: `${path}/${key}`,
    severity: "error",
    suggestion: "Use transformClips for portable transform animation; keep IK, morph targets, masks, and engine controllers out of portable IR.",
  }));
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
  world.entities.forEach((entity, index) => {
    validateEntityTags(entity.tags, `${path}/entities/${index}/tags`, diagnostics);
    validateTransformComponents(entity, `${path}/entities/${index}`, diagnostics);
  });
  world.entities.forEach((entity, index) => validatePatrolComponent(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validateStateMachineComponent(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validateWorldTextComponent(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validateKinematicMoverComponent(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validateSpawnerComponent(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validateRenderComponents(entity, `${path}/entities/${index}`, diagnostics));
  validatePortableRenderLayerCapacity(world, path, diagnostics);
  const entityIds = new Set(world.entities.map((entity) => entity.id));
  world.entities.forEach((entity, index) => validatePhysicsComponents(entity, `${path}/entities/${index}`, entityIds, diagnostics));
  world.entities.forEach((entity, index) => validateCharacterComponents(entity, `${path}/entities/${index}`, input, diagnostics));
}

const PORTABLE_RENDER_LAYER_CAPACITY = 32;

function validatePortableRenderLayerCapacity(world: IWorldIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const names = new Set<string>(["default"]);
  for (const entity of world.entities) {
    for (const name of entity.components.RenderLayers?.layers ?? []) {
      if (typeof name === "string") {
        names.add(name);
      }
    }
    for (const name of entity.components.Camera?.layers ?? []) {
      if (typeof name === "string") {
        names.add(name);
      }
    }
  }
  if (names.size > PORTABLE_RENDER_LAYER_CAPACITY) {
    diagnostics.push({
      code: "TN_IR_RENDER_LAYER_CAPACITY_EXCEEDED",
      message: `World declares ${names.size} render layers, exceeding the portable limit of ${PORTABLE_RENDER_LAYER_CAPACITY}.`,
      path: `${path}/entities`,
      severity: "error",
      suggestion: `Use at most ${PORTABLE_RENDER_LAYER_CAPACITY} unique render layer names including 'default'.`,
    });
  }
}

function validateKinematicMoverComponent(entity: IWorldEntity, path: string, diagnostics: IIrDiagnostic[]): void {
  const mover = entity.components.KinematicMover;
  if (mover === undefined) {
    return;
  }
  if (!isRecord(mover)) {
    diagnostics.push({ code: "TN_IR_KINEMATIC_MOVER_INVALID", message: `KinematicMover '${entity.id}' must be an object.`, path: `${path}/components/KinematicMover`, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, mover, ["axis", "direction", "loop", "mode", "phase", "radius", "speed", "waypoints"], (key) => ({
    code: "TN_IR_KINEMATIC_MOVER_FIELD_UNSUPPORTED",
    message: `KinematicMover '${entity.id}' uses unsupported field '${key}'.`,
    path: `${path}/components/KinematicMover/${key}`,
    severity: "error",
  }));
  if (mover.mode !== "sine" && mover.mode !== "waypoints") {
    diagnostics.push({
      code: "TN_IR_KINEMATIC_MOVER_MODE_INVALID",
      message: "KinematicMover.mode must be sine or waypoints.",
      path: `${path}/components/KinematicMover/mode`,
      severity: "error",
      suggestion: "Use mode: 'sine' for oscillating hazards or mode: 'waypoints' for path movers.",
    });
  }
  validateFiniteNumber(mover.speed, `${path}/components/KinematicMover/speed`, "TN_IR_KINEMATIC_MOVER_SPEED_INVALID", diagnostics);
  if (mover.axis !== undefined && mover.axis !== "x" && mover.axis !== "y" && mover.axis !== "z") {
    diagnostics.push({ code: "TN_IR_KINEMATIC_MOVER_AXIS_INVALID", message: "KinematicMover.axis must be x, y, or z.", path: `${path}/components/KinematicMover/axis`, severity: "error" });
  }
  if (mover.direction !== undefined) {
    validateFiniteVec3(mover.direction, `${path}/components/KinematicMover/direction`, "TN_IR_KINEMATIC_MOVER_DIRECTION_INVALID", diagnostics);
  }
  if (mover.phase !== undefined) {
    validateFiniteNumber(mover.phase, `${path}/components/KinematicMover/phase`, "TN_IR_KINEMATIC_MOVER_PHASE_INVALID", diagnostics);
  }
  if (mover.radius !== undefined) {
    validateFiniteMinimum(mover.radius, 0, `${path}/components/KinematicMover/radius`, "TN_IR_KINEMATIC_MOVER_RADIUS_INVALID", diagnostics);
  }
  if (mover.loop !== undefined && typeof mover.loop !== "boolean") {
    diagnostics.push({ code: "TN_IR_KINEMATIC_MOVER_LOOP_INVALID", message: "KinematicMover.loop must be boolean.", path: `${path}/components/KinematicMover/loop`, severity: "error" });
  }
  if (mover.mode === "sine" && mover.waypoints !== undefined) {
    diagnostics.push({
      code: "TN_IR_KINEMATIC_MOVER_WAYPOINTS_INVALID",
      message: "KinematicMover.waypoints is only supported when mode is waypoints.",
      path: `${path}/components/KinematicMover/waypoints`,
      severity: "error",
    });
  }
  if (mover.mode === "waypoints") {
    if (!Array.isArray(mover.waypoints) || mover.waypoints.length < 2) {
      diagnostics.push({
        code: "TN_IR_KINEMATIC_MOVER_WAYPOINTS_INVALID",
        message: "Waypoint KinematicMover requires at least two waypoint positions.",
        path: `${path}/components/KinematicMover/waypoints`,
        severity: "error",
      });
    } else {
      mover.waypoints.forEach((waypoint, index) => validateFiniteVec3(waypoint, `${path}/components/KinematicMover/waypoints/${index}`, "TN_IR_KINEMATIC_MOVER_WAYPOINTS_INVALID", diagnostics));
    }
  }
}

function validatePatrolComponent(entity: IWorldEntity, path: string, diagnostics: IIrDiagnostic[]): void {
  const patrol = entity.components.Patrol;
  if (patrol === undefined) {
    return;
  }
  if (!isRecord(patrol)) {
    diagnostics.push({ code: "TN_IR_PATROL_INVALID", message: `Patrol '${entity.id}' must be an object.`, path: `${path}/components/Patrol`, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, patrol, ["faceHeading", "mode", "pauseAtWaypoint", "paused", "speed", "waypoints"], (key) => ({
    code: "TN_IR_PATROL_FIELD_UNSUPPORTED",
    message: `Patrol '${entity.id}' uses unsupported field '${key}'.`,
    path: `${path}/components/Patrol/${key}`,
    severity: "error",
  }));
  if (patrol.mode !== "loop" && patrol.mode !== "ping-pong") {
    diagnostics.push({ code: "TN_IR_PATROL_MODE_INVALID", message: "Patrol.mode must be loop or ping-pong.", path: `${path}/components/Patrol/mode`, severity: "error", suggestion: "Use mode: 'loop' for a closed route or mode: 'ping-pong' for a reversing route." });
  }
  validateFiniteMinimum(patrol.speed, 0, `${path}/components/Patrol/speed`, "TN_IR_PATROL_SPEED_INVALID", diagnostics);
  if (!Array.isArray(patrol.waypoints) || patrol.waypoints.length < 2 || patrol.waypoints.length > 32) {
    diagnostics.push({ code: "TN_IR_PATROL_WAYPOINTS_INVALID", message: "Patrol.waypoints must contain between 2 and 32 positions.", path: `${path}/components/Patrol/waypoints`, severity: "error", suggestion: "Keep patrol routes bounded and provide at least two waypoints." });
  } else {
    patrol.waypoints.forEach((waypoint, index) => validateFiniteVec3(waypoint, `${path}/components/Patrol/waypoints/${index}`, "TN_IR_PATROL_WAYPOINTS_INVALID", diagnostics));
  }
  if (patrol.pauseAtWaypoint !== undefined) {
    validateFiniteRange(patrol.pauseAtWaypoint, 0, 60, `${path}/components/Patrol/pauseAtWaypoint`, "TN_IR_PATROL_PAUSE_INVALID", diagnostics);
  }
  if (patrol.faceHeading !== undefined && typeof patrol.faceHeading !== "boolean") {
    diagnostics.push({ code: "TN_IR_PATROL_FACE_HEADING_INVALID", message: "Patrol.faceHeading must be boolean.", path: `${path}/components/Patrol/faceHeading`, severity: "error" });
  }
  if (patrol.paused !== undefined && typeof patrol.paused !== "boolean") {
    diagnostics.push({ code: "TN_IR_PATROL_PAUSED_INVALID", message: "Patrol.paused must be boolean.", path: `${path}/components/Patrol/paused`, severity: "error" });
  }
  if (entity.components.RigidBody?.kind === "dynamic") {
    diagnostics.push({ code: "TN_IR_PATROL_DYNAMIC_BODY_UNSUPPORTED", message: `Patrol '${entity.id}' cannot drive a dynamic rigid body.`, path: `${path}/components/Patrol`, severity: "error", suggestion: "Use a kinematic rigid body for runtime-owned patrol intent or author a future force/steering contract." });
  }
}

function validateStateMachineComponent(entity: IWorldEntity, path: string, diagnostics: IIrDiagnostic[]): void {
  const machine = entity.components.StateMachine;
  if (machine === undefined) {
    return;
  }
  if (!isRecord(machine)) {
    diagnostics.push({ code: "TN_IR_STATE_MACHINE_INVALID", message: `StateMachine '${entity.id}' must be an object.`, path: `${path}/components/StateMachine`, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, machine, ["current", "enabled", "initial", "states", "transitions"], (key) => ({
    code: "TN_IR_STATE_MACHINE_FIELD_UNSUPPORTED",
    message: `StateMachine '${entity.id}' uses unsupported field '${key}'.`,
    path: `${path}/components/StateMachine/${key}`,
    severity: "error",
  }));
  if (!Array.isArray(machine.states) || machine.states.length === 0 || machine.states.length > 32 || machine.states.some((state) => typeof state !== "string" || state.trim() === "")) {
    diagnostics.push({ code: "TN_IR_STATE_MACHINE_STATES_INVALID", message: "StateMachine.states must contain between 1 and 32 non-empty state names.", path: `${path}/components/StateMachine/states`, severity: "error", suggestion: "Use a bounded unique state-name array." });
  }
  if (Array.isArray(machine.states) && new Set(machine.states).size !== machine.states.length) {
    diagnostics.push({ code: "TN_IR_STATE_MACHINE_STATES_DUPLICATE", message: "StateMachine.states must contain unique state names.", path: `${path}/components/StateMachine/states`, severity: "error", suggestion: "Keep each state name unique so transitions have one deterministic target." });
  }
  const states = new Set(Array.isArray(machine.states) ? machine.states : []);
  if (typeof machine.initial !== "string" || !states.has(machine.initial)) {
    diagnostics.push({ code: "TN_IR_STATE_MACHINE_INITIAL_INVALID", message: "StateMachine.initial must name a declared state.", path: `${path}/components/StateMachine/initial`, severity: "error" });
  }
  if (machine.current !== undefined && (typeof machine.current !== "string" || !states.has(machine.current))) {
    diagnostics.push({ code: "TN_IR_STATE_MACHINE_CURRENT_INVALID", message: "StateMachine.current must name a declared state when authored.", path: `${path}/components/StateMachine/current`, severity: "error" });
  }
  if (machine.enabled !== undefined && typeof machine.enabled !== "boolean") {
    diagnostics.push({ code: "TN_IR_STATE_MACHINE_ENABLED_INVALID", message: "StateMachine.enabled must be boolean.", path: `${path}/components/StateMachine/enabled`, severity: "error" });
  }
  if (!Array.isArray(machine.transitions) || machine.transitions.length > 64) {
    diagnostics.push({ code: "TN_IR_STATE_MACHINE_TRANSITIONS_INVALID", message: "StateMachine.transitions must contain at most 64 transitions.", path: `${path}/components/StateMachine/transitions`, severity: "error" });
    return;
  }
  machine.transitions.forEach((transition, index) => {
    const transitionPath = `${path}/components/StateMachine/transitions/${index}`;
    if (!isRecord(transition)) {
      diagnostics.push({ code: "TN_IR_STATE_MACHINE_TRANSITION_INVALID", message: "StateMachine transition must be an object.", path: transitionPath, severity: "error" });
      return;
    }
    if (!states.has(transition.from) || !states.has(transition.to)) {
      diagnostics.push({ code: "TN_IR_STATE_MACHINE_TRANSITION_STATE_INVALID", message: "StateMachine transition from/to must name declared states.", path: transitionPath, severity: "error" });
    }
    const trigger = transition.trigger;
    if (!isRecord(trigger)) {
      diagnostics.push({ code: "TN_IR_STATE_MACHINE_TRIGGER_INVALID", message: "StateMachine transition trigger must be an object.", path: `${transitionPath}/trigger`, severity: "error" });
      return;
    }
    validateUnsupportedFields(diagnostics, trigger, ["event", "kind", "phase", "sensor", "ticks"], (key) => ({
      code: "TN_IR_STATE_MACHINE_TRIGGER_FIELD_UNSUPPORTED",
      message: `StateMachine trigger uses unsupported field '${key}'.`,
      path: `${transitionPath}/trigger/${key}`,
      severity: "error",
    }));
    if (trigger.kind === "event") {
      if (typeof trigger.event !== "string" || trigger.event.trim() === "") {
        diagnostics.push({ code: "TN_IR_STATE_MACHINE_EVENT_INVALID", message: "Event state-machine triggers require a non-empty event id.", path: `${transitionPath}/trigger/event`, severity: "error" });
      }
    } else if (trigger.kind === "sensor") {
      if (typeof trigger.sensor !== "string" || trigger.sensor.trim() === "" || !["enter", "exit", "stay"].includes(String(trigger.phase))) {
        diagnostics.push({ code: "TN_IR_STATE_MACHINE_SENSOR_INVALID", message: "Sensor state-machine triggers require a sensor id and enter, exit, or stay phase.", path: `${transitionPath}/trigger`, severity: "error" });
      }
    } else if (trigger.kind === "timer") {
      validateIntegerRange(trigger.ticks, 1, 6000, `${transitionPath}/trigger/ticks`, "TN_IR_STATE_MACHINE_TIMER_INVALID", diagnostics);
    } else {
      diagnostics.push({ code: "TN_IR_STATE_MACHINE_TRIGGER_KIND_INVALID", message: "StateMachine trigger.kind must be event, sensor, or timer.", path: `${transitionPath}/trigger/kind`, severity: "error" });
    }
  });
}

function validateWorldTextComponent(entity: IWorldEntity, path: string, diagnostics: IIrDiagnostic[]): void {
  const text = entity.components.WorldText;
  if (text === undefined) {
    return;
  }
  if (!isRecord(text)) {
    diagnostics.push({ code: "TN_IR_WORLD_TEXT_INVALID", message: `WorldText '${entity.id}' must be an object.`, path: `${path}/components/WorldText`, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, text, ["billboard", "color", "elapsed", "fade", "floatDistance", "lifetime", "offset", "size", "target", "text"], (key) => ({
    code: "TN_IR_WORLD_TEXT_FIELD_UNSUPPORTED",
    message: `WorldText '${entity.id}' uses unsupported field '${key}'.`,
    path: `${path}/components/WorldText/${key}`,
    severity: "error",
  }));
  if (typeof text.text !== "string" || text.text.length === 0 || text.text.length > 128) {
    diagnostics.push({ code: "TN_IR_WORLD_TEXT_TEXT_INVALID", message: "WorldText.text must contain between 1 and 128 characters.", path: `${path}/components/WorldText/text`, severity: "error" });
  }
  if (text.size !== undefined) validateFiniteRange(text.size, 1, 256, `${path}/components/WorldText/size`, "TN_IR_WORLD_TEXT_SIZE_INVALID", diagnostics);
  if (text.lifetime !== undefined) validateFiniteRange(text.lifetime, 0, 30, `${path}/components/WorldText/lifetime`, "TN_IR_WORLD_TEXT_LIFETIME_INVALID", diagnostics);
  if (text.floatDistance !== undefined) validateFiniteRange(text.floatDistance, 0, 10, `${path}/components/WorldText/floatDistance`, "TN_IR_WORLD_TEXT_FLOAT_INVALID", diagnostics);
  if (text.elapsed !== undefined) validateFiniteRange(text.elapsed, 0, 30, `${path}/components/WorldText/elapsed`, "TN_IR_WORLD_TEXT_ELAPSED_INVALID", diagnostics);
  if (text.offset !== undefined) {
    validateFiniteVec3(text.offset, `${path}/components/WorldText/offset`, "TN_IR_WORLD_TEXT_OFFSET_INVALID", diagnostics);
  }
  if (text.target !== undefined && (typeof text.target !== "string" || text.target.trim() === "")) {
    diagnostics.push({ code: "TN_IR_WORLD_TEXT_TARGET_INVALID", message: "WorldText.target must be a non-empty entity id when provided.", path: `${path}/components/WorldText/target`, severity: "error" });
  }
  if (text.billboard !== undefined && typeof text.billboard !== "boolean") {
    diagnostics.push({ code: "TN_IR_WORLD_TEXT_BILLBOARD_INVALID", message: "WorldText.billboard must be boolean.", path: `${path}/components/WorldText/billboard`, severity: "error" });
  }
  if (text.fade !== undefined && typeof text.fade !== "boolean") {
    diagnostics.push({ code: "TN_IR_WORLD_TEXT_FADE_INVALID", message: "WorldText.fade must be boolean.", path: `${path}/components/WorldText/fade`, severity: "error" });
  }
  if (text.color !== undefined && typeof text.color !== "string" && (!isNumberTuple(text.color, 3) && !isNumberTuple(text.color, 4))) {
    diagnostics.push({ code: "TN_IR_WORLD_TEXT_COLOR_INVALID", message: "WorldText.color must be a color string or a finite RGB/RGBA tuple.", path: `${path}/components/WorldText/color`, severity: "error" });
  }
}

function validateSpawnerComponent(entity: IWorldEntity, path: string, diagnostics: IIrDiagnostic[]): void {
  const spawner = entity.components.Spawner;
  if (spawner === undefined) {
    return;
  }
  if (!isRecord(spawner)) {
    diagnostics.push({ code: "TN_IR_SPAWNER_INVALID", message: `Spawner '${entity.id}' must be an object.`, path: `${path}/components/Spawner`, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, spawner, ["area", "despawnPolicy", "enabled", "interval", "jitterSeed", "maxAlive", "maxTotal", "mode", "prefab", "waveSize"], (key) => ({
    code: "TN_IR_SPAWNER_FIELD_UNSUPPORTED",
    message: `Spawner '${entity.id}' uses unsupported field '${key}'.`,
    path: `${path}/components/Spawner/${key}`,
    severity: "error",
  }));
  if (spawner.mode !== "interval" && spawner.mode !== "once" && spawner.mode !== "wave") {
    diagnostics.push({
      code: "TN_IR_SPAWNER_MODE_INVALID",
      message: "Spawner.mode must be interval, once, or wave.",
      path: `${path}/components/Spawner/mode`,
      severity: "error",
      suggestion: "Use mode: 'once' for one-time population, 'interval' for streams, or 'wave' for bursts.",
    });
  }
  if (typeof spawner.prefab !== "string" || spawner.prefab.length === 0) {
    diagnostics.push({ code: "TN_IR_SPAWNER_PREFAB_INVALID", message: "Spawner.prefab must be a non-empty prefab id.", path: `${path}/components/Spawner/prefab`, severity: "error" });
  }
  if (typeof spawner.enabled !== "boolean") {
    diagnostics.push({ code: "TN_IR_SPAWNER_ENABLED_INVALID", message: "Spawner.enabled must be boolean.", path: `${path}/components/Spawner/enabled`, severity: "error" });
  }
  validateOptionalPositiveFinite(spawner.interval, `${path}/components/Spawner/interval`, "TN_IR_SPAWNER_INTERVAL_INVALID", diagnostics);
  validateOptionalIntegerMinimum(spawner.waveSize, 1, `${path}/components/Spawner/waveSize`, "TN_IR_SPAWNER_WAVE_SIZE_INVALID", diagnostics);
  validateOptionalIntegerMinimum(spawner.maxAlive, 1, `${path}/components/Spawner/maxAlive`, "TN_IR_SPAWNER_MAX_ALIVE_INVALID", diagnostics);
  validateOptionalIntegerMinimum(spawner.maxTotal, 1, `${path}/components/Spawner/maxTotal`, "TN_IR_SPAWNER_MAX_TOTAL_INVALID", diagnostics);
  if (spawner.jitterSeed !== undefined) {
    validateFiniteNumber(spawner.jitterSeed, `${path}/components/Spawner/jitterSeed`, "TN_IR_SPAWNER_JITTER_SEED_INVALID", diagnostics);
  }
  validateSpawnerArea(spawner.area, `${path}/components/Spawner/area`, diagnostics);
  validateSpawnerDespawnPolicy(spawner.despawnPolicy, `${path}/components/Spawner/despawnPolicy`, diagnostics);
}

function validateSpawnerArea(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_SPAWNER_AREA_INVALID", message: "Spawner.area must be an object.", path, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, value, ["shape", "size"], (key) => ({
    code: "TN_IR_SPAWNER_AREA_FIELD_UNSUPPORTED",
    message: `Spawner.area uses unsupported field '${key}'.`,
    path: `${path}/${key}`,
    severity: "error",
  }));
  if (value.shape !== "point" && value.shape !== "box" && value.shape !== "circle") {
    diagnostics.push({ code: "TN_IR_SPAWNER_AREA_SHAPE_INVALID", message: "Spawner.area.shape must be point, box, or circle.", path: `${path}/shape`, severity: "error" });
  }
  if (value.size !== undefined && (typeof value.size !== "number" || !Number.isFinite(value.size)) && !isNumberTuple(value.size, 2) && !isNumberTuple(value.size, 3)) {
    diagnostics.push({ code: "TN_IR_SPAWNER_AREA_SIZE_INVALID", message: "Spawner.area.size must be a finite number, vec2, or vec3.", path: `${path}/size`, severity: "error" });
  }
}

function validateSpawnerDespawnPolicy(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_SPAWNER_DESPAWN_POLICY_INVALID", message: "Spawner.despawnPolicy must be an object.", path, severity: "error" });
    return;
  }
  validateUnsupportedFields(diagnostics, value, ["afterSeconds", "beyondDistance"], (key) => ({
    code: "TN_IR_SPAWNER_DESPAWN_POLICY_FIELD_UNSUPPORTED",
    message: `Spawner.despawnPolicy uses unsupported field '${key}'.`,
    path: `${path}/${key}`,
    severity: "error",
  }));
  validateOptionalPositiveFinite(value.afterSeconds, `${path}/afterSeconds`, "TN_IR_SPAWNER_DESPAWN_AFTER_INVALID", diagnostics);
  validateOptionalPositiveFinite(value.beyondDistance, `${path}/beyondDistance`, "TN_IR_SPAWNER_DESPAWN_DISTANCE_INVALID", diagnostics);
}

function validateOptionalPositiveFinite(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value) || value <= 0)) {
    diagnostics.push({ code, message: "Expected a positive finite number.", path, severity: "error" });
  }
}

function validateOptionalIntegerMinimum(value: unknown, minimum: number, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (value !== undefined && (typeof value !== "number" || !Number.isInteger(value) || value < minimum)) {
    diagnostics.push({ code, message: `Expected an integer greater than or equal to ${minimum}.`, path, severity: "error" });
  }
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
        fix: {
          cookbook: "materials-pass",
          docs: "docs/contracts/ir.md",
          instruction: "Add the missing material to the durable material source document or update MeshRenderer.material to an existing material id.",
          snippet: '{ "id": "mat.default", "color": "#ffffff", "roughness": 0.8, "metalness": 0 }',
        },
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
        fix: {
          docs: "docs/contracts/ir.md",
          instruction: "Use finite numeric Transform vectors; repair the durable scene source that emitted this IR path.",
          snippet: '{ "Transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": [1, 1, 1] } }',
        },
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
  diagnostics.push(...validateContactShadows(entity.components.ContactShadows, `${path}/components/ContactShadows`));
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
