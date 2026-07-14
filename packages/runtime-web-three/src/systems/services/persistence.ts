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

export interface IWebPersistenceStorage {
  getItem(key: string): string | null;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

export interface IWebPersistenceServiceOptions {
  storage?: IWebPersistenceStorage;
  storageKey?: string;
}

export function createWebPersistenceService(localData: ILocalDataIr, options: IWebPersistenceServiceOptions = {}): IWebPersistenceService {
  const slots = new Map(localData.saveSlots.map((slot) => [slot.id, slot]));
  const saves = new Map<string, IPersistenceSaveRecord>();
  const settingSpecs = new Map(localData.settings.map((setting) => [setting.key, setting]));
  const settings = new Map<string, boolean | number | string>(localData.settings.map((setting) => [setting.key, setting.defaultValue]));
  const resourceIds = new Set(localData.resources.map((resource) => resource.id));
  const componentIds = new Set(localData.components.map((component) => component.id));
  const storage = options.storage ?? defaultPersistenceStorage();
  const storageKey = options.storageKey ?? "default";
  for (const slot of slots.values()) {
    const record = readStoredRecord(storage, persistedSlotKey(storageKey, slot.id), slot, resourceIds, componentIds);
    if (record !== undefined) {
      saves.set(slot.id, record);
      for (const [key, value] of Object.entries(record.settings)) {
        setSettingValue(settingSpecs, settings, key, value);
      }
    }
  }

  return {
    delete(slot) {
      const deleted = saves.delete(slot);
      if (deleted) safeStorageWrite(() => storage?.removeItem(persistedSlotKey(storageKey, slot)));
      return deleted;
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
      safeStorageWrite(() => storage?.setItem(persistedSlotKey(storageKey, slot), JSON.stringify(record)));
      return { accepted: true, record, slot, status: "saved" };
    },
    setSetting(key, value) {
      return setSettingValue(settingSpecs, settings, key, value);
    },
  };
}

function defaultPersistenceStorage(): IWebPersistenceStorage | undefined {
  try {
    return typeof globalThis.localStorage === "undefined" ? undefined : globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function persistedSlotKey(namespace: string, slot: string): string {
  return `threenative:persistence:${encodeURIComponent(namespace)}:${encodeURIComponent(slot)}`;
}

function readStoredRecord(
  storage: IWebPersistenceStorage | undefined,
  key: string,
  slot: ILocalDataIr["saveSlots"][number],
  resourceIds: ReadonlySet<string>,
  componentIds: ReadonlySet<string>,
): IPersistenceSaveRecord | undefined {
  try {
    const raw = storage?.getItem(key);
    if (raw === undefined || raw === null) return undefined;
    const candidate = JSON.parse(raw) as unknown;
    if (!isRecord(candidate)
      || candidate.slot !== slot.id
      || candidate.appVersion !== slot.appVersion
      || candidate.schemaVersion !== slot.schemaVersion
      || !isRecord(candidate.resources)
      || !isRecord(candidate.components)
      || !isRecord(candidate.settings)) return undefined;
    const resources = Object.fromEntries(Object.entries(candidate.resources).filter(([id]) => resourceIds.has(id)));
    const components = Object.fromEntries(Object.entries(candidate.components).flatMap(([entity, value]) => {
      if (!isRecord(value)) return [];
      return [[entity, Object.fromEntries(Object.entries(value).filter(([id]) => componentIds.has(id)))]];
    }));
    const settings = Object.fromEntries(Object.entries(candidate.settings).filter(([, value]) => typeof value === "boolean" || typeof value === "number" || typeof value === "string")) as Record<string, boolean | number | string>;
    return { appVersion: slot.appVersion, components, resources, schemaVersion: slot.schemaVersion, settings, slot: slot.id };
  } catch {
    return undefined;
  }
}

function safeStorageWrite(write: () => void): void {
  try {
    write();
  } catch {
    // The in-memory save remains usable for this runtime session.
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
