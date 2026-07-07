import type { IBundleManifest, ISystemsIr, IWorldIr } from "@threenative/ir";

import { loadSystemModule } from "./systems/moduleLoader.js";
import { runSchedule } from "./systems/runner.js";

export interface IRuntimeQueryDiffingReport {
  changedQuery: {
    ids: string[];
    mode: "runtime";
  };
  schema: "threenative.runtime-query-diffing";
  version: "0.1.0";
}

export async function traceRuntimeQueryDiffing(
  world: IWorldIr,
  systems: ISystemsIr,
  options: { bundlePath?: string; manifest?: IBundleManifest } = {},
): Promise<IRuntimeQueryDiffingReport> {
  const workingWorld = structuredClone(world);
  const module = options.bundlePath && options.manifest
    ? await loadSystemModule(options.bundlePath, options.manifest)
    : { systems: {} };

  await runSchedule({
    module,
    schedule: "update",
    systems,
    world: workingWorld,
  });

  const report = workingWorld.resources?.QueryReport as { ids?: string[] } | undefined;

  return {
    changedQuery: {
      ids: report?.ids ?? [],
      mode: "runtime",
    },
    schema: "threenative.runtime-query-diffing",
    version: "0.1.0",
  };
}
