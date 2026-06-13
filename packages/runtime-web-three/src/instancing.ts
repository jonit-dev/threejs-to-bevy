import type { IEnvironmentInstanceIr, IEnvironmentSceneIr } from "@threenative/ir";
import type { IRuntimeDiagnostic } from "./mapWorld.js";

export interface IInstancingGroup {
  count: number;
  instanceIds: string[];
  sourceAsset: string;
}

export interface IInstancingPlan {
  diagnostics: IRuntimeDiagnostic[];
  groups: IInstancingGroup[];
  instanceCount: number;
  uninstancedRepeatedPropCount: number;
  uninstanced: Array<{ id: string; reason: string; sourceAsset: string }>;
}

export function buildInstancingPlan(scene: IEnvironmentSceneIr, minimumGroupSize = 2): IInstancingPlan {
  const bySourceAsset = new Map<string, IEnvironmentInstanceIr[]>();
  for (const instance of scene.instances) {
    const items = bySourceAsset.get(instance.sourceAsset) ?? [];
    items.push(instance);
    bySourceAsset.set(instance.sourceAsset, items);
  }

  const diagnostics: IRuntimeDiagnostic[] = [];
  const groups: IInstancingGroup[] = [];
  const uninstanced: IInstancingPlan["uninstanced"] = [];

  for (const [sourceAsset, instances] of [...bySourceAsset.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const compatible = instances.filter(isInstancingCompatible);
    const incompatible = instances.filter((instance) => !isInstancingCompatible(instance));
    if (compatible.length >= minimumGroupSize) {
      groups.push({
        count: compatible.length,
        instanceIds: compatible.map((instance) => instance.id).sort(),
        sourceAsset,
      });
    } else {
      uninstanced.push(...compatible.map((instance) => ({ id: instance.id, reason: "below-minimum-group-size", sourceAsset })));
    }
    uninstanced.push(...incompatible.map((instance) => ({ id: instance.id, reason: "unique-or-hero-placement", sourceAsset })));
  }

  const repeatedUninstanced = uninstanced.filter((item) => {
    if (item.reason !== "below-minimum-group-size") {
      return false;
    }
    const compatibleCount = (bySourceAsset.get(item.sourceAsset) ?? []).filter(isInstancingCompatible).length;
    return compatibleCount >= minimumGroupSize;
  });
  for (const item of repeatedUninstanced) {
    diagnostics.push({
      code: "TN-WEB-INSTANCE-SKIPPED",
      message: `Environment instance '${item.id}' was not instanced: ${item.reason}.`,
      path: `environment.scene.json/instances/${item.id}`,
      severity: "warning",
    });
  }

  return {
    diagnostics,
    groups,
    instanceCount: groups.reduce((total, group) => total + group.count, 0),
    uninstanced,
    uninstancedRepeatedPropCount: repeatedUninstanced.length,
  };
}

function isInstancingCompatible(instance: IEnvironmentInstanceIr): boolean {
  return !instance.tags?.some((tag) => tag === "hero" || tag === "unique" || tag === "foreground");
}
