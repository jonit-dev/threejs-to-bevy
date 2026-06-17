import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type IAssetsManifest,
  type IAnimationsIr,
  type IAudioControlIr,
  type IAudioIr,
  type IAudioMusicIr,
  type IAudioOneShotIr,
  type IBundleManifest,
  type IEnvironmentSceneIr,
  type IIrNamedSchema,
  type IIrSchemaFile,
  type IIrSchemaField,
  type IMaterialsIr,
  type ITargetProfile,
  type IUiIr,
  type IUiNodeIr,
  type IWorldIr,
} from "./types.js";
import type { ISystemsIr } from "./systems.js";
import type { IInputIr, InputBinding } from "./input.js";
import { validatePerformanceProfile } from "./performanceProfile.js";
import { validateEnvironmentSceneIr } from "./environment.js";
import { validateOverlaysIr, type IOverlaysIr } from "./overlays.js";
import { validateCameraViews } from "./camera.js";

export interface IIrDiagnostic {
  code: string;
  limit?: number | readonly string[];
  message: string;
  path: string;
  severity?: "error" | "warning";
  suggestion?: string;
  value?: number | string;
}

export interface IBundleValidationResult {
  diagnostics: IIrDiagnostic[];
  ok: boolean;
}

export async function validateBundle(bundlePath: string): Promise<IBundleValidationResult> {
  const diagnostics: IIrDiagnostic[] = [];
  const manifest = await readJson<unknown>(resolve(bundlePath, "manifest.json"), diagnostics);

  if (manifest === undefined) {
    return { diagnostics, ok: false };
  }

  if (!validateManifest(manifest, "manifest.json", diagnostics)) {
    return { diagnostics, ok: false };
  }

  const world = await readJson<IWorldIr>(resolve(bundlePath, manifest.entry.world), diagnostics);
  const audio =
    manifest.entry.audio === undefined
      ? undefined
      : await readJson<IAudioIr>(resolve(bundlePath, manifest.entry.audio), diagnostics);
  const animations =
    manifest.entry.animations === undefined
      ? undefined
      : await readJson<IAnimationsIr>(resolve(bundlePath, manifest.entry.animations), diagnostics);
  const environmentScene =
    manifest.entry.environmentScene === undefined
      ? undefined
      : await readJson<IEnvironmentSceneIr>(resolve(bundlePath, manifest.entry.environmentScene), diagnostics);
  const materials = await readJson<IMaterialsIr>(resolve(bundlePath, manifest.files.materials), diagnostics);
  const assets = await readJson<IAssetsManifest>(resolve(bundlePath, manifest.files.assets), diagnostics);
  const targetProfile = await readJson<ITargetProfile>(resolve(bundlePath, manifest.files.targetProfile), diagnostics);
  const systems =
    manifest.entry.systems === undefined
      ? undefined
      : await readJson<ISystemsIr>(resolve(bundlePath, manifest.entry.systems), diagnostics);
  const input =
    manifest.files.input === undefined ? undefined : await readJson<IInputIr>(resolve(bundlePath, manifest.files.input), diagnostics);
  const runtimeConfig =
    manifest.files.runtimeConfig === undefined
      ? undefined
      : await readJson<unknown>(resolve(bundlePath, manifest.files.runtimeConfig), diagnostics);
  const ui =
    manifest.entry.ui === undefined ? undefined : await readJson<IUiIr>(resolve(bundlePath, manifest.entry.ui), diagnostics);
  const overlays =
    manifest.entry.overlays === undefined
      ? undefined
      : await readJson<IOverlaysIr>(resolve(bundlePath, manifest.entry.overlays), diagnostics);
  const componentSchemas =
    manifest.files.componentSchemas === undefined
      ? undefined
      : await readJson<IIrSchemaFile>(resolve(bundlePath, manifest.files.componentSchemas), diagnostics);
  const resourceSchemas =
    manifest.files.resourceSchemas === undefined
      ? undefined
      : await readJson<IIrSchemaFile>(resolve(bundlePath, manifest.files.resourceSchemas), diagnostics);
  const eventSchemas =
    manifest.files.eventSchemas === undefined
      ? undefined
      : await readJson<IIrSchemaFile>(resolve(bundlePath, manifest.files.eventSchemas), diagnostics);

  if (world !== undefined) {
    validateWorld(world, manifest.entry.world, diagnostics, input);
    const entityIds = new Set(world.entities.map((entity) => entity.id));
    if (componentSchemas !== undefined) {
      validateSchemaFile(componentSchemas, manifest.files.componentSchemas ?? "schemas/components.schema.json", "threenative.component-schemas", diagnostics);
      validateWorldComponents(world, componentSchemas.schemas, entityIds, diagnostics);
    }
    if (resourceSchemas !== undefined) {
      validateSchemaFile(resourceSchemas, manifest.files.resourceSchemas ?? "schemas/resources.schema.json", "threenative.resource-schemas", diagnostics);
      validateResources(world, resourceSchemas.schemas, entityIds, diagnostics);
    }
    if (eventSchemas !== undefined) {
      validateSchemaFile(eventSchemas, manifest.files.eventSchemas ?? "schemas/events.schema.json", "threenative.event-schemas", diagnostics);
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
    await validateAssets(assets, bundlePath, manifest.files.assets, diagnostics);
  }
  if (environmentScene !== undefined) {
    diagnostics.push(...validateEnvironmentSceneIr(environmentScene, assets, manifest.entry.environmentScene ?? "environment.scene.json", input));
  }
  if (audio !== undefined) {
    validateAudio(audio, assets, manifest.entry.audio ?? "audio.ir.json", diagnostics);
  }
  if (animations !== undefined) {
    validateAnimations(animations, world, manifest.entry.animations ?? "animations.ir.json", diagnostics);
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
      manifest.entry.systems ?? "systems.ir.json",
      componentSchemas?.schemas ?? {},
      resourceSchemas?.schemas ?? {},
      eventSchemas?.schemas ?? {},
      diagnostics,
    );
  }
  if (input !== undefined) {
    validateInput(input, manifest.files.input ?? "input.ir.json", diagnostics);
  }
  if (runtimeConfig !== undefined) {
    validateRuntimeConfig(runtimeConfig, manifest.files.runtimeConfig ?? "runtime.config.json", diagnostics);
  }
  if (ui !== undefined) {
    validateUi(ui, manifest.entry.ui ?? "ui.ir.json", diagnostics);
  }
  if (overlays !== undefined) {
    diagnostics.push(...validateOverlaysIr(overlays, manifest.entry.overlays ?? "overlays.ir.json"));
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
  const files = assets.assets.filter((asset) => "path" in asset);
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

function validateVec3(value: readonly number[], path: string, diagnostics: IIrDiagnostic[]): void {
  if (value.length !== 3 || value.some((item) => !Number.isFinite(item))) {
    diagnostics.push({
      code: "TN_IR_VEC3_INVALID",
      message: "Expected a three-component finite numeric vector.",
      path,
    });
  }
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

function validateAudio(
  audio: IAudioIr,
  assets: IAssetsManifest | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = audio as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["buses", "controls", "emitters", "listeners", "music", "oneShots", "schema", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_AUDIO_FIELD_UNSUPPORTED",
        message: `Audio IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  if (audio.schema !== "threenative.audio" || audio.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_AUDIO_VERSION_UNSUPPORTED",
      message: "Audio IR must use threenative.audio version 0.1.0.",
      path,
    });
  }
  const audioAssets = new Set((assets?.assets ?? []).filter((asset) => asset.kind === "audio").map((asset) => asset.id));
  const busIds = validateAudioBuses(audio.buses, `${path}/buses`, diagnostics);
  const emitterIds = validateAudioEmitters(audio.emitters, `${path}/emitters`, diagnostics);
  validateAudioListeners(audio.listeners, `${path}/listeners`, diagnostics);
  audio.oneShots.forEach((oneShot, index) => validateAudioOneShot(oneShot, audioAssets, busIds, emitterIds, `${path}/oneShots/${index}`, diagnostics));
  audio.music.forEach((music, index) => validateAudioMusic(music, audioAssets, busIds, `${path}/music/${index}`, diagnostics));
  validateAudioControls(audio.controls, audio, `${path}/controls`, diagnostics);
}

function validateAudioOneShot(
  oneShot: IAudioOneShotIr,
  audioAssets: Set<string>,
  busIds: Set<string>,
  emitterIds: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = oneShot as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["asset", "bus", "emitter", "event", "id", "volume"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_AUDIO_FIELD_UNSUPPORTED",
        message: `Audio one-shot '${oneShot.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  validateAudioVolume(oneShot.volume, `${path}/volume`, diagnostics);
  validateAudioAssetRef(oneShot.asset, audioAssets, `${path}/asset`, diagnostics);
  validateAudioRouteRef(oneShot.bus, busIds, `${path}/bus`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
  validateAudioRouteRef(oneShot.emitter, emitterIds, `${path}/emitter`, "TN_IR_AUDIO_EMITTER_MISSING", "emitter", diagnostics);
}

function validateAudioMusic(
  music: IAudioMusicIr,
  audioAssets: Set<string>,
  busIds: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = music as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["asset", "autoplay", "bus", "id", "loop", "volume"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_AUDIO_FIELD_UNSUPPORTED",
        message: `Audio music '${music.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  if (music.loop !== true) {
    diagnostics.push({
      code: "TN_IR_AUDIO_MUSIC_LOOP_REQUIRED",
      message: `Audio music '${music.id}' must be looped in V2.`,
      path: `${path}/loop`,
    });
  }
  validateAudioVolume(music.volume, `${path}/volume`, diagnostics);
  validateAudioAssetRef(music.asset, audioAssets, `${path}/asset`, diagnostics);
  validateAudioRouteRef(music.bus, busIds, `${path}/bus`, "TN_IR_AUDIO_BUS_MISSING", "bus", diagnostics);
}

function validateAudioControls(
  controls: IAudioControlIr[] | undefined,
  audio: IAudioIr,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (controls === undefined) {
    return;
  }
  if (!Array.isArray(controls)) {
    diagnostics.push({ code: "TN_IR_AUDIO_CONTROLS_INVALID", message: "Audio controls must be an array.", path });
    return;
  }
  const playbackIds = new Set([...audio.music, ...audio.oneShots].map((item) => item.id));
  const ids = new Set<string>();
  controls.forEach((control, index) => {
    const controlPath = `${path}/${index}`;
    const raw = control as unknown as Record<string, unknown>;
    for (const key of Object.keys(raw)) {
      if (!["at", "id", "kind", "target"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio control '${control.id}' uses unsupported field '${key}'.`, path: `${controlPath}/${key}` });
      }
    }
    if (ids.has(control.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_DUPLICATE", message: `Audio control '${control.id}' is duplicated.`, path: `${controlPath}/id` });
    }
    ids.add(control.id);
    if (!["pause", "query", "resume", "seek", "stop"].includes(control.kind)) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_KIND_INVALID", message: `Audio control '${control.id}' uses unsupported kind '${String(control.kind)}'.`, path: `${controlPath}/kind` });
    }
    if (!playbackIds.has(control.target)) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_TARGET_MISSING", message: `Audio control '${control.id}' references unknown playback '${control.target}'.`, path: `${controlPath}/target` });
    }
    if (control.at !== undefined && (!Number.isFinite(control.at) || control.at < 0 || control.kind !== "seek")) {
      diagnostics.push({ code: "TN_IR_AUDIO_CONTROL_SEEK_INVALID", message: `Audio control '${control.id}' has an invalid seek position.`, path: `${controlPath}/at` });
    }
  });
}

function validateAudioBuses(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  if (value === undefined) {
    return ids;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_BUSES_INVALID", message: "Audio buses must be an array.", path });
    return ids;
  }
  value.forEach((bus, index) => {
    const busPath = `${path}/${index}`;
    if (!isRecord(bus)) {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_INVALID", message: "Audio bus must be an object.", path: busPath });
      return;
    }
    for (const key of Object.keys(bus)) {
      if (!["id", "volume"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio bus uses unsupported field '${key}'.`, path: `${busPath}/${key}` });
      }
    }
    if (typeof bus.id !== "string" || bus.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_ID_INVALID", message: "Audio bus ID must be a non-empty string.", path: `${busPath}/id` });
    } else if (ids.has(bus.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_BUS_DUPLICATE", message: `Audio bus '${bus.id}' is duplicated.`, path: `${busPath}/id` });
    } else {
      ids.add(bus.id);
    }
    validateAudioVolume(bus.volume, `${busPath}/volume`, diagnostics);
  });
  return ids;
}

function validateAudioListeners(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  if (value === undefined) {
    return ids;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_LISTENERS_INVALID", message: "Audio listeners must be an array.", path });
    return ids;
  }
  value.forEach((listener, index) => {
    const listenerPath = `${path}/${index}`;
    if (!isRecord(listener)) {
      diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_INVALID", message: "Audio listener must be an object.", path: listenerPath });
      return;
    }
    for (const key of Object.keys(listener)) {
      if (!["id", "position"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio listener uses unsupported field '${key}'.`, path: `${listenerPath}/${key}` });
      }
    }
    if (typeof listener.id !== "string" || listener.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_ID_INVALID", message: "Audio listener ID must be a non-empty string.", path: `${listenerPath}/id` });
    } else if (ids.has(listener.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_LISTENER_DUPLICATE", message: `Audio listener '${listener.id}' is duplicated.`, path: `${listenerPath}/id` });
    } else {
      ids.add(listener.id);
    }
    validateFiniteVec3(listener.position, `${listenerPath}/position`, "TN_IR_AUDIO_LISTENER_POSITION_INVALID", diagnostics);
  });
  return ids;
}

function validateAudioEmitters(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const ids = new Set<string>();
  if (value === undefined) {
    return ids;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_AUDIO_EMITTERS_INVALID", message: "Audio emitters must be an array.", path });
    return ids;
  }
  value.forEach((emitter, index) => {
    const emitterPath = `${path}/${index}`;
    if (!isRecord(emitter)) {
      diagnostics.push({ code: "TN_IR_AUDIO_EMITTER_INVALID", message: "Audio emitter must be an object.", path: emitterPath });
      return;
    }
    for (const key of Object.keys(emitter)) {
      if (!["id", "position", "radius"].includes(key)) {
        diagnostics.push({ code: "TN_IR_AUDIO_FIELD_UNSUPPORTED", message: `Audio emitter uses unsupported field '${key}'.`, path: `${emitterPath}/${key}` });
      }
    }
    if (typeof emitter.id !== "string" || emitter.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_AUDIO_EMITTER_ID_INVALID", message: "Audio emitter ID must be a non-empty string.", path: `${emitterPath}/id` });
    } else if (ids.has(emitter.id)) {
      diagnostics.push({ code: "TN_IR_AUDIO_EMITTER_DUPLICATE", message: `Audio emitter '${emitter.id}' is duplicated.`, path: `${emitterPath}/id` });
    } else {
      ids.add(emitter.id);
    }
    validateFiniteVec3(emitter.position, `${emitterPath}/position`, "TN_IR_AUDIO_EMITTER_POSITION_INVALID", diagnostics);
    if (emitter.radius !== undefined) {
      validatePositiveFinite(emitter.radius, `${emitterPath}/radius`, "TN_IR_AUDIO_EMITTER_RADIUS_INVALID", diagnostics);
    }
  });
  return ids;
}

function validateAudioRouteRef(
  value: unknown,
  ids: Set<string>,
  path: string,
  code: string,
  label: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "string" || value.trim() === "" || !ids.has(value)) {
    diagnostics.push({
      code,
      message: `Audio playback references unknown ${label} '${String(value)}'.`,
      path,
    });
  }
}

function validateAudioVolume(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    diagnostics.push({
      code: "TN_IR_AUDIO_VOLUME_INVALID",
      message: "Audio volume must be a finite number greater than or equal to 0.",
      path,
    });
  }
}

function validateAudioAssetRef(
  asset: string,
  audioAssets: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!audioAssets.has(asset)) {
    diagnostics.push({
      code: "TN_IR_AUDIO_ASSET_MISSING",
      message: `Audio playback references unknown audio asset '${asset}'.`,
      path,
    });
  }
}

function validateUi(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (ui.schema !== "threenative.ui" || ui.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_UI_VERSION_UNSUPPORTED",
      message: "UI IR must use threenative.ui version 0.1.0.",
      path,
    });
  }
  const ids = new Set<string>();
  const focusableIds = new Set<string>();
  validateUiNode(ui.root, `${path}/root`, diagnostics, ids);
  collectFocusableUiIds(ui.root, focusableIds);
  validateUiMetadata(ui, path, diagnostics, ids, focusableIds);
}

function validateUiNode(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>): void {
  const raw = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["accessibilityLabel", "action", "binding", "children", "focusable", "id", "kind", "label", "layout", "max", "navigation", "role", "src", "style", "text", "value"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_UI_FIELD_UNSUPPORTED",
        message: `UI node '${node.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  validateUiLayout(node.layout, `${path}/layout`, diagnostics);
  validateUiStyle(node.style, `${path}/style`, diagnostics);
  validateUiAccessibility(node, path, diagnostics);
  if (!["bar", "button", "column", "image", "row", "stack", "text", "touchControl"].includes(node.kind)) {
    diagnostics.push({
      code: "TN_IR_UI_NODE_UNSUPPORTED",
      message: `Unsupported UI node kind '${String(node.kind)}'.`,
      path: `${path}/kind`,
    });
  }
  if (ids.has(node.id)) {
    diagnostics.push({
      code: "TN_IR_UI_ID_DUPLICATE",
      message: `UI node ID '${node.id}' is duplicated.`,
      path: `${path}/id`,
    });
  }
  ids.add(node.id);
  if ((node.kind === "button" || node.kind === "touchControl") && node.action === undefined) {
    diagnostics.push({
      code: "TN_IR_UI_ACTION_MISSING",
      message: `UI ${node.kind} node '${node.id}' must declare an action.`,
      path: `${path}/action`,
    });
  }
  if (node.kind === "image") {
    if (typeof node.src !== "string" || node.src.length === 0) {
      diagnostics.push({
        code: "TN_IR_UI_IMAGE_SRC_MISSING",
        message: `UI image node '${node.id}' must declare a non-empty src.`,
        path: `${path}/src`,
      });
    } else if (node.src.startsWith("/") || node.src.includes("..") || /^[a-z]+:/i.test(node.src)) {
      diagnostics.push({
        code: "TN_IR_UI_IMAGE_SRC_INVALID",
        message: "UI image src must be a bundle-relative path.",
        path: `${path}/src`,
      });
    }
  }
  node.children?.forEach((child, index) => validateUiNode(child, `${path}/children/${index}`, diagnostics, ids));
}

function validateUiAccessibility(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (node.accessibilityLabel !== undefined && (typeof node.accessibilityLabel !== "string" || node.accessibilityLabel.length === 0)) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_LABEL_INVALID", message: "UI accessibilityLabel must be a non-empty string when provided.", path: `${path}/accessibilityLabel` });
  }
  if (node.role !== undefined && !["button", "group", "image", "list", "listitem", "none", "progressbar", "text"].includes(String(node.role))) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_ROLE_INVALID", message: "UI role must be button, group, image, list, listitem, none, progressbar, or text.", path: `${path}/role` });
  }
  const hasAccessibleName = typeof node.accessibilityLabel === "string" && node.accessibilityLabel.length > 0
    || typeof node.label === "string" && node.label.length > 0
    || typeof node.text === "string" && node.text.length > 0;
  if (["bar", "button", "image", "touchControl"].includes(node.kind) && !hasAccessibleName) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_LABEL_MISSING", message: `UI ${node.kind} node '${node.id}' must declare label, text, or accessibilityLabel.`, path });
  }
  if (node.focusable === true && !hasAccessibleName) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_FOCUSABLE_NAME_MISSING", message: `Focusable UI node '${node.id}' must declare label, text, or accessibilityLabel.`, path });
  }
  if (node.role === "progressbar" && !hasAccessibleName) {
    diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_PROGRESS_NAME_MISSING", message: `UI progressbar node '${node.id}' must declare label, text, or accessibilityLabel.`, path });
  }
  if (node.role === "list") {
    node.children?.forEach((child, index) => {
      if (child.role !== "listitem") {
        diagnostics.push({ code: "TN_IR_UI_ACCESSIBILITY_LISTITEM_MISSING", message: `UI list child '${child.id}' must declare role 'listitem'.`, path: `${path}/children/${index}/role` });
      }
    });
  }
}

function validateUiStyle(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_INVALID", message: "UI style must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["backgroundColor", "borderColor", "borderRadius", "borderWidth", "color", "fontSize", "fontWeight", "gradient", "opacity", "shadow", "textAlign", "textDecoration", "wrap"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_FIELD_UNSUPPORTED", message: `UI style uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  for (const key of ["backgroundColor", "borderColor", "color"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "string" || !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(item))) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: `UI style ${key} must be #RRGGBB or #RRGGBBAA.`, path: `${path}/${key}` });
    }
  }
  for (const key of ["borderRadius", "borderWidth", "fontSize"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: `UI style ${key} must be a finite non-negative number.`, path: `${path}/${key}` });
    }
  }
  if (value.opacity !== undefined && (typeof value.opacity !== "number" || !Number.isFinite(value.opacity) || value.opacity < 0 || value.opacity > 1)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_OPACITY_INVALID", message: "UI style opacity must be between 0 and 1.", path: `${path}/opacity` });
  }
  validateUiGradient(value.gradient, `${path}/gradient`, diagnostics);
  validateUiShadow(value.shadow, `${path}/shadow`, diagnostics);
  if (value.fontWeight !== undefined && !["bold", "normal"].includes(String(value.fontWeight))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_FONT_WEIGHT_INVALID", message: "UI style fontWeight must be normal or bold.", path: `${path}/fontWeight` });
  }
  if (value.textAlign !== undefined && !["center", "left", "right"].includes(String(value.textAlign))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_TEXT_ALIGN_INVALID", message: "UI style textAlign must be left, center, or right.", path: `${path}/textAlign` });
  }
  if (value.textDecoration !== undefined && !["lineThrough", "none", "underline"].includes(String(value.textDecoration))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_TEXT_DECORATION_INVALID", message: "UI style textDecoration must be none, underline, or lineThrough.", path: `${path}/textDecoration` });
  }
  if (value.wrap !== undefined && !["character", "none", "word"].includes(String(value.wrap))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_WRAP_INVALID", message: "UI style wrap must be character, none, or word.", path: `${path}/wrap` });
  }
}

function validateUiGradient(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_GRADIENT_INVALID", message: "UI style gradient must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["angle", "from", "kind", "to"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_FIELD_UNSUPPORTED", message: `UI style gradient uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (value.kind !== "linear") {
    diagnostics.push({ code: "TN_IR_UI_STYLE_GRADIENT_INVALID", message: "UI style gradient kind must be linear.", path: `${path}/kind` });
  }
  for (const key of ["from", "to"]) {
    const item = value[key];
    if (typeof item !== "string" || !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(item)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: `UI style gradient ${key} must be #RRGGBB or #RRGGBBAA.`, path: `${path}/${key}` });
    }
  }
  if (value.angle !== undefined && (typeof value.angle !== "number" || !Number.isFinite(value.angle))) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: "UI style gradient angle must be a finite number.", path: `${path}/angle` });
  }
}

function validateUiShadow(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_SHADOW_INVALID", message: "UI style shadow must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["blur", "color", "offsetX", "offsetY", "spread"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_FIELD_UNSUPPORTED", message: `UI style shadow uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (typeof value.color !== "string" || !/^#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(value.color)) {
    diagnostics.push({ code: "TN_IR_UI_STYLE_COLOR_INVALID", message: "UI style shadow color must be #RRGGBB or #RRGGBBAA.", path: `${path}/color` });
  }
  for (const key of ["offsetX", "offsetY"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item))) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: `UI style shadow ${key} must be a finite number.`, path: `${path}/${key}` });
    }
  }
  for (const key of ["blur", "spread"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
      diagnostics.push({ code: "TN_IR_UI_STYLE_NUMBER_INVALID", message: `UI style shadow ${key} must be a finite non-negative number.`, path: `${path}/${key}` });
    }
  }
}

function validateUiLayout(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_INVALID", message: "UI layout must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["align", "columnGap", "direction", "grid", "grow", "height", "inset", "justify", "maxHeight", "maxWidth", "minHeight", "minWidth", "overflow", "padding", "position", "rowGap", "width", "zIndex"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_FIELD_UNSUPPORTED", message: `UI layout uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (value.direction !== undefined && !["column", "row"].includes(String(value.direction))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_DIRECTION_INVALID", message: "UI layout direction must be row or column.", path: `${path}/direction` });
  }
  if (value.align !== undefined && !["center", "end", "start", "stretch"].includes(String(value.align))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_ALIGN_INVALID", message: "UI layout align must be start, center, end, or stretch.", path: `${path}/align` });
  }
  if (value.justify !== undefined && !["center", "end", "spaceBetween", "start"].includes(String(value.justify))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_JUSTIFY_INVALID", message: "UI layout justify must be start, center, end, or spaceBetween.", path: `${path}/justify` });
  }
  if (value.overflow !== undefined && !["hidden", "scroll", "visible"].includes(String(value.overflow))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_OVERFLOW_INVALID", message: "UI layout overflow must be hidden, scroll, or visible.", path: `${path}/overflow` });
  }
  if (value.position !== undefined && !["absolute", "relative"].includes(String(value.position))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_POSITION_INVALID", message: "UI layout position must be absolute or relative.", path: `${path}/position` });
  }
  validateUiGridLayout(value.grid, `${path}/grid`, diagnostics);
  for (const key of ["columnGap", "grow", "height", "maxHeight", "maxWidth", "minHeight", "minWidth", "padding", "rowGap", "width"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_NUMBER_INVALID", message: `UI layout ${key} must be a finite non-negative number.`, path: `${path}/${key}` });
    }
  }
  if (value.inset !== undefined) {
    if (!isRecord(value.inset)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_INSET_INVALID", message: "UI layout inset must be an object.", path: `${path}/inset` });
    } else {
      for (const key of Object.keys(value.inset)) {
        if (!["bottom", "left", "right", "top"].includes(key)) {
          diagnostics.push({ code: "TN_IR_UI_LAYOUT_INSET_FIELD_UNSUPPORTED", message: `UI layout inset uses unsupported field '${key}'.`, path: `${path}/inset/${key}` });
        }
      }
      for (const key of ["bottom", "left", "right", "top"]) {
        const item = value.inset[key];
        if (item !== undefined && (typeof item !== "number" || !Number.isFinite(item) || item < 0)) {
          diagnostics.push({ code: "TN_IR_UI_LAYOUT_INSET_INVALID", message: `UI layout inset ${key} must be a finite non-negative number.`, path: `${path}/inset/${key}` });
        }
      }
    }
  }
  if (value.zIndex !== undefined && (typeof value.zIndex !== "number" || !Number.isInteger(value.zIndex))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_Z_INDEX_INVALID", message: "UI layout zIndex must be an integer.", path: `${path}/zIndex` });
  }
}

function validateUiGridLayout(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_INVALID", message: "UI layout grid must be an object.", path });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["autoFlow", "columns", "rows"].includes(key)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_FIELD_UNSUPPORTED", message: `UI layout grid uses unsupported field '${key}'.`, path: `${path}/${key}` });
    }
  }
  if (value.autoFlow !== undefined && !["column", "row"].includes(String(value.autoFlow))) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_AUTO_FLOW_INVALID", message: "UI layout grid autoFlow must be row or column.", path: `${path}/autoFlow` });
  }
  for (const key of ["columns", "rows"]) {
    const item = value[key];
    if (item !== undefined && (typeof item !== "number" || !Number.isInteger(item) || item < 1)) {
      diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_TRACK_INVALID", message: `UI layout grid ${key} must be a positive integer.`, path: `${path}/${key}` });
    }
  }
  if (value.columns === undefined && value.rows === undefined) {
    diagnostics.push({ code: "TN_IR_UI_LAYOUT_GRID_TRACK_MISSING", message: "UI layout grid must declare columns or rows.", path });
  }
}

function collectFocusableUiIds(node: IUiNodeIr, focusableIds: Set<string>): void {
  if (node.focusable === true || node.kind === "button" || node.kind === "touchControl") {
    focusableIds.add(node.id);
  }
  node.children?.forEach((child) => collectFocusableUiIds(child, focusableIds));
}

function validateUiMetadata(ui: IUiIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>, focusableIds: Set<string>): void {
  const raw = ui as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["focusOrder", "inputActions", "root", "safeArea", "schema", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_UI_FIELD_UNSUPPORTED",
        message: `UI IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  validateUiFocusOrder(ui.focusOrder, `${path}/focusOrder`, diagnostics, focusableIds);
  validateUiSafeArea(ui.safeArea, `${path}/safeArea`, diagnostics);
  validateUiInputActions(ui.inputActions, `${path}/inputActions`, diagnostics);
  validateUiNavigation(ui.root, `${path}/root`, diagnostics, ids, focusableIds);
}

function validateUiFocusOrder(value: unknown, path: string, diagnostics: IIrDiagnostic[], focusableIds: Set<string>): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_UI_FOCUS_ORDER_INVALID", message: "UI focusOrder must be an array.", path });
    return;
  }
  const seen = new Set<string>();
  value.forEach((id, index) => {
    if (typeof id !== "string" || id.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_FOCUS_ID_INVALID", message: "UI focusOrder entries must be non-empty node IDs.", path: `${path}/${index}` });
    } else if (seen.has(id)) {
      diagnostics.push({ code: "TN_IR_UI_FOCUS_ID_DUPLICATE", message: `UI focusOrder ID '${id}' is duplicated.`, path: `${path}/${index}` });
    } else if (!focusableIds.has(id)) {
      diagnostics.push({ code: "TN_IR_UI_FOCUS_TARGET_INVALID", message: `UI focusOrder references non-focusable or missing node '${id}'.`, path: `${path}/${index}` });
    }
    seen.add(String(id));
  });
}

function validateUiSafeArea(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || !["avoid", "none"].includes(value.mode as string)) {
    diagnostics.push({ code: "TN_IR_UI_SAFE_AREA_INVALID", message: "UI safeArea mode must be 'avoid' or 'none'.", path });
    return;
  }
  if (value.edges !== undefined && (!Array.isArray(value.edges) || value.edges.some((edge) => !["bottom", "left", "right", "top"].includes(edge as string)))) {
    diagnostics.push({ code: "TN_IR_UI_SAFE_AREA_EDGE_INVALID", message: "UI safeArea edges must be top, right, bottom, or left.", path: `${path}/edges` });
  }
}

function validateUiInputActions(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_UI_INPUT_ACTIONS_INVALID", message: "UI inputActions must be an object.", path });
    return;
  }
  for (const [key, action] of Object.entries(value)) {
    if (!["activate", "cancel", "next", "previous"].includes(key) || typeof action !== "string" || action.trim() === "") {
      diagnostics.push({ code: "TN_IR_UI_INPUT_ACTION_INVALID", message: `UI input action '${key}' must reference a non-empty action ID.`, path: `${path}/${key}` });
    }
  }
}

function validateUiNavigation(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>, focusableIds: Set<string>): void {
  const navigation = node.navigation as unknown;
  if (navigation !== undefined) {
    if (!isRecord(navigation)) {
      diagnostics.push({ code: "TN_IR_UI_NAVIGATION_INVALID", message: "UI navigation must be an object.", path: `${path}/navigation` });
    } else {
      for (const [direction, target] of Object.entries(navigation)) {
        if (!["down", "left", "right", "up"].includes(direction) || typeof target !== "string" || !ids.has(target) || !focusableIds.has(target)) {
          diagnostics.push({ code: "TN_IR_UI_NAVIGATION_TARGET_INVALID", message: `UI navigation '${direction}' must reference a focusable node.`, path: `${path}/navigation/${direction}` });
        }
      }
    }
  }
  node.children?.forEach((child, index) => validateUiNavigation(child, `${path}/children/${index}`, diagnostics, ids, focusableIds));
}

async function validateAssets(assets: IAssetsManifest, bundlePath: string, path: string, diagnostics: IIrDiagnostic[]): Promise<void> {
  assets.assets.forEach((asset, index) => validateAssetMetadata(asset, `${path}/assets/${index}`, diagnostics));
  await Promise.all(
    assets.assets.map(async (asset, index) => {
      if (asset.kind === "mesh") {
        await validateMeshPayloadFiles(asset, bundlePath, `${path}/assets/${index}`, diagnostics);
      }
      if (!("path" in asset)) {
        return;
      }
      const assetPath = `${path}/assets/${index}/path`;
      if (asset.path.startsWith("/") || asset.path.includes("..")) {
        diagnostics.push({
          code: "TN_IR_ASSET_PATH_INVALID",
          message: `Asset '${asset.id}' must use a bundle-relative path without parent traversal.`,
          path: assetPath,
          severity: "error",
          suggestion: "Move the asset into the emitted bundle and reference it with a bundle-relative path.",
        });
        return;
      }
      const extension = asset.path.split(".").pop()?.toLowerCase();
      if (!assetFormatMatches(asset.kind, asset.format, extension)) {
        diagnostics.push({
          code: "TN_IR_ASSET_FORMAT_UNSUPPORTED",
          message: `Asset '${asset.id}' uses unsupported ${asset.kind} format '${asset.format}'.`,
          path: `${path}/assets/${index}/format`,
          severity: "error",
          suggestion: "Use a supported asset format for the asset kind or update the target profile before emitting the bundle.",
        });
      }
      try {
        await access(resolve(bundlePath, asset.path));
      } catch {
        diagnostics.push({
          code: "TN_IR_ASSET_PATH_MISSING",
          message: `Asset '${asset.id}' path '${asset.path}' does not exist in the bundle.`,
          path: assetPath,
          severity: "error",
          suggestion: "Copy the referenced file into the bundle or update assets.manifest.json to point at an existing bundle-relative file.",
        });
      }
    }),
  );
}

async function validateMeshPayloadFiles(
  asset: IAssetsManifest["assets"][number],
  bundlePath: string,
  path: string,
  diagnostics: IIrDiagnostic[],
): Promise<void> {
  if (asset.kind !== "mesh") {
    return;
  }
  const binaryAttributes = "binaryAttributes" in asset ? asset.binaryAttributes ?? [] : [];
  await Promise.all(
    binaryAttributes.map(async (attribute, index) => {
      const payloadPath = `${path}/binaryAttributes/${index}/path`;
      try {
        const bytes = await readFile(resolve(bundlePath, attribute.path));
        const expectedBytes = attribute.count * attribute.itemSize * 4;
        if (bytes.byteLength !== expectedBytes) {
          diagnostics.push({ code: "TN_IR_MESH_PAYLOAD_SIZE_INVALID", message: `Binary mesh attribute '${attribute.name}' expected ${expectedBytes} bytes but found ${bytes.byteLength}.`, path: payloadPath, severity: "error" });
          return;
        }
        for (let offset = 0; offset < bytes.byteLength; offset += 4) {
          if (!Number.isFinite(bytes.readFloatLE(offset))) {
            diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VALUES_INVALID", message: `Binary mesh attribute '${attribute.name}' contains a non-finite value.`, path: payloadPath, severity: "error" });
            return;
          }
        }
      } catch {
        diagnostics.push({ code: "TN_IR_ASSET_PATH_MISSING", message: `Binary mesh payload '${attribute.path}' does not exist in the bundle.`, path: payloadPath, severity: "error" });
      }
    }),
  );
  const indices = "binaryIndices" in asset ? asset.binaryIndices : undefined;
  const inlinePosition = "attributes" in asset ? asset.attributes?.find((attribute) => attribute.name === "position") : undefined;
  const positionCount = binaryAttributes.find((attribute) => attribute.name === "position")?.count
    ?? (inlinePosition === undefined ? undefined : inlinePosition.values.length / 3);
  if (indices !== undefined) {
    try {
      const bytes = await readFile(resolve(bundlePath, indices.path));
      const itemBytes = indices.format === "uint16" ? 2 : 4;
      if (bytes.byteLength !== indices.count * itemBytes) {
        diagnostics.push({ code: "TN_IR_MESH_PAYLOAD_SIZE_INVALID", message: `Binary mesh indices expected ${indices.count * itemBytes} bytes but found ${bytes.byteLength}.`, path: `${path}/binaryIndices/path`, severity: "error" });
        return;
      }
      for (let item = 0; item < indices.count; item += 1) {
        const value = indices.format === "uint16" ? bytes.readUInt16LE(item * itemBytes) : bytes.readUInt32LE(item * itemBytes);
        if (positionCount !== undefined && value >= positionCount) {
          diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Binary mesh indices must be within the position vertex count.", path: `${path}/binaryIndices/${item}`, severity: "error" });
          return;
        }
      }
    } catch {
      diagnostics.push({ code: "TN_IR_ASSET_PATH_MISSING", message: `Binary mesh payload '${indices.path}' does not exist in the bundle.`, path: `${path}/binaryIndices/path`, severity: "error" });
    }
  }
}

function validateAssetMetadata(asset: IAssetsManifest["assets"][number], path: string, diagnostics: IIrDiagnostic[]): void {
  const raw = asset as unknown as Record<string, unknown>;
  const allowed = new Set(
    asset.kind === "mesh"
      ? ["attributes", "binaryAttributes", "binaryIndices", "bounds", "budget", "format", "generation", "id", "indices", "kind", "primitive", "size", "topology", "usage"]
      : asset.kind === "texture"
        ? ["center", "format", "id", "kind", "magFilter", "minFilter", "offset", "path", "repeat", "rotation", "wrapS", "wrapT"]
        : asset.kind === "render-target"
          ? ["format", "height", "id", "kind", "sampleCount", "usage", "width"]
          : ["animationGraph", "animations", "bounds", "format", "id", "kind", "particleEmitters", "path"],
  );
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      diagnostics.push({
        code: unsupportedAssetFieldCode(key),
        message: `Asset '${asset.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        suggestion: "Use constrained animationGraph and particleEmitters metadata; keep engine controllers, IK, retargeting, and unbounded particles out of portable IR.",
      });
    }
  }
  if (("animations" in raw || "animationGraph" in raw || "particleEmitters" in raw) && asset.kind !== "model") {
    diagnostics.push({
      code: "TN_IR_ANIMATION_MODEL_REQUIRED",
      message: `Asset '${asset.id}' can declare animation graph, particle, or clip metadata only when it is a model asset.`,
      path,
    });
    return;
  }
  const clipIds = asset.kind === "model" && Array.isArray(raw.animations)
    ? new Set(raw.animations.flatMap((clip) => isRecord(clip) && typeof clip.id === "string" ? [clip.id] : []))
    : new Set<string>();
  if (asset.kind === "model" && "animations" in raw) {
    validateAnimationClips(raw.animations, `${path}/animations`, diagnostics);
  }
  if (asset.kind === "model" && "animationGraph" in raw) {
    validateAnimationGraph(raw.animationGraph, clipIds, `${path}/animationGraph`, diagnostics);
  }
  if (asset.kind === "model" && "particleEmitters" in raw) {
    validateParticleEmitters(raw.particleEmitters, `${path}/particleEmitters`, diagnostics);
  }
  if (asset.kind === "mesh") {
    validateGeneratedMeshAsset(asset, path, diagnostics);
  }
  if (asset.kind === "render-target") {
    validateRenderTargetAsset(asset, path, diagnostics);
  }
}

function unsupportedAssetFieldCode(key: string): string {
  if (key === "mask" || key === "masks" || key === "boneMask" || key === "boneMasks" || key === "layers") {
    return "TN_IR_ANIMATION_MASKS_UNSUPPORTED";
  }
  if (key === "morphTargets" || key === "morphTargetTracks" || key === "morphWeights") {
    return "TN_IR_MORPH_TARGET_ANIMATION_UNSUPPORTED";
  }
  if (key === "retargeting" || key === "retargetMap") {
    return "TN_IR_RETARGETING_UNSUPPORTED";
  }
  if (key === "ik" || key === "inverseKinematics") {
    return "TN_IR_IK_UNSUPPORTED";
  }
  if (key === "propertyAnimations" || key === "propertyTracks" || key === "uiAnimations") {
    return "TN_IR_PROPERTY_ANIMATION_UNSUPPORTED";
  }
  if (key === "blendGraph" || key === "engineController" || key === "particles" || key === "stateMachine") {
    return "TN_IR_ANIMATION_FIELD_UNSUPPORTED";
  }
  return "TN_IR_ASSET_FIELD_UNSUPPORTED";
}

function validateRenderTargetAsset(
  asset: Extract<IAssetsManifest["assets"][number], { kind: "render-target" }>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (!Number.isFinite(asset.width) || asset.width <= 0) {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_SIZE_INVALID",
      message: `Render target '${asset.id}' width must be a positive finite number.`,
      path: `${path}/width`,
    });
  }
  if (!Number.isFinite(asset.height) || asset.height <= 0) {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_SIZE_INVALID",
      message: `Render target '${asset.id}' height must be a positive finite number.`,
      path: `${path}/height`,
    });
  }
  if (asset.usage !== "color" && asset.usage !== "depth") {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_USAGE_INVALID",
      message: `Render target '${asset.id}' usage must be 'color' or 'depth'.`,
      path: `${path}/usage`,
    });
  }
  if (asset.sampleCount !== undefined && (!Number.isInteger(asset.sampleCount) || asset.sampleCount < 1)) {
    diagnostics.push({
      code: "TN_IR_RENDER_TARGET_SAMPLE_COUNT_INVALID",
      message: `Render target '${asset.id}' sampleCount must be a positive integer when declared.`,
      path: `${path}/sampleCount`,
      severity: "error",
      suggestion: "Omit sampleCount for single-sample targets or use a supported sample count.",
    });
  }
}

const GENERATED_MESH_SIZE_ARITY: Record<string, number> = {
  annulus: 2,
  box: 3,
  capsule: 2,
  circle: 1,
  cone: 2,
  conicalFrustum: 3,
  custom: 0,
  cylinder: 2,
  extrudedRectangle: 3,
  plane: 2,
  regularPolygon: 2,
  sphere: 1,
  torus: 2,
};

function validateGeneratedMeshAsset(asset: Extract<IAssetsManifest["assets"][number], { kind: "mesh" }>, path: string, diagnostics: IIrDiagnostic[]): void {
  const expectedSize = GENERATED_MESH_SIZE_ARITY[asset.primitive];
  if (expectedSize === undefined) {
    diagnostics.push({
      code: "TN_IR_MESH_PRIMITIVE_UNSUPPORTED",
      message: `Generated mesh '${asset.id}' uses unsupported primitive '${asset.primitive}'.`,
      path: `${path}/primitive`,
      severity: "error",
      suggestion: "Use a supported generated primitive or emit a model asset.",
    });
    return;
  }
  if (asset.primitive === "custom") {
    validateCustomMeshAsset(asset as Extract<IAssetsManifest["assets"][number], { kind: "mesh" }> & { attributes?: unknown; indices?: unknown }, path, diagnostics);
    return;
  }
  if ("attributes" in asset || "indices" in asset || "binaryAttributes" in asset || "binaryIndices" in asset) {
    diagnostics.push({
      code: "TN_IR_MESH_CUSTOM_FIELD_UNSUPPORTED",
      message: `Generated mesh '${asset.id}' may declare attributes or indices only when primitive is 'custom'.`,
      path,
      severity: "error",
    });
  }
  const size = asset.size;
  if (size === undefined) {
    return;
  }
  if (size.length !== expectedSize || size.some((value) => !Number.isFinite(value) || value <= 0)) {
    diagnostics.push({
      code: "TN_IR_MESH_SIZE_INVALID",
      message: `Generated mesh '${asset.id}' primitive '${asset.primitive}' expects ${expectedSize} positive finite size values.`,
      path: `${path}/size`,
      severity: "error",
      suggestion: "Emit the canonical size tuple for the generated primitive.",
    });
    return;
  }
  const firstSize = size[0] ?? 0;
  const secondSize = size[1] ?? 0;
  if ((asset.primitive === "annulus" || asset.primitive === "torus") && secondSize <= firstSize) {
    diagnostics.push({
      code: "TN_IR_MESH_SIZE_INVALID",
      message: `Generated mesh '${asset.id}' primitive '${asset.primitive}' requires outer radius greater than inner radius.`,
      path: `${path}/size/1`,
      severity: "error",
    });
  }
  if (asset.primitive === "regularPolygon" && (!Number.isInteger(secondSize) || secondSize < 3)) {
    diagnostics.push({
      code: "TN_IR_MESH_SIZE_INVALID",
      message: `Generated mesh '${asset.id}' regularPolygon requires at least three integer sides.`,
      path: `${path}/size/1`,
      severity: "error",
    });
  }
}

function validateCustomMeshAsset(
  asset: Extract<IAssetsManifest["assets"][number], { kind: "mesh" }> & { attributes?: unknown; binaryAttributes?: unknown; binaryIndices?: unknown; indices?: unknown },
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (asset.size !== undefined) {
    diagnostics.push({
      code: "TN_IR_MESH_CUSTOM_SIZE_UNSUPPORTED",
      message: `Custom mesh '${asset.id}' must use attributes and indices instead of size.`,
      path: `${path}/size`,
      severity: "error",
    });
  }
  if (asset.topology !== undefined && asset.topology !== "triangle-list") {
    diagnostics.push({ code: "TN_IR_MESH_TOPOLOGY_UNSUPPORTED", message: `Custom mesh '${asset.id}' uses unsupported topology '${String(asset.topology)}'.`, path: `${path}/topology`, severity: "error" });
  }
  if (asset.usage !== undefined && asset.usage !== "static") {
    diagnostics.push({ code: "TN_IR_MESH_USAGE_UNSUPPORTED", message: `Custom mesh '${asset.id}' uses unsupported usage '${String(asset.usage)}'.`, path: `${path}/usage`, severity: "error" });
  }
  validateMeshBounds(asset.bounds, `${path}/bounds`, diagnostics);
  validateMeshBudget(asset.budget, `${path}/budget`, diagnostics);
  validateMeshGeneration(asset.generation, `${path}/generation`, diagnostics);
  const hasInline = Array.isArray(asset.attributes) && asset.attributes.length > 0;
  const hasBinary = Array.isArray(asset.binaryAttributes) && asset.binaryAttributes.length > 0;
  if (!hasInline && !hasBinary) {
    diagnostics.push({
      code: "TN_IR_MESH_ATTRIBUTES_INVALID",
      message: `Custom mesh '${asset.id}' must include inline or binary mesh attributes.`,
      path: `${path}/attributes`,
      severity: "error",
    });
    return;
  }
  const seen = new Set<string>();
  let vertexCount: number | undefined;
  let positionVertexCount: number | undefined;
  (Array.isArray(asset.attributes) ? asset.attributes : []).forEach((attribute, index) => {
    const attributePath = `${path}/attributes/${index}`;
    if (!isRecord(attribute)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTES_INVALID", message: "Mesh attribute must be an object.", path: attributePath, severity: "error" });
      return;
    }
    if (typeof attribute.name !== "string" || !isMeshAttributeName(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_NAME_INVALID", message: "Mesh attribute name must be position, normal, uv, uv1, color, or custom:<identifier>.", path: `${attributePath}/name`, severity: "error" });
      return;
    }
    if (seen.has(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_DUPLICATE", message: `Mesh attribute '${attribute.name}' is duplicated.`, path: `${attributePath}/name`, severity: "error" });
      return;
    }
    seen.add(attribute.name);
    if (![1, 2, 3, 4].includes(attribute.itemSize as number)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: "Mesh attribute itemSize must be 1, 2, 3, or 4.", path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    const expectedItemSize = expectedMeshAttributeItemSize(attribute.name);
    if (expectedItemSize !== undefined && attribute.itemSize !== expectedItemSize) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: `Mesh attribute '${attribute.name}' itemSize must be ${expectedItemSize}.`, path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    if (!Array.isArray(attribute.values) || attribute.values.length === 0 || attribute.values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VALUES_INVALID", message: "Mesh attribute values must be a non-empty finite number array.", path: `${attributePath}/values`, severity: "error" });
      return;
    }
    const itemSize = attribute.itemSize as number;
    if (attribute.values.length % itemSize !== 0) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VALUES_INVALID", message: "Mesh attribute values length must divide evenly by itemSize.", path: `${attributePath}/values`, severity: "error" });
      return;
    }
    const count = attribute.values.length / itemSize;
    vertexCount ??= count;
    if (count !== vertexCount) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VERTEX_COUNT_INVALID", message: "All mesh attributes must have the same vertex count.", path: `${attributePath}/values`, severity: "error" });
    }
    if (attribute.name === "position") {
      if (itemSize !== 3) {
        diagnostics.push({ code: "TN_IR_MESH_POSITION_INVALID", message: "Custom mesh position attribute must use itemSize 3.", path: `${attributePath}/itemSize`, severity: "error" });
      }
      positionVertexCount = count;
    }
  });
  (Array.isArray(asset.binaryAttributes) ? asset.binaryAttributes : []).forEach((attribute, index) => {
    const attributePath = `${path}/binaryAttributes/${index}`;
    if (!isRecord(attribute)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTES_INVALID", message: "Binary mesh attribute must be an object.", path: attributePath, severity: "error" });
      return;
    }
    if (typeof attribute.name !== "string" || !isMeshAttributeName(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_NAME_INVALID", message: "Mesh attribute name must be position, normal, uv, uv1, color, or custom:<identifier>.", path: `${attributePath}/name`, severity: "error" });
      return;
    }
    if (seen.has(attribute.name)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_DUPLICATE", message: `Mesh attribute '${attribute.name}' is duplicated.`, path: `${attributePath}/name`, severity: "error" });
      return;
    }
    seen.add(attribute.name);
    if (![1, 2, 3, 4].includes(attribute.itemSize as number)) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: "Mesh attribute itemSize must be 1, 2, 3, or 4.", path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    const expectedItemSize = expectedMeshAttributeItemSize(attribute.name);
    if (expectedItemSize !== undefined && attribute.itemSize !== expectedItemSize) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_ITEM_SIZE_INVALID", message: `Mesh attribute '${attribute.name}' itemSize must be ${expectedItemSize}.`, path: `${attributePath}/itemSize`, severity: "error" });
      return;
    }
    if (attribute.format !== `float32x${attribute.itemSize}`) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_FORMAT_INVALID", message: "Binary mesh attribute format must match itemSize.", path: `${attributePath}/format`, severity: "error" });
    }
    if (!Number.isInteger(attribute.count) || (attribute.count as number) <= 0) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_COUNT_INVALID", message: "Binary mesh attribute count must be a positive integer.", path: `${attributePath}/count`, severity: "error" });
      return;
    }
    const count = attribute.count as number;
    vertexCount ??= count;
    if (count !== vertexCount) {
      diagnostics.push({ code: "TN_IR_MESH_ATTRIBUTE_VERTEX_COUNT_INVALID", message: "All mesh attributes must have the same vertex count.", path: `${attributePath}/count`, severity: "error" });
    }
    validateBundleRelativePath(attribute.path, `${attributePath}/path`, diagnostics);
    if (attribute.name === "position") {
      positionVertexCount = count;
    }
  });
  if (positionVertexCount === undefined) {
    diagnostics.push({
      code: "TN_IR_MESH_POSITION_REQUIRED",
      message: `Custom mesh '${asset.id}' requires a position attribute.`,
      path: `${path}/attributes`,
      severity: "error",
    });
  }
  if (asset.binaryIndices !== undefined) {
    validateBinaryIndicesMetadata(asset.binaryIndices, `${path}/binaryIndices`, diagnostics);
  }
  validateCustomMeshIndices(asset, positionVertexCount, path, diagnostics);
}

function validateMeshBounds(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || !Array.isArray(value.min) || !Array.isArray(value.max)) {
    diagnostics.push({ code: "TN_IR_MESH_BOUNDS_INVALID", message: "Mesh bounds must include min and max vec3 values.", path, severity: "error" });
    return;
  }
  validateVec3(value.min, `${path}/min`, diagnostics);
  validateVec3(value.max, `${path}/max`, diagnostics);
}

function validateMeshBudget(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || !["standard-prop", "hero-prop", "doodad"].includes(String(value.classification)) || !Number.isInteger(value.vertexCount) || !Number.isInteger(value.limit)) {
    diagnostics.push({ code: "TN_IR_MESH_BUDGET_INVALID", message: "Mesh budget must include classification, vertexCount, and limit.", path, severity: "error" });
  }
}

function validateMeshGeneration(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value) || typeof value.id !== "string" || !["MeshBuilder", "BufferGeometrySnapshot"].includes(String(value.source))) {
    diagnostics.push({ code: "TN_IR_MESH_GENERATION_INVALID", message: "Mesh generation metadata must include id and supported source.", path, severity: "error" });
  }
}

function validateBinaryIndicesMetadata(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Binary mesh indices must be an object.", path, severity: "error" });
    return;
  }
  if (!["uint16", "uint32"].includes(String(value.format))) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_FORMAT_INVALID", message: "Binary mesh indices format must be uint16 or uint32.", path: `${path}/format`, severity: "error" });
  }
  if (!Number.isInteger(value.count) || (value.count as number) <= 0 || (value.count as number) % 3 !== 0) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Binary mesh indices count must define complete triangles.", path: `${path}/count`, severity: "error" });
  }
  validateBundleRelativePath(value.path, `${path}/path`, diagnostics);
}

function validateBundleRelativePath(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || value.trim() === "" || value.startsWith("/") || value.includes("..")) {
    diagnostics.push({
      code: "TN_IR_ASSET_PATH_INVALID",
      message: "Binary mesh payloads must use bundle-relative paths without parent traversal.",
      path,
      severity: "error",
      suggestion: "Emit generated mesh payloads under generated/meshes/.",
    });
  }
}

function validateCustomMeshIndices(
  asset: Extract<IAssetsManifest["assets"][number], { kind: "mesh" }> & { indices?: unknown },
  vertexCount: number | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  if (asset.indices === undefined) {
    return;
  }
  if (!Array.isArray(asset.indices) || asset.indices.length === 0 || asset.indices.length % 3 !== 0) {
    diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Custom mesh indices must define complete triangles.", path: `${path}/indices`, severity: "error" });
    return;
  }
  asset.indices.forEach((index, itemIndex) => {
    if (!Number.isInteger(index) || index < 0 || index > 0xffffffff || (vertexCount !== undefined && index >= vertexCount)) {
      diagnostics.push({ code: "TN_IR_MESH_INDICES_INVALID", message: "Custom mesh indices must be non-negative U32 integers within the position vertex count.", path: `${path}/indices/${itemIndex}`, severity: "error" });
    }
  });
}

function isMeshAttributeName(name: string): boolean {
  return ["position", "normal", "uv", "uv1", "color"].includes(name) || /^custom:[A-Za-z_][A-Za-z0-9_]*$/.test(name);
}

function expectedMeshAttributeItemSize(name: string): number | undefined {
  if (name === "position" || name === "normal") {
    return 3;
  }
  if (name === "uv" || name === "uv1") {
    return 2;
  }
  if (name === "color") {
    return 4;
  }
  return undefined;
}

function validateAnimationClips(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_CLIPS_INVALID",
      message: "Model asset animations must be an array.",
      path,
    });
    return;
  }
  const seen = new Set<string>();
  value.forEach((clip, index) => {
    const clipPath = `${path}/${index}`;
    if (!isRecord(clip)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_CLIP_INVALID",
        message: "Animation clip metadata must be an object.",
        path: clipPath,
      });
      return;
    }
    for (const key of Object.keys(clip)) {
      if (!["id", "loop", "sourceClip", "speed"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_ANIMATION_FIELD_UNSUPPORTED",
          message: `Animation clip uses unsupported field '${key}'.`,
          path: `${clipPath}/${key}`,
          suggestion: "Animation graphs, blends, IK, retargeting, and particles are deferred to V7.",
        });
      }
    }
    if (typeof clip.id !== "string" || clip.id.trim() === "") {
      diagnostics.push({
        code: "TN_IR_ANIMATION_CLIP_ID_INVALID",
        message: "Animation clip ID must be a non-empty string.",
        path: `${clipPath}/id`,
      });
    } else if (seen.has(clip.id)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_CLIP_DUPLICATE",
        message: `Animation clip ID '${clip.id}' is duplicated.`,
        path: `${clipPath}/id`,
      });
    } else {
      seen.add(clip.id);
    }
    if (clip.loop !== undefined && typeof clip.loop !== "boolean") {
      diagnostics.push({
        code: "TN_IR_ANIMATION_LOOP_INVALID",
        message: "Animation clip loop must be boolean.",
        path: `${clipPath}/loop`,
      });
    }
    if (clip.sourceClip !== undefined && (typeof clip.sourceClip !== "string" || clip.sourceClip.trim() === "")) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_SOURCE_CLIP_INVALID",
        message: "Animation source clip must be a non-empty string.",
        path: `${clipPath}/sourceClip`,
      });
    }
    if (clip.speed !== undefined && (typeof clip.speed !== "number" || !Number.isFinite(clip.speed) || clip.speed <= 0)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_SPEED_INVALID",
        message: "Animation clip speed must be a positive finite number.",
        path: `${clipPath}/speed`,
      });
    }
  });
}

function validateAnimationGraph(value: unknown, clipIds: ReadonlySet<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_INVALID",
      message: "Animation graph must be an object.",
      path,
    });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["initialState", "parameters", "states", "transitions"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_ANIMATION_GRAPH_FIELD_UNSUPPORTED",
        message: `Animation graph uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        suggestion: "Keep engine-specific controllers and graph runtime handles adapter-private.",
      });
    }
  }
  if (typeof value.initialState !== "string" || value.initialState.trim() === "") {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_INITIAL_STATE_INVALID",
      message: "Animation graph initialState must be a non-empty string.",
      path: `${path}/initialState`,
    });
  }
  const stateIds = validateAnimationGraphStates(value.states, clipIds, `${path}/states`, diagnostics);
  const parameterIds = validateAnimationGraphParameters(value.parameters, `${path}/parameters`, diagnostics);
  if (typeof value.initialState === "string" && value.initialState.trim() !== "" && !stateIds.has(value.initialState)) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_INITIAL_STATE_MISSING",
      message: `Animation graph initialState '${value.initialState}' is not declared in states.`,
      path: `${path}/initialState`,
    });
  }
  validateAnimationGraphTransitions(value.transitions, stateIds, parameterIds, `${path}/transitions`, diagnostics);
}

function validateAnimationGraphStates(value: unknown, clipIds: ReadonlySet<string>, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const stateIds = new Set<string>();
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({
      code: "TN_IR_ANIMATION_GRAPH_STATES_INVALID",
      message: "Animation graph states must be a non-empty array.",
      path,
    });
    return stateIds;
  }
  value.forEach((state, index) => {
    const statePath = `${path}/${index}`;
    if (!isRecord(state)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_STATE_INVALID", message: "Animation graph state must be an object.", path: statePath });
      return;
    }
    for (const key of Object.keys(state)) {
      if (!["clip", "events", "id"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_ANIMATION_GRAPH_STATE_FIELD_UNSUPPORTED",
          message: `Animation graph state uses unsupported field '${key}'.`,
          path: `${statePath}/${key}`,
        });
      }
    }
    if (typeof state.id !== "string" || state.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_STATE_ID_INVALID", message: "Animation graph state ID must be a non-empty string.", path: `${statePath}/id` });
    } else if (stateIds.has(state.id)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_STATE_DUPLICATE", message: `Animation graph state ID '${state.id}' is duplicated.`, path: `${statePath}/id` });
    } else {
      stateIds.add(state.id);
    }
    if (typeof state.clip !== "string" || state.clip.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_CLIP_INVALID", message: "Animation graph state clip must be a non-empty string.", path: `${statePath}/clip` });
    } else if (!clipIds.has(state.clip)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_GRAPH_CLIP_MISSING", message: `Animation graph state references unknown clip '${state.clip}'.`, path: `${statePath}/clip` });
    }
    validateAnimationEvents(state.events, `${statePath}/events`, diagnostics);
  });
  return stateIds;
}

function validateAnimationEvents(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_ANIMATION_EVENTS_INVALID", message: "Animation graph events must be an array.", path });
    return;
  }
  value.forEach((event, index) => {
    const eventPath = `${path}/${index}`;
    if (!isRecord(event)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_EVENT_INVALID", message: "Animation graph event must be an object.", path: eventPath });
      return;
    }
    if (typeof event.event !== "string" || event.event.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_EVENT_ID_INVALID", message: "Animation graph event ID must be a non-empty string.", path: `${eventPath}/event` });
    }
    if (typeof event.atSeconds !== "number" || !Number.isFinite(event.atSeconds) || event.atSeconds < 0) {
      diagnostics.push({ code: "TN_IR_ANIMATION_EVENT_TIME_INVALID", message: "Animation graph event atSeconds must be a non-negative finite number.", path: `${eventPath}/atSeconds` });
    }
  });
}

function validateAnimationGraphParameters(value: unknown, path: string, diagnostics: IIrDiagnostic[]): Set<string> {
  const parameterIds = new Set<string>();
  if (value === undefined) {
    return parameterIds;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETERS_INVALID", message: "Animation graph parameters must be an array.", path });
    return parameterIds;
  }
  value.forEach((parameter, index) => {
    const parameterPath = `${path}/${index}`;
    if (!isRecord(parameter)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_INVALID", message: "Animation graph parameter must be an object.", path: parameterPath });
      return;
    }
    if (typeof parameter.id !== "string" || parameter.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_ID_INVALID", message: "Animation graph parameter ID must be a non-empty string.", path: `${parameterPath}/id` });
    } else if (parameterIds.has(parameter.id)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_DUPLICATE", message: `Animation graph parameter ID '${parameter.id}' is duplicated.`, path: `${parameterPath}/id` });
    } else {
      parameterIds.add(parameter.id);
    }
    if (!["boolean", "number", "trigger"].includes(parameter.kind as string)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_PARAMETER_KIND_UNSUPPORTED", message: `Animation graph parameter kind '${String(parameter.kind)}' is unsupported.`, path: `${parameterPath}/kind` });
    }
  });
  return parameterIds;
}

function validateAnimationGraphTransitions(value: unknown, stateIds: ReadonlySet<string>, parameterIds: ReadonlySet<string>, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITIONS_INVALID", message: "Animation graph transitions must be an array.", path });
    return;
  }
  value.forEach((transition, index) => {
    const transitionPath = `${path}/${index}`;
    if (!isRecord(transition)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_INVALID", message: "Animation graph transition must be an object.", path: transitionPath });
      return;
    }
    if (typeof transition.from !== "string" || !stateIds.has(transition.from)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_STATE_MISSING", message: "Animation graph transition from state must reference a declared state.", path: `${transitionPath}/from` });
    }
    if (typeof transition.to !== "string" || !stateIds.has(transition.to)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_STATE_MISSING", message: "Animation graph transition to state must reference a declared state.", path: `${transitionPath}/to` });
    }
    if (transition.blendSeconds !== undefined && (typeof transition.blendSeconds !== "number" || !Number.isFinite(transition.blendSeconds) || transition.blendSeconds < 0)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_BLEND_INVALID", message: "Animation graph transition blendSeconds must be a non-negative finite number.", path: `${transitionPath}/blendSeconds` });
    }
    if (!isRecord(transition.when)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_CONDITION_INVALID", message: "Animation graph transition when condition must be an object.", path: `${transitionPath}/when` });
      return;
    }
    if (typeof transition.when.parameter !== "string" || !parameterIds.has(transition.when.parameter)) {
      diagnostics.push({ code: "TN_IR_ANIMATION_TRANSITION_PARAMETER_MISSING", message: "Animation graph transition condition must reference a declared parameter.", path: `${transitionPath}/when/parameter` });
    }
  });
}

function validateParticleEmitters(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_PARTICLE_EMITTERS_INVALID", message: "Particle emitters must be an array.", path });
    return;
  }
  const seen = new Set<string>();
  value.forEach((emitter, index) => {
    const emitterPath = `${path}/${index}`;
    if (!isRecord(emitter)) {
      diagnostics.push({ code: "TN_IR_PARTICLE_EMITTER_INVALID", message: "Particle emitter must be an object.", path: emitterPath });
      return;
    }
    for (const key of Object.keys(emitter)) {
      if (!["id", "lifetimeSeconds", "maxParticles", "radius", "ratePerSecond", "shape"].includes(key)) {
        diagnostics.push({ code: "TN_IR_PARTICLE_FIELD_UNSUPPORTED", message: `Particle emitter uses unsupported field '${key}'.`, path: `${emitterPath}/${key}` });
      }
    }
    if (typeof emitter.id !== "string" || emitter.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_PARTICLE_EMITTER_ID_INVALID", message: "Particle emitter ID must be a non-empty string.", path: `${emitterPath}/id` });
    } else if (seen.has(emitter.id)) {
      diagnostics.push({ code: "TN_IR_PARTICLE_EMITTER_DUPLICATE", message: `Particle emitter ID '${emitter.id}' is duplicated.`, path: `${emitterPath}/id` });
    } else {
      seen.add(emitter.id);
    }
    validatePositiveInteger(emitter.maxParticles, `${emitterPath}/maxParticles`, "TN_IR_PARTICLE_MAX_INVALID", "Particle emitter maxParticles", diagnostics);
    validateNonNegativeFinite(emitter.ratePerSecond, `${emitterPath}/ratePerSecond`, "TN_IR_PARTICLE_RATE_INVALID", "Particle emitter ratePerSecond", diagnostics);
    validatePositiveFiniteValue(emitter.lifetimeSeconds, `${emitterPath}/lifetimeSeconds`, "TN_IR_PARTICLE_LIFETIME_INVALID", "Particle emitter lifetimeSeconds", diagnostics);
    if (!["point", "sphere"].includes(emitter.shape as string)) {
      diagnostics.push({ code: "TN_IR_PARTICLE_SHAPE_UNSUPPORTED", message: `Particle emitter shape '${String(emitter.shape)}' is unsupported.`, path: `${emitterPath}/shape` });
    }
    if (emitter.radius !== undefined) {
      validatePositiveFiniteValue(emitter.radius, `${emitterPath}/radius`, "TN_IR_PARTICLE_RADIUS_INVALID", "Particle emitter radius", diagnostics);
    }
  });
}

function validatePositiveInteger(value: unknown, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    diagnostics.push({ code, message: `${label} must be a positive integer.`, path });
  }
}

function validateNonNegativeFinite(value: unknown, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    diagnostics.push({ code, message: `${label} must be a non-negative finite number.`, path });
  }
}

function validatePositiveFiniteValue(value: unknown, path: string, code: string, label: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push({ code, message: `${label} must be a positive finite number.`, path });
  }
}

function assetFormatMatches(kind: string, format: string, extension: string | undefined): boolean {
  if (kind === "texture" && format === "jpeg" && extension === "jpg") {
    return true;
  }
  if (format !== extension) {
    return false;
  }
  if (kind === "buffer") {
    return format === "bin";
  }
  if (kind === "model") {
    return format === "glb" || format === "gltf";
  }
  if (kind === "texture") {
    return format === "jpeg" || format === "png";
  }
  if (kind === "audio") {
    return format === "mp3" || format === "ogg" || format === "wav";
  }
  return true;
}

function validateMaterialTextureRefs(materials: IMaterialsIr, assets: IAssetsManifest | undefined, path: string, diagnostics: IIrDiagnostic[]): void {
  const textureAssets = new Set((assets?.assets ?? []).filter((asset) => asset.kind === "texture").map((asset) => asset.id));
  const renderTargetTextures = new Set(
    (assets?.assets ?? [])
      .filter((asset): asset is Extract<typeof asset, { kind: "render-target" }> => asset.kind === "render-target" && asset.usage === "color")
      .map((asset) => asset.id),
  );
  const slots = [
    "baseColorTexture",
    "normalTexture",
    "metallicRoughnessTexture",
    "emissiveTexture",
    "occlusionTexture",
    "clearcoatTexture",
    "clearcoatRoughnessTexture",
    "transmissionTexture",
    "specularTexture",
  ] as const;
  materials.materials.forEach((material, materialIndex) => {
    slots.forEach((slot) => {
      const value = material[slot];
      if (value !== undefined && !textureAssets.has(value) && !renderTargetTextures.has(value)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_TEXTURE_ASSET_MISSING",
          message: `Material '${material.id}' references unknown texture asset '${value}'.`,
          path: `${path}/materials/${materialIndex}/${slot}`,
          severity: "error",
          suggestion: `Add texture asset '${value}' to assets.manifest.json or remove the ${slot} reference from material '${material.id}'.`,
        });
      }
    });
  });
}

function validateMaterials(materials: IMaterialsIr, path: string, diagnostics: IIrDiagnostic[]): void {
  const supportedBlendModes = new Set(["normal", "additive", "multiply", "premultipliedAlpha"]);
  const supportedExtendedPresets = new Set(["unlitMasked", "foliage"]);
  materials.materials.forEach((material, index) => {
    const raw = material as unknown as Record<string, unknown>;
    if (raw.kind !== "standard" && raw.kind !== "extended") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_UNSUPPORTED",
        message: `Material '${material.id}' uses unsupported material kind '${String(raw.kind)}'.`,
        path: `${path}/materials/${index}/kind`,
      });
    }
    if (material.kind === "extended") {
      if (material.extension === undefined) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_EXTENSION_MISSING",
          message: `Extended material '${material.id}' must declare an extension preset.`,
          path: `${path}/materials/${index}/extension`,
          severity: "error",
          suggestion: "Add extension.preset with a supported portable preset such as 'unlitMasked' or 'foliage'.",
        });
      } else if (!supportedExtendedPresets.has(material.extension.preset)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_EXTENSION_UNSUPPORTED",
          message: `Material '${material.id}' uses unsupported extended preset '${material.extension.preset}'.`,
          path: `${path}/materials/${index}/extension/preset`,
          severity: "error",
          suggestion: "Use a supported extended preset: unlitMasked or foliage.",
        });
      }
    } else if (material.extension !== undefined) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_EXTENSION_INVALID",
        message: `Standard material '${material.id}' cannot declare extension metadata.`,
        path: `${path}/materials/${index}/extension`,
        severity: "error",
        suggestion: "Remove extension from standard materials or change kind to 'extended'.",
      });
    }
    if (material.renderOrder !== undefined && (!Number.isInteger(material.renderOrder) || !Number.isFinite(material.renderOrder))) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_RENDER_ORDER_INVALID",
        message: `Material '${material.id}' renderOrder must be a finite integer.`,
        path: `${path}/materials/${index}/renderOrder`,
        severity: "error",
        suggestion: "Set renderOrder to an integer such as 0, 1, or -1.",
      });
    }
    if (material.depthWrite !== undefined && typeof material.depthWrite !== "boolean") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_DEPTH_WRITE_INVALID",
        message: `Material '${material.id}' depthWrite must be a boolean.`,
        path: `${path}/materials/${index}/depthWrite`,
        severity: "error",
      });
    }
    if (material.depthTest !== undefined && typeof material.depthTest !== "boolean") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_DEPTH_TEST_INVALID",
        message: `Material '${material.id}' depthTest must be a boolean.`,
        path: `${path}/materials/${index}/depthTest`,
        severity: "error",
      });
    }
    if (material.blendMode !== undefined) {
      if (!supportedBlendModes.has(material.blendMode)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_BLEND_MODE_UNSUPPORTED",
          message: `Material '${material.id}' uses unsupported blendMode '${material.blendMode}'.`,
          path: `${path}/materials/${index}/blendMode`,
          severity: "error",
          suggestion: "Use blendMode 'normal', 'additive', 'multiply', or 'premultipliedAlpha'.",
        });
      } else if (material.alphaMode !== "blend") {
        diagnostics.push({
          code: "TN_IR_MATERIAL_BLEND_MODE_INVALID",
          message: `Material '${material.id}' blendMode is only supported when alphaMode is 'blend'.`,
          path: `${path}/materials/${index}/blendMode`,
          severity: "error",
          suggestion: "Set alphaMode to 'blend' or remove blendMode.",
        });
      }
      if (material.blendMode !== "normal" && material.alphaMode === "mask") {
        diagnostics.push({
          code: "TN_IR_MATERIAL_BLEND_MODE_INVALID",
          message: `Material '${material.id}' cannot combine alphaMode 'mask' with blendMode '${material.blendMode}'.`,
          path: `${path}/materials/${index}/blendMode`,
          severity: "error",
          suggestion: "Use alphaMode 'blend' for non-normal blend modes.",
        });
      }
    }
    const alphaMode = material.alphaMode ?? "opaque";
    if (material.depthTest === false && alphaMode === "opaque") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_DEPTH_TEST_INVALID",
        message: `Material '${material.id}' cannot disable depthTest on opaque materials.`,
        path: `${path}/materials/${index}/depthTest`,
        severity: "error",
        suggestion: "Use alphaMode 'blend' or remove depthTest: false from opaque materials.",
      });
    }
    if (material.alphaMode !== undefined && !["opaque", "mask", "blend"].includes(material.alphaMode)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_ALPHA_MODE_INVALID",
        message: `Material '${material.id}' uses unsupported alphaMode '${String(material.alphaMode)}'.`,
        path: `${path}/materials/${index}/alphaMode`,
        severity: "error",
        suggestion: "Use alphaMode 'opaque', 'mask', or 'blend'.",
      });
    }
    if (material.alphaCutoff !== undefined && (!Number.isFinite(material.alphaCutoff) || material.alphaCutoff < 0 || material.alphaCutoff > 1)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_ALPHA_CUTOFF_INVALID",
        message: `Material '${material.id}' alphaCutoff must be between 0 and 1.`,
        path: `${path}/materials/${index}/alphaCutoff`,
        severity: "error",
        suggestion: "Set alphaCutoff to a normalized value between 0 and 1.",
      });
    }
    if (material.opacity !== undefined && (!Number.isFinite(material.opacity) || material.opacity < 0 || material.opacity > 1)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_OPACITY_INVALID",
        message: `Material '${material.id}' opacity must be between 0 and 1.`,
        path: `${path}/materials/${index}/opacity`,
        severity: "error",
        suggestion: "Set opacity to a normalized value between 0 and 1.",
      });
    }
    if (material.emissiveIntensity !== undefined && (!Number.isFinite(material.emissiveIntensity) || material.emissiveIntensity < 0)) {
      diagnostics.push({
        code: "TN_IR_MATERIAL_EMISSIVE_INTENSITY_INVALID",
        message: `Material '${material.id}' emissiveIntensity must be a non-negative finite number.`,
        path: `${path}/materials/${index}/emissiveIntensity`,
        severity: "error",
        suggestion: "Set emissiveIntensity to 0 or a positive finite value.",
      });
    }
    for (const key of ["clearcoat", "clearcoatRoughness", "specularIntensity", "transmission"] as const) {
      const value = material[key];
      if (value !== undefined && (!Number.isFinite(value) || value < 0 || value > 1)) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_FACTOR_INVALID",
          message: `Material '${material.id}' ${key} must be between 0 and 1.`,
          path: `${path}/materials/${index}/${key}`,
          severity: "error",
          suggestion: `Set ${key} to a normalized value between 0 and 1.`,
        });
      }
    }
    for (const key of ["shader", "vertexShader", "fragmentShader", "nodeGraph", "postprocess"]) {
      if (raw[key] !== undefined) {
        diagnostics.push({
          code: "TN_IR_MATERIAL_CAPABILITY_UNSUPPORTED",
          message: `Material '${material.id}' uses unsupported shader capability '${key}'.`,
          path: `${path}/materials/${index}/${key}`,
        });
      }
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
  if (binding.device === "gamepad" && binding.required !== false) {
    diagnostics.push({
      code: "TN_IR_INPUT_GAMEPAD_UNSUPPORTED_V2",
      message: "Gamepad bindings are V3 scope and cannot be required by a V2 bundle.",
      path,
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
  if (isRecord(renderer) && !["none", "msaa2", "msaa4", "msaa8"].includes(renderer.antialias as string)) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_RENDERER_ANTIALIAS_INVALID",
      message: "Renderer antialias mode must be one of none, msaa2, msaa4, or msaa8.",
      path: `${path}/renderer/antialias`,
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

function validateSystems(
  systems: ISystemsIr,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  resourceSchemas: Record<string, IIrNamedSchema>,
  eventSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  const rawSystems = systems as unknown as Record<string, unknown>;
  for (const key of Object.keys(rawSystems)) {
    if (!["channels", "componentHooks", "lifecycle", "observers", "pluginGroups", "plugins", "schema", "systems", "tasks", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_SYSTEMS_FIELD_UNSUPPORTED",
        message: `Systems IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Remove platform or host-specific scripting metadata unless it is represented by promoted systems lifecycle, task, or channel fields.",
      });
    }
  }
  if (systems.schema !== "threenative.systems" || systems.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_SYSTEMS_VERSION_UNSUPPORTED",
      message: "Systems IR must use threenative.systems version 0.1.0.",
      path,
    });
  }
  validateComponentHooks(systems.componentHooks, `${path}/componentHooks`, componentSchemas, diagnostics);
  validateSystemsLifecycle(systems.lifecycle, `${path}/lifecycle`, resourceSchemas, diagnostics);
  validateSystemObservers(systems.observers, `${path}/observers`, eventSchemas, diagnostics);
  const channelIds = validateSystemChannels(systems.channels, `${path}/channels`, eventSchemas, diagnostics);
  validateSystemTasks(systems.tasks, `${path}/tasks`, channelIds, diagnostics);
  const systemNames = new Set(systems.systems.map((system) => system.name));
  validateSystemOrdering(systems.systems, `${path}/systems`, diagnostics);
  const pluginIds = validateSystemPlugins(systems.plugins, `${path}/plugins`, systemNames, diagnostics);
  validateSystemPluginGroups(systems.pluginGroups, `${path}/pluginGroups`, pluginIds, diagnostics);

  systems.systems.forEach((system, systemIndex) => {
    const rawSystem = system as unknown as Record<string, unknown>;
    for (const key of Object.keys(rawSystem)) {
      if (!["after", "before", "commands", "eventReads", "eventWrites", "name", "queries", "reads", "resourceReads", "resourceWrites", "schedule", "script", "services", "writes"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_FIELD_UNSUPPORTED",
          message: `System '${system.name}' uses unsupported field '${key}'.`,
          path: `${path}/systems/${systemIndex}/${key}`,
          severity: "error",
          suggestion: "Use deterministic schedules, declared effects, and promoted lifecycle metadata instead of async timers, platform APIs, or system-local persisted state.",
        });
      }
    }
    const writes = new Set(system.writes);
    const eventWrites = new Set(system.eventWrites);
    if (!["fixedUpdate", "postUpdate", "startup", "update"].includes(system.schedule)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_STAGE_UNSUPPORTED",
        message: `System '${system.name}' uses unsupported schedule '${system.schedule}'.`,
        path: `${path}/systems/${systemIndex}/schedule`,
      });
    }
    system.reads.forEach((component, componentIndex) => {
      if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          message: `System '${system.name}' reads component '${component}' without a schema.`,
          path: `${path}/systems/${systemIndex}/reads/${componentIndex}`,
        });
      }
    });
    system.writes.forEach((component, componentIndex) => {
      if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          message: `System '${system.name}' writes component '${component}' without a schema.`,
          path: `${path}/systems/${systemIndex}/writes/${componentIndex}`,
        });
      }
    });
    (system.resourceReads ?? []).forEach((resource, resourceIndex) => {
      if (!isBuiltInResource(resource) && resourceSchemas[resource] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_RESOURCE_SCHEMA_MISSING",
          message: `System '${system.name}' reads resource '${resource}' without a schema.`,
          path: `${path}/systems/${systemIndex}/resourceReads/${resourceIndex}`,
        });
      }
    });
    (system.resourceWrites ?? []).forEach((resource, resourceIndex) => {
      if (!isBuiltInResource(resource) && resourceSchemas[resource] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_RESOURCE_SCHEMA_MISSING",
          message: `System '${system.name}' writes resource '${resource}' without a schema.`,
          path: `${path}/systems/${systemIndex}/resourceWrites/${resourceIndex}`,
        });
      }
    });
    system.eventReads.forEach((event, eventIndex) => {
      if (eventSchemas[event] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
          message: `System '${system.name}' reads event '${event}' without a schema.`,
          path: `${path}/systems/${systemIndex}/eventReads/${eventIndex}`,
        });
      }
    });
    system.eventWrites.forEach((event, eventIndex) => {
      if (eventSchemas[event] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
          message: `System '${system.name}' writes event '${event}' without a schema.`,
          path: `${path}/systems/${systemIndex}/eventWrites/${eventIndex}`,
        });
      }
    });
    system.queries.forEach((query, queryIndex) => {
      if (query.orderBy !== undefined && query.orderBy !== "id") {
        diagnostics.push({
          code: "TN_IR_SYSTEM_QUERY_ORDER_UNSUPPORTED",
          message: `System '${system.name}' declares unsupported query order '${query.orderBy}'.`,
          path: `${path}/systems/${systemIndex}/queries/${queryIndex}/orderBy`,
        });
      }
      if (query.offset !== undefined && (!Number.isInteger(query.offset) || query.offset < 0)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_QUERY_OFFSET_INVALID",
          message: `System '${system.name}' query offset must be a non-negative integer.`,
          path: `${path}/systems/${systemIndex}/queries/${queryIndex}/offset`,
        });
      }
      if (query.limit !== undefined && (!Number.isInteger(query.limit) || query.limit < 0)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_QUERY_LIMIT_INVALID",
          message: `System '${system.name}' query limit must be a non-negative integer.`,
          path: `${path}/systems/${systemIndex}/queries/${queryIndex}/limit`,
        });
      }
      (query.changed ?? []).forEach((component, componentIndex) => {
        if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' changed-query filter references component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/changed/${componentIndex}`,
          });
        }
      });
      query.with.forEach((component, componentIndex) => {
        if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' queries component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/with/${componentIndex}`,
          });
        }
      });
      query.without.forEach((component, componentIndex) => {
        if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' excludes component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/without/${componentIndex}`,
          });
        }
      });
    });
    (system.services ?? []).forEach((service, serviceIndex) => {
      if (!["animation.play", "animation.query", "animation.stop", "assets.load", "character.move", "physics.overlap", "physics.raycast", "physics.shapeCast", "picking.mesh", "picking.pointerRay"].includes(service)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_SERVICE_UNSUPPORTED",
          message: `System '${system.name}' declares unsupported service '${service}'.`,
          path: `${path}/systems/${systemIndex}/services/${serviceIndex}`,
        });
      }
    });
    system.commands.forEach((command, commandIndex) => {
      if (command.kind === "addComponent" || command.kind === "removeComponent" || command.kind === "setComponent") {
        if (!isBuiltInComponent(command.component) && componentSchemas[command.component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' command references component '${command.component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/component`,
          });
        }
        if (!writes.has(command.component)) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_WRITE_UNDECLARED",
            message: `System '${system.name}' command writes component '${command.component}' without declaring write access.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/component`,
          });
        }
      }
      if (command.kind === "spawn") {
        command.components.forEach((component, componentIndex) => {
          if (!isBuiltInComponent(component) && componentSchemas[component] === undefined) {
            diagnostics.push({
              code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
              message: `System '${system.name}' command spawns component '${component}' without a schema.`,
              path: `${path}/systems/${systemIndex}/commands/${commandIndex}/components/${componentIndex}`,
            });
          }
          if (!writes.has(component)) {
            diagnostics.push({
              code: "TN_IR_SYSTEM_WRITE_UNDECLARED",
              message: `System '${system.name}' command spawns component '${component}' without declaring write access.`,
              path: `${path}/systems/${systemIndex}/commands/${commandIndex}/components`,
            });
          }
        });
      }
      if (command.kind === "emitEvent") {
        if (eventSchemas[command.event] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_EVENT_SCHEMA_MISSING",
            message: `System '${system.name}' command emits event '${command.event}' without a schema.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/event`,
          });
        }
        if (!eventWrites.has(command.event)) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_EVENT_WRITE_UNDECLARED",
            message: `System '${system.name}' emits event '${command.event}' without declaring event write access.`,
            path: `${path}/systems/${systemIndex}/commands/${commandIndex}/event`,
          });
        }
      }
    });
  });
}

function validateSystemOrdering(systems: ISystemsIr["systems"], path: string, diagnostics: IIrDiagnostic[]): void {
  const byName = new Map<string, { index: number; schedule: string; system: ISystemsIr["systems"][number] }>();
  systems.forEach((system, index) => {
    byName.set(system.name, { index, schedule: system.schedule, system });
  });

  systems.forEach((system, systemIndex) => {
    validateSystemOrderRefs(system.before, `${path}/${systemIndex}/before`, "before", system, byName, diagnostics);
    validateSystemOrderRefs(system.after, `${path}/${systemIndex}/after`, "after", system, byName, diagnostics);
  });

  for (const schedule of ["startup", "fixedUpdate", "update", "postUpdate"]) {
    const scheduled = systems.filter((system) => system.schedule === schedule);
    const names = new Set(scheduled.map((system) => system.name));
    const outgoing = new Map<string, Set<string>>();
    const indegree = new Map<string, number>();
    for (const name of names) {
      outgoing.set(name, new Set());
      indegree.set(name, 0);
    }
    for (const system of scheduled) {
      for (const target of system.before ?? []) {
        if (target === system.name || !names.has(target)) {
          continue;
        }
        addSystemOrderEdge(system.name, target, outgoing, indegree);
      }
      for (const source of system.after ?? []) {
        if (source === system.name || !names.has(source)) {
          continue;
        }
        addSystemOrderEdge(source, system.name, outgoing, indegree);
      }
    }
    const ready = [...names].filter((name) => indegree.get(name) === 0).sort();
    let visited = 0;
    while (ready.length > 0) {
      const name = ready.shift()!;
      visited += 1;
      for (const next of [...(outgoing.get(name) ?? [])].sort()) {
        indegree.set(next, (indegree.get(next) ?? 0) - 1);
        if (indegree.get(next) === 0) {
          ready.push(next);
          ready.sort();
        }
      }
    }
    if (visited !== names.size) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_CYCLE",
        message: `Systems in schedule '${schedule}' declare cyclic before/after ordering constraints.`,
        path,
        severity: "error",
        suggestion: "Remove one of the before/after constraints so the schedule has a deterministic acyclic order.",
      });
    }
  }
}

function validateSystemOrderRefs(
  value: string[] | undefined,
  path: string,
  field: "after" | "before",
  system: ISystemsIr["systems"][number],
  byName: ReadonlyMap<string, { index: number; schedule: string; system: ISystemsIr["systems"][number] }>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  const raw = value as unknown;
  if (!Array.isArray(raw)) {
    diagnostics.push({
      code: "TN_IR_SYSTEM_ORDER_INVALID",
      message: `System '${system.name}' ${field} constraints must be an array of system names.`,
      path,
      severity: "error",
    });
    return;
  }
  raw.forEach((candidate, index) => {
    if (typeof candidate !== "string" || candidate.trim() === "") {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_INVALID",
        message: `System '${system.name}' ${field} constraint must reference a non-empty system name.`,
        path: `${path}/${index}`,
        severity: "error",
      });
      return;
    }
    if (candidate === system.name) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_SELF_REFERENCE",
        message: `System '${system.name}' cannot order itself with a ${field} constraint.`,
        path: `${path}/${index}`,
        severity: "error",
      });
      return;
    }
    const target = byName.get(candidate);
    if (target === undefined) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_TARGET_MISSING",
        message: `System '${system.name}' ${field} constraint references missing system '${candidate}'.`,
        path: `${path}/${index}`,
        severity: "error",
      });
      return;
    }
    if (target.schedule !== system.schedule) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_ORDER_CROSS_SCHEDULE",
        message: `System '${system.name}' ${field} constraint references system '${candidate}' in schedule '${target.schedule}', not '${system.schedule}'.`,
        path: `${path}/${index}`,
        severity: "error",
        suggestion: "Only order systems within the same schedule; stage order remains startup, fixedUpdate, update, postUpdate.",
      });
    }
  });
}

function addSystemOrderEdge(source: string, target: string, outgoing: Map<string, Set<string>>, indegree: Map<string, number>): void {
  const edges = outgoing.get(source);
  if (edges === undefined || edges.has(target)) {
    return;
  }
  edges.add(target);
  indegree.set(target, (indegree.get(target) ?? 0) + 1);
}

function validateSystemPlugins(
  value: ISystemsIr["plugins"] | undefined,
  path: string,
  systemNames: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): Set<string> {
  const pluginIds = new Set<string>();
  if (value === undefined) {
    return pluginIds;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGINS_INVALID", message: "Systems plugins must be an array.", path, severity: "error" });
    return pluginIds;
  }
  value.forEach((plugin, index) => {
    const pluginPath = `${path}/${index}`;
    if (!isRecord(plugin)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_INVALID", message: "Plugin declaration must be an object.", path: pluginPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(plugin)) {
      if (!["id", "systems"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_FIELD_UNSUPPORTED", message: `Plugin declaration uses unsupported field '${key}'.`, path: `${pluginPath}/${key}`, severity: "error" });
      }
    }
    if (typeof plugin.id !== "string" || plugin.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_ID_INVALID", message: "Plugin ID must be a non-empty string.", path: `${pluginPath}/id`, severity: "error" });
    } else if (pluginIds.has(plugin.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_DUPLICATE", message: `Plugin '${plugin.id}' is duplicated.`, path: `${pluginPath}/id`, severity: "error" });
    } else {
      pluginIds.add(plugin.id);
    }
    validatePluginSystems(plugin.systems, `${pluginPath}/systems`, systemNames, diagnostics);
  });
  return pluginIds;
}

function validatePluginSystems(value: unknown, path: string, systemNames: ReadonlySet<string>, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_SYSTEMS_INVALID", message: "Plugin systems must be a non-empty array.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((system, index) => {
    if (typeof system !== "string" || system.trim() === "" || !systemNames.has(system)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_SYSTEM_MISSING", message: "Plugin system must reference a declared system.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (seen.has(system)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_SYSTEM_DUPLICATE", message: `Plugin system '${system}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    seen.add(system);
  });
}

function validateSystemPluginGroups(
  value: ISystemsIr["pluginGroups"] | undefined,
  path: string,
  pluginIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUPS_INVALID", message: "Systems plugin groups must be an array.", path, severity: "error" });
    return;
  }
  const groupIds = new Set<string>();
  value.forEach((group, index) => {
    const groupPath = `${path}/${index}`;
    if (!isRecord(group)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_INVALID", message: "Plugin group declaration must be an object.", path: groupPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(group)) {
      if (!["id", "plugins"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_FIELD_UNSUPPORTED", message: `Plugin group declaration uses unsupported field '${key}'.`, path: `${groupPath}/${key}`, severity: "error" });
      }
    }
    if (typeof group.id !== "string" || group.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_ID_INVALID", message: "Plugin group ID must be a non-empty string.", path: `${groupPath}/id`, severity: "error" });
    } else if (groupIds.has(group.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_DUPLICATE", message: `Plugin group '${group.id}' is duplicated.`, path: `${groupPath}/id`, severity: "error" });
    } else {
      groupIds.add(group.id);
    }
    validatePluginGroupPlugins(group.plugins, `${groupPath}/plugins`, pluginIds, diagnostics);
  });
}

function validatePluginGroupPlugins(value: unknown, path: string, pluginIds: ReadonlySet<string>, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGINS_INVALID", message: "Plugin group plugins must be a non-empty array.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((plugin, index) => {
    if (typeof plugin !== "string" || plugin.trim() === "" || !pluginIds.has(plugin)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGIN_MISSING", message: "Plugin group plugin must reference a declared plugin.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (seen.has(plugin)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_PLUGIN_GROUP_PLUGIN_DUPLICATE", message: `Plugin group plugin '${plugin}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    seen.add(plugin);
  });
}

function validateSystemChannels(
  value: ISystemsIr["channels"] | undefined,
  path: string,
  eventSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): Set<string> {
  const channelIds = new Set<string>();
  if (value === undefined) {
    return channelIds;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_CHANNELS_INVALID", message: "Systems channels must be an array.", path, severity: "error" });
    return channelIds;
  }
  const eventRoutes = new Set<string>();
  value.forEach((channel, index) => {
    const channelPath = `${path}/${index}`;
    if (!isRecord(channel)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_INVALID", message: "Channel declaration must be an object.", path: channelPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(channel)) {
      if (!["delivery", "event", "id"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_FIELD_UNSUPPORTED", message: `Channel declaration uses unsupported field '${key}'.`, path: `${channelPath}/${key}`, severity: "error" });
      }
    }
    if (typeof channel.id !== "string" || channel.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_ID_INVALID", message: "Channel ID must be a non-empty string.", path: `${channelPath}/id`, severity: "error" });
    } else if (channelIds.has(channel.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_DUPLICATE", message: `Channel '${channel.id}' is duplicated.`, path: `${channelPath}/id`, severity: "error" });
    } else {
      channelIds.add(channel.id);
    }
    if (typeof channel.event !== "string" || channel.event.trim() === "" || eventSchemas[channel.event] === undefined) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_EVENT_SCHEMA_MISSING", message: "Channel event must reference a declared event schema.", path: `${channelPath}/event`, severity: "error" });
    } else if (eventRoutes.has(channel.event)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_EVENT_DUPLICATE", message: `Event '${channel.event}' is already bound to a channel.`, path: `${channelPath}/event`, severity: "error" });
    } else {
      eventRoutes.add(channel.event);
    }
    if (channel.delivery !== "fixed-trace") {
      diagnostics.push({ code: "TN_IR_SYSTEM_CHANNEL_DELIVERY_UNSUPPORTED", message: "Channel delivery must be 'fixed-trace'.", path: `${channelPath}/delivery`, severity: "error" });
    }
  });
  return channelIds;
}

function validateSystemTasks(
  value: ISystemsIr["tasks"] | undefined,
  path: string,
  channelIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_TASKS_INVALID", message: "Systems tasks must be an array.", path, severity: "error" });
    return;
  }
  const taskIds = new Set<string>();
  value.forEach((task, index) => {
    const taskPath = `${path}/${index}`;
    if (!isRecord(task)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_INVALID", message: "Task declaration must be an object.", path: taskPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(task)) {
      if (!["channel", "id", "mode", "schedule"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_TASK_FIELD_UNSUPPORTED", message: `Task declaration uses unsupported field '${key}'.`, path: `${taskPath}/${key}`, severity: "error" });
      }
    }
    if (typeof task.id !== "string" || task.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_ID_INVALID", message: "Task ID must be a non-empty string.", path: `${taskPath}/id`, severity: "error" });
    } else if (taskIds.has(task.id)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_DUPLICATE", message: `Task '${task.id}' is duplicated.`, path: `${taskPath}/id`, severity: "error" });
    } else {
      taskIds.add(task.id);
    }
    if (task.mode !== "fixed-trace") {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_MODE_UNSUPPORTED", message: "Task mode must be 'fixed-trace'.", path: `${taskPath}/mode`, severity: "error" });
    }
    if (!["fixedUpdate", "postUpdate", "startup", "update"].includes(task.schedule as string)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_SCHEDULE_UNSUPPORTED", message: "Task schedule must be a supported system schedule.", path: `${taskPath}/schedule`, severity: "error" });
    }
    if (task.channel !== undefined && (typeof task.channel !== "string" || !channelIds.has(task.channel))) {
      diagnostics.push({ code: "TN_IR_SYSTEM_TASK_CHANNEL_MISSING", message: "Task channel must reference a declared systems channel.", path: `${taskPath}/channel`, severity: "error" });
    }
  });
}

function validateComponentHooks(
  value: unknown,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOKS_INVALID", message: "Component hooks must be an array.", path, severity: "error" });
    return;
  }
  const components = new Set<string>();
  value.forEach((declaration, index) => {
    const declarationPath = `${path}/${index}`;
    if (!isRecord(declaration)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_INVALID", message: "Component hook declaration must be an object.", path: declarationPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(declaration)) {
      if (!["component", "hooks"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_FIELD_UNSUPPORTED", message: `Component hook declaration uses unsupported field '${key}'.`, path: `${declarationPath}/${key}`, severity: "error" });
      }
    }
    if (typeof declaration.component !== "string" || declaration.component.trim() === "" || componentSchemas[declaration.component] === undefined) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_SCHEMA_MISSING", message: "Component hook must reference a declared component schema.", path: `${declarationPath}/component`, severity: "error" });
    } else if (components.has(declaration.component)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_DUPLICATE", message: `Component hook declaration for '${declaration.component}' is duplicated.`, path: declarationPath, severity: "error" });
    } else {
      components.add(declaration.component);
    }
    validateComponentHookKinds(declaration.hooks, `${declarationPath}/hooks`, diagnostics);
  });
}

function validateComponentHookKinds(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_KINDS_INVALID", message: "Component hook kinds must be a non-empty array.", path, severity: "error" });
    return;
  }
  const hooks = new Set<string>();
  value.forEach((hook, index) => {
    if (hook !== "onAdd" && hook !== "onInsert") {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_KIND_UNSUPPORTED", message: "Component hook kind must be 'onAdd' or 'onInsert'.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (hooks.has(hook)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_COMPONENT_HOOK_KIND_DUPLICATE", message: `Component hook kind '${hook}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    hooks.add(hook);
  });
}

function validateSystemObservers(
  value: unknown,
  path: string,
  eventSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVERS_INVALID", message: "Systems observers must be an array.", path, severity: "error" });
    return;
  }
  const routes = new Set<string>();
  value.forEach((observer, index) => {
    const observerPath = `${path}/${index}`;
    if (!isRecord(observer)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_INVALID", message: "Observer declaration must be an object.", path: observerPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(observer)) {
      if (!["event", "phases", "propagation"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_FIELD_UNSUPPORTED", message: `Observer declaration uses unsupported field '${key}'.`, path: `${observerPath}/${key}`, severity: "error" });
      }
    }
    if (typeof observer.event !== "string" || observer.event.trim() === "" || eventSchemas[observer.event] === undefined) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_EVENT_SCHEMA_MISSING", message: "Observer event must reference a declared event schema.", path: `${observerPath}/event`, severity: "error" });
    }
    if (observer.propagation !== "target-ancestors") {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PROPAGATION_UNSUPPORTED", message: "Observer propagation must be 'target-ancestors'.", path: `${observerPath}/propagation`, severity: "error" });
    }
    validateObserverPhases(observer.phases, `${observerPath}/phases`, diagnostics);
    const routeKey = `${String(observer.event)}:${String(observer.propagation)}:${JSON.stringify(observer.phases)}`;
    if (routes.has(routeKey)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_DUPLICATE", message: "Observer route is duplicated.", path: observerPath, severity: "error" });
    } else {
      routes.add(routeKey);
    }
  });
}

function validateObserverPhases(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PHASES_INVALID", message: "Observer phases must be a non-empty array.", path, severity: "error" });
    return;
  }
  const phases = new Set<string>();
  value.forEach((phase, index) => {
    if (phase !== "target" && phase !== "bubble") {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PHASE_UNSUPPORTED", message: "Observer phase must be 'target' or 'bubble'.", path: `${path}/${index}`, severity: "error" });
      return;
    }
    if (phases.has(phase)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_OBSERVER_PHASE_DUPLICATE", message: `Observer phase '${phase}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
      return;
    }
    phases.add(phase);
  });
}

function validateSystemsLifecycle(
  value: ISystemsIr["lifecycle"] | undefined,
  path: string,
  resourceSchemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  const raw = value as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["appStates", "computedStates", "hotReload", "replay", "state", "substates"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_SYSTEM_LIFECYCLE_FIELD_UNSUPPORTED",
        message: `Systems lifecycle uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
      });
    }
  }
  if (value.replay !== "fixed-trace") {
    diagnostics.push({
      code: "TN_IR_SYSTEM_LIFECYCLE_REPLAY_UNSUPPORTED",
      message: "Systems lifecycle replay must be 'fixed-trace'.",
      path: `${path}/replay`,
      severity: "error",
    });
  }
  if (value.state !== "system-local-disallowed") {
    diagnostics.push({
      code: "TN_IR_SYSTEM_LIFECYCLE_STATE_UNSUPPORTED",
      message: "Systems lifecycle state must disallow system-local persisted state.",
      path: `${path}/state`,
      severity: "error",
    });
  }
  if (value.hotReload !== "invalidate") {
    diagnostics.push({
      code: "TN_IR_SYSTEM_LIFECYCLE_HOT_RELOAD_UNSUPPORTED",
      message: "Systems lifecycle hotReload must be 'invalidate'.",
      path: `${path}/hotReload`,
      severity: "error",
    });
  }
  const stateIds = new Set<string>();
  validateStateDeclarations(value.appStates, `${path}/appStates`, "app", resourceSchemas, stateIds, diagnostics);
  validateStateDeclarations(value.computedStates, `${path}/computedStates`, "computed", resourceSchemas, stateIds, diagnostics);
  validateSubstateDeclarations(value.substates, `${path}/substates`, resourceSchemas, stateIds, diagnostics);
}

function validateStateDeclarations(
  value: unknown,
  path: string,
  kind: "app" | "computed",
  resourceSchemas: Record<string, IIrNamedSchema>,
  stateIds: Set<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_DECLARATIONS_INVALID", message: "State declarations must be an array.", path, severity: "error" });
    return;
  }
  value.forEach((state, index) => {
    const statePath = `${path}/${index}`;
    if (!isRecord(state)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_STATE_INVALID", message: "State declaration must be an object.", path: statePath, severity: "error" });
      return;
    }
    for (const key of Object.keys(state)) {
      const allowed = kind === "app" ? ["id", "initial", "source", "values"] : ["fallback", "id", "source", "values"];
      if (!allowed.includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_STATE_FIELD_UNSUPPORTED", message: `State declaration uses unsupported field '${key}'.`, path: `${statePath}/${key}`, severity: "error" });
      }
    }
    validateStateId(state.id, `${statePath}/id`, stateIds, diagnostics);
    validateStateValues(state.values, `${statePath}/values`, diagnostics);
    const values = Array.isArray(state.values) ? state.values : [];
    if (kind === "app") {
      validateStateValueRef(state.initial, values, `${statePath}/initial`, "initial", diagnostics);
    } else {
      validateStateValueRef(state.fallback, values, `${statePath}/fallback`, "fallback", diagnostics);
    }
    validateStateSource(state.source, `${statePath}/source`, resourceSchemas, diagnostics);
  });
}

function validateSubstateDeclarations(
  value: unknown,
  path: string,
  resourceSchemas: Record<string, IIrNamedSchema>,
  stateIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_DECLARATIONS_INVALID", message: "Substate declarations must be an array.", path, severity: "error" });
    return;
  }
  const substateIds = new Set<string>();
  value.forEach((state, index) => {
    const statePath = `${path}/${index}`;
    if (!isRecord(state)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_STATE_INVALID", message: "Substate declaration must be an object.", path: statePath, severity: "error" });
      return;
    }
    for (const key of Object.keys(state)) {
      if (!["fallback", "id", "parent", "parentValue", "source", "values"].includes(key)) {
        diagnostics.push({ code: "TN_IR_SYSTEM_STATE_FIELD_UNSUPPORTED", message: `Substate declaration uses unsupported field '${key}'.`, path: `${statePath}/${key}`, severity: "error" });
      }
    }
    validateStateId(state.id, `${statePath}/id`, substateIds, diagnostics);
    if (typeof state.parent !== "string" || state.parent.trim() === "" || !stateIds.has(state.parent)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_SUBSTATE_PARENT_MISSING", message: "Substate parent must reference a declared app or computed state.", path: `${statePath}/parent`, severity: "error" });
    }
    validateStateValues(state.values, `${statePath}/values`, diagnostics);
    const values = Array.isArray(state.values) ? state.values : [];
    validateStateValueRef(state.fallback, values, `${statePath}/fallback`, "fallback", diagnostics);
    if (typeof state.parentValue !== "string" || state.parentValue.trim() === "") {
      diagnostics.push({ code: "TN_IR_SYSTEM_SUBSTATE_PARENT_VALUE_INVALID", message: "Substate parentValue must be a non-empty string.", path: `${statePath}/parentValue`, severity: "error" });
    }
    validateStateSource(state.source, `${statePath}/source`, resourceSchemas, diagnostics);
  });
}

function validateStateId(value: unknown, path: string, ids: Set<string>, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_ID_INVALID", message: "State ID must be a non-empty string.", path, severity: "error" });
    return;
  }
  if (ids.has(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_ID_DUPLICATE", message: `State ID '${value}' is duplicated.`, path, severity: "error" });
    return;
  }
  ids.add(value);
}

function validateStateValues(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim() === "")) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_VALUES_INVALID", message: "State values must be a non-empty array of strings.", path, severity: "error" });
  }
}

function validateStateValueRef(value: unknown, values: unknown[], path: string, label: "fallback" | "initial", diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "string" || !values.includes(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_VALUE_MISSING", message: `State ${label} value must be declared in values.`, path, severity: "error" });
  }
}

function validateStateSource(value: unknown, path: string, resourceSchemas: Record<string, IIrNamedSchema>, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_SOURCE_INVALID", message: "State source must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["field", "resource"].includes(key)) {
      diagnostics.push({ code: "TN_IR_SYSTEM_STATE_SOURCE_FIELD_UNSUPPORTED", message: `State source uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof value.resource !== "string" || value.resource.trim() === "" || resourceSchemas[value.resource] === undefined) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_RESOURCE_SCHEMA_MISSING", message: "State source resource must reference a declared resource schema.", path: `${path}/resource`, severity: "error" });
  }
  if (typeof value.field !== "string" || value.field.trim() === "" || value.field.includes("/")) {
    diagnostics.push({ code: "TN_IR_SYSTEM_STATE_SOURCE_FIELD_INVALID", message: "State source field must be a non-empty resource field name.", path: `${path}/field`, severity: "error" });
  }
}

function validateSchemaFile(
  schemaFile: IIrSchemaFile,
  path: string,
  expectedSchema: IIrSchemaFile["schema"],
  diagnostics: IIrDiagnostic[],
): void {
  if (schemaFile.schema !== expectedSchema || schemaFile.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_SCHEMA_FILE_VERSION_UNSUPPORTED",
      message: `Schema file must use ${expectedSchema} version 0.1.0.`,
      path,
    });
  }
}

function validateWorldComponents(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  world.entities.forEach((entity, entityIndex) => {
    for (const [componentName, value] of Object.entries(entity.components)) {
      if (isBuiltInComponent(componentName)) {
        continue;
      }
      const schema = schemas[componentName];
      if (schema === undefined) {
        diagnostics.push({
          code: "TN_IR_COMPONENT_SCHEMA_MISSING",
          message: `Component '${componentName}' does not have a schema.`,
          path: `world.ir.json/entities/${entityIndex}/components/${componentName}`,
        });
        continue;
      }
      validatePayload(value, schema, `world.ir.json/entities/${entityIndex}/components/${componentName}`, entityIds, diagnostics);
    }
  });
}

function validateResources(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  for (const [resourceName, value] of Object.entries(world.resources ?? {})) {
    if (isBuiltInResource(resourceName)) {
      continue;
    }
    const schema = schemas[resourceName];
    if (schema === undefined) {
      diagnostics.push({
        code: "TN_IR_RESOURCE_SCHEMA_MISSING",
        message: `Resource '${resourceName}' does not have a schema.`,
        path: `world.ir.json/resources/${resourceName}`,
      });
      continue;
    }
    validatePayload(value, schema, `world.ir.json/resources/${resourceName}`, entityIds, diagnostics);
  }
}

function isBuiltInComponent(componentName: string): boolean {
  return ["Camera", "CharacterController", "Collider", "Hierarchy", "Light", "MeshRenderer", "RenderLayers", "RigidBody", "Transform", "Visibility"].includes(componentName);
}

function isBuiltInResource(resourceName: string): boolean {
  return resourceName === "ActiveCamera" || resourceName === "ActiveCameras";
}

function validateWorldEvents(
  world: IWorldIr,
  schemas: Record<string, IIrNamedSchema>,
  diagnostics: IIrDiagnostic[],
): void {
  for (const eventName of Object.keys(world.events ?? {})) {
    if (schemas[eventName] === undefined) {
      diagnostics.push({
        code: "TN_IR_EVENT_SCHEMA_MISSING",
        message: `Event '${eventName}' does not have a schema.`,
        path: `world.ir.json/events/${eventName}`,
      });
    }
  }
}

function validatePayload(
  value: unknown,
  schema: IIrNamedSchema,
  path: string,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_SCHEMA_PAYLOAD_INVALID",
      message: "Schema payload must be an object.",
      path,
    });
    return;
  }

  for (const [fieldName, field] of Object.entries(schema.fields)) {
    const fieldValue = value[fieldName];
    if (fieldValue === undefined) {
      if (field.required === true) {
        diagnostics.push({
          code: "TN_IR_SCHEMA_FIELD_REQUIRED",
          message: `Required field '${fieldName}' is missing.`,
          path: `${path}/${fieldName}`,
        });
      }
      continue;
    }
    validateFieldValue(fieldValue, field, `${path}/${fieldName}`, entityIds, diagnostics);
  }

  for (const fieldName of Object.keys(value)) {
    if (schema.fields[fieldName] === undefined) {
      diagnostics.push({
        code: "TN_IR_SCHEMA_FIELD_UNKNOWN",
        message: `Field '${fieldName}' is not declared by the schema.`,
        path: `${path}/${fieldName}`,
      });
    }
  }
}

function validateFieldValue(
  value: unknown,
  field: IIrSchemaField,
  path: string,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  const ok =
    (field.kind === "number" && typeof value === "number" && Number.isFinite(value)) ||
    (field.kind === "integer" && Number.isInteger(value)) ||
    (["asset", "color", "string"].includes(field.kind) && typeof value === "string") ||
    (field.kind === "entity" && typeof value === "string" && entityIds.has(value)) ||
    (field.kind === "boolean" && typeof value === "boolean") ||
    (field.kind === "vec2" && isNumberTuple(value, 2)) ||
    (field.kind === "vec3" && isNumberTuple(value, 3)) ||
    (field.kind === "vec4" && isNumberTuple(value, 4)) ||
    (field.kind === "quat" && isNumberTuple(value, 4));

  if (!ok) {
    diagnostics.push({
      code: field.kind === "entity" && typeof value === "string" ? "TN_IR_ENTITY_REFERENCE_MISSING" : "TN_IR_SCHEMA_FIELD_TYPE",
      message:
        field.kind === "entity" && typeof value === "string"
          ? `Entity reference '${value}' does not exist.`
          : `Field must match schema kind '${field.kind}'.`,
      path,
    });
  }
}

function isNumberTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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

  if (manifest.schema !== "threenative.bundle" || manifest.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_MANIFEST_VERSION_UNSUPPORTED",
      message: "Manifest must use threenative.bundle version 0.1.0.",
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
      suggestion: "Regenerate the bundle or add entry.world: 'world.ir.json'.",
    });
  } else if (entry.world !== "world.ir.json") {
    diagnostics.push({
      code: "TN_IR_WORLD_ENTRY_INVALID",
      message: "V1 manifest entry.world must be world.ir.json.",
      path: "manifest.json/entry/world",
    });
  }
  if (isRecord(entry) && entry.overlays !== undefined) {
    validateManifestPath(entry.overlays, `${path}/entry/overlays`, "overlays.ir.json", diagnostics);
  }
  if (isRecord(entry) && entry.animations !== undefined) {
    validateManifestPath(entry.animations, `${path}/entry/animations`, "animations.ir.json", diagnostics);
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
    validateManifestPath(files.assets, `${path}/files/assets`, "assets.manifest.json", diagnostics);
    validateManifestPath(files.materials, `${path}/files/materials`, "materials.ir.json", diagnostics);
    validateManifestPath(files.targetProfile, `${path}/files/targetProfile`, "target.profile.json", diagnostics);
    for (const key of ["animations", "componentSchemas", "eventSchemas", "input", "resourceSchemas", "runtimeConfig"] as const) {
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
    (entry.systems === undefined || typeof entry.systems === "string") &&
    (entry.overlays === undefined || typeof entry.overlays === "string") &&
    (entry.ui === undefined || typeof entry.ui === "string") &&
    (files.componentSchemas === undefined || typeof files.componentSchemas === "string") &&
    (files.animations === undefined || typeof files.animations === "string") &&
    (files.eventSchemas === undefined || typeof files.eventSchemas === "string") &&
    (files.input === undefined || typeof files.input === "string") &&
    (files.resourceSchemas === undefined || typeof files.resourceSchemas === "string") &&
    (files.runtimeConfig === undefined || typeof files.runtimeConfig === "string")
  );
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
  world.entities.forEach((entity, index) => validateRenderComponents(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validatePhysicsComponents(entity, `${path}/entities/${index}`, diagnostics));
  world.entities.forEach((entity, index) => validateCharacterComponents(entity, `${path}/entities/${index}`, input, diagnostics));
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

function validatePhysicsComponents(entity: IWorldIr["entities"][number], path: string, diagnostics: IIrDiagnostic[]): void {
  const collider = entity.components.Collider as unknown;
  const body = entity.components.RigidBody as unknown;
  if (collider === undefined && body === undefined) {
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

  const colliderRecord = isRecord(collider) ? collider : undefined;
  const bodyRecord = isRecord(body) ? body : undefined;

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
    if (colliderRecord.friction !== undefined) {
      validateFiniteMinimum(colliderRecord.friction, 0, `${path}/components/Collider/friction`, "TN_IR_PHYSICS_COLLIDER_FRICTION_INVALID", diagnostics);
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
        message: "Mesh trigger colliders are not supported in the V6 portable physics contract.",
        path: `${path}/components/Collider/kind`,
        suggestion: "Use a primitive trigger collider or a static mesh collider without trigger semantics.",
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
  if (bodyRecord?.mass !== undefined) {
    validatePositiveFinite(bodyRecord.mass, `${path}/components/RigidBody/mass`, "TN_IR_PHYSICS_BODY_MASS_INVALID", diagnostics);
  }
  if (bodyRecord?.damping !== undefined) {
    validateFiniteMinimum(bodyRecord.damping, 0, `${path}/components/RigidBody/damping`, "TN_IR_PHYSICS_BODY_DAMPING_INVALID", diagnostics);
  }
  if (bodyRecord?.gravityScale !== undefined) {
    validateFiniteNumber(bodyRecord.gravityScale, `${path}/components/RigidBody/gravityScale`, "TN_IR_PHYSICS_BODY_GRAVITY_SCALE_INVALID", diagnostics);
  }
  if (bodyRecord?.velocity !== undefined) {
    validateFiniteVec3(bodyRecord.velocity, `${path}/components/RigidBody/velocity`, "TN_IR_PHYSICS_BODY_VELOCITY_INVALID", diagnostics);
  }
  if (colliderRecord?.kind === "mesh" && bodyRecord?.kind !== undefined && bodyRecord.kind !== "static") {
    diagnostics.push({
      code: "TN_IR_PHYSICS_DYNAMIC_MESH_UNSUPPORTED",
      message: "Non-static mesh colliders are not supported in the V6 portable physics contract.",
      path: `${path}/components/Collider/kind`,
      suggestion: "Use a static mesh collider or a primitive collider for dynamic or kinematic bodies.",
    });
  }
  if (bodyRecord !== undefined && collider === undefined) {
    diagnostics.push({
      code: "TN_IR_PHYSICS_COLLIDER_MISSING",
      message: `RigidBody '${entity.id}' must have a Collider in the V6 portable physics contract.`,
      path: `${path}/components/Collider`,
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
    if (!["blocking", "grounding", "interactAction", "moveXAxis", "moveZAxis", "slopeLimit", "speed", "stepOffset"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_CHARACTER_FIELD_UNSUPPORTED",
        message: `CharacterController '${entity.id}' uses unsupported field '${key}'.`,
        path: `${path}/components/CharacterController/${key}`,
        suggestion: "Navmesh and engine-specific controller fields are deferred.",
      });
    }
  }
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

function validatePositiveVec3(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item) || item <= 0)) {
    diagnostics.push({
      code,
      message: "Expected a three-component positive finite numeric vector.",
      path,
    });
  }
}

function validateFiniteVec3(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => typeof item !== "number" || !Number.isFinite(item))) {
    diagnostics.push({
      code,
      message: "Expected a three-component finite numeric vector.",
      path,
    });
  }
}

function validatePositiveFinite(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    diagnostics.push({
      code,
      message: "Expected a positive finite number.",
      path,
    });
  }
}

function validateFiniteNumber(value: unknown, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    diagnostics.push({
      code,
      message: "Expected a finite number.",
      path,
    });
  }
}

function validateFiniteMinimum(value: unknown, minimum: number, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum) {
    diagnostics.push({
      code,
      message: `Expected a finite number greater than or equal to ${minimum}.`,
      path,
    });
  }
}

function validateFiniteRange(value: unknown, minimum: number, maximum: number, path: string, code: string, diagnostics: IIrDiagnostic[]): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    diagnostics.push({
      code,
      message: `Expected a finite number between ${minimum} and ${maximum}.`,
      path,
    });
  }
}

function validateUniqueIds(
  items: ReadonlyArray<{ id: string }>,
  path: string,
  code: string,
  diagnostics: IIrDiagnostic[],
): void {
  const seen = new Set<string>();

  items.forEach((item, index) => {
    if (seen.has(item.id)) {
      diagnostics.push({
        code,
        message: `Duplicate id '${item.id}'.`,
        path: `${path}/${index}/id`,
        severity: "error",
        suggestion: `Rename or remove the duplicate '${item.id}' entry so IDs are unique within this section.`,
      });
    }
    seen.add(item.id);
  });
}

async function readJson<T>(path: string, diagnostics: IIrDiagnostic[]): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    diagnostics.push({
      code: "TN_IR_FILE_INVALID",
      message: `Missing or invalid JSON file '${path}'.`,
      path,
      severity: "error",
      suggestion: "Regenerate the bundle or fix the manifest entry so it points at valid JSON.",
    });
    return undefined;
  }
}
