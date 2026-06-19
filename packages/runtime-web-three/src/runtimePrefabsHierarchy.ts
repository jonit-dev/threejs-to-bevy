import type { IBundleManifest, IPrefabsIr, ISystemsIr, IWorldIr } from "@threenative/ir";

import { loadSystemModule, runSchedule } from "./systems/runner.js";

export interface IRuntimePrefabsHierarchyReport {
  entities: Array<{ id: string; parent: string | null }>;
  schema: "threenative.runtime-prefabs-hierarchy";
  version: "0.1.0";
}

export async function traceRuntimePrefabsHierarchy(
  world: IWorldIr,
  systems: ISystemsIr,
  prefabs: IPrefabsIr,
  options: { bundlePath?: string; manifest?: IBundleManifest } = {},
): Promise<IRuntimePrefabsHierarchyReport> {
  const workingWorld = structuredClone(world);
  const module = options.bundlePath && options.manifest
    ? await loadSystemModule(options.bundlePath, options.manifest)
    : { systems: {} };

  await runSchedule({
    module,
    prefabs,
    schedule: "update",
    systems,
    world: workingWorld,
  });

  return {
    entities: workingWorld.entities
      .map((entity) => ({
        id: entity.id,
        parent: readParent(entity.components.Hierarchy),
      }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    schema: "threenative.runtime-prefabs-hierarchy",
    version: "0.1.0",
  };
}

function readParent(value: unknown): string | null {
  if (typeof value === "object" && value !== null && !Array.isArray(value) && typeof (value as { parent?: unknown }).parent === "string") {
    return (value as { parent: string }).parent;
  }
  return null;
}
