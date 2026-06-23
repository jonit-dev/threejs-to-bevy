import { mkdir, mkdtemp, rename, rm, writeFile } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import {
  IR_DOCUMENTS,
  IR_SCHEMA_IDS,
  IR_VERSION,
  type IAssetsManifest,
  type IAnimationsIr,
  type IBundleManifest,
  type IGltfSceneMetadataIr,
  type IInputIr,
  type ILocalDataIr,
  type IMaterialIr,
  type IMaterialsIr,
  type IPrefabsIr,
  type IRuntimeConfigIr,
  type IScenesIr,
  type ISceneTransitionIr,
  type ITargetProfile,
  type IUiIr,
  type IWorldIr,
} from "@threenative/ir";
import type { IAuthoringDocument } from "@threenative/authoring";
import { type IAnimationsDeclaration, type IAssetGroupDeclaration, type IAssetModuleDeclaration, type IAssetReference, type IAudioDeclaration, type IInputMapDeclaration, type IOverlayDeclaration, type IPersistenceDeclaration, type ISceneAudioDeclaration, type ISceneLifecycleDeclaration, type World } from "@threenative/sdk";
import { type IUiElement } from "@threenative/ui";

import { type IProjectConfig } from "../config.js";
import type { IAuthoringGraph } from "../authoring/graph.js";
import { AUTHORING_PROVENANCE_FILE, authoringProvenanceDocument, buildAuthoringProvenanceDocument, type IAuthoringEmittedDocument } from "../authoring/provenance.js";
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

const SCRIPTS_MANIFEST_FILE = "scripts.manifest.json";

export interface IEmitBundleOptions {
  authoringDocuments?: readonly IAuthoringDocument[];
  authoringGraph?: IAuthoringGraph;
}

export async function emitBundle(config: IProjectConfig, root: unknown, options: IEmitBundleOptions = {}): Promise<string> {
  const outDir = resolve(config.projectPath, config.outDir);
  const bundleRoot = normalizeBundleRoot(root);
  const isWorld =
    typeof bundleRoot.scene === "object" && bundleRoot.scene !== null && bundleRoot.scene.constructor.name === "World";
  const worldRoot = bundleRoot.world ?? (isWorld ? bundleRoot.scene : undefined);
  const sceneRoot = isWorld ? undefined : bundleRoot.scene;
  const lifecycleScenes = emitLifecycleScenes(config.projectPath, bundleRoot.scenes, bundleRoot.initialScene);
  const emitted = mergeSceneEmits([
    ...(sceneRoot === undefined ? [] : [sceneToWorld(sceneRoot as Parameters<typeof sceneToWorld>[0])]),
    ...lifecycleScenes.sceneEmits,
  ]);
  const ecs = mergeEcsEmits([
    ...(worldRoot === undefined ? [] : [ecsToIr(worldRoot as Parameters<typeof ecsToIr>[0], { projectPath: config.projectPath })]),
    ...lifecycleScenes.ecsEmits,
  ]);
  const rootInput = bundleRoot.input === undefined ? ecs?.input : inputToIr(bundleRoot.input);
  const input = mergeInputs(rootInput, lifecycleScenes.input);
  const audio = bundleRoot.audio === undefined ? undefined : emitAudio(bundleRoot.audio);
  const localData = bundleRoot.persistence === undefined ? undefined : emitPersistence(bundleRoot.persistence);
  const animations = bundleRoot.animations === undefined ? undefined : emitAnimations(bundleRoot.animations);
  const environment = bundleRoot.environment === undefined ? undefined : await emitEnvironment(config.projectPath, bundleRoot.environment);
  const overlays = bundleRoot.overlay === undefined ? undefined : await emitOverlays(config.projectPath, bundleRoot.overlay);
  const generatedMeshPayloads = prepareGeneratedMeshPayloads(mergeById([
    ...readBundleRootAssets(bundleRoot.assets),
    ...readStructuredAssets(options.authoringDocuments),
    ...readStructuredMeshes(options.authoringDocuments),
    ...mergeEnvironmentAssets(mergeAudioAssets(emitted?.assets ?? [], bundleRoot.audio), environment?.assets ?? []),
  ]));
  const assets = generatedMeshPayloads.assets;
  const rootUi = (bundleRoot.ui === undefined ? undefined : emitUi(bundleRoot.ui)) as IUiIr | undefined;
  const ui = mergeUis(rootUi, lifecycleScenes.ui);
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
  const runtimeConfig = ecs?.runtimeConfig ?? readStructuredRuntimeConfig(options.authoringDocuments);
  const prefabs = readStructuredPrefabs(options.authoringDocuments);
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
      runtimeConfig,
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
      ...(prefabs === undefined ? {} : { prefabs: IR_DOCUMENTS.prefabs.fileName }),
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
      ...(prefabs === undefined ? {} : { prefabs: IR_DOCUMENTS.prefabs.fileName }),
      ...(runtimeConfig === undefined ? {} : { runtimeConfig: IR_DOCUMENTS.runtimeConfig.fileName }),
      targetProfile: IR_DOCUMENTS.targetProfile.fileName,
      ...(gltfScene === undefined ? {} : { gltfScene: IR_DOCUMENTS.gltfScene.fileName }),
      ...(ecs === undefined
        ? {}
        : {
            componentSchemas: IR_DOCUMENTS.componentSchemas.fileName,
            eventSchemas: IR_DOCUMENTS.eventSchemas.fileName,
            resourceSchemas: IR_DOCUMENTS.resourceSchemas.fileName,
            ...(ecs.scriptBundle === undefined ? {} : { scripts: IR_DOCUMENTS.scripts.fileName }),
          }),
    },
  };

  const stagingDir = await createEmitStagingDir(outDir);
  try {
    await writeBundleOutput(stagingDir);
    await replaceOutputDirectory(stagingDir, outDir);
  } catch (error) {
    await rm(stagingDir, { force: true, recursive: true });
    throw error;
  }

  return outDir;

  async function writeBundleOutput(targetDir: string): Promise<void> {
    await mkdir(targetDir, { recursive: true });
    await mkdir(resolve(targetDir, "schemas"), { recursive: true });
    await writeGeneratedMeshPayloads(targetDir, generatedMeshPayloads.payloads);
    await writeFile(resolve(targetDir, IR_DOCUMENTS.manifest.fileName), stableJson(manifest));
    await copyAssetFiles(config.projectPath, targetDir, assets);
    await copyExtraAssetFiles(config.projectPath, targetDir, [...(environment?.extraFiles ?? []), ...(overlays?.extraFiles ?? [])]);
    await writeFile(resolve(targetDir, IR_DOCUMENTS.world.fileName), stableJson(world));
    await writeFile(resolve(targetDir, IR_DOCUMENTS.materials.fileName), stableJson(materials));
    await writeFile(resolve(targetDir, IR_DOCUMENTS.assets.fileName), stableJson(assetsManifest));
    await writeFile(resolve(targetDir, IR_DOCUMENTS.targetProfile.fileName), stableJson(targetProfile));
    if (options.authoringGraph !== undefined) {
      await writeFile(resolve(targetDir, AUTHORING_PROVENANCE_FILE), stableJson(authoringProvenanceForEmit()));
    }
    if (environment !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.environmentScene.fileName), stableJson(environment.scene));
    }
    if (ui !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.ui.fileName), stableJson(ui));
    }
    if (overlays !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.overlays.fileName), stableJson(overlays.overlays));
    }
    if (audio !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.audio.fileName), stableJson(audio));
    }
    if (localData !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.localData.fileName), stableJson(localData));
    }
    if (lifecycleScenes.scenes !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.scenes.fileName), stableJson(lifecycleScenes.scenes));
    }
    if (animations !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.animations.fileName), stableJson(animations));
    }
    if (gltfScene !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.gltfScene.fileName), stableJson(gltfScene));
    }
    if (input !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.input.fileName), stableJson(input));
    }
    if (ecs !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.componentSchemas.fileName), stableJson(ecs.componentSchemas));
      await writeFile(resolve(targetDir, IR_DOCUMENTS.resourceSchemas.fileName), stableJson(ecs.resourceSchemas));
      await writeFile(resolve(targetDir, IR_DOCUMENTS.eventSchemas.fileName), stableJson(ecs.eventSchemas));
      await writeFile(resolve(targetDir, IR_DOCUMENTS.systems.fileName), stableJson(ecs.systems));
      if (ecs.scriptBundle !== undefined) {
        await writeFile(resolve(targetDir, IR_DOCUMENTS.scripts.fileName), ecs.scriptBundle);
      }
      if (ecs.scriptManifest !== undefined) {
        await writeFile(resolve(targetDir, SCRIPTS_MANIFEST_FILE), stableJson(ecs.scriptManifest));
      }
    }
    if (runtimeConfig !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.runtimeConfig.fileName), stableJson(runtimeConfig));
    }
    if (prefabs !== undefined) {
      await writeFile(resolve(targetDir, IR_DOCUMENTS.prefabs.fileName), stableJson(prefabs));
    }
  }

  function authoringProvenanceForEmit(): ReturnType<typeof authoringProvenanceDocument> {
    if (options.authoringGraph === undefined) {
      throw new Error("authoringGraph is required to emit authoring provenance.");
    }
    if (options.authoringDocuments === undefined || options.authoringDocuments.length === 0) {
      return authoringProvenanceDocument(options.authoringGraph);
    }
    return buildAuthoringProvenanceDocument(options.authoringGraph, {
      documents: options.authoringDocuments,
      emitted: emittedDocumentsForProvenance(),
    });
  }

  function emittedDocumentsForProvenance(): IAuthoringEmittedDocument[] {
    return [
      { data: manifest, kind: "unknown", path: IR_DOCUMENTS.manifest.fileName },
      { data: world, kind: "entity", path: IR_DOCUMENTS.world.fileName },
      { data: materials, kind: "material", path: IR_DOCUMENTS.materials.fileName },
      { data: assetsManifest, kind: "assets", path: IR_DOCUMENTS.assets.fileName },
      ...(ui === undefined ? [] : [{ data: ui, kind: "ui" as const, path: IR_DOCUMENTS.ui.fileName }]),
      ...(input === undefined ? [] : [{ data: input, kind: "input" as const, path: IR_DOCUMENTS.input.fileName }]),
      ...(prefabs === undefined ? [] : [{ data: prefabs, kind: "prefab" as const, path: IR_DOCUMENTS.prefabs.fileName }]),
      ...(runtimeConfig === undefined ? [] : [{ data: runtimeConfig, kind: "unknown" as const, path: IR_DOCUMENTS.runtimeConfig.fileName }]),
      ...(ecs?.systems === undefined ? [] : [{ data: ecs.systems, kind: "system" as const, path: IR_DOCUMENTS.systems.fileName }]),
      ...(ecs?.scriptBundle === undefined ? [] : [{ data: ecs.scriptBundle, kind: "generated-script" as const, path: IR_DOCUMENTS.scripts.fileName }]),
    ];
  }
}

async function createEmitStagingDir(outDir: string): Promise<string> {
  const parent = dirname(outDir);
  await mkdir(parent, { recursive: true });
  return mkdtemp(resolve(parent, ".tn-emit-"));
}

async function replaceOutputDirectory(stagingDir: string, outDir: string): Promise<void> {
  const backupDir = `${outDir}.previous-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let backedUp = false;
  try {
    await rename(outDir, backupDir);
    backedUp = true;
  } catch (error) {
    if (!isMissingPathError(error)) {
      throw error;
    }
  }

  try {
    await rename(stagingDir, outDir);
  } catch (error) {
    if (backedUp) {
      await rename(backupDir, outDir);
    }
    throw error;
  }

  if (backedUp) {
    await rm(backupDir, { force: true, recursive: true });
  }
}

function isMissingPathError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "ENOENT";
}

interface IBundleRoot {
  assetGroups?: readonly IAssetGroupDeclaration[];
  assets?: readonly (IAssetReference | IAssetModuleDeclaration)[];
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
    && ["assetGroups", "assets", "animations", "audio", "environment", "initialScene", "input", "overlay", "persistence", "scene", "scenes", "ui", "world"].some((key) => key in root)
  );
}

function readStructuredRuntimeConfig(documents: readonly IAuthoringDocument[] | undefined): IRuntimeConfigIr | undefined {
  const data = documents?.find((document) => document.kind === "runtime" && isRecord(document.data))?.data;
  if (!isRecord(data) || !isRecord(data.time) || !isRecord(data.window)) {
    return undefined;
  }
  return {
    schema: IR_SCHEMA_IDS.runtimeConfig,
    version: IR_VERSION,
    ...(isRecord(data.renderer) ? { renderer: cloneRecord(data.renderer) as IRuntimeConfigIr["renderer"] } : {}),
    time: cloneRecord(data.time) as IRuntimeConfigIr["time"],
    window: cloneRecord(data.window) as IRuntimeConfigIr["window"],
  };
}

function readBundleRootAssets(assets: IBundleRoot["assets"]): IInternalAsset[] {
  return (assets ?? []).map((item) => {
    const ref = isAssetModuleDeclaration(item) ? item.asset : item;
    return cloneAssetReference(ref);
  });
}

function readStructuredAssets(documents: readonly IAuthoringDocument[] | undefined): IInternalAsset[] {
  return (documents ?? [])
    .filter((document) => document.kind === "asset" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      if (!Array.isArray(data.assets)) {
        return [];
      }
      return data.assets.flatMap((item) => structuredAsset(item));
    });
}

function structuredAsset(item: unknown): IInternalAsset[] {
  if (!isRecord(item)) {
    return [];
  }
  const id = readString(item.id);
  const type = readString(item.type);
  if (id === undefined) {
    return [];
  }
  if (type === "render-target") {
    const width = readNumber(item.width);
    const height = readNumber(item.height);
    if (width === undefined || height === undefined) {
      return [];
    }
    const usage = readString(item.usage) === "depth" ? "depth" : "color";
    const format = renderTargetFormat(readString(item.format), usage);
    return [{
      format,
      height,
      id,
      kind: "render-target",
      ...(readNumber(item.sampleCount) === undefined ? {} : { sampleCount: readNumber(item.sampleCount) }),
      usage,
      width,
    }];
  }
  const path = readString(item.path);
  const kind = assetKindFromSourceType(type);
  if (path === undefined || kind === undefined) {
    return [];
  }
  const format = inferAssetFormat(kind, path);
  if (format === undefined) {
    return [];
  }
  return [{
    ...(kind === "model" && Array.isArray(item.animations) ? { animations: item.animations.map((entry) => cloneRecord(entry as Record<string, unknown>)) } : {}),
    ...(kind === "model" && isRecord(item.animationGraph) ? { animationGraph: cloneRecord(item.animationGraph) } : {}),
    format,
    id,
    kind,
    path,
    ...(kind === "model" && Array.isArray(item.particleEmitters) ? { particleEmitters: item.particleEmitters.map((entry) => cloneRecord(entry as Record<string, unknown>)) } : {}),
    sourceMode: "bundle",
  }];
}

function readStructuredMeshes(documents: readonly IAuthoringDocument[] | undefined): IInternalAsset[] {
  return (documents ?? [])
    .filter((document) => document.kind === "mesh" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      if (!Array.isArray(data.meshes)) {
        return [];
      }
      return data.meshes.flatMap((item) => structuredMeshAsset(item));
    });
}

function structuredMeshAsset(item: unknown): IInternalAsset[] {
  if (!isRecord(item)) {
    return [];
  }
  const id = readString(item.id);
  const kind = readString(item.kind);
  if (id === undefined) {
    return [];
  }
  if (kind === "primitive") {
    const primitive = readString(item.primitive);
    return primitive === undefined ? [] : [{ format: "generated", id, kind: "mesh", primitive }];
  }
  if (kind !== "custom" || !Array.isArray(item.attributes)) {
    return [];
  }
  return [{
    attributes: item.attributes.map((attribute) => cloneRecord(attribute as Record<string, unknown>)),
    format: "generated",
    id,
    ...(Array.isArray(item.indices) ? { indices: [...item.indices] } : {}),
    kind: "mesh",
    primitive: "custom",
    ...(item.storage === "binary" ? { storage: "binary" } : {}),
  }];
}

function renderTargetFormat(format: string | undefined, usage: "color" | "depth"): "depth24plus" | "rgba16f" | "rgba8" {
  if (format === "rgba16f" || format === "rgba8" || format === "depth24plus") {
    return format;
  }
  return usage === "depth" ? "depth24plus" : "rgba8";
}

function assetKindFromSourceType(type: string | undefined): string | undefined {
  if (type === "model" || type === "texture" || type === "audio" || type === "buffer") {
    return type;
  }
  return undefined;
}

function inferAssetFormat(kind: string, path: string): string | undefined {
  const extension = extname(path).slice(1).toLowerCase();
  if (kind === "model" && (extension === "glb" || extension === "gltf")) {
    return extension;
  }
  if (kind === "texture" && (extension === "png" || extension === "jpeg" || extension === "jpg")) {
    return extension === "jpg" ? "jpeg" : extension;
  }
  if (kind === "audio" && (extension === "mp3" || extension === "ogg" || extension === "wav")) {
    return extension;
  }
  if (kind === "buffer" && extension === "bin") {
    return extension;
  }
  return undefined;
}

function isAssetModuleDeclaration(value: IAssetReference | IAssetModuleDeclaration): value is IAssetModuleDeclaration {
  return isRecord(value) && isRecord(value.asset);
}

function cloneAssetReference(ref: IAssetReference): IInternalAsset {
  return JSON.parse(JSON.stringify(ref)) as IInternalAsset;
}

function readStructuredPrefabs(documents: readonly IAuthoringDocument[] | undefined): IPrefabsIr | undefined {
  const prefabs = (documents ?? [])
    .filter((document) => document.kind === "prefab" && isRecord(document.data))
    .flatMap((document) => {
      const data = document.data as Record<string, unknown>;
      const id = readString(data.id);
      const entities = readPrefabEntities(data.entities);
      if (id === undefined || entities.length === 0) {
        return [];
      }
      return [{
        id,
        entities,
        root: entities[0]!.id,
      }];
    })
    .sort((left, right) => left.id.localeCompare(right.id));

  if (prefabs.length === 0) {
    return undefined;
  }
  return {
    schema: IR_SCHEMA_IDS.prefabs,
    version: IR_VERSION,
    prefabs,
  };
}

function readPrefabEntities(value: unknown): IPrefabsIr["prefabs"][number]["entities"] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    const id = readString(item.id);
    if (id === undefined) {
      return [];
    }
    const components = isRecord(item.components) ? cloneRecord(item.components) : {};
    return [{ id, components }];
  });
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cloneRecord(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ILifecycleSceneEmitResult {
  ecsEmits: IEcsEmitResult[];
  input?: IInputIr;
  sceneEmits: ReturnType<typeof sceneToWorld>[];
  scenes?: IScenesIr;
  ui?: IUiIr;
}

function emitLifecycleScenes(projectPath: string, scenes: readonly ISceneLifecycleDeclaration[] | undefined, initialScene: string | undefined): ILifecycleSceneEmitResult {
  if (scenes === undefined) {
    return { ecsEmits: [], sceneEmits: [] };
  }
  const sceneEmits: ReturnType<typeof sceneToWorld>[] = [];
  const ecsEmits: IEcsEmitResult[] = [];
  const inputEmits: IInputIr[] = [];
  const uiEmits: IUiIr[] = [];
  const sceneEntries = scenes.map((scene) => {
    const visualEmit = scene.visual === undefined ? undefined : sceneToWorld(scene.visual);
    const ecsEmit = scene.world === undefined ? undefined : ecsToIr(scene.world, { projectPath });
    const inputEmit = scene.input === undefined ? undefined : inputToIr(scene.input);
    const uiEmit = scene.ui === undefined ? undefined : emitUi(scene.ui as IUiElement) as IUiIr;
    if (visualEmit !== undefined) {
      sceneEmits.push(visualEmit);
    }
    if (ecsEmit !== undefined) {
      ecsEmits.push(ecsEmit);
    }
    if (inputEmit !== undefined) {
      inputEmits.push(inputEmit);
    }
    if (uiEmit !== undefined) {
      uiEmits.push(uiEmit);
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
      ...emitSceneScopes(inputEmit, ecsEmit, uiEmit),
      ...emitScenePersistence(scene.persistence),
      ...emitSceneTransitions(scene.transitions),
    };
  });
  return {
    ecsEmits,
    input: inputEmits.reduce((merged, current) => mergeInputs(merged, current), undefined as IInputIr | undefined),
    sceneEmits,
    scenes: {
      schema: IR_SCHEMA_IDS.scenes,
      version: IR_VERSION,
      initialScene: initialScene ?? scenes[0]?.id ?? "",
      scenes: sceneEntries,
    },
    ui: uiEmits.reduce((merged, current) => mergeUis(merged, current), undefined as IUiIr | undefined),
  };
}

function emitSceneScopes(
  input: IInputIr | undefined,
  ecs: IEcsEmitResult | undefined,
  ui: IUiIr | undefined,
): Pick<IScenesIr["scenes"][number], "input" | "systems" | "ui"> {
  const inputId = input === undefined ? undefined : scopedInputId(input);
  return {
    ...(inputId === undefined ? {} : { input: inputId }),
    ...(ecs === undefined || ecs.systems.systems.length === 0
      ? {}
      : { systems: ecs.systems.systems.map((system) => system.name).sort((left, right) => left.localeCompare(right)) }),
    ...(ui === undefined ? {} : { ui: [ui.root.id] }),
  };
}

function scopedInputId(input: IInputIr): string | undefined {
  const ids = [
    ...input.actions.map((action) => action.id),
    ...input.axes.map((axis) => axis.id),
  ].sort((left, right) => left.localeCompare(right));
  return ids[0];
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
      scriptManifest: mergeScriptManifests(merged.scriptManifest, current.scriptManifest),
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

function mergeScriptManifests(left: IEcsEmitResult["scriptManifest"], right: IEcsEmitResult["scriptManifest"]): IEcsEmitResult["scriptManifest"] {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return {
    schema: "threenative.scripts",
    version: "0.1.0",
    artifacts: [{ generated: true, path: "scripts.bundle.js", source: false }],
    systems: [...left.systems, ...right.systems].sort((a, b) => a.systemId.localeCompare(b.systemId)),
  };
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
    ...mergeControlsSettings(left, right),
    ...mergePersistedBindingOverrides(left, right),
  };
}

function mergeUis(left: IUiIr | undefined, right: IUiIr | undefined): IUiIr | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  const wrapperId = uniqueUiId([left.root, right.root], "ui.scope.root");
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    ...mergeUiMetadata(left, right),
    root: {
      children: [left.root, right.root].sort((a, b) => a.id.localeCompare(b.id)),
      id: wrapperId,
      kind: "stack",
    },
  };
}

function uniqueUiId(nodes: readonly IUiIr["root"][], preferred: string): string {
  const used = new Set(nodes.flatMap((node) => collectUiNodeIds(node)));
  if (!used.has(preferred)) {
    return preferred;
  }
  let index = 1;
  while (used.has(`${preferred}.${index}`)) {
    index += 1;
  }
  return `${preferred}.${index}`;
}

function collectUiNodeIds(node: IUiIr["root"]): string[] {
  return [node.id, ...(node.children ?? []).flatMap((child) => collectUiNodeIds(child))];
}

function mergePersistedBindingOverrides(left: IInputIr, right: IInputIr): Pick<IInputIr, "persistedBindingOverrides"> {
  const persistedBindingOverrides = mergeByInputOverrideKey([...(left.persistedBindingOverrides ?? []), ...(right.persistedBindingOverrides ?? [])]);
  return persistedBindingOverrides.length === 0 ? {} : { persistedBindingOverrides };
}

function mergeControlsSettings(left: IInputIr, right: IInputIr): Pick<IInputIr, "controlsSettings"> {
  const controlsSettings = right.controlsSettings ?? left.controlsSettings;
  return controlsSettings === undefined ? {} : { controlsSettings };
}

function mergeByInputOverrideKey<T extends { actionOrAxisId: string; axisSlot?: string; control: string; device: string; profileId: string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [inputOverrideKey(item), item])).values()].sort((left, right) =>
    inputOverrideKey(left).localeCompare(inputOverrideKey(right)),
  );
}

function inputOverrideKey(item: { actionOrAxisId: string; axisSlot?: string; control: string; device: string; profileId: string }): string {
  return `${item.profileId}\0${item.actionOrAxisId}\0${item.axisSlot ?? ""}\0${item.device}\0${item.control}`;
}

function mergeUiMetadata(left: IUiIr, right: IUiIr): Omit<IUiIr, "root" | "schema" | "version"> {
  return {
    ...mergeUiFonts(left, right),
    ...mergeUiFocusOrder(left, right),
    ...mergeUiInputActions(left, right),
    ...mergeUiSafeArea(left, right),
  };
}

function mergeUiFonts(left: IUiIr, right: IUiIr): Pick<IUiIr, "fonts"> {
  const fonts = mergeByUiFontKey([...(left.fonts ?? []), ...(right.fonts ?? [])]);
  return fonts.length === 0 ? {} : { fonts };
}

function mergeByUiFontKey<T extends { asset: string; family: string; style?: string; weight?: number | string }>(items: T[]): T[] {
  return [...new Map(items.map((item) => [uiFontKey(item), item])).values()].sort((left, right) => uiFontKey(left).localeCompare(uiFontKey(right)));
}

function uiFontKey(item: { asset: string; family: string; style?: string; weight?: number | string }): string {
  return `${item.family}\0${item.weight ?? ""}\0${item.style ?? ""}\0${item.asset}`;
}

function mergeUiFocusOrder(left: IUiIr, right: IUiIr): Pick<IUiIr, "focusOrder"> {
  const focusOrder = sortUnique([...(left.focusOrder ?? []), ...(right.focusOrder ?? [])]);
  return focusOrder.length === 0 ? {} : { focusOrder };
}

function mergeUiInputActions(left: IUiIr, right: IUiIr): Pick<IUiIr, "inputActions"> {
  const inputActions = right.inputActions ?? left.inputActions;
  return inputActions === undefined ? {} : { inputActions };
}

function mergeUiSafeArea(left: IUiIr, right: IUiIr): Pick<IUiIr, "safeArea"> {
  const safeArea = right.safeArea ?? left.safeArea;
  return safeArea === undefined ? {} : { safeArea };
}

function sortUnique(values: readonly string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
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
