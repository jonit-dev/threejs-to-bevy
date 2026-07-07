import type { IBundleManifest } from "@threenative/ir";
import type { ISystemModule } from "./runner.js";

export async function loadSystemModuleUrl(source: string, manifest: IBundleManifest): Promise<ISystemModule> {
  const scriptFile = manifest.entry.scripts ?? manifest.files.scripts;
  if (scriptFile === undefined) {
    return { systems: {} };
  }
  return (await import(/* @vite-ignore */ `${source.replace(/\/$/, "")}/${scriptFile}`)) as ISystemModule;
}
