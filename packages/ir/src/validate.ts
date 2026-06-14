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
    if (!["music", "oneShots", "schema", "version"].includes(key)) {
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
  audio.oneShots.forEach((oneShot, index) => validateAudioOneShot(oneShot, audioAssets, `${path}/oneShots/${index}`, diagnostics));
  audio.music.forEach((music, index) => validateAudioMusic(music, audioAssets, `${path}/music/${index}`, diagnostics));
}

function validateAudioOneShot(
  oneShot: IAudioOneShotIr,
  audioAssets: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = oneShot as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["asset", "event", "id"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_AUDIO_FIELD_UNSUPPORTED",
        message: `Audio one-shot '${oneShot.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
      });
    }
  }
  validateAudioAssetRef(oneShot.asset, audioAssets, `${path}/asset`, diagnostics);
}

function validateAudioMusic(
  music: IAudioMusicIr,
  audioAssets: Set<string>,
  path: string,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = music as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["asset", "autoplay", "id", "loop"].includes(key)) {
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
  validateAudioAssetRef(music.asset, audioAssets, `${path}/asset`, diagnostics);
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
  validateUiNode(ui.root, `${path}/root`, diagnostics, ids);
}

function validateUiNode(node: IUiNodeIr, path: string, diagnostics: IIrDiagnostic[], ids: Set<string>): void {
  const raw = node as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["action", "binding", "children", "focusable", "id", "kind", "label", "max", "text", "value"].includes(key)) {
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
      : ["animations", "bounds", "format", "id", "kind", "path"],
  );
  for (const key of Object.keys(raw)) {
    if (!allowed.has(key)) {
      diagnostics.push({
        code: key === "blendGraph" || key === "ik" || key === "particles" || key === "retargeting" || key === "stateMachine" ? "TN_IR_ANIMATION_FIELD_UNSUPPORTED" : "TN_IR_ASSET_FIELD_UNSUPPORTED",
        message: `Asset '${asset.id}' uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        suggestion: "Animation graphs, blends, IK, retargeting, and particles are deferred to V7.",
      });
    }
  }
  if ("animations" in raw && asset.kind !== "model") {
    diagnostics.push({
      code: "TN_IR_ANIMATION_MODEL_REQUIRED",
      message: `Asset '${asset.id}' can declare animations only when it is a model asset.`,
      path: `${path}/animations`,
    });
    return;
  }
  if (asset.kind === "model" && "animations" in raw) {
    validateAnimationClips(raw.animations, `${path}/animations`, diagnostics);
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
  if (systems.schema !== "threenative.systems" || systems.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_SYSTEMS_VERSION_UNSUPPORTED",
      message: "Systems IR must use threenative.systems version 0.1.0.",
      path,
    });
  }

  systems.systems.forEach((system, systemIndex) => {
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
