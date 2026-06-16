import type {
  IAssetsManifest,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IInputIr,
  ILocalDataIr,
  IIrSchemaFile,
  IMaterialsIr,
  IOverlaysIr,
  IRuntimeConfigIr,
  ISystemsIr,
  ITargetProfile,
  IUiIr,
  IWorldIr,
} from "@threenative/ir";

export interface IWebBundle {
  assets: IAssetsManifest;
  audio?: IAudioIr;
  componentSchemas?: IIrSchemaFile;
  environmentScene?: IEnvironmentSceneIr;
  input?: IInputIr;
  localData?: ILocalDataIr;
  manifest: IBundleManifest;
  materials: IMaterialsIr;
  runtimeConfig?: IRuntimeConfigIr;
  source?: string;
  systems?: ISystemsIr;
  targetProfile: ITargetProfile;
  ui?: IUiIr;
  overlays?: IOverlaysIr;
  world: IWorldIr;
}

export async function loadBundle(source: string): Promise<IWebBundle> {
  const manifest = await readBundleJson<IBundleManifest>(source, "manifest.json");

  const audio =
    manifest.entry.audio === undefined ? undefined : await readBundleJson<IAudioIr>(source, manifest.entry.audio);
  const systems =
    manifest.entry.systems === undefined
      ? undefined
      : await readBundleJson<ISystemsIr>(source, manifest.entry.systems);
  const environmentScene =
    manifest.entry.environmentScene === undefined
      ? undefined
      : await readBundleJson<IEnvironmentSceneIr>(source, manifest.entry.environmentScene);
  const input =
    manifest.files.input === undefined ? undefined : await readBundleJson<IInputIr>(source, manifest.files.input);
  const localData =
    manifest.entry.localData === undefined
      ? undefined
      : await readBundleJson<ILocalDataIr>(source, manifest.entry.localData);
  const runtimeConfig =
    manifest.files.runtimeConfig === undefined
      ? undefined
      : await readBundleJson<IRuntimeConfigIr>(source, manifest.files.runtimeConfig);
  const componentSchemas =
    manifest.files.componentSchemas === undefined
      ? undefined
      : await readBundleJson<IIrSchemaFile>(source, manifest.files.componentSchemas);
  const ui = manifest.entry.ui === undefined ? undefined : await readBundleJson<IUiIr>(source, manifest.entry.ui);
  const overlays =
    manifest.entry.overlays === undefined ? undefined : await readBundleJson<IOverlaysIr>(source, manifest.entry.overlays);
  const assets = await hydrateGeneratedMeshAssets(await readBundleJson<IAssetsManifest>(source, manifest.files.assets), source);
  return {
    assets,
    audio,
    componentSchemas,
    environmentScene,
    input,
    localData,
    manifest,
    materials: await readBundleJson<IMaterialsIr>(source, manifest.files.materials),
    runtimeConfig,
    overlays,
    source,
    systems,
    targetProfile: await readBundleJson<ITargetProfile>(source, manifest.files.targetProfile),
    ui,
    world: await readBundleJson<IWorldIr>(source, manifest.entry.world),
  };
}

async function hydrateGeneratedMeshAssets(assets: IAssetsManifest, source: string): Promise<IAssetsManifest> {
  return {
    ...assets,
    assets: await Promise.all(assets.assets.map(async (asset) => {
      if (asset.kind !== "mesh" || asset.primitive !== "custom" || asset.binaryAttributes === undefined) {
        return asset;
      }
      const attributes = await Promise.all(asset.binaryAttributes.map(async (attribute) => ({
        itemSize: attribute.itemSize,
        name: attribute.name,
        values: await readFloat32Payload(source, attribute.path, attribute.count * attribute.itemSize),
      })));
      const indices = asset.binaryIndices === undefined
        ? undefined
        : await readIndexPayload(source, asset.binaryIndices.path, asset.binaryIndices.count, asset.binaryIndices.format);
      return {
        ...asset,
        attributes,
        ...(indices === undefined ? {} : { indices }),
      };
    })),
  };
}

async function readFloat32Payload(source: string, file: string, count: number): Promise<number[]> {
  const bytes = await readBundleBytes(source, file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: count }, (_, index) => view.getFloat32(index * 4, true));
}

async function readIndexPayload(source: string, file: string, count: number, format: "uint16" | "uint32"): Promise<number[]> {
  const bytes = await readBundleBytes(source, file);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const itemBytes = format === "uint16" ? 2 : 4;
  return Array.from({ length: count }, (_, index) => format === "uint16" ? view.getUint16(index * itemBytes, true) : view.getUint32(index * itemBytes, true));
}

async function readBundleBytes(source: string, file: string): Promise<Uint8Array> {
  if (isFetchable(source)) {
    const response = await fetch(`${source.replace(/\/$/, "")}/${file}`);
    if (!response.ok) {
      throw new Error(`Failed to load bundle file '${file}': ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }
  const fsModule = nodeModuleName("fs/promises");
  const pathModule = nodeModuleName("path");
  const dynamicImport = new Function("moduleName", "return import(moduleName)") as <T>(moduleName: string) => Promise<T>;
  const { readFile } = await dynamicImport<{ readFile(path: string): Promise<Uint8Array> }>(fsModule);
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  return readFile(resolve(source, file));
}

async function readBundleJson<T>(source: string, file: string): Promise<T> {
  if (isFetchable(source)) {
    const response = await fetch(`${source.replace(/\/$/, "")}/${file}`);
    if (!response.ok) {
      throw new Error(`Failed to load bundle file '${file}': ${response.status}`);
    }
    return (await response.json()) as T;
  }

  const fsModule = nodeModuleName("fs/promises");
  const pathModule = nodeModuleName("path");
  const dynamicImport = new Function("moduleName", "return import(moduleName)") as <T>(
    moduleName: string,
  ) => Promise<T>;
  const { readFile } = await dynamicImport<{ readFile(path: string, encoding: "utf8"): Promise<string> }>(
    fsModule,
  );
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  return JSON.parse(await readFile(resolve(source, file), "utf8")) as T;
}

function nodeModuleName(name: string): string {
  return `node:${name}`;
}

function isFetchable(source: string): boolean {
  return (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    (typeof window !== "undefined" && source.startsWith("/"))
  );
}
