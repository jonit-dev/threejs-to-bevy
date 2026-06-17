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
