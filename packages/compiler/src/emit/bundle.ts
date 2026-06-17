import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  type IAssetsManifest,
  type IAnimationsIr,
  type IBundleManifest,
  type IMaterialIr,
  type IMaterialsIr,
  type ITargetProfile,
  type IUiIr,
  type IWorldIr,
} from "@threenative/ir";
import { type IAnimationsDeclaration, type IAssetGroupDeclaration, type IAssetReference, type IAudioDeclaration, type IInputMapDeclaration, type IOverlayDeclaration, type World } from "@threenative/sdk";
import { type IUiElement } from "@threenative/ui";

import { type IProjectConfig } from "../config.js";
import { copyAssetFiles, copyExtraAssetFiles, type IInternalAsset } from "./asset-copy.js";
import { emitAudio } from "./audio.js";
import { deriveRequiredCapabilities } from "./capabilities.js";
import { ecsToIr } from "./ecs.js";
import { emitEnvironment, type IEnvironmentDeclaration } from "./environment.js";
import { inputToIr } from "./input.js";
import { emitOverlays } from "../overlay/emit.js";
import { sceneToWorld } from "./scene-to-world.js";
import { stableJson } from "./stable-json.js";
import { emitUi } from "./ui.js";

export async function emitBundle(config: IProjectConfig, root: unknown): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const bundleRoot = normalizeBundleRoot(root);
  const isWorld =
    typeof bundleRoot.scene === "object" && bundleRoot.scene !== null && bundleRoot.scene.constructor.name === "World";
  const worldRoot = bundleRoot.world ?? (isWorld ? bundleRoot.scene : undefined);
  const sceneRoot = isWorld ? undefined : bundleRoot.scene;
  const emitted = sceneRoot === undefined ? undefined : sceneToWorld(sceneRoot as Parameters<typeof sceneToWorld>[0]);
  const ecs = worldRoot === undefined ? undefined : ecsToIr(worldRoot as Parameters<typeof ecsToIr>[0]);
  const input = bundleRoot.input === undefined ? ecs?.input : inputToIr(bundleRoot.input);
  const audio = bundleRoot.audio === undefined ? undefined : emitAudio(bundleRoot.audio);
  const animations = bundleRoot.animations === undefined ? undefined : emitAnimations(bundleRoot.animations);
  const environment = bundleRoot.environment === undefined ? undefined : await emitEnvironment(config.projectPath, bundleRoot.environment);
  const overlays = bundleRoot.overlay === undefined ? undefined : await emitOverlays(config.projectPath, bundleRoot.overlay);
  const generatedMeshPayloads = prepareGeneratedMeshPayloads(
    mergeEnvironmentAssets(mergeAudioAssets(emitted?.assets ?? [], bundleRoot.audio), environment?.assets ?? []),
  );
  const assets = generatedMeshPayloads.assets;
  const ui = (bundleRoot.ui === undefined ? undefined : emitUi(bundleRoot.ui)) as IUiIr | undefined;
  const world = mergeWorlds(emitted?.world, ecs?.world);
  const materials: IMaterialsIr = {
    schema: "threenative.materials",
    version: "0.1.0",
    materials: (emitted?.materials ?? []) as unknown as IMaterialIr[],
  };
  const assetsManifest: IAssetsManifest = {
    schema: "threenative.assets",
    version: "0.1.0",
    assets: assets.map(stripInternalAssetFields) as IAssetsManifest["assets"],
    groups: assetGroups(assets, bundleRoot.assetGroups),
  };
  const targetProfile: ITargetProfile = {
    schema: "threenative.target-profile",
    version: "0.1.0",
    targets: ["web", "desktop"],
    ...(environment?.budgets === undefined ? {} : { budgets: environment.budgets }),
    ...(environment?.performance === undefined ? {} : { performance: environment.performance }),
  };
  const manifest: IBundleManifest = {
    schema: "threenative.bundle",
    version: "0.1.0",
    name: "threenative-game",
    requiredCapabilities: deriveRequiredCapabilities({
      assets: assetsManifest,
      audio,
      animations,
      componentSchemas: ecs?.componentSchemas,
      environment: environment?.scene,
      eventSchemas: ecs?.eventSchemas,
      input,
      materials,
      overlays: overlays?.overlays,
      resourceSchemas: ecs?.resourceSchemas,
      runtimeConfig: ecs?.runtimeConfig,
      systems: ecs?.systems,
      ui,
      world,
    }),
    entry: {
      ...(audio === undefined ? {} : { audio: "audio.ir.json" }),
      ...(animations === undefined ? {} : { animations: "animations.ir.json" }),
      ...(environment === undefined ? {} : { environmentScene: "environment.scene.json" }),
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" }),
      ...(ecs === undefined ? {} : { systems: "systems.ir.json" }),
      ...(overlays === undefined ? {} : { overlays: "overlays.ir.json" }),
      ...(ui === undefined ? {} : { ui: "ui.ir.json" }),
      world: "world.ir.json",
    },
    files: {
      assets: "assets.manifest.json",
      ...(animations === undefined ? {} : { animations: "animations.ir.json" }),
      ...(input === undefined ? {} : { input: "input.ir.json" }),
      materials: "materials.ir.json",
      targetProfile: "target.profile.json",
      ...(ecs === undefined
        ? {}
        : {
            componentSchemas: "schemas/components.schema.json" as const,
            eventSchemas: "schemas/events.schema.json" as const,
            resourceSchemas: "schemas/resources.schema.json" as const,
            ...(ecs.runtimeConfig === undefined ? {} : { runtimeConfig: "runtime.config.json" as const }),
            ...(ecs.scriptBundle === undefined ? {} : { scripts: "scripts.bundle.js" as const }),
          }),
    },
  };

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(resolve(outDir, "schemas"), { recursive: true });
  await writeGeneratedMeshPayloads(outDir, generatedMeshPayloads.payloads);
  await writeFile(resolve(outDir, "manifest.json"), stableJson(manifest));
  await copyAssetFiles(config.projectPath, outDir, assets);
  await copyExtraAssetFiles(config.projectPath, outDir, [...(environment?.extraFiles ?? []), ...(overlays?.extraFiles ?? [])]);
  await writeFile(resolve(outDir, "world.ir.json"), stableJson(world));
  await writeFile(resolve(outDir, "materials.ir.json"), stableJson(materials));
  await writeFile(resolve(outDir, "assets.manifest.json"), stableJson(assetsManifest));
  await writeFile(resolve(outDir, "target.profile.json"), stableJson(targetProfile));
  if (environment !== undefined) {
    await writeFile(resolve(outDir, "environment.scene.json"), stableJson(environment.scene));
  }
  if (ui !== undefined) {
    await writeFile(resolve(outDir, "ui.ir.json"), stableJson(ui));
  }
  if (overlays !== undefined) {
    await writeFile(resolve(outDir, "overlays.ir.json"), stableJson(overlays.overlays));
  }
  if (audio !== undefined) {
    await writeFile(resolve(outDir, "audio.ir.json"), stableJson(audio));
  }
  if (animations !== undefined) {
    await writeFile(resolve(outDir, "animations.ir.json"), stableJson(animations));
  }
  if (input !== undefined) {
    await writeFile(resolve(outDir, "input.ir.json"), stableJson(input));
  }
  if (ecs !== undefined) {
    await writeFile(resolve(outDir, "schemas/components.schema.json"), stableJson(ecs.componentSchemas));
    await writeFile(resolve(outDir, "schemas/resources.schema.json"), stableJson(ecs.resourceSchemas));
    await writeFile(resolve(outDir, "schemas/events.schema.json"), stableJson(ecs.eventSchemas));
    await writeFile(resolve(outDir, "systems.ir.json"), stableJson(ecs.systems));
    if (ecs.runtimeConfig !== undefined) {
      await writeFile(resolve(outDir, "runtime.config.json"), stableJson(ecs.runtimeConfig));
    }
    if (ecs.scriptBundle !== undefined) {
      await writeFile(resolve(outDir, "scripts.bundle.js"), ecs.scriptBundle);
    }
  }

  return outDir;
}

interface IBundleRoot {
  assetGroups?: readonly IAssetGroupDeclaration[];
  animations?: IAnimationsDeclaration;
  audio?: IAudioDeclaration;
  environment?: IEnvironmentDeclaration;
  input?: IInputMapDeclaration;
  overlay?: IOverlayDeclaration;
  scene?: unknown;
  ui?: IUiElement;
  world?: World;
}

function normalizeBundleRoot(root: unknown): IBundleRoot {
  if (isBundleRoot(root)) {
    return root;
  }
  return { scene: root };
}

function isBundleRoot(root: unknown): root is IBundleRoot {
  return (
    typeof root === "object"
    && root !== null
    && ["assetGroups", "animations", "audio", "environment", "input", "overlay", "scene", "ui", "world"].some((key) => key in root)
  );
}

function emitAnimations(animations: IAnimationsDeclaration): IAnimationsIr {
  return {
    schema: "threenative.animations",
    version: "0.1.0",
    transformClips: animations.transformClips.map((clip) => ({
      id: clip.id,
      ...(clip.loop === undefined ? {} : { loop: clip.loop }),
      tracks: clip.tracks.map((track) => ({
        channel: track.channel,
        ...(track.easing === undefined ? {} : { easing: track.easing }),
        keyframes: track.keyframes.map((keyframe) => ({ timeSeconds: keyframe.timeSeconds, value: [...keyframe.value] })),
        target: track.target,
      })),
    })),
  };
}

function mergeWorlds(scene: IWorldIr | undefined, ecs: IWorldIr | undefined): IWorldIr | undefined {
  if (scene === undefined) {
    return ecs;
  }
  if (ecs === undefined) {
    return scene;
  }
  const entities = new Map(scene.entities.map((entity) => [entity.id, { ...entity, components: { ...entity.components } }]));
  for (const entity of ecs.entities) {
    const existing = entities.get(entity.id);
    entities.set(
      entity.id,
      existing === undefined
        ? { ...entity, components: { ...entity.components } }
        : { ...existing, components: { ...existing.components, ...entity.components }, tags: entity.tags ?? existing.tags },
    );
  }
  return {
    ...scene,
    entities: [...entities.values()].sort((left, right) => left.id.localeCompare(right.id)),
    events: { ...(scene.events ?? {}), ...(ecs.events ?? {}) },
    resources: { ...(scene.resources ?? {}), ...(ecs.resources ?? {}) },
  };
}

function mergeAudioAssets(
  assets: Array<Record<string, unknown> & { id: string }>,
  audio: IAudioDeclaration | undefined,
): IInternalAsset[] {
  const merged = new Map(assets.map((asset) => [asset.id, asset]));
  for (const asset of audioAssetRefs(audio)) {
    merged.set(asset.id, {
      format: asset.format,
      id: asset.id,
      kind: asset.kind,
      path: asset.path,
    });
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergeEnvironmentAssets(
  assets: IInternalAsset[],
  environmentAssets: IInternalAsset[],
): IInternalAsset[] {
  const merged = new Map(assets.map((asset) => [asset.id, asset]));
  for (const asset of environmentAssets) {
    merged.set(asset.id, asset);
  }
  return [...merged.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function audioAssetRefs(audio: IAudioDeclaration | undefined): IAssetReference[] {
  if (audio === undefined) {
    return [];
  }
  return [...audio.music, ...audio.oneShots].flatMap((item) => (item.assetRef === undefined ? [] : [item.assetRef]));
}

function stripInternalAssetFields(asset: IInternalAsset): Record<string, unknown> & { id: string } {
  const { sourcePath: _sourcePath, storage: _storage, ...publicAsset } = asset;
  return publicAsset;
}

function assetGroups(assets: readonly IInternalAsset[], groups: readonly IAssetGroupDeclaration[] | undefined): IAssetsManifest["groups"] {
  const required = assets
    .filter((asset) => asset.kind !== "render-target")
    .map((asset) => asset.id)
    .sort((left, right) => left.localeCompare(right));
  const normalized = [
    ...(required.length === 0 ? [] : [{ id: "bundle.requiredAssets", required }]),
    ...(groups ?? []).map((group) => ({
      id: group.id,
      ...(group.failurePolicy === undefined ? {} : { failurePolicy: group.failurePolicy }),
      ...(group.optional === undefined ? {} : { optional: [...group.optional].sort((left, right) => left.localeCompare(right)) }),
      required: [...group.required].sort((left, right) => left.localeCompare(right)),
      ...(group.timeoutMs === undefined ? {} : { timeoutMs: group.timeoutMs }),
    })),
  ].sort((left, right) => left.id.localeCompare(right.id));
  return normalized.length === 0 ? undefined : normalized;
}

interface IGeneratedMeshPayload {
  bytes: Buffer;
  path: string;
}

function prepareGeneratedMeshPayloads(assets: IInternalAsset[]): { assets: IInternalAsset[]; payloads: IGeneratedMeshPayload[] } {
  const payloads: IGeneratedMeshPayload[] = [];
  const prepared = assets.map((asset) => {
    if (asset.kind !== "mesh" || asset.primitive !== "custom" || asset.storage !== "binary" || !Array.isArray(asset.attributes)) {
      return asset;
    }
    const meshId = sanitizeMeshId(asset.id);
    const binaryAttributes = asset.attributes.map((attribute, index) => {
      const typed = attribute as { itemSize: 1 | 2 | 3 | 4; name: string; values: readonly number[] };
      const path = `generated/meshes/${meshId}.${String(index).padStart(2, "0")}.${typed.name.replace(":", "-")}.bin`;
      payloads.push({ bytes: float32Payload(typed.values), path });
      return {
        count: typed.values.length / typed.itemSize,
        format: `float32x${typed.itemSize}`,
        itemSize: typed.itemSize,
        name: typed.name,
        path,
      };
    });
    const indices = Array.isArray(asset.indices) ? asset.indices as readonly number[] : undefined;
    const binaryIndices = indices === undefined ? undefined : (() => {
      const format = indices.every((index) => index <= 0xffff) ? "uint16" : "uint32";
      const path = `generated/meshes/${meshId}.indices.${format}.bin`;
      payloads.push({ bytes: indexPayload(indices, format), path });
      return { count: indices.length, format, path };
    })();
    const { attributes: _attributes, indices: _indices, storage: _storage, ...rest } = asset;
    return {
      ...rest,
      binaryAttributes,
      ...(binaryIndices === undefined ? {} : { binaryIndices }),
    };
  });
  return { assets: prepared, payloads };
}

async function writeGeneratedMeshPayloads(outDir: string, payloads: readonly IGeneratedMeshPayload[]): Promise<void> {
  for (const payload of payloads) {
    const path = resolve(outDir, payload.path);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, payload.bytes);
  }
}

function float32Payload(values: readonly number[]): Buffer {
  const bytes = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => bytes.writeFloatLE(value, index * 4));
  return bytes;
}

function indexPayload(values: readonly number[], format: "uint16" | "uint32"): Buffer {
  const itemBytes = format === "uint16" ? 2 : 4;
  const bytes = Buffer.alloc(values.length * itemBytes);
  values.forEach((value, index) => {
    if (format === "uint16") {
      bytes.writeUInt16LE(value, index * itemBytes);
    } else {
      bytes.writeUInt32LE(value, index * itemBytes);
    }
  });
  return bytes;
}

function sanitizeMeshId(id: string): string {
  return id.replace(/[^A-Za-z0-9_.-]+/g, "_");
}
