import type { ILocalDataIr } from "./types.js";
import type { IIrDiagnostic } from "./validate.js";
import { isRecord, validateOptionalFiniteNumber } from "./validationPrimitives.js";

export function validateLocalData(localData: ILocalDataIr, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(localData)) {
    diagnostics.push({
      code: "TN_IR_LOCAL_DATA_INVALID",
      message: "Local data IR must be a JSON object.",
      path,
      severity: "error",
      suggestion: "Regenerate local-data.ir.json from SDK persistence declarations.",
    });
    return;
  }
  if (localData.schema !== "threenative.local-data" || localData.version !== "0.1.0") {
    diagnostics.push({
      code: "TN_IR_LOCAL_DATA_VERSION_UNSUPPORTED",
      message: "Local data IR must use threenative.local-data version 0.1.0.",
      path,
      severity: "error",
    });
  }
  for (const key of Object.keys(localData)) {
    if (!["autosave", "components", "migration", "resources", "saveSlots", "schema", "settings", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_LOCAL_DATA_FIELD_UNSUPPORTED",
        message: `Local data IR field '${key}' is not supported.`,
        path: `${path}/${key}`,
        suggestion: "Remove runtime-specific persistence fields from local-data.ir.json.",
      });
    }
  }
  validateLocalDataSchemaEntries(localData.resources, `${path}/resources`, "resource", diagnostics);
  validateLocalDataSchemaEntries(localData.components, `${path}/components`, "component", diagnostics);
  validateLocalDataSettings(localData.settings, `${path}/settings`, diagnostics);
  validateLocalDataSaveSlots(localData.saveSlots, `${path}/saveSlots`, diagnostics);
  validateLocalDataMigration(localData.migration, `${path}/migration`, diagnostics);
  validateLocalDataAutosave(localData.autosave, `${path}/autosave`, diagnostics);
}

function validateLocalDataSchemaEntries(value: unknown, path: string, label: "component" | "resource", diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({
      code: "TN_IR_LOCAL_DATA_SCHEMA_LIST_INVALID",
      message: `Local data ${label}s must be an array.`,
      path,
      severity: "error",
    });
    return;
  }
  const ids = new Set<string>();
  value.forEach((entry, index) => {
    const entryPath = `${path}/${index}`;
    if (!isRecord(entry)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SCHEMA_INVALID", message: `Local data ${label} declaration must be an object.`, path: entryPath });
      return;
    }
    if (typeof entry.id !== "string" || entry.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_ID_INVALID", message: `Local data ${label} id must be a non-empty string.`, path: `${entryPath}/id` });
    } else if (ids.has(entry.id)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_ID_DUPLICATE", message: `Local data ${label} id '${entry.id}' is duplicated.`, path: `${entryPath}/id` });
    } else {
      ids.add(entry.id);
    }
    if (!isRecord(entry.schema)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SCHEMA_INVALID", message: `Local data ${label} schema must be an object.`, path: `${entryPath}/schema` });
    } else if (containsPortableHandle(entry.schema)) {
      diagnostics.push({
        code: "TN_IR_LOCAL_DATA_RUNTIME_HANDLE_UNSUPPORTED",
        message: `Local data ${label} '${String(entry.id)}' schema must not include runtime handles.`,
        path: `${entryPath}/schema`,
        severity: "error",
        suggestion: "Persist portable ids and scalar data instead of renderer, runtime, native, or platform handles.",
      });
    }
  });
}

function validateLocalDataSettings(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTINGS_INVALID", message: "Local data settings must be an array.", path });
    return;
  }
  const keys = new Set<string>();
  value.forEach((setting, index) => {
    const settingPath = `${path}/${index}`;
    if (!isRecord(setting)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_INVALID", message: "Local data setting must be an object.", path: settingPath });
      return;
    }
    const key = setting.key;
    if (typeof key !== "string" || key.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_KEY_INVALID", message: "Local data setting key must be a non-empty string.", path: `${settingPath}/key` });
    } else if (keys.has(key)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DUPLICATE", message: `Local data setting '${key}' is duplicated.`, path: `${settingPath}/key` });
    } else {
      keys.add(key);
    }
    if (!["accessibility", "audio", "controls", "video"].includes(String(setting.group))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_GROUP_INVALID", message: "Local data setting group must be accessibility, audio, controls, or video.", path: `${settingPath}/group` });
    }
    if (!["boolean", "number", "string"].includes(String(setting.kind))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_KIND_INVALID", message: "Local data setting kind must be boolean, number, or string.", path: `${settingPath}/kind` });
      return;
    }
    if (typeof setting.defaultValue !== setting.kind) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_DEFAULT_INVALID", message: `Local data setting '${String(key)}' default value must match kind '${String(setting.kind)}'.`, path: `${settingPath}/defaultValue` });
    }
    if (setting.kind === "number") {
      validateOptionalFiniteNumber(setting.min, `${settingPath}/min`, "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", diagnostics);
      validateOptionalFiniteNumber(setting.max, `${settingPath}/max`, "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", diagnostics);
      if (typeof setting.min === "number" && typeof setting.max === "number" && setting.max < setting.min) {
        diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_RANGE_INVALID", message: "Local data setting max must be greater than or equal to min.", path: `${settingPath}/max` });
      }
    }
    if (setting.enumValues !== undefined && (setting.kind !== "string" || !Array.isArray(setting.enumValues) || setting.enumValues.length === 0 || setting.enumValues.some((item) => typeof item !== "string" || item.trim() === ""))) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SETTING_ENUM_INVALID", message: "Local data setting enum values require non-empty string choices.", path: `${settingPath}/enumValues` });
    }
  });
}

function validateLocalDataSaveSlots(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOTS_INVALID", message: "Local data saveSlots must be an array.", path });
    return;
  }
  const ids = new Set<string>();
  value.forEach((slot, index) => {
    const slotPath = `${path}/${index}`;
    if (!isRecord(slot)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_INVALID", message: "Local data save slot must be an object.", path: slotPath });
      return;
    }
    if (typeof slot.id !== "string" || slot.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_ID_INVALID", message: "Local data save slot id must be a non-empty string.", path: `${slotPath}/id` });
    } else if (ids.has(slot.id)) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_DUPLICATE", message: `Local data save slot '${slot.id}' is duplicated.`, path: `${slotPath}/id` });
    } else {
      ids.add(slot.id);
    }
    if (typeof slot.appVersion !== "string" || slot.appVersion.trim() === "") {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_APP_VERSION_INVALID", message: "Local data save slot appVersion must be a non-empty string.", path: `${slotPath}/appVersion` });
    }
    if (!Number.isInteger(slot.schemaVersion) || Number(slot.schemaVersion) <= 0) {
      diagnostics.push({ code: "TN_IR_LOCAL_DATA_SAVE_SLOT_SCHEMA_VERSION_INVALID", message: "Local data save slot schemaVersion must be a positive integer.", path: `${slotPath}/schemaVersion` });
    }
  });
}

function validateLocalDataMigration(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_INVALID", message: "Local data migration must be an object.", path });
    return;
  }
  if (!Number.isInteger(value.currentVersion) || Number(value.currentVersion) <= 0) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATION_VERSION_INVALID", message: "Local data currentVersion must be a positive integer.", path: `${path}/currentVersion` });
  }
  if (!Array.isArray(value.migrators) || value.migrators.some((entry) => !Number.isInteger(entry) || Number(entry) <= 0)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_MIGRATORS_INVALID", message: "Local data migrators must be positive integer versions.", path: `${path}/migrators` });
    return;
  }
  if (Number.isInteger(value.currentVersion) && Number(value.currentVersion) > 1) {
    const required = Number(value.currentVersion) - 1;
    if (!value.migrators.includes(required)) {
      diagnostics.push({
        code: "TN_IR_LOCAL_DATA_MIGRATOR_MISSING",
        message: `Local data migration to version ${String(value.currentVersion)} must declare a migrator from version ${required}.`,
        path: `${path}/migrators`,
        suggestion: "Add the missing migrator metadata or lower currentVersion.",
      });
    }
  }
}

function validateLocalDataAutosave(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_INVALID", message: "Local data autosave must be an object.", path });
    return;
  }
  if (typeof value.debounceMs !== "number" || !Number.isFinite(value.debounceMs) || value.debounceMs < 0) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_DEBOUNCE_INVALID", message: "Local data autosave debounceMs must be a non-negative finite number.", path: `${path}/debounceMs` });
  }
  if (value.intervalSeconds !== undefined && (typeof value.intervalSeconds !== "number" || !Number.isFinite(value.intervalSeconds) || value.intervalSeconds <= 0)) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_INTERVAL_INVALID", message: "Local data autosave intervalSeconds must be positive when provided.", path: `${path}/intervalSeconds` });
  }
  if (value.checkpointEvents !== undefined && (!Array.isArray(value.checkpointEvents) || value.checkpointEvents.some((entry) => typeof entry !== "string" || entry.trim() === ""))) {
    diagnostics.push({ code: "TN_IR_LOCAL_DATA_AUTOSAVE_EVENT_INVALID", message: "Local data autosave checkpointEvents must be non-empty event names.", path: `${path}/checkpointEvents` });
  }
}

function containsPortableHandle(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.some(containsPortableHandle);
  }
  if (isRecord(value)) {
    return Object.entries(value).some(([key, child]) => ["nativeHandle", "platformPath", "rendererObject", "runtimeHandle"].includes(key) || containsPortableHandle(child));
  }
  return false;
}
