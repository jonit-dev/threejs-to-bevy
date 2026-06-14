import { access, readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import {
  type IAssetsManifest,
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
import type { IRuntimeConfigIr } from "./runtimeConfig.js";
import { validatePerformanceProfile } from "./performanceProfile.js";
import { validateEnvironmentSceneIr } from "./environment.js";

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
  const manifest = await readJson<IBundleManifest>(resolve(bundlePath, "manifest.json"), diagnostics);

  if (manifest === undefined) {
    return { diagnostics, ok: false };
  }

  validateManifest(manifest, "manifest.json", diagnostics);

  const world = await readJson<IWorldIr>(resolve(bundlePath, manifest.entry.world), diagnostics);
  const audio =
    manifest.entry.audio === undefined
      ? undefined
      : await readJson<IAudioIr>(resolve(bundlePath, manifest.entry.audio), diagnostics);
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
      : await readJson<IRuntimeConfigIr>(resolve(bundlePath, manifest.files.runtimeConfig), diagnostics);
  const ui =
    manifest.entry.ui === undefined ? undefined : await readJson<IUiIr>(resolve(bundlePath, manifest.entry.ui), diagnostics);
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

function validateAudio(
  audio: IAudioIr,
  assets: IAssetsManifest | undefined,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = audio as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["buses", "emitters", "listeners", "music", "oneShots", "schema", "version"].includes(key)) {
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
    if (!["action", "binding", "children", "focusable", "id", "kind", "label", "max", "navigation", "text", "value"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_UI_FIELD_UNSUPPORTED",
        message: `UI node '${node.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  if (!["bar", "button", "column", "row", "stack", "text", "touchControl"].includes(node.kind)) {
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
  node.children?.forEach((child, index) => validateUiNode(child, `${path}/children/${index}`, diagnostics, ids));
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

function validateAssetMetadata(asset: IAssetsManifest["assets"][number], path: string, diagnostics: IIrDiagnostic[]): void {
  const raw = asset as unknown as Record<string, unknown>;
  const allowed = new Set(
    asset.kind === "mesh"
      ? ["format", "id", "kind", "primitive", "size"]
      : ["animationGraph", "animations", "bounds", "format", "id", "kind", "particleEmitters", "path"],
  );
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      diagnostics.push({
        code: key === "blendGraph" || key === "engineController" || key === "ik" || key === "particles" || key === "retargeting" || key === "stateMachine" ? "TN_IR_ANIMATION_FIELD_UNSUPPORTED" : "TN_IR_ASSET_FIELD_UNSUPPORTED",
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
  const slots = ["baseColorTexture", "normalTexture", "metallicRoughnessTexture", "emissiveTexture", "occlusionTexture"] as const;
  materials.materials.forEach((material, materialIndex) => {
    slots.forEach((slot) => {
      const value = material[slot];
      if (value !== undefined && !textureAssets.has(value)) {
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
  materials.materials.forEach((material, index) => {
    const raw = material as unknown as Record<string, unknown>;
    if (raw.kind !== "standard") {
      diagnostics.push({
        code: "TN_IR_MATERIAL_UNSUPPORTED",
        message: `Material '${material.id}' uses unsupported material kind '${String(raw.kind)}'.`,
        path: `${path}/materials/${index}/kind`,
      });
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

function validateRuntimeConfig(config: IRuntimeConfigIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (config.schema !== "threenative.runtime-config" || config.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_RUNTIME_CONFIG_VERSION_UNSUPPORTED",
      message: "Runtime config IR must use threenative.runtime-config version 0.1.0.",
      path,
    });
  }
  if (!Number.isFinite(config.time.fixedDelta) || config.time.fixedDelta <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_FIXED_DELTA_INVALID",
      message: "Fixed timestep must be a positive finite number.",
      path: `${path}/time/fixedDelta`,
    });
  }
  if (!Number.isFinite(config.window.width) || config.window.width <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_WINDOW_INVALID",
      message: "Window width must be a positive finite number.",
      path: `${path}/window/width`,
    });
  }
  if (!Number.isFinite(config.window.height) || config.window.height <= 0) {
    diagnostics.push({
      code: "TN_IR_RUNTIME_WINDOW_INVALID",
      message: "Window height must be a positive finite number.",
      path: `${path}/window/height`,
    });
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
    if (!["lifecycle", "schema", "systems", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_SYSTEMS_FIELD_UNSUPPORTED",
        message: `Systems IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
        suggestion: "Remove async, hot-reload, platform, or host-specific scripting metadata unless it is represented by promoted systems lifecycle fields.",
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
  validateSystemsLifecycle(systems.lifecycle, `${path}/lifecycle`, resourceSchemas, diagnostics);

  systems.systems.forEach((system, systemIndex) => {
    const rawSystem = system as unknown as Record<string, unknown>;
    for (const key of Object.keys(rawSystem)) {
      if (!["commands", "eventReads", "eventWrites", "name", "queries", "reads", "resourceReads", "resourceWrites", "schedule", "script", "services", "writes"].includes(key)) {
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
      if (componentSchemas[component] === undefined) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
          message: `System '${system.name}' reads component '${component}' without a schema.`,
          path: `${path}/systems/${systemIndex}/reads/${componentIndex}`,
        });
      }
    });
    system.writes.forEach((component, componentIndex) => {
      if (componentSchemas[component] === undefined) {
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
      query.with.forEach((component, componentIndex) => {
        if (componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' queries component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/with/${componentIndex}`,
          });
        }
      });
      query.without.forEach((component, componentIndex) => {
        if (componentSchemas[component] === undefined) {
          diagnostics.push({
            code: "TN_IR_SYSTEM_COMPONENT_SCHEMA_MISSING",
            message: `System '${system.name}' excludes component '${component}' without a schema.`,
            path: `${path}/systems/${systemIndex}/queries/${queryIndex}/without/${componentIndex}`,
          });
        }
      });
    });
    (system.services ?? []).forEach((service, serviceIndex) => {
      if (!["animation.play", "physics.overlap", "physics.raycast", "physics.shapeCast"].includes(service)) {
        diagnostics.push({
          code: "TN_IR_SYSTEM_SERVICE_UNSUPPORTED",
          message: `System '${system.name}' declares unsupported service '${service}'.`,
          path: `${path}/systems/${systemIndex}/services/${serviceIndex}`,
        });
      }
    });
    system.commands.forEach((command, commandIndex) => {
      if (command.kind === "addComponent" || command.kind === "removeComponent" || command.kind === "setComponent") {
        if (componentSchemas[command.component] === undefined) {
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
          if (componentSchemas[component] === undefined) {
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
  return ["Camera", "CharacterController", "Collider", "Hierarchy", "Light", "MeshRenderer", "RigidBody", "Transform", "Visibility"].includes(componentName);
}

function isBuiltInResource(resourceName: string): boolean {
  return resourceName === "ActiveCamera";
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

function validateManifest(manifest: IBundleManifest, path: string, diagnostics: IIrDiagnostic[]): void {
  if (manifest.schema !== "threenative.bundle" || manifest.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_MANIFEST_VERSION_UNSUPPORTED",
      message: "Manifest must use threenative.bundle version 0.1.0.",
      path,
    });
  }

  if (manifest.entry.world !== "world.ir.json") {
    diagnostics.push({
      code: "TN_IR_WORLD_ENTRY_INVALID",
      message: "V1 manifest entry.world must be world.ir.json.",
      path: "manifest.json/entry/world",
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

  const renderer = entity.components.MeshRenderer;
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
    if (colliderRecord.kind === "box") {
      validatePositiveVec3(colliderRecord.size, `${path}/components/Collider/size`, "TN_IR_PHYSICS_COLLIDER_SIZE_INVALID", diagnostics);
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
    if (!["blocking", "grounding", "interactAction", "moveXAxis", "moveZAxis", "speed"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_CHARACTER_FIELD_UNSUPPORTED",
        message: `CharacterController '${entity.id}' uses unsupported field '${key}'.`,
        path: `${path}/components/CharacterController/${key}`,
        suggestion: "Slope, step, navmesh, and engine-specific controller fields are deferred to V7.",
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
  if (typeof controller.blocking !== "boolean") {
    diagnostics.push({
      code: "TN_IR_CHARACTER_BLOCKING_INVALID",
      message: "CharacterController.blocking must be boolean.",
      path: `${path}/components/CharacterController/blocking`,
    });
  }
  if (!["none", "raycast"].includes(controller.grounding as string)) {
    diagnostics.push({
      code: "TN_IR_CHARACTER_GROUNDING_UNSUPPORTED",
      message: `CharacterController '${entity.id}' uses unsupported grounding mode '${String(controller.grounding)}'.`,
      path: `${path}/components/CharacterController/grounding`,
      suggestion: "Use 'raycast' or 'none'. Slope and step handling are deferred to V7.",
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
