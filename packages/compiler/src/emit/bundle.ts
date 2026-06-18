import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  IR_DOCUMENTS,
  IR_SCHEMA_IDS,
  IR_VERSION,
  type IAssetsManifest,
  type IAnimationsIr,
  type IBundleManifest,
  type IGltfSceneMetadataIr,
  type ILocalDataIr,
  type IMaterialIr,
  type IMaterialsIr,
  type IScenesIr,
  type ISceneTransitionIr,
  type ITargetProfile,
  type IUiIr,
  type IWorldIr,
} from "@threenative/ir";
import { type IAnimationsDeclaration, type IAssetGroupDeclaration, type IAssetReference, type IAudioDeclaration, type IInputMapDeclaration, type IOverlayDeclaration, type IPersistenceDeclaration, type ISceneAudioDeclaration, type ISceneLifecycleDeclaration, type World } from "@threenative/sdk";
import { type IUiElement } from "@threenative/ui";

import { type IProjectConfig } from "../config.js";
import { copyAssetFiles, copyExtraAssetFiles, type IInternalAsset } from "./asset-copy.js";
import { emitAudio } from "./audio.js";
import { deriveRequiredCapabilities } from "./capabilities.js";
import { ecsToIr, type IEcsEmitResult } from "./ecs.js";
import { emitEnvironment, type IEnvironmentDeclaration } from "./environment.js";
import { inputToIr } from "./input.js";
import { emitPersistence } from "./persistence.js";
import { emitOverlays } from "../overlay/emit.js";
import { sceneToWorld } from "./scene-to-world.js";
import { stableJson } from "./stable-json.js";
import { emitUi } from "./ui.js";
import { extractGltfSceneMetadata } from "../gltf/metadata.js";

export async function emitBundle(config: IProjectConfig, root: unknown): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const bundleRoot = normalizeBundleRoot(root);
  const isWorld =
    typeof bundleRoot.scene === "object" && bundleRoot.scene !== null && bundleRoot.scene.constructor.name === "World";
  const worldRoot = bundleRoot.world ?? (isWorld ? bundleRoot.scene : undefined);
  const sceneRoot = isWorld ? undefined : bundleRoot.scene;
  const lifecycleScenes = emitLifecycleScenes(bundleRoot.scenes, bundleRoot.initialScene);
  const emitted = mergeSceneEmits([
    ...(sceneRoot === undefined ? [] : [sceneToWorld(sceneRoot as Parameters<typeof sceneToWorld>[0])]),
    ...lifecycleScenes.sceneEmits,
  ]);
  const ecs = mergeEcsEmits([
    ...(worldRoot === undefined ? [] : [ecsToIr(worldRoot as Parameters<typeof ecsToIr>[0])]),
    ...lifecycleScenes.ecsEmits,
  ]);
  const input = bundleRoot.input === undefined ? ecs?.input : inputToIr(bundleRoot.input);
  const audio = bundleRoot.audio === undefined ? undefined : emitAudio(bundleRoot.audio);
  const localData = bundleRoot.persistence === undefined ? undefined : emitPersistence(bundleRoot.persistence);
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
    schema: IR_SCHEMA_IDS.materials,
    version: IR_VERSION,
    materials: (emitted?.materials ?? []) as unknown as IMaterialIr[],
  };
  const assetsManifest: IAssetsManifest = {
    schema: IR_SCHEMA_IDS.assets,
    version: IR_VERSION,
    assets: assets.map(stripInternalAssetFields) as IAssetsManifest["assets"],
    groups: assetGroups(assets, bundleRoot.assetGroups),
  };
  const gltfScene: IGltfSceneMetadataIr | undefined = await extractGltfSceneMetadata(config.projectPath, assets);
  const targetProfile: ITargetProfile = {
    schema: IR_SCHEMA_IDS.targetProfile,
    version: IR_VERSION,
    targets: ["web", "desktop"],
    ...(environment?.budgets === undefined ? {} : { budgets: environment.budgets }),
    ...(environment?.performance === undefined ? {} : { performance: environment.performance }),
  };
  const manifest: IBundleManifest = {
    schema: IR_SCHEMA_IDS.bundle,
    version: IR_VERSION,
    name: "threenative-game",
    requiredCapabilities: deriveRequiredCapabilities({
      assets: assetsManifest,
      audio,
      animations,
      componentSchemas: ecs?.componentSchemas,
      environment: environment?.scene,
      eventSchemas: ecs?.eventSchemas,
      input,
      localData,
      materials,
      overlays: overlays?.overlays,
      resourceSchemas: ecs?.resourceSchemas,
      runtimeConfig: ecs?.runtimeConfig,
      scenes: lifecycleScenes.scenes,
      systems: ecs?.systems,
      ui,
      world,
    }),
    entry: {
      ...(audio === undefined ? {} : { audio: IR_DOCUMENTS.audio.fileName }),
      ...(animations === undefined ? {} : { animations: IR_DOCUMENTS.animations.fileName }),
      ...(environment === undefined ? {} : { environmentScene: IR_DOCUMENTS.environmentScene.fileName }),
      ...(localData === undefined ? {} : { localData: IR_DOCUMENTS.localData.fileName }),
      ...(lifecycleScenes.scenes === undefined ? {} : { scenes: IR_DOCUMENTS.scenes.fileName }),
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: IR_DOCUMENTS.scripts.fileName }),
      ...(ecs === undefined ? {} : { systems: IR_DOCUMENTS.systems.fileName }),
      ...(overlays === undefined ? {} : { overlays: IR_DOCUMENTS.overlays.fileName }),
      ...(ui === undefined ? {} : { ui: IR_DOCUMENTS.ui.fileName }),
      world: IR_DOCUMENTS.world.fileName,
    },
    files: {
      assets: IR_DOCUMENTS.assets.fileName,
      ...(animations === undefined ? {} : { animations: IR_DOCUMENTS.animations.fileName }),
      ...(input === undefined ? {} : { input: IR_DOCUMENTS.input.fileName }),
      ...(localData === undefined ? {} : { localData: IR_DOCUMENTS.localData.fileName }),
      materials: IR_DOCUMENTS.materials.fileName,
      targetProfile: IR_DOCUMENTS.targetProfile.fileName,
      ...(gltfScene === undefined ? {} : { gltfScene: IR_DOCUMENTS.gltfScene.fileName }),
      ...(ecs === undefined
        ? {}
        : {
            componentSchemas: IR_DOCUMENTS.componentSchemas.fileName,
            eventSchemas: IR_DOCUMENTS.eventSchemas.fileName,
            resourceSchemas: IR_DOCUMENTS.resourceSchemas.fileName,
            ...(ecs.runtimeConfig === undefined ? {} : { runtimeConfig: IR_DOCUMENTS.runtimeConfig.fileName }),
            ...(ecs.scriptBundle === undefined ? {} : { scripts: IR_DOCUMENTS.scripts.fileName }),
          }),
    },
  };

  await rm(outDir, { force: true, recursive: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(resolve(outDir, "schemas"), { recursive: true });
  await writeGeneratedMeshPayloads(outDir, generatedMeshPayloads.payloads);
  await writeFile(resolve(outDir, IR_DOCUMENTS.manifest.fileName), stableJson(manifest));
  await copyAssetFiles(config.projectPath, outDir, assets);
  await copyExtraAssetFiles(config.projectPath, outDir, [...(environment?.extraFiles ?? []), ...(overlays?.extraFiles ?? [])]);
  await writeFile(resolve(outDir, IR_DOCUMENTS.world.fileName), stableJson(world));
  await writeFile(resolve(outDir, IR_DOCUMENTS.materials.fileName), stableJson(materials));
  await writeFile(resolve(outDir, IR_DOCUMENTS.assets.fileName), stableJson(assetsManifest));
  await writeFile(resolve(outDir, IR_DOCUMENTS.targetProfile.fileName), stableJson(targetProfile));
  if (environment !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.environmentScene.fileName), stableJson(environment.scene));
  }
  if (ui !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.ui.fileName), stableJson(ui));
  }
  if (overlays !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.overlays.fileName), stableJson(overlays.overlays));
  }
  if (audio !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.audio.fileName), stableJson(audio));
  }
  if (localData !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.localData.fileName), stableJson(localData));
  }
  if (lifecycleScenes.scenes !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.scenes.fileName), stableJson(lifecycleScenes.scenes));
  }
  if (animations !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.animations.fileName), stableJson(animations));
  }
  if (gltfScene !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.gltfScene.fileName), stableJson(gltfScene));
  }
  if (input !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.input.fileName), stableJson(input));
  }
  if (ecs !== undefined) {
    await writeFile(resolve(outDir, IR_DOCUMENTS.componentSchemas.fileName), stableJson(ecs.componentSchemas));
    await writeFile(resolve(outDir, IR_DOCUMENTS.resourceSchemas.fileName), stableJson(ecs.resourceSchemas));
    await writeFile(resolve(outDir, IR_DOCUMENTS.eventSchemas.fileName), stableJson(ecs.eventSchemas));
    await writeFile(resolve(outDir, IR_DOCUMENTS.systems.fileName), stableJson(ecs.systems));
    if (ecs.runtimeConfig !== undefined) {
      await writeFile(resolve(outDir, IR_DOCUMENTS.runtimeConfig.fileName), stableJson(ecs.runtimeConfig));
    }
    if (ecs.scriptBundle !== undefined) {
      await writeFile(resolve(outDir, IR_DOCUMENTS.scripts.fileName), ecs.scriptBundle);
    }
  }

  return outDir;
}

interface IBundleRoot {
  assetGroups?: readonly IAssetGroupDeclaration[];
  animations?: IAnimationsDeclaration;
  audio?: IAudioDeclaration;
  environment?: IEnvironmentDeclaration;
  initialScene?: string;
  input?: IInputMapDeclaration;
  overlay?: IOverlayDeclaration;
  persistence?: IPersistenceDeclaration;
  scene?: unknown;
  scenes?: readonly ISceneLifecycleDeclaration[];
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
    && ["assetGroups", "animations", "audio", "environment", "initialScene", "input", "overlay", "persistence", "scene", "scenes", "ui", "world"].some((key) => key in root)
  );
}

interface ILifecycleSceneEmitResult {
  ecsEmits: IEcsEmitResult[];
  sceneEmits: ReturnType<typeof sceneToWorld>[];
  scenes?: IScenesIr;
}

function emitLifecycleScenes(scenes: readonly ISceneLifecycleDeclaration[] | undefined, initialScene: string | undefined): ILifecycleSceneEmitResult {
  if (scenes === undefined) {
    return { ecsEmits: [], sceneEmits: [] };
  }
  const sceneEmits: ReturnType<typeof sceneToWorld>[] = [];
  const ecsEmits: IEcsEmitResult[] = [];
  const sceneEntries = scenes.map((scene) => {
    const visualEmit = scene.visual === undefined ? undefined : sceneToWorld(scene.visual);
    const ecsEmit = scene.world === undefined ? undefined : ecsToIr(scene.world);
    if (visualEmit !== undefined) {
      sceneEmits.push(visualEmit);
    }
    if (ecsEmit !== undefined) {
      ecsEmits.push(ecsEmit);
    }
    const sceneWorld = mergeWorlds(visualEmit?.world, ecsEmit?.world);
    return {
      activation: scene.activation,
      ...(scene.preload?.assetGroups === undefined || scene.preload.assetGroups.length === 0
        ? {}
        : { assetGroups: [...scene.preload.assetGroups].sort((left, right) => left.localeCompare(right)) }),
      ...emitSceneAudio(scene.audio),
      ...(sceneWorld === undefined ? {} : { entities: sceneWorld.entities.map((entity) => entity.id).sort((left, right) => left.localeCompare(right)) }),
      id: scene.id,
      kind: scene.kind,
      ...emitScenePersistence(scene.persistence),
      ...emitSceneTransitions(scene.transitions),
    };
  });
  return {
    ecsEmits,
    sceneEmits,
    scenes: {
      schema: IR_SCHEMA_IDS.scenes,
      version: IR_VERSION,
      initialScene: initialScene ?? scenes[0]?.id ?? "",
      scenes: sceneEntries,
    },
  };
}

function emitSceneAudio(audio: ISceneLifecycleDeclaration["audio"]): Pick<IScenesIr["scenes"][number], "audio"> {
  if (audio === undefined || !isSceneAudioMetadata(audio)) {
    return {};
  }
  return {
    audio: {
      music: audio.music,
      ...(audio.transition === undefined ? {} : { transition: emitSceneTransition(audio.transition) }),
    },
  };
}

function isSceneAudioMetadata(audio: ISceneLifecycleDeclaration["audio"]): audio is ISceneAudioDeclaration {
  return typeof audio === "object" && audio !== null && "music" in audio && typeof audio.music === "string";
}

function emitScenePersistence(persistence: ISceneLifecycleDeclaration["persistence"]): Pick<IScenesIr["scenes"][number], "persistence"> {
  if (persistence === undefined) {
    return {};
  }
  return {
    persistence: {
      ...(persistence.keepEntities.length === 0 ? {} : { keepEntities: [...persistence.keepEntities].sort((left, right) => left.localeCompare(right)) }),
      ...(persistence.keepResources.length === 0 ? {} : { keepResources: [...persistence.keepResources].sort((left, right) => left.localeCompare(right)) }),
    },
  };
}

function emitSceneTransitions(transitions: ISceneLifecycleDeclaration["transitions"]): Pick<IScenesIr["scenes"][number], "transitions"> {
  if (transitions.enter === undefined && transitions.exit === undefined) {
    return {};
  }
  return {
    transitions: {
      ...(transitions.enter === undefined ? {} : { enter: emitSceneTransition(transitions.enter) }),
      ...(transitions.exit === undefined ? {} : { exit: emitSceneTransition(transitions.exit) }),
    },
  };
}

function emitSceneTransition(transition: NonNullable<ISceneLifecycleDeclaration["transitions"]["enter"]>): ISceneTransitionIr {
  return {
    durationMs: transition.durationMs,
    kind: transition.kind,
    ...(transition.color === undefined ? {} : { color: transition.color }),
    ...(transition.loadingScene === undefined ? {} : { loadingScene: transition.loadingScene }),
  };
}

function emitAnimations(animations: IAnimationsDeclaration): IAnimationsIr {
  return {
    schema: IR_SCHEMA_IDS.animations,
    version: IR_VERSION,
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

function mergeSceneEmits(emits: ReturnType<typeof sceneToWorld>[]): ReturnType<typeof sceneToWorld> | undefined {
  if (emits.length === 0) {
    return undefined;
  }
  return {
    assets: mergeById(emits.flatMap((emit) => emit.assets)),
    materials: mergeById(emits.flatMap((emit) => emit.materials)),
    world: emits.map((emit) => emit.world).reduce((merged, world) => mergeWorlds(merged, world) ?? merged),
  };
}

function mergeEcsEmits(emits: IEcsEmitResult[]): IEcsEmitResult | undefined {
  if (emits.length === 0) {
    return undefined;
  }
  const [first, ...rest] = emits;
  if (first === undefined) {
    return undefined;
  }
  return rest.reduce(
    (merged, current) => ({
      componentSchemas: mergeSchemaFiles(merged.componentSchemas, current.componentSchemas),
      eventSchemas: mergeSchemaFiles(merged.eventSchemas, current.eventSchemas),
      input: mergeInputs(merged.input, current.input),
      resourceSchemas: mergeSchemaFiles(merged.resourceSchemas, current.resourceSchemas),
      runtimeConfig: current.runtimeConfig ?? merged.runtimeConfig,
      scriptBundle: [merged.scriptBundle, current.scriptBundle].filter((item): item is string => item !== undefined && item.trim() !== "").join("\n"),
      systems: {
        schema: "threenative.systems",
        version: "0.1.0",
        systems: mergeByName([...merged.systems.systems, ...current.systems.systems]),
      },
      world: mergeWorlds(merged.world, current.world) ?? merged.world,
    }),
    first,
  );
}

function mergeSchemaFiles<T extends { schema: string; version: string; schemas: Record<string, unknown> }>(left: T, right: T): T {
  return {
    ...left,
    schemas: Object.fromEntries([...Object.entries(left.schemas), ...Object.entries(right.schemas)].sort(([a], [b]) => a.localeCompare(b))),
  };
}

function mergeInputs(left: IEcsEmitResult["input"], right: IEcsEmitResult["input"]): IEcsEmitResult["input"] {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return {
    schema: "threenative.input",
    version: "0.1.0",
    actions: mergeById([...left.actions, ...right.actions]),
    axes: mergeById([...left.axes, ...right.axes]),
  };
}

function mergeById<T extends { id: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.id, item])).values()].sort((left, right) => left.id.localeCompare(right.id));
}

function mergeByName<T extends { name: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [item.name, item])).values()].sort((left, right) => left.name.localeCompare(right.name));
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
