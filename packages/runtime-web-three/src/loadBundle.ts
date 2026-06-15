import type {
  IAssetsManifest,
  IAudioIr,
  IBundleManifest,
  IEnvironmentSceneIr,
  IInputIr,
  IIrSchemaFile,
  IMaterialsIr,
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
  manifest: IBundleManifest;
  materials: IMaterialsIr;
  runtimeConfig?: IRuntimeConfigIr;
  source?: string;
  systems?: ISystemsIr;
  targetProfile: ITargetProfile;
  ui?: IUiIr;
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
  const runtimeConfig =
    manifest.files.runtimeConfig === undefined
      ? undefined
      : await readBundleJson<IRuntimeConfigIr>(source, manifest.files.runtimeConfig);
  const componentSchemas =
    manifest.files.componentSchemas === undefined
      ? undefined
      : await readBundleJson<IIrSchemaFile>(source, manifest.files.componentSchemas);
  const ui = manifest.entry.ui === undefined ? undefined : await readBundleJson<IUiIr>(source, manifest.entry.ui);
  return {
    assets: await readBundleJson<IAssetsManifest>(source, manifest.files.assets),
    audio,
    componentSchemas,
    environmentScene,
    input,
    manifest,
    materials: await readBundleJson<IMaterialsIr>(source, manifest.files.materials),
    runtimeConfig,
    source,
    systems,
    targetProfile: await readBundleJson<ITargetProfile>(source, manifest.files.targetProfile),
    ui,
    world: await readBundleJson<IWorldIr>(source, manifest.entry.world),
  };
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
