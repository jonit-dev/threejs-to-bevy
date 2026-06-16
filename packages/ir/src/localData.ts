import type { IIrDiagnostic } from "./validate.js";
import type { IIrNamedSchema, IWorldIr, SchemaVersion } from "./types.js";

export type LocalDataSchema = "threenative.local-data";
export type LocalDataStorage = "local-only";
export type LocalDataSettingGroup = "accessibility" | "audio" | "controls" | "video";
export type LocalDataSettingKind = "boolean" | "integer" | "number" | "string";
export type LocalDataCheckpointSchedule = "fixedUpdate" | "postUpdate" | "startup" | "update";

export interface ILocalDataSettingIr {
  default: boolean | number | string;
  group: LocalDataSettingGroup;
  id: string;
  kind: LocalDataSettingKind;
  max?: number;
  min?: number;
  values?: readonly string[];
}

export interface ILocalDataComponentRefIr {
  component: string;
  entity?: string;
}

export interface ILocalDataSaveSlotIr {
  components?: readonly ILocalDataComponentRefIr[];
  id: string;
  label?: string;
  maxBytes?: number;
  resources?: readonly string[];
  version: string;
}

export interface ILocalDataMigrationIr {
  appliesTo: string;
  fromVersion: string;
  hint: string;
  id: string;
  strategy: "diagnostic";
  toVersion: string;
}

export interface ILocalDataCheckpointIr {
  event: string;
  id: string;
  saveSlot: string;
  schedule: LocalDataCheckpointSchedule;
}

export interface ILocalDataIr {
  schema: LocalDataSchema;
  version: SchemaVersion;
  checkpoints?: readonly ILocalDataCheckpointIr[];
  migrations?: readonly ILocalDataMigrationIr[];
  saveSlots: readonly ILocalDataSaveSlotIr[];
  settings: readonly ILocalDataSettingIr[];
  storage: LocalDataStorage;
}

const settingGroups = new Set(["accessibility", "audio", "controls", "video"]);
const settingKinds = new Set(["boolean", "integer", "number", "string"]);
const checkpointSchedules = new Set(["fixedUpdate", "postUpdate", "startup", "update"]);

export function validateLocalDataIr(
  localData: ILocalDataIr,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  resourceSchemas: Record<string, IIrNamedSchema>,
  eventSchemas: Record<string, IIrNamedSchema>,
  world: IWorldIr | undefined,
  diagnostics: IIrDiagnostic[],
): void {
  const raw = localData as unknown as Record<string, unknown>;
  for (const key of Object.keys(raw)) {
    if (!["checkpoints", "migrations", "saveSlots", "schema", "settings", "storage", "version"].includes(key)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED", message: `Local data IR uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (localData.schema !== "threenative.local-data" || localData.version !== "0.1.0") {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_VERSION_UNSUPPORTED", message: "Local data IR must use threenative.local-data version 0.1.0.", path, severity: "error" });
  }
  if (localData.storage !== "local-only") {
    diagnostics.push({
      code: "TN_IR_LOCAL_DATA_STORAGE_UNSUPPORTED",
      message: "Local data storage must be local-only.",
      path: `${path}/storage`,
      severity: "error",
      suggestion: "Cloud, account-bound, and network-backed storage are outside the V8 local-data contract.",
    });
  }

  const entityIds = new Set((world?.entities ?? []).map((entity) => entity.id));
  const slotIds = validateSaveSlots(localData.saveSlots, `${path}/saveSlots`, componentSchemas, resourceSchemas, entityIds, diagnostics);
  validateSettings(localData.settings, `${path}/settings`, diagnostics);
  validateMigrations(localData.migrations, `${path}/migrations`, slotIds, diagnostics);
  validateCheckpoints(localData.checkpoints, `${path}/checkpoints`, slotIds, eventSchemas, diagnostics);
}

function validateSaveSlots(
  value: unknown,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  resourceSchemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOTS_INVALID", message: "Local data saveSlots must be a non-empty array.", path, severity: "error" });
    return ids;
  }
  value.forEach((slot, index) => {
    const slotPath = `${path}/${index}`;
    if (!isRecord(slot)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_INVALID", message: "Save slot must be an object.", path: slotPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(slot)) {
      if (!["components", "id", "label", "maxBytes", "resources", "version"].includes(key)) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED", message: `Save slot uses unsupported field '${key}'.`, path: `${slotPath}/${key}`, severity: "error" });
      }
    }
    const id = readId(slot.id, `${slotPath}/id`, "TN_IR_LOCAL_DATA_SAVE_SLOT_ID_INVALID", ids, diagnostics);
    if (id !== undefined) {
      ids.add(id);
    }
    if (typeof slot.version !== "string" || slot.version.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_VERSION_INVALID", message: "Save slot version must be a non-empty string.", path: `${slotPath}/version`, severity: "error" });
    }
    const maxBytes = slot.maxBytes;
    if (maxBytes !== undefined && (typeof maxBytes !== "number" || !Number.isInteger(maxBytes) || maxBytes <= 0)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_MAX_BYTES_INVALID", message: "Save slot maxBytes must be a positive integer.", path: `${slotPath}/maxBytes`, severity: "error" });
    }
    validateResourceRefs(slot.resources, `${slotPath}/resources`, resourceSchemas, diagnostics);
    validateComponentRefs(slot.components, `${slotPath}/components`, componentSchemas, entityIds, diagnostics);
    if ((slot.resources === undefined || (Array.isArray(slot.resources) && slot.resources.length === 0)) && (slot.components === undefined || (Array.isArray(slot.components) && slot.components.length === 0))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_EMPTY", message: "Save slot must persist at least one declared resource or component.", path: slotPath, severity: "error" });
    }
  });
  return ids;
}

function validateResourceRefs(value: unknown, path: string, resourceSchemas: Record<string, IIrNamedSchema>, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_RESOURCE_REFS_INVALID", message: "Save slot resources must be an array.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((resource, index) => {
    if (typeof resource !== "string" || resource.trim() === "" || resourceSchemas[resource] === undefined) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_RESOURCE_SCHEMA_MISSING", message: "Persisted resource must reference a declared resource schema.", path: `${path}/${index}`, severity: "error" });
    } else if (seen.has(resource)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_RESOURCE_DUPLICATE", message: `Persisted resource '${resource}' is duplicated.`, path: `${path}/${index}`, severity: "error" });
    }
    seen.add(String(resource));
  });
}

function validateComponentRefs(
  value: unknown,
  path: string,
  componentSchemas: Record<string, IIrNamedSchema>,
  entityIds: ReadonlySet<string>,
  diagnostics: IIrDiagnostic[],
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_COMPONENT_REFS_INVALID", message: "Save slot components must be an array.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((componentRef, index) => {
    const refPath = `${path}/${index}`;
    if (!isRecord(componentRef)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_COMPONENT_REF_INVALID", message: "Persisted component reference must be an object.", path: refPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(componentRef)) {
      if (!["component", "entity"].includes(key)) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED", message: `Persisted component reference uses unsupported field '${key}'.`, path: `${refPath}/${key}`, severity: "error" });
      }
    }
    if (typeof componentRef.component !== "string" || componentRef.component.trim() === "" || componentSchemas[componentRef.component] === undefined) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_COMPONENT_SCHEMA_MISSING", message: "Persisted component must reference a declared component schema.", path: `${refPath}/component`, severity: "error" });
    }
    if (componentRef.entity !== undefined && (typeof componentRef.entity !== "string" || !entityIds.has(componentRef.entity))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_COMPONENT_ENTITY_MISSING", message: "Persisted component entity filter must reference an entity in world.ir.json.", path: `${refPath}/entity`, severity: "error" });
    }
    const key = `${String(componentRef.component)}:${String(componentRef.entity ?? "*")}`;
    if (seen.has(key)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_COMPONENT_DUPLICATE", message: "Persisted component reference is duplicated.", path: refPath, severity: "error" });
    }
    seen.add(key);
  });
}

function validateSettings(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTINGS_INVALID", message: "Local data settings must be an array.", path, severity: "error" });
    return;
  }
  const ids = new Set<string>();
  value.forEach((setting, index) => {
    const settingPath = `${path}/${index}`;
    if (!isRecord(setting)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_INVALID", message: "Local setting must be an object.", path: settingPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(setting)) {
      if (!["default", "group", "id", "kind", "max", "min", "values"].includes(key)) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED", message: `Local setting uses unsupported field '${key}'.`, path: `${settingPath}/${key}`, severity: "error" });
      }
    }
    const id = readId(setting.id, `${settingPath}/id`, "TN_IR_LOCAL_DATA_SETTING_ID_INVALID", ids, diagnostics);
    if (id !== undefined) {
      ids.add(id);
    }
    if (!settingGroups.has(String(setting.group))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_GROUP_UNSUPPORTED", message: "Local setting group must be controls, audio, video, or accessibility.", path: `${settingPath}/group`, severity: "error" });
    }
    if (!settingKinds.has(String(setting.kind))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_KIND_UNSUPPORTED", message: "Local setting kind must be boolean, integer, number, or string.", path: `${settingPath}/kind`, severity: "error" });
      return;
    }
    validateSettingDefault(setting.default, String(setting.kind), `${settingPath}/default`, diagnostics);
    if (setting.kind === "integer" || setting.kind === "number") {
      validateSettingRange(setting, settingPath, diagnostics);
    }
    if (setting.values !== undefined) {
      if (setting.kind !== "string" || !Array.isArray(setting.values) || setting.values.length === 0 || setting.values.some((item) => typeof item !== "string" || item.length === 0)) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_VALUES_INVALID", message: "Local setting values may only constrain non-empty string settings.", path: `${settingPath}/values`, severity: "error" });
      } else if (!setting.values.includes(setting.default as string)) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DEFAULT_INVALID", message: "Local setting default must be one of the declared string values.", path: `${settingPath}/default`, severity: "error" });
      }
    }
  });
}

function validateSettingDefault(value: unknown, kind: string, path: string, diagnostics: IIrDiagnostic[]): void {
  const valid =
    kind === "boolean" ? typeof value === "boolean"
      : kind === "integer" ? typeof value === "number" && Number.isInteger(value)
        : kind === "number" ? typeof value === "number" && Number.isFinite(value)
          : kind === "string" ? typeof value === "string"
            : false;
  if (!valid) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DEFAULT_INVALID", message: `Local setting default must match kind '${kind}'.`, path, severity: "error" });
  }
}

function validateSettingRange(setting: Record<string, unknown>, path: string, diagnostics: IIrDiagnostic[]): void {
  for (const key of ["min", "max"]) {
    if (setting[key] !== undefined && (typeof setting[key] !== "number" || !Number.isFinite(setting[key]))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", message: `Local setting ${key} must be a finite number.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (typeof setting.min === "number" && typeof setting.max === "number" && setting.min > setting.max) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", message: "Local setting min must be less than or equal to max.", path, severity: "error" });
  }
  if (typeof setting.default === "number") {
    if (typeof setting.min === "number" && setting.default < setting.min) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DEFAULT_INVALID", message: "Local setting default must be greater than or equal to min.", path: `${path}/default`, severity: "error" });
    }
    if (typeof setting.max === "number" && setting.default > setting.max) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DEFAULT_INVALID", message: "Local setting default must be less than or equal to max.", path: `${path}/default`, severity: "error" });
    }
  }
}

function validateMigrations(value: unknown, path: string, slotIds: ReadonlySet<string>, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATIONS_INVALID", message: "Local data migrations must be an array.", path, severity: "error" });
    return;
  }
  const ids = new Set<string>();
  value.forEach((migration, index) => {
    const migrationPath = `${path}/${index}`;
    if (!isRecord(migration)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_INVALID", message: "Local data migration must be an object.", path: migrationPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(migration)) {
      if (!["appliesTo", "fromVersion", "hint", "id", "strategy", "toVersion"].includes(key)) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED", message: `Local data migration uses unsupported field '${key}'.`, path: `${migrationPath}/${key}`, severity: "error" });
      }
    }
    const id = readId(migration.id, `${migrationPath}/id`, "TN_IR_LOCAL_DATA_MIGRATION_ID_INVALID", ids, diagnostics);
    if (id !== undefined) {
      ids.add(id);
    }
    if (typeof migration.appliesTo !== "string" || !slotIds.has(migration.appliesTo)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_SLOT_MISSING", message: "Local data migration must reference a declared save slot.", path: `${migrationPath}/appliesTo`, severity: "error" });
    }
    if (migration.strategy !== "diagnostic") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_STRATEGY_UNSUPPORTED", message: "Local data migration strategy must be diagnostic.", path: `${migrationPath}/strategy`, severity: "error" });
    }
    for (const key of ["fromVersion", "hint", "toVersion"]) {
      if (typeof migration[key] !== "string" || migration[key].trim() === "") {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_INVALID", message: `Local data migration ${key} must be a non-empty string.`, path: `${migrationPath}/${key}`, severity: "error" });
      }
    }
  });
}

function validateCheckpoints(value: unknown, path: string, slotIds: ReadonlySet<string>, eventSchemas: Record<string, IIrNamedSchema>, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_CHECKPOINTS_INVALID", message: "Local data checkpoints must be an array.", path, severity: "error" });
    return;
  }
  const ids = new Set<string>();
  value.forEach((checkpoint, index) => {
    const checkpointPath = `${path}/${index}`;
    if (!isRecord(checkpoint)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_CHECKPOINT_INVALID", message: "Local data checkpoint must be an object.", path: checkpointPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(checkpoint)) {
      if (!["event", "id", "saveSlot", "schedule"].includes(key)) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED", message: `Local data checkpoint uses unsupported field '${key}'.`, path: `${checkpointPath}/${key}`, severity: "error" });
      }
    }
    const id = readId(checkpoint.id, `${checkpointPath}/id`, "TN_IR_LOCAL_DATA_CHECKPOINT_ID_INVALID", ids, diagnostics);
    if (id !== undefined) {
      ids.add(id);
    }
    if (typeof checkpoint.saveSlot !== "string" || !slotIds.has(checkpoint.saveSlot)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_CHECKPOINT_SLOT_MISSING", message: "Local data checkpoint must reference a declared save slot.", path: `${checkpointPath}/saveSlot`, severity: "error" });
    }
    if (typeof checkpoint.event !== "string" || eventSchemas[checkpoint.event] === undefined) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_CHECKPOINT_EVENT_SCHEMA_MISSING", message: "Local data checkpoint must reference a declared event schema.", path: `${checkpointPath}/event`, severity: "error" });
    }
    if (!checkpointSchedules.has(String(checkpoint.schedule))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_CHECKPOINT_SCHEDULE_UNSUPPORTED", message: "Local data checkpoint schedule must be startup, fixedUpdate, update, or postUpdate.", path: `${checkpointPath}/schedule`, severity: "error" });
    }
  });
}

function readId(value: unknown, path: string, code: string, seen: ReadonlySet<string>, diagnostics: IIrDiagnostic[]): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    diagnostics.push({ code, message: "ID must be a non-empty string.", path, severity: "error" });
    return undefined;
  }
  if (seen.has(value)) {
    diagnostics.push({ code: code.replace("_INVALID", "_DUPLICATE"), message: `ID '${value}' is duplicated.`, path, severity: "error" });
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
