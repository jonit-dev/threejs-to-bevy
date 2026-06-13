import type {
  IAssetsManifest,
  IBundleManifest,
  IInputIr,
  IMaterialsIr,
  IRuntimeConfigIr,
  ISystemsIr,
  ITargetProfile,
  IWorldIr,
} from "@threenative/ir";

export interface IWebBundle {
  assets: IAssetsManifest;
  input?: IInputIr;
  manifest: IBundleManifest;
  materials: IMaterialsIr;
  runtimeConfig?: IRuntimeConfigIr;
  systems?: ISystemsIr;
  targetProfile: ITargetProfile;
  world: IWorldIr;
}

export async function loadBundle(source: string): Promise<IWebBundle> {
  const manifest = await readBundleJson<IBundleManifest>(source, "manifest.json");

  const systems =
    manifest.entry.systems === undefined
      ? undefined
      : await readBundleJson<ISystemsIr>(source, manifest.entry.systems);
  const input =
    manifest.files.input === undefined ? undefined : await readBundleJson<IInputIr>(source, manifest.files.input);
  const runtimeConfig =
    manifest.files.runtimeConfig === undefined
      ? undefined
      : await readBundleJson<IRuntimeConfigIr>(source, manifest.files.runtimeConfig);
  return {
    assets: await readBundleJson<IAssetsManifest>(source, manifest.files.assets),
    input,
    manifest,
    materials: await readBundleJson<IMaterialsIr>(source, manifest.files.materials),
    runtimeConfig,
    systems,
    targetProfile: await readBundleJson<ITargetProfile>(source, manifest.files.targetProfile),
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

  const nodePrefix = "node";
  const fsModule = `${nodePrefix}:fs/promises`;
  const pathModule = `${nodePrefix}:path`;
  const dynamicImport = new Function("moduleName", "return import(moduleName)") as <T>(
    moduleName: string,
  ) => Promise<T>;
  const { readFile } = await dynamicImport<{ readFile(path: string, encoding: "utf8"): Promise<string> }>(
    fsModule,
  );
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  return JSON.parse(await readFile(resolve(source, file), "utf8")) as T;
}

function isFetchable(source: string): boolean {
  return (
    source.startsWith("http://") ||
    source.startsWith("https://") ||
    (typeof window !== "undefined" && source.startsWith("/"))
  );
}
