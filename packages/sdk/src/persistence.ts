import { SdkError } from "./errors.js";

export type PersistenceSettingGroup = "accessibility" | "audio" | "controls" | "video";
export type PersistenceSettingKind = "boolean" | "number" | "string";

export interface IPersistedResourceDeclaration {
  id: string;
  schema: Record<string, unknown>;
}

export interface IPersistedComponentDeclaration {
  id: string;
  schema: Record<string, unknown>;
}

export interface IPersistenceSettingDeclaration {
  defaultValue: boolean | number | string;
  enumValues?: string[];
  group: PersistenceSettingGroup;
  key: string;
  kind: PersistenceSettingKind;
  max?: number;
  min?: number;
}

export interface ISaveSlotDeclaration {
  appVersion: string;
  id: string;
  schemaVersion: number;
}

export interface IPersistenceMigrationDeclaration {
  currentVersion: number;
  migrators: number[];
  transforms?: IPersistenceMigrationTransformDeclaration[];
}

export type PersistenceMigrationOperationKind =
  | "deleteComponent"
  | "deleteResource"
  | "deleteSetting"
  | "renameComponent"
  | "renameResource"
  | "renameSetting";

export interface IPersistenceMigrationOperationDeclaration {
  from: string;
  kind: PersistenceMigrationOperationKind;
  to?: string;
}

export interface IPersistenceMigrationTransformDeclaration {
  fromVersion: number;
  operations: IPersistenceMigrationOperationDeclaration[];
}

export interface IAutosaveDeclaration {
  checkpointEvents?: string[];
  debounceMs: number;
  intervalSeconds?: number;
}

export interface IPersistenceDeclaration {
  autosave?: IAutosaveDeclaration;
  components: IPersistedComponentDeclaration[];
  kind: "Persistence";
  migration?: IPersistenceMigrationDeclaration;
  resources: IPersistedResourceDeclaration[];
  saveSlots: ISaveSlotDeclaration[];
  settings: IPersistenceSettingDeclaration[];
}

export function persistResource(id: string, schema: Record<string, unknown>): IPersistedResourceDeclaration {
  assertId(id, "TN_SDK_PERSIST_RESOURCE_ID_INVALID", "Persisted resource ID must not be empty.");
  assertPortableSchema(schema, "TN_SDK_PERSIST_RESOURCE_SCHEMA_INVALID", `Persisted resource '${id}'`);
  return { id, schema };
}

export function persistComponent(id: string, schema: Record<string, unknown>): IPersistedComponentDeclaration {
  assertId(id, "TN_SDK_PERSIST_COMPONENT_ID_INVALID", "Persisted component ID must not be empty.");
  assertPortableSchema(schema, "TN_SDK_PERSIST_COMPONENT_SCHEMA_INVALID", `Persisted component '${id}'`);
  return { id, schema };
}

export function persistSetting(key: string, options: {
  defaultValue: boolean | number | string;
  enumValues?: string[];
  group: PersistenceSettingGroup;
  kind: PersistenceSettingKind;
  max?: number;
  min?: number;
}): IPersistenceSettingDeclaration {
  assertId(key, "TN_SDK_PERSIST_SETTING_KEY_INVALID", "Persistence setting key must not be empty.");
  if (!["accessibility", "audio", "controls", "video"].includes(options.group)) {
    throw new SdkError("TN_SDK_PERSIST_SETTING_GROUP_INVALID", `Persistence setting '${key}' uses unsupported group '${String(options.group)}'.`);
  }
  if (!["boolean", "number", "string"].includes(options.kind)) {
    throw new SdkError("TN_SDK_PERSIST_SETTING_KIND_INVALID", `Persistence setting '${key}' uses unsupported kind '${String(options.kind)}'.`);
  }
  if (typeof options.defaultValue !== options.kind) {
    throw new SdkError("TN_SDK_PERSIST_SETTING_DEFAULT_INVALID", `Persistence setting '${key}' default value must match kind '${options.kind}'.`);
  }
  if (options.kind === "number" && (options.min !== undefined || options.max !== undefined)) {
    assertFiniteNumber(options.min, "TN_SDK_PERSIST_SETTING_RANGE_INVALID", true);
    assertFiniteNumber(options.max, "TN_SDK_PERSIST_SETTING_RANGE_INVALID", true);
    if (options.min !== undefined && options.max !== undefined && options.max < options.min) {
      throw new SdkError("TN_SDK_PERSIST_SETTING_RANGE_INVALID", `Persistence setting '${key}' max must be greater than or equal to min.`);
    }
  }
  if (options.enumValues !== undefined && (options.kind !== "string" || options.enumValues.length === 0 || options.enumValues.some((value) => value.trim() === ""))) {
    throw new SdkError("TN_SDK_PERSIST_SETTING_ENUM_INVALID", `Persistence setting '${key}' enum values require non-empty string choices.`);
  }
  return {
    defaultValue: options.defaultValue,
    ...(options.enumValues === undefined ? {} : { enumValues: [...options.enumValues].sort() }),
    group: options.group,
    key,
    kind: options.kind,
    ...(options.max === undefined ? {} : { max: options.max }),
    ...(options.min === undefined ? {} : { min: options.min }),
  };
}

export function saveSlot(id: string, options: { appVersion: string; schemaVersion: number }): ISaveSlotDeclaration {
  assertId(id, "TN_SDK_PERSIST_SLOT_ID_INVALID", "Save slot ID must not be empty.");
  assertId(options.appVersion, "TN_SDK_PERSIST_SLOT_APP_VERSION_INVALID", "Save slot app version must not be empty.");
  assertPositiveInteger(options.schemaVersion, "TN_SDK_PERSIST_SLOT_SCHEMA_VERSION_INVALID", "Save slot schema version must be a positive integer.");
  return { appVersion: options.appVersion, id, schemaVersion: options.schemaVersion };
}

export function persistenceMigration(options: {
  currentVersion: number;
  migrators?: number[];
  transforms?: IPersistenceMigrationTransformDeclaration[];
}): IPersistenceMigrationDeclaration {
  assertPositiveInteger(options.currentVersion, "TN_SDK_PERSIST_MIGRATION_VERSION_INVALID", "Persistence current version must be a positive integer.");
  for (const version of options.migrators ?? []) {
    assertPositiveInteger(version, "TN_SDK_PERSIST_MIGRATOR_INVALID", "Persistence migrator versions must be positive integers.");
  }
  const transformVersions = new Set<number>();
  const transforms = (options.transforms ?? []).map((transform) => {
    assertPositiveInteger(transform.fromVersion, "TN_SDK_PERSIST_MIGRATOR_INVALID", "Persistence transform versions must be positive integers.");
    if (transform.fromVersion >= options.currentVersion) {
      throw new SdkError("TN_SDK_PERSIST_MIGRATOR_INVALID", "Persistence transform fromVersion must be lower than currentVersion.");
    }
    if (transformVersions.has(transform.fromVersion)) {
      throw new SdkError("TN_SDK_PERSIST_MIGRATOR_DUPLICATE", `Persistence transform from version ${transform.fromVersion} is duplicated.`);
    }
    transformVersions.add(transform.fromVersion);
    return {
      fromVersion: transform.fromVersion,
      operations: transform.operations.map(normalizeMigrationOperation),
    };
  }).sort((left, right) => left.fromVersion - right.fromVersion);
  const migrators = [...new Set([...(options.migrators ?? []), ...transformVersions])].sort((left, right) => left - right);
  return {
    currentVersion: options.currentVersion,
    migrators,
    ...(transforms.length === 0 ? {} : { transforms }),
  };
}

function normalizeMigrationOperation(operation: IPersistenceMigrationOperationDeclaration): IPersistenceMigrationOperationDeclaration {
  if (!["deleteComponent", "deleteResource", "deleteSetting", "renameComponent", "renameResource", "renameSetting"].includes(operation.kind)) {
    throw new SdkError("TN_SDK_PERSIST_MIGRATION_OPERATION_INVALID", `Persistence migration operation kind '${String(operation.kind)}' is not supported.`);
  }
  assertId(operation.from, "TN_SDK_PERSIST_MIGRATION_OPERATION_INVALID", "Persistence migration operation from must not be empty.");
  const isRename = operation.kind.startsWith("rename");
  if (isRename && (operation.to === undefined || operation.to.trim() === "")) {
    throw new SdkError("TN_SDK_PERSIST_MIGRATION_OPERATION_INVALID", "Persistence rename operations require a non-empty to value.");
  }
  if (!isRename && operation.to !== undefined) {
    throw new SdkError("TN_SDK_PERSIST_MIGRATION_OPERATION_INVALID", "Persistence delete operations must not declare a to value.");
  }
  return { from: operation.from, kind: operation.kind, ...(operation.to === undefined ? {} : { to: operation.to }) };
}

export function autosave(options: { checkpointEvents?: string[]; debounceMs: number; intervalSeconds?: number }): IAutosaveDeclaration {
  assertFiniteNumber(options.debounceMs, "TN_SDK_PERSIST_AUTOSAVE_DEBOUNCE_INVALID");
  if (options.debounceMs < 0) {
    throw new SdkError("TN_SDK_PERSIST_AUTOSAVE_DEBOUNCE_INVALID", "Autosave debounce must be non-negative.");
  }
  if (options.intervalSeconds !== undefined && (!Number.isFinite(options.intervalSeconds) || options.intervalSeconds <= 0)) {
    throw new SdkError("TN_SDK_PERSIST_AUTOSAVE_INTERVAL_INVALID", "Autosave interval must be positive when provided.");
  }
  for (const event of options.checkpointEvents ?? []) {
    assertId(event, "TN_SDK_PERSIST_AUTOSAVE_EVENT_INVALID", "Autosave checkpoint event must not be empty.");
  }
  return {
    ...(options.checkpointEvents === undefined ? {} : { checkpointEvents: [...options.checkpointEvents].sort() }),
    debounceMs: options.debounceMs,
    ...(options.intervalSeconds === undefined ? {} : { intervalSeconds: options.intervalSeconds }),
  };
}

export function definePersistence(options: {
  autosave?: IAutosaveDeclaration;
  components?: IPersistedComponentDeclaration[];
  migration?: IPersistenceMigrationDeclaration;
  resources?: IPersistedResourceDeclaration[];
  saveSlots?: ISaveSlotDeclaration[];
  settings?: IPersistenceSettingDeclaration[];
}): IPersistenceDeclaration {
  assertUnique(options.resources ?? [], "TN_SDK_PERSIST_RESOURCE_DUPLICATE", "Persisted resource");
  assertUnique(options.components ?? [], "TN_SDK_PERSIST_COMPONENT_DUPLICATE", "Persisted component");
  assertUnique((options.settings ?? []).map((setting) => ({ id: setting.key })), "TN_SDK_PERSIST_SETTING_DUPLICATE", "Persistence setting");
  assertUnique(options.saveSlots ?? [], "TN_SDK_PERSIST_SLOT_DUPLICATE", "Save slot");
  return {
    ...(options.autosave === undefined ? {} : { autosave: options.autosave }),
    components: [...(options.components ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    kind: "Persistence",
    ...(options.migration === undefined ? {} : { migration: options.migration }),
    resources: [...(options.resources ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    saveSlots: [...(options.saveSlots ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    settings: [...(options.settings ?? [])].sort((left, right) => left.key.localeCompare(right.key)),
  };
}

function assertPortableSchema(schema: Record<string, unknown>, code: string, label: string): void {
  if (typeof schema !== "object" || schema === null || Array.isArray(schema)) {
    throw new SdkError(code, `${label} schema must be an object.`);
  }
  if (containsRuntimeHandle(schema)) {
    throw new SdkError("TN_SDK_PERSIST_RUNTIME_HANDLE_UNSUPPORTED", `${label} schema must not include runtime handles.`);
  }
}

function containsRuntimeHandle(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsRuntimeHandle);
  }
  if (typeof value === "object" && value !== null) {
    return Object.entries(value).some(([key, child]) => key === "runtimeHandle" || key === "nativeHandle" || containsRuntimeHandle(child));
  }
  return false;
}

function assertId(value: string, code: string, message: string): void {
  if (value.trim() === "") {
    throw new SdkError(code, message);
  }
}

function assertFiniteNumber(value: number | undefined, code: string, optional = false): void {
  if (value === undefined && optional) {
    return;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SdkError(code, "Persistence numeric values must be finite.");
  }
}

function assertPositiveInteger(value: number, code: string, message: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SdkError(code, message);
  }
}

function assertUnique(values: readonly { id: string }[], code: string, label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value.id)) {
      throw new SdkError(code, `${label} '${value.id}' is duplicated.`);
    }
    seen.add(value.id);
  }
}
