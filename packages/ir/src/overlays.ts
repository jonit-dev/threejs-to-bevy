import type { IIrDiagnostic } from "./validate.js";

export type OverlayInputMode = "keyboard" | "modal" | "none" | "pointer" | "pointer-and-keyboard";
export type OverlayTargetProfile = "desktop" | "web";
export type OverlayMessageSchemaKind = "boolean" | "integer" | "number" | "object" | "string";

export interface IOverlayMessageSchema {
  fields?: Record<string, OverlayMessageSchemaKind>;
  kind: "object";
  required?: string[];
}

export interface IOverlayMessageDeclaration {
  name: string;
  schema: IOverlayMessageSchema;
}

export interface IOverlayBridgeMessages {
  gameToOverlay?: IOverlayMessageDeclaration[];
  overlayToGame?: IOverlayMessageDeclaration[];
}

export interface IOverlayIr {
  entry: string;
  id: string;
  input: OverlayInputMode;
  layout?: IOverlayLayout;
  messages: IOverlayBridgeMessages;
  targetProfiles: OverlayTargetProfile[];
  transparent: boolean;
  zIndex: number;
}

export interface IOverlayLayoutRect { height: number; width: number; x: number; y: number }
export interface IOverlayViewportLayout { mode: "viewport" }
export type IOverlayLayout = IOverlayLayoutRect | IOverlayViewportLayout;

export interface IOverlaysIr {
  overlays: IOverlayIr[];
  schema: "threenative.overlays";
  version: "0.1.0" | "0.2.0";
}

export const OVERLAY_MAX_PAYLOAD_BYTES = 16 * 1024;

export type OverlayPayloadValidationCode = "TN_OVERLAY_MESSAGE_REJECTED" | "TN_OVERLAY_PAYLOAD_TOO_LARGE";

export interface IOverlayPayloadValidationResult {
  code?: OverlayPayloadValidationCode;
  valid: boolean;
}

export function validateOverlayPayload(
  payload: unknown,
  schema: IOverlayMessageSchema,
  maxBytes = OVERLAY_MAX_PAYLOAD_BYTES,
): IOverlayPayloadValidationResult {
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > maxBytes) {
    return { code: "TN_OVERLAY_PAYLOAD_TOO_LARGE", valid: false };
  }
  if (schema.kind !== "object" || !isRecord(payload)) {
    return { code: "TN_OVERLAY_MESSAGE_REJECTED", valid: false };
  }
  const fields = schema.fields ?? {};
  for (const required of schema.required ?? []) {
    if (!(required in payload)) {
      return { code: "TN_OVERLAY_MESSAGE_REJECTED", valid: false };
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    const kind = fields[key];
    if (kind === undefined || !matchesPayloadKind(value, kind)) {
      return { code: "TN_OVERLAY_MESSAGE_REJECTED", valid: false };
    }
  }
  return { valid: true };
}

const INPUT_MODES = new Set<OverlayInputMode>(["keyboard", "modal", "none", "pointer", "pointer-and-keyboard"]);
const TARGET_PROFILES = new Set<OverlayTargetProfile>(["desktop", "web"]);
const MESSAGE_NAME_PATTERN = /^[a-z][a-z0-9]*(?::[a-z][a-z0-9-]*)+$/;
const SCHEMA_KINDS = new Set<OverlayMessageSchemaKind>(["boolean", "integer", "number", "object", "string"]);

export function validateOverlaysIr(value: unknown, path = "overlays.ir.json"): IIrDiagnostic[] {
  const diagnostics: IIrDiagnostic[] = [];
  if (!isRecord(value)) {
    diagnostics.push({
      code: "TN_IR_OVERLAY_INVALID",
      message: "Overlays IR must be a JSON object.",
      path,
      severity: "error",
    });
    return diagnostics;
  }

  for (const key of Object.keys(value)) {
    if (!["overlays", "schema", "version"].includes(key)) {
      diagnostics.push({
        code: "TN_IR_OVERLAY_FIELD_UNSUPPORTED",
        message: `Overlays IR uses unsupported field '${key}'.`,
        path: `${path}/${key}`,
        severity: "error",
      });
    }
  }
  if (value.schema !== "threenative.overlays" || (value.version !== "0.1.0" && value.version !== "0.2.0")) {
    diagnostics.push({
      code: "TN_IR_OVERLAY_VERSION_UNSUPPORTED",
      message: "Overlays IR must use threenative.overlays version 0.1.0 or 0.2.0.",
      path,
      severity: "error",
    });
  }
  if (!Array.isArray(value.overlays)) {
    diagnostics.push({
      code: "TN_IR_OVERLAY_LIST_INVALID",
      message: "Overlays IR must contain an overlays array.",
      path: `${path}/overlays`,
      severity: "error",
    });
    return diagnostics;
  }

  const seen = new Set<string>();
  value.overlays.forEach((overlay, index) => {
    const overlayPath = `${path}/overlays/${index}`;
    if (!isRecord(overlay)) {
      diagnostics.push({ code: "TN_IR_OVERLAY_INVALID", message: "Overlay declarations must be objects.", path: overlayPath, severity: "error" });
      return;
    }
    for (const key of Object.keys(overlay)) {
      if (!["entry", "id", "input", "layout", "messages", "targetProfiles", "transparent", "zIndex"].includes(key)) {
        diagnostics.push({
          code: "TN_IR_OVERLAY_FIELD_UNSUPPORTED",
          message: `Overlay declaration uses unsupported field '${key}'.`,
          path: `${overlayPath}/${key}`,
          severity: "error",
        });
      }
    }
    if (typeof overlay.id !== "string" || overlay.id.trim() === "") {
      diagnostics.push({ code: "TN_IR_OVERLAY_ID_INVALID", message: "Overlay id must be a non-empty string.", path: `${overlayPath}/id`, severity: "error" });
    } else if (seen.has(overlay.id)) {
      diagnostics.push({ code: "TN_IR_OVERLAY_ID_DUPLICATE", message: `Duplicate overlay id '${overlay.id}'.`, path: `${overlayPath}/id`, severity: "error" });
    } else {
      seen.add(overlay.id);
    }
    validateOverlayEntry(overlay.entry, `${overlayPath}/entry`, diagnostics);
    if (typeof overlay.transparent !== "boolean") {
      diagnostics.push({ code: "TN_IR_OVERLAY_TRANSPARENT_INVALID", message: "Overlay transparent must be a boolean.", path: `${overlayPath}/transparent`, severity: "error" });
    }
    if (!Number.isInteger(overlay.zIndex) || (overlay.zIndex as number) < 0) {
      diagnostics.push({ code: "TN_IR_OVERLAY_Z_INDEX_INVALID", message: "Overlay zIndex must be a non-negative integer.", path: `${overlayPath}/zIndex`, severity: "error" });
    }
    if (typeof overlay.input !== "string" || !INPUT_MODES.has(overlay.input as OverlayInputMode)) {
      diagnostics.push({
        code: "TN_IR_OVERLAY_INPUT_UNSUPPORTED",
        message: "Overlay input must be none, pointer, keyboard, pointer-and-keyboard, or modal.",
        path: `${overlayPath}/input`,
        severity: "error",
      });
    }
    validateTargetProfiles(overlay.targetProfiles, `${overlayPath}/targetProfiles`, diagnostics);
    if (overlay.layout !== undefined && !isValidOverlayLayout(overlay.layout)) {
      diagnostics.push({ code: "TN_IR_OVERLAY_LAYOUT_INVALID", message: "Overlay layout must be { mode: 'viewport' } or a non-negative finite x/y rectangle with positive width and height.", path: `${overlayPath}/layout`, severity: "error" });
    }
    validateOverlayMessages(overlay.messages, `${overlayPath}/messages`, diagnostics);
  });

  return diagnostics;
}

export function validateOverlayEntry(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || value.startsWith("/")
    || value.includes("..")
    || /^[a-z][a-z0-9+.-]*:/i.test(value)
    || /<script/i.test(value)
    || value.includes("\\")
  ) {
    diagnostics.push({
      code: "TN_IR_OVERLAY_ENTRY_INVALID",
      message: "Overlay entry must be a local bundle-relative path without parent traversal, remote URLs, or inline script content.",
      path,
      severity: "error",
      suggestion: "Use a copied bundle-local entry such as overlay/index.html.",
    });
  }
}

function validateTargetProfiles(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    diagnostics.push({ code: "TN_IR_OVERLAY_TARGET_PROFILE_INVALID", message: "Overlay targetProfiles must be a non-empty array.", path, severity: "error" });
    return;
  }
  value.forEach((profile, index) => {
    if (typeof profile !== "string" || !TARGET_PROFILES.has(profile as OverlayTargetProfile)) {
      diagnostics.push({
        code: "TN_IR_OVERLAY_TARGET_PROFILE_INVALID",
        message: "Overlay targetProfiles may only include web or desktop.",
        path: `${path}/${index}`,
        severity: "error",
      });
    }
  });
}

function validateOverlayMessages(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value)) {
    diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGES_INVALID", message: "Overlay messages must be an object.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["gameToOverlay", "overlayToGame"].includes(key)) {
      diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGES_FIELD_UNSUPPORTED", message: `Overlay messages uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  validateMessageList(value.overlayToGame, `${path}/overlayToGame`, diagnostics);
  validateMessageList(value.gameToOverlay, `${path}/gameToOverlay`, diagnostics);
}

function validateMessageList(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGES_INVALID", message: "Overlay message declarations must be arrays.", path, severity: "error" });
    return;
  }
  const seen = new Set<string>();
  value.forEach((message, index) => {
    const messagePath = `${path}/${index}`;
    if (!isRecord(message)) {
      diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGE_INVALID", message: "Overlay message declarations must be objects.", path: messagePath, severity: "error" });
      return;
    }
    for (const key of Object.keys(message)) {
      if (!["name", "schema"].includes(key)) {
        diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGE_FIELD_UNSUPPORTED", message: `Overlay message uses unsupported field '${key}'.`, path: `${messagePath}/${key}`, severity: "error" });
      }
    }
    if (typeof message.name !== "string" || !MESSAGE_NAME_PATTERN.test(message.name)) {
      diagnostics.push({
        code: "TN_IR_OVERLAY_MESSAGE_NAME_INVALID",
        message: "Overlay message names must be lowercase namespaced strings such as inventory:use-item.",
        path: `${messagePath}/name`,
        severity: "error",
      });
    } else if (seen.has(message.name)) {
      diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGE_NAME_DUPLICATE", message: `Duplicate overlay message '${message.name}'.`, path: `${messagePath}/name`, severity: "error" });
    } else {
      seen.add(message.name);
    }
    validateMessageSchema(message.schema, `${messagePath}/schema`, diagnostics);
  });
}

function validateMessageSchema(value: unknown, path: string, diagnostics: IIrDiagnostic[]): void {
  if (!isRecord(value) || value.kind !== "object") {
    diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGE_SCHEMA_INVALID", message: "Overlay message schema must be an object schema.", path, severity: "error" });
    return;
  }
  for (const key of Object.keys(value)) {
    if (!["fields", "kind", "required"].includes(key)) {
      diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGE_SCHEMA_FIELD_UNSUPPORTED", message: `Overlay message schema uses unsupported field '${key}'.`, path: `${path}/${key}`, severity: "error" });
    }
  }
  if (value.fields !== undefined && !isRecord(value.fields)) {
    diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGE_SCHEMA_INVALID", message: "Overlay message schema fields must be an object.", path: `${path}/fields`, severity: "error" });
    return;
  }
  for (const [field, kind] of Object.entries(value.fields ?? {})) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(field) || typeof kind !== "string" || !SCHEMA_KINDS.has(kind as OverlayMessageSchemaKind)) {
      diagnostics.push({
        code: "TN_IR_OVERLAY_MESSAGE_SCHEMA_INVALID",
        message: "Overlay message schema fields must use identifier names and supported primitive kinds.",
        path: `${path}/fields/${field}`,
        severity: "error",
      });
    }
  }
  if (value.required !== undefined) {
    if (!Array.isArray(value.required) || value.required.some((item) => typeof item !== "string")) {
      diagnostics.push({ code: "TN_IR_OVERLAY_MESSAGE_SCHEMA_INVALID", message: "Overlay message schema required must be a string array.", path: `${path}/required`, severity: "error" });
    } else {
      const fields = new Set(Object.keys(value.fields ?? {}));
      value.required.forEach((field, index) => {
        if (!fields.has(field)) {
          diagnostics.push({
            code: "TN_IR_OVERLAY_MESSAGE_SCHEMA_INVALID",
            message: `Required overlay message field '${field}' is not declared in fields.`,
            path: `${path}/required/${index}`,
            severity: "error",
          });
        }
      });
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidOverlayLayout(value: unknown): value is IOverlayLayout {
  if (!isRecord(value)) return false;
  if (value.mode === "viewport") {
    return Object.keys(value).every((key) => key === "mode");
  }
  const fields = [value.height, value.width, value.x, value.y];
  return fields.every((field) => typeof field === "number" && Number.isFinite(field) && field >= 0)
    && (value.height as number) > 0
    && (value.width as number) > 0
    && Object.keys(value).every((key) => ["height", "width", "x", "y"].includes(key));
}

function matchesPayloadKind(value: unknown, kind: OverlayMessageSchemaKind): boolean {
  if (kind === "integer") return Number.isInteger(value);
  if (kind === "number") return typeof value === "number" && Number.isFinite(value);
  if (kind === "object") return isRecord(value);
  return typeof value === kind;
}
