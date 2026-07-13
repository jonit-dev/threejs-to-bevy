import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type {
  IAnimationsIr,
  IAssetsManifest,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IGameFlowIr,
  IIrSchemaFile,
  ILocalDataIr,
  IMaterialsIr,
  IPrefabsIr,
  IScenesIr,
  ISequencesIr,
  ITargetProfile,
  IUiIr,
  IWorldIr,
} from "./types.js";
import type { IInputIr } from "./input.js";
import type { ISystemsIr } from "./systems.js";
import type { IInteractionsIr } from "./interactions.js";
import type { IGltfSceneMetadataIr } from "./gltfScene.js";
import type { IOverlaysIr } from "./overlays.js";
import type { IIrDiagnostic } from "./validate.js";

export interface ILoadedBundleDocuments {
  animations?: IAnimationsIr;
  assets?: IAssetsManifest;
  audio?: IAudioIr;
  componentSchemas?: IIrSchemaFile;
  environmentScene?: IEnvironmentSceneIr;
  eventSchemas?: IIrSchemaFile;
  gameFlow?: IGameFlowIr;
  gltfScene?: IGltfSceneMetadataIr;
  input?: IInputIr;
  interactions?: IInteractionsIr;
  localData?: ILocalDataIr;
  materials?: IMaterialsIr;
  overlays?: IOverlaysIr;
  prefabs?: IPrefabsIr;
  resourceSchemas?: IIrSchemaFile;
  runtimeConfig?: unknown;
  scenes?: IScenesIr;
  sequences?: ISequencesIr;
  systems?: ISystemsIr;
  targetProfile?: ITargetProfile;
  ui?: IUiIr;
  world?: IWorldIr;
}

export async function readBundleDocuments(
  bundlePath: string,
  manifest: IBundleManifest,
  diagnostics: IIrDiagnostic[],
): Promise<ILoadedBundleDocuments> {
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
  const localData =
    manifest.entry.localData === undefined
      ? undefined
      : await readJson<ILocalDataIr>(resolve(bundlePath, manifest.entry.localData), diagnostics);
  const gameFlow =
    manifest.entry.gameFlow === undefined
      ? undefined
      : await readJson<IGameFlowIr>(resolve(bundlePath, manifest.entry.gameFlow), diagnostics);
  const scenes =
    manifest.entry.scenes === undefined
      ? undefined
      : await readJson<IScenesIr>(resolve(bundlePath, manifest.entry.scenes), diagnostics);
  const sequences =
    manifest.entry.sequences === undefined
      ? undefined
      : await readJson<ISequencesIr>(resolve(bundlePath, manifest.entry.sequences), diagnostics);
  const materials = await readJson<IMaterialsIr>(resolve(bundlePath, manifest.files.materials), diagnostics);
  const assets = await readJson<IAssetsManifest>(resolve(bundlePath, manifest.files.assets), diagnostics);
  const targetProfile = await readJson<ITargetProfile>(resolve(bundlePath, manifest.files.targetProfile), diagnostics);
  const systems =
    manifest.entry.systems === undefined
      ? undefined
      : await readJson<ISystemsIr>(resolve(bundlePath, manifest.entry.systems), diagnostics);
  const input =
    manifest.files.input === undefined
      ? undefined
      : await readJson<IInputIr>(resolve(bundlePath, manifest.files.input), diagnostics);
  const interactions =
    manifest.entry.interactions === undefined
      ? undefined
      : await readJson<IInteractionsIr>(resolve(bundlePath, manifest.entry.interactions), diagnostics);
  const runtimeConfig =
    manifest.files.runtimeConfig === undefined
      ? undefined
      : await readJson<unknown>(resolve(bundlePath, manifest.files.runtimeConfig), diagnostics);
  const ui =
    manifest.entry.ui === undefined
      ? undefined
      : await readJson<IUiIr>(resolve(bundlePath, manifest.entry.ui), diagnostics);
  const overlays =
    manifest.entry.overlays === undefined
      ? undefined
      : await readJson<IOverlaysIr>(resolve(bundlePath, manifest.entry.overlays), diagnostics);
  const prefabs =
    manifest.entry.prefabs === undefined
      ? manifest.files.prefabs === undefined
        ? undefined
        : await readJson<IPrefabsIr>(resolve(bundlePath, manifest.files.prefabs), diagnostics)
      : await readJson<IPrefabsIr>(resolve(bundlePath, manifest.entry.prefabs), diagnostics);
  const gltfScene =
    manifest.files.gltfScene === undefined
      ? undefined
      : await readJson<IGltfSceneMetadataIr>(resolve(bundlePath, manifest.files.gltfScene), diagnostics);
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

  return {
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
  };
}

export async function readJson<T>(path: string, diagnostics: IIrDiagnostic[]): Promise<T | undefined> {
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
