import type { IBundleManifest } from "@threenative/ir";
import type { ISystemModule } from "./runner.js";
import { loadSystemModuleUrl } from "./moduleLoaderUrl.js";

export async function loadSystemModule(source: string, manifest: IBundleManifest): Promise<ISystemModule> {
  if (isFetchable(source)) {
    return loadSystemModuleUrl(source, manifest);
  }

  const scriptFile = manifest.entry.scripts ?? manifest.files.scripts;
  if (scriptFile === undefined) {
    return { systems: {} };
  }

  const pathModule = nodeModuleName("path");
  const urlModule = nodeModuleName("url");
  const dynamicImport = new Function("moduleName", "return import(moduleName)") as <T>(
    moduleName: string,
  ) => Promise<T>;
  const { resolve } = await dynamicImport<{ resolve(...paths: string[]): string }>(pathModule);
  const { pathToFileURL } = await dynamicImport<{ pathToFileURL(path: string): URL }>(urlModule);
  return (await import(/* @vite-ignore */ pathToFileURL(resolve(source, scriptFile)).href)) as ISystemModule;
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
