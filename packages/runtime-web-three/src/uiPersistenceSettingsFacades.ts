import type { IBundleManifest, ILocalDataIr, ISystemsIr, IUiIr, IWorldIr } from "@threenative/ir";

import { loadSystemModule, runSchedule } from "./systems/runner.js";

export interface IUiPersistenceSettingsFacadesReport {
  facadeReport: Record<string, unknown>;
  schema: "threenative.ui-persistence-settings-facades";
  version: "0.1.0";
}

export async function traceUiPersistenceSettingsFacades(
  world: IWorldIr,
  systems: ISystemsIr,
  options: { bundlePath?: string; localData?: ILocalDataIr; manifest?: IBundleManifest; ui?: IUiIr } = {},
): Promise<IUiPersistenceSettingsFacadesReport> {
  const workingWorld = structuredClone(world);
  const module = options.bundlePath && options.manifest
    ? await loadSystemModule(options.bundlePath, options.manifest)
    : { systems: {} };

  await runSchedule({
    localData: options.localData,
    module,
    schedule: "update",
    systems,
    ui: options.ui,
    world: workingWorld,
  });

  return {
    facadeReport: (workingWorld.resources?.FacadeReport as Record<string, unknown> | undefined) ?? {},
    schema: "threenative.ui-persistence-settings-facades",
    version: "0.1.0",
  };
}
