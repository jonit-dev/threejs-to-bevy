import type { IWorldEntity, IWorldIr } from "@threenative/ir";

export interface IComponentDiffCache {
  beginScheduleStage(world: IWorldIr, components: ReadonlyArray<string>): void;
  runtimeChangedComponents(entity: IWorldEntity): string[];
}

export function createComponentDiffCache(): IComponentDiffCache {
  let baseline = new Map<string, Map<string, string>>();
  let tracked = new Set<string>();

  return {
    beginScheduleStage(world, components) {
      tracked = new Set(components);
      baseline = new Map();
      for (const entity of world.entities) {
        for (const component of tracked) {
          const value = entity.components[component];
          if (value === undefined) {
            continue;
          }
          const row = baseline.get(entity.id) ?? new Map<string, string>();
          row.set(component, JSON.stringify(value));
          baseline.set(entity.id, row);
        }
      }
    },
    runtimeChangedComponents(entity) {
      const changed: string[] = [];
      for (const component of [...tracked].sort()) {
        const current = entity.components[component];
        const currentValue = current === undefined ? undefined : JSON.stringify(current);
        const baselineValue = baseline.get(entity.id)?.get(component);
        if (currentValue !== baselineValue) {
          changed.push(component);
        }
      }
      return changed;
    },
  };
}
