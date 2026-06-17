import type { ILocalDataIr, IWorldIr } from "@threenative/ir";

export interface IPersistenceSaveRecord {
  appVersion: string;
  components: Record<string, Record<string, unknown>>;
  resources: Record<string, unknown>;
  schemaVersion: number;
  settings: Record<string, boolean | number | string>;
  slot: string;
}

export interface IPersistenceSaveResult {
  accepted: boolean;
  record?: IPersistenceSaveRecord;
  slot: string;
  status: "missing-slot" | "saved";
}

export interface IPersistenceLoadResult {
  accepted: boolean;
  record?: IPersistenceSaveRecord;
  slot: string;
  status: "loaded" | "missing-save" | "missing-slot";
  world: IWorldIr;
}

export interface IWebPersistenceService {
  delete(slot: string): boolean;
  exportSettings(): Record<string, boolean | number | string>;
  getSetting(key: string): boolean | number | string | undefined;
  importSettings(values: Record<string, unknown>): Record<string, boolean | number | string>;
  listSlots(): string[];
  load(slot: string, world: IWorldIr): IPersistenceLoadResult;
  save(slot: string, world: IWorldIr): IPersistenceSaveResult;
  setSetting(key: string, value: boolean | number | string): boolean;
}

export function createWebPersistenceService(localData: ILocalDataIr): IWebPersistenceService {
  const slots = new Map(localData.saveSlots.map((slot) => [slot.id, slot]));
  const saves = new Map<string, IPersistenceSaveRecord>();
  const settingSpecs = new Map(localData.settings.map((setting) => [setting.key, setting]));
  const settings = new Map<string, boolean | number | string>(localData.settings.map((setting) => [setting.key, setting.defaultValue]));
  const resourceIds = new Set(localData.resources.map((resource) => resource.id));
  const componentIds = new Set(localData.components.map((component) => component.id));

  return {
    delete(slot) {
      return saves.delete(slot);
    },
    exportSettings() {
      return Object.fromEntries([...settings.entries()].sort(([left], [right]) => left.localeCompare(right)));
    },
    getSetting(key) {
      return settings.get(key);
    },
    importSettings(values) {
      for (const [key, value] of Object.entries(values)) {
        setSettingValue(settingSpecs, settings, key, value);
      }
      return this.exportSettings();
    },
    listSlots() {
      return [...slots.keys()].sort((left, right) => left.localeCompare(right));
    },
    load(slot, world) {
      if (!slots.has(slot)) {
        return { accepted: false, slot, status: "missing-slot", world: clone(world) as IWorldIr };
      }
      const record = saves.get(slot);
      if (record === undefined) {
        return { accepted: false, slot, status: "missing-save", world: clone(world) as IWorldIr };
      }
      for (const [key, value] of Object.entries(record.settings)) {
        setSettingValue(settingSpecs, settings, key, value);
      }
      const nextWorld = clone(world) as IWorldIr;
      nextWorld.resources = { ...(nextWorld.resources ?? {}), ...clone(record.resources) as Record<string, unknown> };
      nextWorld.entities = nextWorld.entities.map((entity) => {
        const persisted = record.components[entity.id];
        return persisted === undefined
          ? entity
          : { ...entity, components: { ...entity.components, ...clone(persisted) as IWorldIr["entities"][number]["components"] } };
      });
      return { accepted: true, record: clone(record) as IPersistenceSaveRecord, slot, status: "loaded", world: nextWorld };
    },
    save(slot, world) {
      const slotSpec = slots.get(slot);
      if (slotSpec === undefined) {
        return { accepted: false, slot, status: "missing-slot" };
      }
      const record: IPersistenceSaveRecord = {
        appVersion: slotSpec.appVersion,
        components: persistComponents(world, componentIds),
        resources: persistResources(world, resourceIds),
        schemaVersion: slotSpec.schemaVersion,
        settings: this.exportSettings(),
        slot,
      };
      saves.set(slot, clone(record) as IPersistenceSaveRecord);
      return { accepted: true, record, slot, status: "saved" };
    },
    setSetting(key, value) {
      return setSettingValue(settingSpecs, settings, key, value);
    },
  };
}

function persistResources(world: IWorldIr, ids: ReadonlySet<string>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(world.resources ?? {})
      .filter(([id]) => ids.has(id))
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, value]) => [id, clone(value)]),
  );
}

function persistComponents(world: IWorldIr, ids: ReadonlySet<string>): Record<string, Record<string, unknown>> {
  const entities = world.entities
    .map((entity) => {
      const components = Object.fromEntries(
        Object.entries(entity.components)
          .filter(([id]) => ids.has(id))
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([id, value]) => [id, clone(value)]),
      );
      return [entity.id, components] as const;
    })
    .filter(([, components]) => Object.keys(components).length > 0)
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.fromEntries(entities);
}

function setSettingValue(
  specs: ReadonlyMap<string, ILocalDataIr["settings"][number]>,
  settings: Map<string, boolean | number | string>,
  key: string,
  value: unknown,
): boolean {
  const spec = specs.get(key);
  if (spec === undefined || typeof value !== spec.kind) {
    return false;
  }
  if (spec.kind === "number") {
    const numeric = value as number;
    if (!Number.isFinite(numeric) || (spec.min !== undefined && numeric < spec.min) || (spec.max !== undefined && numeric > spec.max)) {
      return false;
    }
  }
  const settingValue = value as boolean | number | string;
  if (spec.enumValues !== undefined && !spec.enumValues.includes(String(settingValue))) {
    return false;
  }
  settings.set(key, settingValue);
  return true;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}
