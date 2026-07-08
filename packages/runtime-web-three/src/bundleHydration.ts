import type {
  IAssetsManifest,
  IAnimationsIr,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IGameFlowIr,
  IInputIr,
  IIrSchemaFile,
  ILocalDataIr,
  IMaterialsIr,
  IOverlaysIr,
  IPrefabsIr,
  IRuntimeConfigIr,
  IScenesIr,
  ISequencesIr,
  ISystemsIr,
  ITargetProfile,
  IUiIr,
  IWorldIr,
  IGltfSceneMetadataIr,
} from "@threenative/ir";
import { assertBundleRelativePath } from "@threenative/ir/bundlePaths";
import type { IWebBundle } from "./webBundle.js";

export interface IBundleFileReader {
  readBytes(file: string): Promise<Uint8Array>;
  readJson<T>(file: string): Promise<T>;
}

export async function hydrateWebBundle(source: string, reader: IBundleFileReader): Promise<IWebBundle> {
  const manifest = await reader.readJson<IBundleManifest>("manifest.json");

  const audio =
    manifest.entry.audio === undefined ? undefined : await reader.readJson<IAudioIr>(manifest.entry.audio);
  const animations =
    manifest.entry.animations === undefined ? undefined : await reader.readJson<IAnimationsIr>(manifest.entry.animations);
  const systems =
    manifest.entry.systems === undefined
      ? undefined
      : await reader.readJson<ISystemsIr>(manifest.entry.systems);
  const environmentScene =
    manifest.entry.environmentScene === undefined
      ? undefined
      : await reader.readJson<IEnvironmentSceneIr>(manifest.entry.environmentScene);
  const input =
    manifest.files.input === undefined ? undefined : await reader.readJson<IInputIr>(manifest.files.input);
  const gltfScene =
    manifest.files.gltfScene === undefined ? undefined : await reader.readJson<IGltfSceneMetadataIr>(manifest.files.gltfScene);
  const localData =
    manifest.entry.localData === undefined
      ? manifest.files.localData === undefined
        ? undefined
        : await reader.readJson<ILocalDataIr>(manifest.files.localData)
      : await reader.readJson<ILocalDataIr>(manifest.entry.localData);
  const gameFlow =
    manifest.entry.gameFlow === undefined
      ? undefined
      : await reader.readJson<IGameFlowIr>(manifest.entry.gameFlow);
  const runtimeConfig =
    manifest.files.runtimeConfig === undefined
      ? undefined
      : await reader.readJson<IRuntimeConfigIr>(manifest.files.runtimeConfig);
  const componentSchemas =
    manifest.files.componentSchemas === undefined
      ? undefined
      : await reader.readJson<IIrSchemaFile>(manifest.files.componentSchemas);
  const ui = manifest.entry.ui === undefined ? undefined : await reader.readJson<IUiIr>(manifest.entry.ui);
  const overlays =
    manifest.entry.overlays === undefined ? undefined : await reader.readJson<IOverlaysIr>(manifest.entry.overlays);
  const prefabs =
    manifest.entry.prefabs === undefined
      ? manifest.files.prefabs === undefined
        ? undefined
        : await reader.readJson<IPrefabsIr>(manifest.files.prefabs)
      : await reader.readJson<IPrefabsIr>(manifest.entry.prefabs);
  const scenes =
    manifest.entry.scenes === undefined ? undefined : await reader.readJson<IScenesIr>(manifest.entry.scenes);
  const sequences =
    manifest.entry.sequences === undefined ? undefined : await reader.readJson<ISequencesIr>(manifest.entry.sequences);
  const assets = await hydrateGeneratedMeshAssets(await reader.readJson<IAssetsManifest>(manifest.files.assets), reader);
  return {
    assets,
    animations,
    audio,
    componentSchemas,
    environmentScene,
    gameFlow,
    gltfScene,
    input,
    localData,
    manifest,
    materials: await reader.readJson<IMaterialsIr>(manifest.files.materials),
    runtimeConfig,
    overlays,
    prefabs,
    scenes,
    sequences,
    source,
    systems,
    targetProfile: await reader.readJson<ITargetProfile>(manifest.files.targetProfile),
    ui,
    world: await reader.readJson<IWorldIr>(manifest.entry.world),
  };
}

async function hydrateGeneratedMeshAssets(assets: IAssetsManifest, reader: IBundleFileReader): Promise<IAssetsManifest> {
  return {
    ...assets,
    assets: await Promise.all(assets.assets.map(async (asset) => {
      if (asset.kind !== "mesh" || asset.primitive !== "custom" || asset.binaryAttributes === undefined) {
        return asset;
      }
      const attributes = await Promise.all(asset.binaryAttributes.map(async (attribute) => ({
        itemSize: attribute.itemSize,
        name: attribute.name,
        values: await readFloat32Payload(reader, attribute.path, attribute.count * attribute.itemSize),
      })));
      const indices = asset.binaryIndices === undefined
        ? undefined
        : await readIndexPayload(reader, asset.binaryIndices.path, asset.binaryIndices.count, asset.binaryIndices.format);
      return {
        ...asset,
        attributes,
        ...(indices === undefined ? {} : { indices }),
      };
    })),
  };
}

async function readFloat32Payload(reader: IBundleFileReader, file: string, count: number): Promise<number[]> {
  assertBundleRelativePath(file);
  const bytes = await reader.readBytes(file);
  const expectedBytes = count * 4;
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`Generated mesh float payload '${file}' has ${bytes.byteLength} bytes; expected ${expectedBytes}.`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: count }, (_, index) => view.getFloat32(index * 4, true));
}

async function readIndexPayload(reader: IBundleFileReader, file: string, count: number, format: "uint16" | "uint32"): Promise<number[]> {
  assertBundleRelativePath(file);
  const bytes = await reader.readBytes(file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const itemBytes = format === "uint16" ? 2 : 4;
  const expectedBytes = count * itemBytes;
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`Generated mesh index payload '${file}' has ${bytes.byteLength} bytes; expected ${expectedBytes} for ${format}.`);
  }
  return Array.from({ length: count }, (_, index) => format === "uint16" ? view.getUint16(index * itemBytes, true) : view.getUint32(index * itemBytes, true));
}
