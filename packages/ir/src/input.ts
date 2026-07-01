import type { SchemaVersion } from "./types.js";

export type InputBinding =
  | {
      code: string;
      device: "keyboard";
      required?: boolean;
    }
  | {
      button: number;
      device: "pointer";
      required?: boolean;
    }
  | {
      axis: "deltaX" | "deltaY" | "x" | "y";
      device: "pointer";
      required?: boolean;
    }
  | {
      axis?: "x" | "y";
      control: string;
      device: "touch";
      required?: boolean;
    }
  | {
      control: string;
      device: "gamepad";
      required?: boolean;
    };

export type ControlsSettingsCaptureState = "applied" | "conflict-confirmation" | "idle" | "rejected" | "reset-to-default" | "waiting-for-input";

export type ControlsSettingsTargetKind = "action" | "axis";

export type ControlsSettingsAxisSlot = "negative" | "positive" | "value";

export interface IControlsSettingsRowIr {
  actionOrAxisId: string;
  axisSlot?: ControlsSettingsAxisSlot;
  captureState?: ControlsSettingsCaptureState;
  defaultBindings: InputBinding[];
  kind: ControlsSettingsTargetKind;
  uiNodeId?: string;
}

export interface IControlsSettingsIr {
  profileId: string;
  rows: IControlsSettingsRowIr[];
}

export interface IPersistedBindingOverrideIr {
  actionOrAxisId: string;
  axisSlot?: ControlsSettingsAxisSlot;
  control: string;
  deadzone?: number;
  device: InputBinding["device"];
  modifiers?: string[];
  profileId: string;
  scale?: number;
  updatedAt: string;
}

export interface IInputActionIr {
  bindings: InputBinding[];
  id: string;
}

export interface IInputAxisIr {
  id: string;
  negative: InputBinding[];
  positive: InputBinding[];
  value?: InputBinding;
}

export interface IInputIr {
  schema: "threenative.input";
  version: SchemaVersion;
  actions: IInputActionIr[];
  axes: IInputAxisIr[];
  controlsSettings?: IControlsSettingsIr;
  persistedBindingOverrides?: IPersistedBindingOverrideIr[];
}

const canonicalKeyboardCodes = new Set([
  "AltLeft",
  "AltRight",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "Backquote",
  "Backslash",
  "Backspace",
  "BracketLeft",
  "BracketRight",
  "CapsLock",
  "Comma",
  "ContextMenu",
  "ControlLeft",
  "ControlRight",
  "Delete",
  "End",
  "Enter",
  "Equal",
  "Escape",
  "Home",
  "Insert",
  "IntlBackslash",
  "IntlRo",
  "IntlYen",
  "MetaLeft",
  "MetaRight",
  "Minus",
  "PageDown",
  "PageUp",
  "Pause",
  "Period",
  "Quote",
  "ScrollLock",
  "Semicolon",
  "ShiftLeft",
  "ShiftRight",
  "Slash",
  "Space",
  "Tab",
]);

const keyboardCodeAliases = new Map<string, string>([
  ["alt", "AltLeft"],
  ["arrowdown", "ArrowDown"],
  ["arrow-down", "ArrowDown"],
  ["arrowleft", "ArrowLeft"],
  ["arrow-left", "ArrowLeft"],
  ["arrowright", "ArrowRight"],
  ["arrow-right", "ArrowRight"],
  ["arrowup", "ArrowUp"],
  ["arrow-up", "ArrowUp"],
  ["control", "ControlLeft"],
  ["ctrl", "ControlLeft"],
  ["down", "ArrowDown"],
  ["esc", "Escape"],
  ["left", "ArrowLeft"],
  ["meta", "MetaLeft"],
  ["right", "ArrowRight"],
  ["shift", "ShiftLeft"],
  ["spacebar", "Space"],
  ["up", "ArrowUp"],
  ...[...canonicalKeyboardCodes].map((code) => [code.toLowerCase(), code] as const),
]);

export function isCanonicalKeyboardCode(code: string): boolean {
  return /^Key[A-Z]$/.test(code)
    || /^Digit[0-9]$/.test(code)
    || /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(code)
    || /^Numpad(?:[0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal|Comma|ParenLeft|ParenRight|Backspace)$/.test(code)
    || canonicalKeyboardCodes.has(code);
}

export function normalizeKeyboardCodeAlias(code: string): string {
  if (isCanonicalKeyboardCode(code)) {
    return code;
  }
  if (/^[a-z]$/i.test(code)) {
    return `Key${code.toUpperCase()}`;
  }
  if (/^[0-9]$/.test(code)) {
    return `Digit${code}`;
  }
  return keyboardCodeAliases.get(code.toLowerCase()) ?? code;
}

export function keyboardCodeSuggestion(code: string): string | undefined {
  const normalized = normalizeKeyboardCodeAlias(code);
  return normalized === code || !isCanonicalKeyboardCode(normalized) ? undefined : normalized;
}

export function sortedPersistedBindingOverrides(
  overrides: ReadonlyArray<IPersistedBindingOverrideIr>,
): IPersistedBindingOverrideIr[] {
  return [...overrides]
    .map((override) => ({
      ...override,
      ...(override.modifiers === undefined ? {} : { modifiers: [...override.modifiers].sort() }),
    }))
    .sort((left, right) => {
      const leftKey = `${left.profileId}\0${left.actionOrAxisId}\0${left.axisSlot ?? ""}\0${left.device}\0${left.control}`;
      const rightKey = `${right.profileId}\0${right.actionOrAxisId}\0${right.axisSlot ?? ""}\0${right.device}\0${right.control}`;
      return leftKey.localeCompare(rightKey);
    });
}
