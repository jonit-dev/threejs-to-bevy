import type { ILocalDataIr, ILocalDataMigrationOperationIr, IWorldIr } from "@threenative/ir";

export const DEFAULT_MAX_PERSISTENCE_RECORD_BYTES = 1_048_576;

export interface IPersistenceDiagnostic {
  code: string;
  message: string;
  path: string;
  severity: "error";
  suggestion: string;
}

export interface IPersistenceSaveRecord {
  appVersion: string;
  components: Record<string, Record<string, unknown>>;
  resources: Record<string, unknown>;
  schema: "threenative.persistence-record";
  schemaVersion: number;
  settings: Record<string, boolean | number | string>;
  slot: string;
  version: "0.1.0";
}

interface IPersistenceSettingsRecord {
  schema: "threenative.persistence-settings";
  settings: Record<string, boolean | number | string>;
  version: "0.1.0";
}

export interface IPersistenceSaveResult {
  accepted: boolean;
  record?: IPersistenceSaveRecord;
  slot: string;
  status: "missing-slot" | "record-too-large" | "saved" | "storage-failed";
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
  diagnostics: readonly IPersistenceDiagnostic[];
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
  maxRecordBytes?: number;
  storage?: IWebPersistenceStorage;
  storageKey?: string;
}

export function createMemoryPersistenceStorage(): IWebPersistenceStorage {
  const records = new Map<string, string>();
  return {
    getItem: (key) => records.get(key) ?? null,
    removeItem: (key) => { records.delete(key); },
    setItem: (key, value) => { records.set(key, value); },
  };
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
  const maxRecordBytes = options.maxRecordBytes ?? DEFAULT_MAX_PERSISTENCE_RECORD_BYTES;
  const diagnostics: IPersistenceDiagnostic[] = [];
  const storedSettings = readStoredSettings(storage, persistedSettingsKey(storageKey), localData, maxRecordBytes);
  if (storedSettings.diagnostic !== undefined) diagnostics.push(storedSettings.diagnostic);
  if (storedSettings.settings !== undefined) {
    for (const [key, value] of Object.entries(storedSettings.settings)) setSettingValue(settingSpecs, settings, key, value);
  }
  for (const slot of slots.values()) {
    const result = readStoredRecord(storage, persistedSlotKey(storageKey, slot.id), slot, localData, maxRecordBytes);
    if (result.diagnostic !== undefined) diagnostics.push(result.diagnostic);
    if (result.record !== undefined) {
      saves.set(slot.id, result.record);
    }
  }

  return {
    delete(slot) {
      if (!saves.has(slot)) return false;
      if (storage === undefined || !safeStorageWrite(() => storage.removeItem(persistedSlotKey(storageKey, slot)))) {
        diagnostics.push(recordDiagnostic("TN_PERSISTENCE_STORAGE_DELETE_FAILED", `Storage could not delete slot '${slot}'.`, persistedSlotKey(storageKey, slot), "Check storage availability and retry; the committed save remains available."));
        return false;
      }
      return saves.delete(slot);
    },
    diagnostics,
    exportSettings() {
      return Object.fromEntries([...settings.entries()].sort(([left], [right]) => left.localeCompare(right)));
    },
    getSetting(key) {
      return settings.get(key);
    },
    importSettings(values) {
      const candidate = new Map(settings);
      for (const [key, value] of Object.entries(values)) {
        setSettingValue(settingSpecs, candidate, key, value);
      }
      if (!commitSettings(storage, persistedSettingsKey(storageKey), candidate, maxRecordBytes)) {
        diagnostics.push(recordDiagnostic("TN_PERSISTENCE_SETTINGS_WRITE_FAILED", "Storage could not commit imported settings.", persistedSettingsKey(storageKey), "Check storage availability and retry; prior committed settings remain active."));
        return this.exportSettings();
      }
      settings.clear();
      for (const [key, value] of candidate) settings.set(key, value);
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
        schema: "threenative.persistence-record",
        schemaVersion: slotSpec.schemaVersion,
        settings: this.exportSettings(),
        slot,
        version: "0.1.0",
      };
      const serialized = JSON.stringify(record);
      if (encodedByteLength(serialized) > maxRecordBytes) {
        diagnostics.push(recordDiagnostic(
          "TN_PERSISTENCE_RECORD_TOO_LARGE",
          `Save record for slot '${slot}' exceeds the ${String(maxRecordBytes)} byte limit.`,
          persistedSlotKey(storageKey, slot),
          "Reduce the declared persisted data or raise the adapter-private record limit.",
        ));
        return { accepted: false, slot, status: "record-too-large" };
      }
      if (storage === undefined || !safeStorageWrite(() => storage.setItem(persistedSlotKey(storageKey, slot), serialized))) {
        diagnostics.push(recordDiagnostic("TN_PERSISTENCE_STORAGE_WRITE_FAILED", `Storage could not commit slot '${slot}'.`, persistedSlotKey(storageKey, slot), "Check storage availability and retry; the prior committed record remains available."));
        return { accepted: false, slot, status: "storage-failed" };
      }
      saves.set(slot, clone(record) as IPersistenceSaveRecord);
      return { accepted: true, record, slot, status: "saved" };
    },
    setSetting(key, value) {
      const candidate = new Map(settings);
      if (!setSettingValue(settingSpecs, candidate, key, value)) return false;
      if (!commitSettings(storage, persistedSettingsKey(storageKey), candidate, maxRecordBytes)) {
        diagnostics.push(recordDiagnostic("TN_PERSISTENCE_SETTINGS_WRITE_FAILED", `Storage could not commit setting '${key}'.`, persistedSettingsKey(storageKey), "Check storage availability and retry; the prior committed setting remains active."));
        return false;
      }
      settings.clear();
      for (const [settingKey, settingValue] of candidate) settings.set(settingKey, settingValue);
      return true;
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

function persistedSettingsKey(namespace: string): string {
  return `threenative:persistence:${encodeURIComponent(namespace)}:settings`;
}

function readStoredRecord(
  storage: IWebPersistenceStorage | undefined,
  key: string,
  slot: ILocalDataIr["saveSlots"][number],
  localData: ILocalDataIr,
  maxRecordBytes: number,
): { diagnostic?: IPersistenceDiagnostic; record?: IPersistenceSaveRecord } {
  let raw: string | null | undefined;
  try {
    raw = storage?.getItem(key);
  } catch {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_STORAGE_READ_FAILED", `Storage could not read slot '${slot.id}'.`, key, "Check storage availability and retry without deleting the existing record.") };
  }
  if (raw === undefined || raw === null) return {};
  if (encodedByteLength(raw) > maxRecordBytes) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_RECORD_TOO_LARGE", `Stored record for slot '${slot.id}' exceeds the ${String(maxRecordBytes)} byte limit.`, key, "Preserve the record for recovery and import a bounded compatible save.") };
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw) as unknown;
  } catch {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_RECORD_CORRUPT", `Stored record for slot '${slot.id}' is not valid JSON.`, key, "Preserve the record for recovery and restore a known-good copy.") };
  }
  if (!isPersistenceSaveRecord(candidate) || candidate.slot !== slot.id) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_RECORD_CORRUPT", `Stored record for slot '${slot.id}' has an invalid envelope.`, key, "Preserve the record for recovery and restore a record with the declared envelope.") };
  }
  if (candidate.schemaVersion > slot.schemaVersion) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_SAVE_FORWARD_INCOMPATIBLE", `Save schema version ${String(candidate.schemaVersion)} is newer than declared slot version ${String(slot.schemaVersion)}.`, key, "Upgrade the game/runtime that owns this save before loading it.") };
  }
  if (candidate.appVersion !== slot.appVersion) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_APP_VERSION_INCOMPATIBLE", `Save app version '${candidate.appVersion}' does not match declared version '${slot.appVersion}'.`, key, "Load the save with its matching app version or provide an explicit compatible migration.") };
  }
  const migrated = migrateRecord(candidate, slot.schemaVersion, localData, key);
  if ("diagnostic" in migrated) return migrated;
  const undeclared = findUndeclaredField(migrated.record, localData);
  if (undeclared !== undefined) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_RECORD_UNDECLARED_FIELD", `Stored record for slot '${slot.id}' contains undeclared field '${undeclared}'.`, `${key}/${undeclared}`, "Declare and migrate the field explicitly, or remove it from the recovery copy.") };
  }
  if (!hasValidSettings(migrated.record.settings, localData)) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_RECORD_CORRUPT", `Stored record for slot '${slot.id}' contains an invalid setting value.`, key, "Preserve the record for recovery and correct values against local-data.ir.json.") };
  }
  if (migrated.record.schemaVersion !== candidate.schemaVersion) {
    const serialized = JSON.stringify(migrated.record);
    if (encodedByteLength(serialized) > maxRecordBytes || storage === undefined || !safeStorageWrite(() => storage.setItem(key, serialized))) {
      return { diagnostic: recordDiagnostic("TN_PERSISTENCE_MIGRATION_COMMIT_FAILED", `Migrated record for slot '${slot.id}' could not be committed.`, key, "Check storage availability and retry; the prior record remains unchanged.") };
    }
  }
  return { record: clone(migrated.record) };
}

function isPersistenceSaveRecord(value: unknown): value is IPersistenceSaveRecord {
  if (!isRecord(value)) return false;
  const allowed = new Set(["appVersion", "components", "resources", "schema", "schemaVersion", "settings", "slot", "version"]);
  return Object.keys(value).every((key) => allowed.has(key))
    && typeof value.appVersion === "string"
    && isRecord(value.components)
    && isRecord(value.resources)
    && value.schema === "threenative.persistence-record"
    && Number.isInteger(value.schemaVersion)
    && Number(value.schemaVersion) > 0
    && isRecord(value.settings)
    && typeof value.slot === "string"
    && value.version === "0.1.0"
    && Object.values(value.components).every(isRecord);
}

function readStoredSettings(
  storage: IWebPersistenceStorage | undefined,
  key: string,
  localData: ILocalDataIr,
  maxRecordBytes: number,
): { diagnostic?: IPersistenceDiagnostic; settings?: Record<string, boolean | number | string> } {
  let raw: string | null | undefined;
  try { raw = storage?.getItem(key); } catch {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_SETTINGS_READ_FAILED", "Storage could not read settings.", key, "Check storage availability and retry without overwriting the settings record.") };
  }
  if (raw === undefined || raw === null) return {};
  if (encodedByteLength(raw) > maxRecordBytes) return { diagnostic: recordDiagnostic("TN_PERSISTENCE_RECORD_TOO_LARGE", "Stored settings exceed the record byte limit.", key, "Preserve the record and restore a bounded compatible copy.") };
  let value: unknown;
  try { value = JSON.parse(raw) as unknown; } catch {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_SETTINGS_CORRUPT", "Stored settings are not valid JSON.", key, "Preserve the record and restore a known-good copy.") };
  }
  if (!isRecord(value) || Object.keys(value).some((field) => !["schema", "settings", "version"].includes(field)) || value.schema !== "threenative.persistence-settings" || value.version !== "0.1.0" || !isRecord(value.settings)) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_SETTINGS_CORRUPT", "Stored settings have an invalid or forward-incompatible envelope.", key, "Preserve the record and load it with a compatible runtime.") };
  }
  const candidate = value.settings as Record<string, unknown>;
  const accepted = new Map<string, boolean | number | string>();
  const specs = new Map(localData.settings.map((setting) => [setting.key, setting]));
  if (!Object.entries(candidate).every(([settingKey, settingValue]) => setSettingValue(specs, accepted, settingKey, settingValue))) {
    return { diagnostic: recordDiagnostic("TN_PERSISTENCE_SETTINGS_UNDECLARED_OR_INVALID", "Stored settings contain an undeclared or invalid value.", key, "Preserve the record and migrate it against local-data.ir.json.") };
  }
  return { settings: Object.fromEntries(accepted) };
}

function commitSettings(storage: IWebPersistenceStorage | undefined, key: string, values: Map<string, boolean | number | string>, maxRecordBytes: number): boolean {
  const record: IPersistenceSettingsRecord = { schema: "threenative.persistence-settings", settings: Object.fromEntries(values), version: "0.1.0" };
  const serialized = JSON.stringify(record);
  return storage !== undefined && encodedByteLength(serialized) <= maxRecordBytes && safeStorageWrite(() => storage.setItem(key, serialized));
}

function migrateRecord(
  input: IPersistenceSaveRecord,
  targetVersion: number,
  localData: ILocalDataIr,
  path: string,
): { diagnostic: IPersistenceDiagnostic } | { record: IPersistenceSaveRecord } {
  const record = clone(input);
  const migration = localData.migration;
  for (let version = record.schemaVersion; version < targetVersion; version += 1) {
    if (migration === undefined || !migration.migrators.includes(version)) {
      return { diagnostic: recordDiagnostic("TN_PERSISTENCE_MIGRATOR_MISSING", `Save schema version ${String(version)} cannot migrate to ${String(version + 1)}.`, path, "Declare every sequential migration step and retry without overwriting the save.") };
    }
    const transform = migration.transforms?.find((entry) => entry.fromVersion === version);
    if (localData.version === "0.1.0" || transform === undefined) {
      return { diagnostic: recordDiagnostic("TN_PERSISTENCE_MIGRATOR_UNEXECUTABLE", `Save schema version ${String(version)} has metadata but no executable declarative transform.`, path, "Emit local data IR version 0.2.0 with a transform for every migration step.") };
    }
    for (const operation of transform.operations) applyMigrationOperation(record, operation);
    record.schemaVersion = version + 1;
  }
  return { record };
}

function applyMigrationOperation(record: IPersistenceSaveRecord, operation: ILocalDataMigrationOperationIr): void {
  const target = operation.kind.endsWith("Resource") ? record.resources : operation.kind.endsWith("Setting") ? record.settings : undefined;
  if (target !== undefined) {
    migrateKey(target, operation.from, operation.kind.startsWith("rename") ? operation.to : undefined);
    return;
  }
  for (const components of Object.values(record.components)) {
    migrateKey(components, operation.from, operation.kind.startsWith("rename") ? operation.to : undefined);
  }
}

function migrateKey(target: Record<string, unknown>, from: string, to: string | undefined): void {
  if (!Object.hasOwn(target, from)) return;
  if (to !== undefined && !Object.hasOwn(target, to)) target[to] = target[from];
  delete target[from];
}

function findUndeclaredField(record: IPersistenceSaveRecord, localData: ILocalDataIr): string | undefined {
  const resourceIds = new Set(localData.resources.map((entry) => entry.id));
  const componentIds = new Set(localData.components.map((entry) => entry.id));
  const settingIds = new Set(localData.settings.map((entry) => entry.key));
  const resource = Object.keys(record.resources).find((id) => !resourceIds.has(id));
  if (resource !== undefined) return `resources/${resource}`;
  for (const [entity, components] of Object.entries(record.components)) {
    const component = Object.keys(components).find((id) => !componentIds.has(id));
    if (component !== undefined) return `components/${entity}/${component}`;
  }
  const setting = Object.keys(record.settings).find((id) => !settingIds.has(id));
  return setting === undefined ? undefined : `settings/${setting}`;
}

function hasValidSettings(settings: IPersistenceSaveRecord["settings"], localData: ILocalDataIr): boolean {
  const specs = new Map(localData.settings.map((entry) => [entry.key, entry]));
  const accepted = new Map<string, boolean | number | string>();
  return Object.entries(settings).every(([key, value]) => setSettingValue(specs, accepted, key, value));
}

function recordDiagnostic(code: string, message: string, path: string, suggestion: string): IPersistenceDiagnostic {
  return { code, message, path, severity: "error", suggestion };
}

function encodedByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function safeStorageWrite(write: () => void): boolean {
  try {
    write();
    return true;
  } catch {
    return false;
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
