import { resolve } from "node:path";
import {
  IR_DOCUMENTS,
  IR_SCHEMA_IDS,
  IR_VERSION,
  normalizeDistribution,
  validateDistribution,
  validateDistributionProjectPaths,
  type IAssetsManifest,
  type IAnimationsIr,
  type IDistributionSource,
  type IAudioIr,
  type IBundleManifest,
  type IGltfSceneMetadataIr,
  type IInputIr,
  type ILocalDataIr,
  type IMaterialIr,
  type IMaterialsIr,
  type IScenesIr,
  type ISceneTransitionIr,
  type ITargetProfile,
  type IUiIr,
  type IUiNodeIr,
  type IWorldIr,
} from "@threenative/ir";
import { normalizeKeyboardCodeAlias } from "@threenative/ir/input";
import type { IAuthoringDocument } from "@threenative/authoring";
import { type IAnimationsDeclaration, type IAssetGroupDeclaration, type IAssetModuleDeclaration, type IAssetReference, type IAudioDeclaration, type IInputMapDeclaration, type IOverlayDeclaration, type IPersistenceDeclaration, type ISceneAudioDeclaration, type ISceneLifecycleDeclaration, type World } from "@threenative/sdk";
import { type IUiElement } from "@threenative/ui";

import { type IProjectConfig } from "../config.js";
import type { IAuthoringGraph } from "../authoring/graph.js";
import { authoringProvenanceDocument, buildAuthoringProvenanceDocument, type IAuthoringEmittedDocument } from "../authoring/provenance.js";
import { planAssetCopies, type IAssetCopy, type IInternalAsset } from "./asset-copy.js";
import { emitAudio } from "./audio.js";
import { writeBundlePlan } from "./bundle-writer.js";
import { deriveRequiredCapabilities } from "./capabilities.js";
import { ecsToIr, type IEcsEmitResult } from "./ecs.js";
import { emitEnvironment, type IEnvironmentDeclaration } from "./environment.js";
import { inputToIr } from "./input.js";
import { emitPersistence } from "./persistence.js";
import { emitOverlays, emitStructuredOverlays, validateOverlaySystemEventDrift } from "../overlay/emit.js";
import { sceneToWorld, throwGeneratedLodAssetIdCollision } from "./scene-to-world.js";
import {
  readBundleRootAssets,
  readStructuredAssets,
  readStructuredDistribution,
  readStructuredGameFlow,
  readStructuredInteractions,
  readStructuredMaterials,
  readStructuredMeshes,
  readStructuredPersistence,
  readStructuredPrefabs,
  readStructuredRuntimeConfig,
  readStructuredSchemaFiles,
  readStructuredSequences,
  readStructuredTargetProfile,
} from "./structured-documents.js";
import { emitUi } from "./ui.js";
import { extractGltfSceneMetadata } from "../gltf/metadata.js";
import { applyBakedProbeContent } from "../bake/bakedProbeContent.js";
import type { ICompilerDiagnostic } from "../diagnostics.js";

export interface IEmitBundleOptions {
  authoringDocuments?: readonly IAuthoringDocument[];
  authoringGraph?: IAuthoringGraph;
}

export async function emitBundle(config: IProjectConfig, root: unknown, options: IEmitBundleOptions = {}): Promise<string> {
  return (await emitBundleWithReport(config, root, options)).bundlePath;
}

export async function emitBundleWithReport(config: IProjectConfig, root: unknown, options: IEmitBundleOptions = {}): Promise<{ bundlePath: string; diagnostics: ICompilerDiagnostic[] }> {
  const outDir = resolve(config.projectPath, config.outDir);
  const plan = await planBundle(config, root, options);
  return { bundlePath: await writeBundlePlan(plan, config.projectPath, outDir), diagnostics: [...(plan.diagnostics ?? [])] };
}

export interface IBundlePlan {
  assetFiles: readonly IAssetCopy[];
  assets: readonly IInternalAsset[];
  documents: IBundlePlanDocuments;
  diagnostics?: readonly ICompilerDiagnostic[];
  extraAssetFiles: readonly IAssetCopy[];
  generatedMeshPayloads: readonly IGeneratedMeshPayload[];
  manifest: IBundleManifest;
}

export interface IBundlePlanDocuments {
  assetsManifest: IAssetsManifest;
  audio?: ReturnType<typeof emitAudio>;
  animations?: IAnimationsIr;
  authoringProvenance?: ReturnType<typeof authoringProvenanceDocument>;
  componentSchemas?: IEcsEmitResult["componentSchemas"];
  distribution?: IDistributionSource;
  environmentScene?: Awaited<ReturnType<typeof emitEnvironment>>["scene"];
  eventSchemas?: IEcsEmitResult["eventSchemas"];
  gameFlow?: ReturnType<typeof readStructuredGameFlow>;
  gltfScene?: IGltfSceneMetadataIr;
  input?: IInputIr;
  interactions?: ReturnType<typeof readStructuredInteractions>;
  localData?: ILocalDataIr;
  materials: IMaterialsIr;
  overlays?: Awaited<ReturnType<typeof emitOverlays>>["overlays"];
  prefabs?: ReturnType<typeof readStructuredPrefabs>;
  resourceSchemas?: IEcsEmitResult["resourceSchemas"];
  runtimeConfig?: ReturnType<typeof readStructuredRuntimeConfig>;
  scenes?: IScenesIr;
  scriptBundle?: string;
  scriptManifest?: IEcsEmitResult["scriptManifest"];
  sequences?: ReturnType<typeof readStructuredSequences>;
  systems?: IEcsEmitResult["systems"];
  targetProfile: ITargetProfile;
  ui?: IUiIr;
  world?: IWorldIr;
}

export async function planBundle(config: IProjectConfig, root: unknown, options: IEmitBundleOptions = {}): Promise<IBundlePlan> {
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
  const structuredInput = readStructuredInput(options.authoringDocuments);
  const input = mergeInputs(mergeInputs(rootInput, structuredInput), lifecycleScenes.input);
  const rootAudio = bundleRoot.audio === undefined ? undefined : emitAudio(bundleRoot.audio);
  const structuredAudio = readStructuredAudio(options.authoringDocuments);
  if (rootAudio !== undefined && structuredAudio !== undefined) throw new Error("TN_COMPILER_AUDIO_DUPLICATE: declare audio in either the TypeScript root or structured source, not both.");
  const audio = rootAudio ?? structuredAudio;
  const rootLocalData = bundleRoot.persistence === undefined ? undefined : emitPersistence(bundleRoot.persistence);
  const structuredLocalData = readStructuredPersistence(options.authoringDocuments);
  if (rootLocalData !== undefined && structuredLocalData !== undefined) throw new Error("TN_COMPILER_PERSISTENCE_DUPLICATE: declare persistence in either the TypeScript root or structured source, not both.");
  const localData = rootLocalData ?? structuredLocalData;
  const animations = bundleRoot.animations === undefined ? undefined : emitAnimations(bundleRoot.animations);
  const authoredAssets = mergeById([
    ...readBundleRootAssets(bundleRoot.assets),
    ...readStructuredAssets(options.authoringDocuments),
    ...readStructuredMeshes(options.authoringDocuments),
  ]);
  const environment = bundleRoot.environment === undefined ? undefined : await emitEnvironment(config.projectPath, bundleRoot.environment, { assets: authoredAssets });
  const rootOverlays = bundleRoot.overlay === undefined ? undefined : await emitOverlays(config.projectPath, bundleRoot.overlay);
  const structuredOverlays = await emitStructuredOverlays(config.projectPath, options.authoringDocuments);
  if (rootOverlays !== undefined && structuredOverlays !== undefined) throw new Error("TN_COMPILER_OVERLAY_DUPLICATE: declare overlays in either the TypeScript root or structured source, not both.");
  const overlays = rootOverlays ?? structuredOverlays;
  if (overlays !== undefined && ecs !== undefined) validateOverlaySystemEventDrift(overlays.overlays, ecs.systems);
  assertNoBundleGeneratedLodAssetIdCollisions(
    emitted?.generatedLodAssetIds ?? [],
    emitted?.assets ?? [],
    [
      ...authoredAssets,
      ...mergeAudioAssets([], bundleRoot.audio),
      ...(environment?.assets ?? []),
    ],
  );
  const generatedMeshPayloads = prepareGeneratedMeshPayloads(mergeById([
    ...authoredAssets,
    ...mergeEnvironmentAssets(mergeAudioAssets(emitted?.assets ?? [], bundleRoot.audio), environment?.assets ?? []),
  ]));
  const assets = generatedMeshPayloads.assets;
  const rootUi = (bundleRoot.ui === undefined ? undefined : emitUi(bundleRoot.ui)) as IUiIr | undefined;
  const structuredUi = readStructuredUi(options.authoringDocuments);
  const ui = mergeUis(mergeUis(rootUi, structuredUi), lifecycleScenes.ui);
  const world = mergeWorlds(emitted?.world, ecs?.world);
  const materials: IMaterialsIr = {
    schema: IR_SCHEMA_IDS.materials,
    version: IR_VERSION,
    materials: mergeById([
      ...((emitted?.materials ?? []) as unknown as IMaterialIr[]),
      ...readStructuredMaterials(options.authoringDocuments),
    ]),
  };
  const assetsManifest: IAssetsManifest = {
    schema: IR_SCHEMA_IDS.assets,
    version: IR_VERSION,
    assets: assets.map(stripInternalAssetFields) as IAssetsManifest["assets"],
    groups: assetGroups(assets, bundleRoot.assetGroups),
  };
  const bakedProbeContent = environment === undefined
    ? { diagnostics: [] as ICompilerDiagnostic[], environment: undefined }
    : await applyBakedProbeContent(config.projectPath, world ?? { entities: [], schema: IR_SCHEMA_IDS.world, version: IR_VERSION }, materials, environment.scene, assetsManifest);
  if (environment !== undefined && bakedProbeContent.environment !== undefined) environment.scene = bakedProbeContent.environment;
  const gltfScene: IGltfSceneMetadataIr | undefined = await extractGltfSceneMetadata(config.projectPath, assets);
  const runtimeConfig = ecs?.runtimeConfig ?? readStructuredRuntimeConfig(options.authoringDocuments);
  const structuredSchemas = readStructuredSchemaFiles(options.authoringDocuments);
  const componentSchemas = mergeOptionalSchemaFiles(ecs?.componentSchemas, structuredSchemas.componentSchemas);
  const eventSchemas = mergeOptionalSchemaFiles(ecs?.eventSchemas, structuredSchemas.eventSchemas);
  const resourceSchemas = mergeOptionalSchemaFiles(ecs?.resourceSchemas, structuredSchemas.resourceSchemas);
  const prefabs = readStructuredPrefabs(options.authoringDocuments);
  const gameFlow = readStructuredGameFlow(options.authoringDocuments);
  const interactions = readStructuredInteractions(options.authoringDocuments);
  const sequences = readStructuredSequences(options.authoringDocuments);
  const structuredTargetProfile = readStructuredTargetProfile(options.authoringDocuments);
  const targetBudgets = structuredTargetProfile?.budgets ?? environment?.budgets;
  const targetPerformance = structuredTargetProfile?.performance ?? environment?.performance;
  const targetProfile: ITargetProfile = {
    schema: IR_SCHEMA_IDS.targetProfile,
    version: IR_VERSION,
    targets: structuredTargetProfile?.targets ?? ["web", "desktop"],
    ...(targetBudgets === undefined ? {} : { budgets: targetBudgets }),
    ...(targetPerformance === undefined ? {} : { performance: targetPerformance }),
  };
  const distributionSource = readStructuredDistribution(options.authoringDocuments);
  let distribution: IDistributionSource | undefined;
  if (distributionSource !== undefined) {
    const distributionDiagnostics = [
      ...validateDistribution(distributionSource, "distribution.ir.json", targetProfile),
      ...await validateDistributionProjectPaths(distributionSource, config.projectPath, "distribution.ir.json"),
    ];
    if (distributionDiagnostics.length > 0) {
      const first = distributionDiagnostics[0]!;
      throw new Error(`${first.code}: ${first.message} (${first.path})`);
    }
    distribution = normalizeDistribution(distributionSource);
  }
  const manifest: IBundleManifest = {
    schema: IR_SCHEMA_IDS.bundle,
    version: IR_VERSION,
    name: "threenative-game",
    requiredCapabilities: deriveRequiredCapabilities({
      assets: assetsManifest,
      audio,
      animations,
      componentSchemas,
      environment: environment?.scene,
      eventSchemas,
      gameFlow,
      input,
      interactions,
      localData,
      materials,
      overlays: overlays?.overlays,
      resourceSchemas,
      runtimeConfig,
      scenes: lifecycleScenes.scenes,
      sequences,
      systems: ecs?.systems,
      ui,
      world,
    }),
    entry: {
      ...(audio === undefined ? {} : { audio: IR_DOCUMENTS.audio.fileName }),
      ...(animations === undefined ? {} : { animations: IR_DOCUMENTS.animations.fileName }),
      ...(environment === undefined ? {} : { environmentScene: IR_DOCUMENTS.environmentScene.fileName }),
      ...(gameFlow === undefined ? {} : { gameFlow: IR_DOCUMENTS.gameFlow.fileName }),
      ...(interactions === undefined ? {} : { interactions: IR_DOCUMENTS.interactions.fileName }),
      ...(localData === undefined ? {} : { localData: IR_DOCUMENTS.localData.fileName }),
      ...(prefabs === undefined ? {} : { prefabs: IR_DOCUMENTS.prefabs.fileName }),
      ...(lifecycleScenes.scenes === undefined ? {} : { scenes: IR_DOCUMENTS.scenes.fileName }),
      ...(sequences === undefined ? {} : { sequences: IR_DOCUMENTS.sequences.fileName }),
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: IR_DOCUMENTS.scripts.fileName }),
      ...(ecs === undefined ? {} : { systems: IR_DOCUMENTS.systems.fileName }),
      ...(overlays === undefined ? {} : { overlays: IR_DOCUMENTS.overlays.fileName }),
      ...(ui === undefined ? {} : { ui: IR_DOCUMENTS.ui.fileName }),
      world: IR_DOCUMENTS.world.fileName,
    },
    files: {
      assets: IR_DOCUMENTS.assets.fileName,
      ...(distribution === undefined ? {} : { distribution: IR_DOCUMENTS.distribution.fileName }),
      ...(animations === undefined ? {} : { animations: IR_DOCUMENTS.animations.fileName }),
      ...(input === undefined ? {} : { input: IR_DOCUMENTS.input.fileName }),
      ...(localData === undefined ? {} : { localData: IR_DOCUMENTS.localData.fileName }),
      materials: IR_DOCUMENTS.materials.fileName,
      ...(prefabs === undefined ? {} : { prefabs: IR_DOCUMENTS.prefabs.fileName }),
      ...(runtimeConfig === undefined ? {} : { runtimeConfig: IR_DOCUMENTS.runtimeConfig.fileName }),
      targetProfile: IR_DOCUMENTS.targetProfile.fileName,
      ...(gltfScene === undefined ? {} : { gltfScene: IR_DOCUMENTS.gltfScene.fileName }),
      ...(eventSchemas === undefined ? {} : { eventSchemas: IR_DOCUMENTS.eventSchemas.fileName }),
      ...(ecs?.scriptBundle === undefined ? {} : { scripts: IR_DOCUMENTS.scripts.fileName }),
      ...(componentSchemas === undefined ? {} : { componentSchemas: IR_DOCUMENTS.componentSchemas.fileName }),
      ...(resourceSchemas === undefined ? {} : { resourceSchemas: IR_DOCUMENTS.resourceSchemas.fileName }),
    },
  };

  const documents: IBundlePlanDocuments = {
    assetsManifest,
    ...(audio === undefined ? {} : { audio }),
    ...(animations === undefined ? {} : { animations }),
    ...(componentSchemas === undefined ? {} : { componentSchemas }),
    ...(distribution === undefined ? {} : { distribution }),
    ...(environment === undefined ? {} : { environmentScene: environment.scene }),
    ...(eventSchemas === undefined ? {} : { eventSchemas }),
    ...(ecs === undefined ? {} : { systems: ecs.systems }),
    ...(gameFlow === undefined ? {} : { gameFlow }),
    ...(gltfScene === undefined ? {} : { gltfScene }),
    ...(input === undefined ? {} : { input }),
    ...(interactions === undefined ? {} : { interactions }),
    ...(localData === undefined ? {} : { localData }),
    materials,
    ...(overlays === undefined ? {} : { overlays: overlays.overlays }),
    ...(prefabs === undefined ? {} : { prefabs }),
    ...(resourceSchemas === undefined ? {} : { resourceSchemas }),
    ...(runtimeConfig === undefined ? {} : { runtimeConfig }),
    ...(lifecycleScenes.scenes === undefined ? {} : { scenes: lifecycleScenes.scenes }),
    ...(ecs?.scriptBundle === undefined ? {} : { scriptBundle: ecs.scriptBundle }),
    ...(ecs?.scriptManifest === undefined ? {} : { scriptManifest: ecs.scriptManifest }),
    ...(sequences === undefined ? {} : { sequences }),
    targetProfile,
    ...(ui === undefined ? {} : { ui }),
    ...(world === undefined ? {} : { world }),
  };
  const authoringProvenance = options.authoringGraph === undefined ? undefined : authoringProvenanceForEmit(documents);

  return {
    assetFiles: await planAssetCopies(config.projectPath, assets),
    assets,
    documents: {
      ...documents,
      ...(authoringProvenance === undefined ? {} : { authoringProvenance }),
    },
    ...(bakedProbeContent.diagnostics.length === 0 ? {} : { diagnostics: bakedProbeContent.diagnostics }),
    extraAssetFiles: [...(environment?.extraFiles ?? []), ...(overlays?.extraFiles ?? [])],
    generatedMeshPayloads: generatedMeshPayloads.payloads,
    manifest,
  };

  function authoringProvenanceForEmit(documentsForEmit: IBundlePlanDocuments): ReturnType<typeof authoringProvenanceDocument> {
    if (options.authoringGraph === undefined) {
      throw new Error("authoringGraph is required to emit authoring provenance.");
    }
    if (options.authoringDocuments === undefined || options.authoringDocuments.length === 0) {
      return authoringProvenanceDocument(options.authoringGraph);
    }
    return buildAuthoringProvenanceDocument(options.authoringGraph, {
      documents: options.authoringDocuments,
      emitted: emittedDocumentsForProvenance(documentsForEmit),
    });
  }

  function emittedDocumentsForProvenance(documentsForEmit: IBundlePlanDocuments): IAuthoringEmittedDocument[] {
    return [
      { data: manifest, kind: "unknown", path: IR_DOCUMENTS.manifest.fileName },
      { data: documentsForEmit.world, kind: "entity", path: IR_DOCUMENTS.world.fileName },
      { data: documentsForEmit.materials, kind: "material", path: IR_DOCUMENTS.materials.fileName },
      { data: documentsForEmit.assetsManifest, kind: "assets", path: IR_DOCUMENTS.assets.fileName },
      ...(documentsForEmit.ui === undefined ? [] : [{ data: documentsForEmit.ui, kind: "ui" as const, path: IR_DOCUMENTS.ui.fileName }]),
      ...(documentsForEmit.input === undefined ? [] : [{ data: documentsForEmit.input, kind: "input" as const, path: IR_DOCUMENTS.input.fileName }]),
      ...(documentsForEmit.interactions === undefined ? [] : [{ data: documentsForEmit.interactions, kind: "interaction" as const, path: IR_DOCUMENTS.interactions.fileName }]),
      ...(documentsForEmit.prefabs === undefined ? [] : [{ data: documentsForEmit.prefabs, kind: "prefab" as const, path: IR_DOCUMENTS.prefabs.fileName }]),
      ...(documentsForEmit.runtimeConfig === undefined ? [] : [{ data: documentsForEmit.runtimeConfig, kind: "unknown" as const, path: IR_DOCUMENTS.runtimeConfig.fileName }]),
      ...(documentsForEmit.systems === undefined ? [] : [{ data: documentsForEmit.systems, kind: "system" as const, path: IR_DOCUMENTS.systems.fileName }]),
      ...(documentsForEmit.scriptBundle === undefined ? [] : [{ data: documentsForEmit.scriptBundle, kind: "generated-script" as const, path: IR_DOCUMENTS.scripts.fileName }]),
    ];
  }
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

function readStructuredInput(documents: readonly IAuthoringDocument[] | undefined): IInputIr | undefined {
  const inputDocuments = (documents ?? []).filter((document) => document.kind === "input" && isRecord(document.data));
  if (inputDocuments.length === 0) {
    return undefined;
  }
  const actions = mergeById(inputDocuments.flatMap((document) => readStructuredInputActions(document.data as Record<string, unknown>)));
  const axes = mergeById(inputDocuments.flatMap((document) => readStructuredInputAxes(document.data as Record<string, unknown>)));
  const controlsSettings = inputDocuments.map((document) => readStructuredControlsSettings(document.data as Record<string, unknown>)).find((settings): settings is NonNullable<IInputIr["controlsSettings"]> => settings !== undefined);
  const persistedBindingOverrides = inputDocuments.flatMap((document) => readStructuredInputOverrides(document.data as Record<string, unknown>));
  return {
    schema: IR_SCHEMA_IDS.input,
    version: IR_VERSION,
    actions,
    axes,
    ...(controlsSettings === undefined ? {} : { controlsSettings }),
    ...(persistedBindingOverrides.length === 0 ? {} : { persistedBindingOverrides: persistedBindingOverrides.sort((left, right) => inputOverrideSortKey(left).localeCompare(inputOverrideSortKey(right))) }),
  };
}

function readStructuredAudio(documents: readonly IAuthoringDocument[] | undefined): IAudioIr | undefined {
  const sounds = mergeById((documents ?? [])
    .filter((document) => document.kind === "audio" && isRecord(document.data))
    .flatMap((document) => readRecordList((document.data as Record<string, unknown>).sounds))
    .map((sound) => ({ asset: readString(sound.asset) ?? "", id: readString(sound.id) ?? "" }))
    .filter((sound) => sound.asset !== "" && sound.id !== ""));
  if (sounds.length === 0) return undefined;
  return {
    schema: IR_SCHEMA_IDS.audio,
    version: IR_VERSION,
    music: sounds.filter((sound) => sound.id.startsWith("music.")).map((sound) => ({ ...sound, autoplay: false, loop: true })),
    oneShots: sounds.filter((sound) => !sound.id.startsWith("music.")).map((sound) => ({ ...sound, event: sound.id })),
  };
}

function readStructuredInputActions(data: Record<string, unknown>): IInputIr["actions"] {
  return readRecordList(data.actions)
    .map((action) => ({
      id: readString(action.id) ?? "",
      bindings: readStringList(action.bindings).map(parseSourceInputBinding),
    }))
    .filter((action) => action.id !== "");
}

function readStructuredInputAxes(data: Record<string, unknown>): IInputIr["axes"] {
  return readRecordList(data.axes)
    .map((axis) => ({
      id: readString(axis.id) ?? "",
      negative: readStringList(axis.negative).map(parseSourceInputBinding),
      positive: readStringList(axis.positive).map(parseSourceInputBinding),
      ...(readString(axis.value) === undefined ? {} : { value: parseSourceInputBinding(readString(axis.value) ?? "") }),
    }))
    .filter((axis) => axis.id !== "");
}

function readStructuredControlsSettings(data: Record<string, unknown>): IInputIr["controlsSettings"] | undefined {
  if (!isRecord(data.controlsSettings)) {
    return undefined;
  }
  const profileId = readString(data.controlsSettings.profileId);
  if (profileId === undefined) {
    return undefined;
  }
  return {
    profileId,
    rows: readRecordList(data.controlsSettings.rows)
      .map((row) => ({
        actionOrAxisId: readString(row.actionOrAxisId) ?? "",
        ...(readString(row.axisSlot) === undefined ? {} : { axisSlot: readString(row.axisSlot) as NonNullable<IInputIr["controlsSettings"]>["rows"][number]["axisSlot"] }),
        ...(readString(row.captureState) === undefined ? {} : { captureState: readString(row.captureState) as NonNullable<IInputIr["controlsSettings"]>["rows"][number]["captureState"] }),
        defaultBindings: readStringList(row.defaultBindings).map(parseSourceInputBinding),
        kind: readString(row.kind) as NonNullable<IInputIr["controlsSettings"]>["rows"][number]["kind"],
        ...(readString(row.uiNodeId) === undefined ? {} : { uiNodeId: readString(row.uiNodeId) }),
      }))
      .filter((row) => row.actionOrAxisId !== "" && (row.kind === "action" || row.kind === "axis"))
      .sort((left, right) => `${left.kind}:${left.actionOrAxisId}:${left.axisSlot ?? ""}`.localeCompare(`${right.kind}:${right.actionOrAxisId}:${right.axisSlot ?? ""}`)),
  };
}

function readStructuredInputOverrides(data: Record<string, unknown>): NonNullable<IInputIr["persistedBindingOverrides"]> {
  return readRecordList(data.persistedBindingOverrides)
    .map((override) => ({
      actionOrAxisId: readString(override.actionOrAxisId) ?? "",
      ...(readString(override.axisSlot) === undefined ? {} : { axisSlot: readString(override.axisSlot) as NonNullable<IInputIr["persistedBindingOverrides"]>[number]["axisSlot"] }),
      control: readString(override.device) === "keyboard" ? normalizeKeyboardCodeAlias(readString(override.control) ?? "") : readString(override.control) ?? "",
      ...(readNumber(override.deadzone) === undefined ? {} : { deadzone: readNumber(override.deadzone) }),
      device: readString(override.device) as NonNullable<IInputIr["persistedBindingOverrides"]>[number]["device"],
      ...(readStringList(override.modifiers).length === 0 ? {} : { modifiers: readStringList(override.modifiers).sort() }),
      profileId: readString(override.profileId) ?? "",
      ...(readNumber(override.scale) === undefined ? {} : { scale: readNumber(override.scale) }),
      updatedAt: readString(override.updatedAt) ?? "",
    }))
    .filter((override) => override.actionOrAxisId !== "" && override.control !== "" && override.profileId !== "" && override.updatedAt !== "" && ["gamepad", "keyboard", "pointer", "touch"].includes(override.device));
}

function readStructuredUi(documents: readonly IAuthoringDocument[] | undefined): IUiIr | undefined {
  const standaloneSources = (documents ?? []).flatMap((document) => document.kind === "ui" && isRecord(document.data) ? [document.data] : []);
  const standaloneNodeIds = new Set(standaloneSources.flatMap((source) => structuredUiNodeIds(readRecordList(source.nodes))));
  const sceneSources = (documents ?? []).flatMap((document) => {
    if (document.kind !== "scene" || !isRecord(document.data) || !isRecord(document.data.ui)) {
      return [];
    }
    const nodes = filterStructuredUiNodes(readRecordList(document.data.ui.nodes), standaloneNodeIds);
    return nodes.length === 0 ? [] : [{ id: `${readString(document.data.id) ?? "scene"}.ui`, ...document.data.ui, nodes }];
  });
  const uiSources = [...standaloneSources, ...sceneSources];
  if (uiSources.length === 0) {
    return undefined;
  }
  return uiSources
    .map((data) => structuredUiDocument(data))
    .reduce((merged, current) => mergeUis(merged, current), undefined as IUiIr | undefined);
}

function structuredUiNodeIds(nodes: readonly Record<string, unknown>[]): string[] {
  return nodes.flatMap((node) => [
    ...(readString(node.id) === undefined ? [] : [readString(node.id)!]),
    ...structuredUiNodeIds(readRecordList(node.children)),
  ]);
}

function filterStructuredUiNodes(nodes: readonly Record<string, unknown>[], excluded: ReadonlySet<string>): Record<string, unknown>[] {
  return nodes.flatMap((node) => {
    const id = readString(node.id);
    if (id !== undefined && excluded.has(id)) {
      return [];
    }
    const children = filterStructuredUiNodes(readRecordList(node.children), excluded);
    return [{ ...node, ...(Array.isArray(node.children) ? { children } : {}) }];
  });
}

function structuredUiDocument(data: Record<string, unknown>): IUiIr {
  const id = readString(data.id) ?? "ui";
  const bindings = readStructuredUiBindings(data);
  const nodes = readRecordList(data.nodes).flatMap((node) => structuredUiNode(node));
  const boundNodes = nodes.map((node) => applyStructuredUiBindings(node, bindings));
  const root: IUiNodeIr = nodes.length === 1
    ? boundNodes[0] ?? { id: `${id}.root`, kind: "stack" }
    : { children: boundNodes, id: `${id}.root`, kind: "stack" };
  return {
    schema: IR_SCHEMA_IDS.ui,
    version: IR_VERSION,
    root,
  };
}

function readStructuredUiBindings(data: Record<string, unknown>): Map<string, IUiNodeIr["binding"]> {
  const bindings = new Map<string, IUiNodeIr["binding"]>();
  for (const binding of readRecordList(data.bindings)) {
    const node = readString(binding.node);
    const resource = readString(binding.resource);
    if (node === undefined || resource === undefined) {
      continue;
    }
    const [name, ...fieldParts] = resource.split(".");
    if (name === undefined || name.length === 0) {
      continue;
    }
    bindings.set(node, {
      ...structuredUiBindingFields(binding),
      ...(fieldParts.length === 0 ? {} : { field: fieldParts.join(".") }),
      kind: "resource",
      name,
    });
  }
  return bindings;
}

function structuredUiBindingFields(binding: Record<string, unknown>): { fields?: string[]; format?: string } {
  const fields = readStringList(binding.fields);
  const format = readString(binding.format);
  return {
    ...(fields.length === 0 ? {} : { fields }),
    ...(format === undefined ? {} : { format }),
  };
}

function applyStructuredUiBindings(node: IUiNodeIr, bindings: ReadonlyMap<string, IUiNodeIr["binding"]>): IUiNodeIr {
  const binding = bindings.get(node.id);
  return {
    ...node,
    ...(binding === undefined ? {} : { binding }),
    ...(node.children === undefined ? {} : { children: node.children.map((child) => applyStructuredUiBindings(child, bindings)) }),
  };
}

function structuredUiNode(data: Record<string, unknown>): IUiNodeIr[] {
  const id = readString(data.id);
  if (id === undefined) {
    return [];
  }
  const kind = structuredUiKind(readString(data.type) ?? readString(data.kind));
  return [{
    id,
    kind,
    ...copyOptionalUiString(data, "action"),
    ...copyOptionalUiString(data, "accessibilityLabel"),
    ...copyOptionalUiString(data, "anchorId"),
    ...copyOptionalUiBoolean(data, "disabled"),
    ...copyOptionalUiBoolean(data, "focusable"),
    ...copyOptionalUiString(data, "label"),
    ...copyOptionalUiNumber(data, "max"),
    ...copyOptionalUiNumber(data, "min"),
    ...structuredUiOrientation(data.orientation),
    ...structuredUiRole(data.role),
    ...copyOptionalUiNumber(data, "step"),
    ...copyOptionalUiString(data, "src"),
    ...copyOptionalUiString(data, "text"),
    ...copyOptionalUiNumber(data, "value"),
    ...copyOptionalUiString(data, "valueText"),
    ...(isRecord(data.binding) ? { binding: cloneRecord(data.binding) as IUiNodeIr["binding"] } : {}),
    ...(Array.isArray(data.effects) ? { effects: JSON.parse(JSON.stringify(data.effects)) as IUiNodeIr["effects"] } : {}),
    ...(isRecord(data.image) ? { image: cloneRecord(data.image) as IUiNodeIr["image"] } : {}),
    ...(isRecord(data.minimap) ? { minimap: cloneRecord(data.minimap) as unknown as IUiNodeIr["minimap"] } : {}),
    ...(isRecord(data.navigation) ? { navigation: cloneRecord(data.navigation) as IUiNodeIr["navigation"] } : {}),
    ...(Array.isArray(data.spans) ? { spans: JSON.parse(JSON.stringify(data.spans)) as IUiNodeIr["spans"] } : {}),
    ...structuredUiResponsive(data.responsive),
    ...(readRecordList(data.children).length === 0 ? {} : { children: readRecordList(data.children).flatMap((child) => structuredUiNode(child)) }),
    ...structuredUiLayout(data.layout),
    ...structuredUiStyle(data.style),
  }];
}

function structuredUiResponsive(value: unknown): Pick<IUiNodeIr, "responsive"> {
  if (!Array.isArray(value)) return {};
  const responsive = value.flatMap((candidate): NonNullable<IUiNodeIr["responsive"]>[number][] => {
    if (!isRecord(candidate)) return [];
    const target = readString(candidate.target);
    if (target !== "desktop" && target !== "mobile" && target !== "tablet") return [];
    return [{
      target,
      ...structuredUiLayout(candidate.layout),
      ...structuredUiStyle(candidate.style),
    }];
  });
  return responsive.length === 0 ? {} : { responsive };
}

function structuredUiKind(value: string | undefined): IUiNodeIr["kind"] {
  if (
    value === "bar"
    || value === "button"
    || value === "column"
    || value === "contextMenu"
    || value === "image"
    || value === "minimap"
    || value === "row"
    || value === "scrollbar"
    || value === "slider"
    || value === "stack"
    || value === "textInput"
    || value === "touchControl"
  ) {
    return value;
  }
  return "text";
}

function structuredUiLayout(value: unknown): Pick<IUiNodeIr, "layout"> {
  if (!isRecord(value)) {
    return {};
  }
  const layout: NonNullable<IUiNodeIr["layout"]> = {};
  const align = readString(value.align);
  const justify = readString(value.justify);
  const position = readString(value.position);
  const overflow = readString(value.overflow);
  const direction = readString(value.direction);
  const normalizedAlign = align === "left" || align === "top" ? "start" : align === "right" || align === "bottom" ? "end" : uiAlign(align);
  const normalizedJustify = justify === "left" || justify === "top" ? "start" : justify === "right" || justify === "bottom" ? "end" : uiJustify(justify);
  if (normalizedAlign !== undefined) layout.align = normalizedAlign;
  if (normalizedJustify !== undefined) layout.justify = normalizedJustify;
  if (position === "absolute" || position === "relative") layout.position = position;
  if (overflow === "hidden" || overflow === "scroll" || overflow === "visible") layout.overflow = overflow;
  if (direction === "column" || direction === "row") layout.direction = direction;
  for (const key of ["columnGap", "grow", "height", "maxHeight", "maxWidth", "minHeight", "minWidth", "padding", "rowGap", "zIndex"] as const) {
    const number = readNumber(value[key]);
    if (number !== undefined) {
      layout[key] = number;
    }
  }
  const inset: NonNullable<NonNullable<IUiNodeIr["layout"]>["inset"]> = {};
  for (const key of ["bottom", "left", "right", "top"] as const) {
    const number = readNumber(value[key]);
    if (number !== undefined) {
      inset[key] = number;
    }
  }
  if (isRecord(value.inset)) {
    for (const key of ["bottom", "left", "right", "top"] as const) {
      const number = readNumber(value.inset[key]);
      if (number !== undefined) {
        inset[key] = number;
      }
    }
  }
  const width = readNumber(value.width);
  if (width !== undefined) {
    if (width >= 1000 && inset.left === undefined && inset.right === undefined) {
      inset.left = 0;
      inset.right = 0;
    } else {
      layout.width = width;
    }
  }
  if (Object.keys(inset).length > 0) {
    layout.inset = inset;
    layout.position ??= "absolute";
  }
  if (isRecord(value.grid)) {
    layout.grid = cloneRecord(value.grid) as NonNullable<IUiNodeIr["layout"]>["grid"];
  }
  return Object.keys(layout).length === 0 ? {} : { layout };
}

function structuredUiStyle(value: unknown): Pick<IUiNodeIr, "style"> {
  if (!isRecord(value)) {
    return {};
  }
  const style: NonNullable<IUiNodeIr["style"]> = {};
  for (const key of ["backgroundColor", "borderColor", "color", "fontFamily"] as const) {
    const string = readString(value[key]);
    if (string !== undefined) {
      style[key] = string;
    }
  }
  for (const key of ["borderRadius", "borderWidth", "fontSize", "opacity"] as const) {
    const number = readNumber(value[key]);
    if (number !== undefined) {
      style[key] = number;
    }
  }
  const fontWeight = readString(value.fontWeight);
  if (fontWeight === "bold" || fontWeight === "normal") style.fontWeight = fontWeight;
  const textAlign = readString(value.textAlign);
  if (textAlign === "center" || textAlign === "left" || textAlign === "right") style.textAlign = textAlign;
  const textDecoration = readString(value.textDecoration);
  if (textDecoration === "lineThrough" || textDecoration === "none" || textDecoration === "underline") style.textDecoration = textDecoration;
  const wrap = readString(value.wrap);
  if (wrap === "character" || wrap === "none" || wrap === "word") style.wrap = wrap;
  if (isRecord(value.gradient)) style.gradient = cloneRecord(value.gradient) as NonNullable<IUiNodeIr["style"]>["gradient"];
  if (isRecord(value.shadow)) style.shadow = cloneRecord(value.shadow) as NonNullable<IUiNodeIr["style"]>["shadow"];
  return Object.keys(style).length === 0 ? {} : { style };
}

function uiAlign(value: string | undefined): NonNullable<IUiNodeIr["layout"]>["align"] | undefined {
  return value === "center" || value === "end" || value === "start" || value === "stretch" ? value : undefined;
}

function uiJustify(value: string | undefined): NonNullable<IUiNodeIr["layout"]>["justify"] | undefined {
  return value === "center" || value === "end" || value === "spaceBetween" || value === "start" ? value : undefined;
}

function structuredUiOrientation(value: unknown): Pick<IUiNodeIr, "orientation"> {
  return value === "horizontal" || value === "vertical" ? { orientation: value } : {};
}

function structuredUiRole(value: unknown): Pick<IUiNodeIr, "role"> {
  return typeof value === "string" ? { role: value as IUiNodeIr["role"] } : {};
}

function copyOptionalUiString<T extends string>(data: Record<string, unknown>, key: T): Partial<Record<T, string>> {
  const value = readString(data[key]);
  return value === undefined ? {} : { [key]: value } as Partial<Record<T, string>>;
}

function copyOptionalUiNumber<T extends string>(data: Record<string, unknown>, key: T): Partial<Record<T, number>> {
  const value = readNumber(data[key]);
  return value === undefined ? {} : { [key]: value } as Partial<Record<T, number>>;
}

function copyOptionalUiBoolean<T extends string>(data: Record<string, unknown>, key: T): Partial<Record<T, boolean>> {
  const value = typeof data[key] === "boolean" ? data[key] : undefined;
  return value === undefined ? {} : { [key]: value } as Partial<Record<T, boolean>>;
}

function readString(value: unknown): string | undefined { return typeof value === "string" && value.trim() !== "" ? value : undefined; }

function readNumber(value: unknown): number | undefined { return typeof value === "number" && Number.isFinite(value) ? value : undefined; }

function readRecordList(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.filter(isRecord) : []; }

function readStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(readString).filter((item): item is string => item !== undefined).sort() : [];
}

function parseSourceInputBinding(value: string): IInputIr["actions"][number]["bindings"][number] {
  const [device, first, second] = value.split(".");
  if (device === "keyboard" && first !== undefined) {
    return { code: normalizeKeyboardCodeAlias(first), device };
  }
  if (device === "gamepad" && first !== undefined) {
    return { control: first, device };
  }
  if (device === "touch" && first !== undefined) {
    return { ...(second === undefined ? {} : { axis: second as "x" | "y" }), control: first, device };
  }
  if (device === "pointer" && first !== undefined && ["deltaX", "deltaY", "x", "y"].includes(first)) {
    return { axis: first as "deltaX" | "deltaY" | "x" | "y", device };
  }
  if (device === "pointer" && first !== undefined && Number.isInteger(Number(first))) {
    return { button: Number(first), device };
  }
  return { code: value, device: "keyboard" };
}

function inputOverrideSortKey(value: NonNullable<IInputIr["persistedBindingOverrides"]>[number]): string {
  return `${value.profileId}\0${value.actionOrAxisId}\0${value.axisSlot ?? ""}\0${value.device}\0${value.control}`;
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
  const generatedLodAssetIds = emits.flatMap((emit) => emit.generatedLodAssetIds);
  const assets = emits.flatMap((emit) => emit.assets);
  assertNoBundleGeneratedLodAssetIdCollisions(generatedLodAssetIds, assets, []);
  return {
    assets: mergeById(assets),
    generatedLodAssetIds: [...new Set(generatedLodAssetIds)].sort((left, right) => left.localeCompare(right)),
    materials: mergeById(emits.flatMap((emit) => emit.materials)),
    world: emits.map((emit) => emit.world).reduce((merged, world) => mergeWorlds(merged, world) ?? merged),
  };
}

function assertNoBundleGeneratedLodAssetIdCollisions(
  generatedLodAssetIds: readonly string[],
  emittedAssets: readonly { id: string }[],
  otherAssets: readonly { id: string }[],
): void {
  const generatedCounts = new Map<string, number>();
  for (const id of generatedLodAssetIds) {
    generatedCounts.set(id, (generatedCounts.get(id) ?? 0) + 1);
  }
  const emittedCounts = new Map<string, number>();
  for (const asset of emittedAssets) {
    emittedCounts.set(asset.id, (emittedCounts.get(asset.id) ?? 0) + 1);
  }
  const otherIds = new Set(otherAssets.map((asset) => asset.id));
  for (const id of generatedCounts.keys()) {
    if ((generatedCounts.get(id) ?? 0) > 1 || (emittedCounts.get(id) ?? 0) > 1 || otherIds.has(id)) {
      throwGeneratedLodAssetIdCollision(id);
    }
  }
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
        ...(merged.systems.countdowns === undefined && current.systems.countdowns === undefined ? {} : {
          countdowns: mergeById([...(merged.systems.countdowns ?? []), ...(current.systems.countdowns ?? [])]),
        }),
        ...(merged.systems.feedbackPresets === undefined && current.systems.feedbackPresets === undefined ? {} : {
          feedbackPresets: mergeById([...(merged.systems.feedbackPresets ?? []), ...(current.systems.feedbackPresets ?? [])]),
        }),
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

function mergeOptionalSchemaFiles<T extends { schema: string; version: string; schemas: Record<string, unknown> }>(left: T | undefined, right: T | undefined): T | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }
  return mergeSchemaFiles(left, right);
}

export function mergeInputs(left: IEcsEmitResult["input"], right: IEcsEmitResult["input"]): IEcsEmitResult["input"] {
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

export function mergeUis(left: IUiIr | undefined, right: IUiIr | undefined): IUiIr | undefined {
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

export function mergeWorlds(scene: IWorldIr | undefined, ecs: IWorldIr | undefined): IWorldIr | undefined {
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

export interface IGeneratedMeshPayload {
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
