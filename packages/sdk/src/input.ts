import { SdkError } from "./errors.js";

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

export type ControlsSettingsAxisSlot = "negative" | "positive" | "value";

export interface IControlsSettingsRowDeclaration {
  actionOrAxisId: string;
  axisSlot?: ControlsSettingsAxisSlot;
  captureState?: ControlsSettingsCaptureState;
  defaultBindings: InputBinding[];
  kind: "action" | "axis";
  uiNodeId?: string;
}

export type ControlsSettingsRowOptions = Omit<IControlsSettingsRowDeclaration, "captureState" | "defaultBindings"> & {
  captureState?: ControlsSettingsCaptureState;
  defaultBindings?: ReadonlyArray<InputBinding>;
};

export interface IControlsSettingsDeclaration {
  profileId: string;
  rows: IControlsSettingsRowDeclaration[];
}

export interface IPersistedBindingOverrideDeclaration {
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

export interface IInputActionDeclaration {
  bindings: InputBinding[];
  id: string;
}

export interface IInputAxisDeclaration {
  id: string;
  negative: InputBinding[];
  positive: InputBinding[];
  value?: InputBinding;
}

export interface IInputMapDeclaration {
  actions: IInputActionDeclaration[];
  axes: IInputAxisDeclaration[];
  controlsSettings?: IControlsSettingsDeclaration;
  persistedBindingOverrides?: IPersistedBindingOverrideDeclaration[];
}

export function defineInputMap(options: {
  actions?: ReadonlyArray<IInputActionDeclaration>;
  axes?: ReadonlyArray<IInputAxisDeclaration>;
  controlsSettings?: IControlsSettingsDeclaration;
  persistedBindingOverrides?: ReadonlyArray<IPersistedBindingOverrideDeclaration>;
}): IInputMapDeclaration {
  return {
    actions: [...(options.actions ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    axes: [...(options.axes ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    ...(options.controlsSettings === undefined ? {} : { controlsSettings: controlsSettings(options.controlsSettings) }),
    ...(options.persistedBindingOverrides === undefined ? {} : { persistedBindingOverrides: sortOverrides(options.persistedBindingOverrides) }),
  };
}

export function action(id: string, bindings: ReadonlyArray<InputBinding>): IInputActionDeclaration {
  assertId(id, "Action");
  return { bindings: [...bindings], id };
}

export function axis(
  id: string,
  options: { negative?: ReadonlyArray<InputBinding>; positive?: ReadonlyArray<InputBinding>; value?: InputBinding },
): IInputAxisDeclaration {
  assertId(id, "Axis");
  return {
    id,
    negative: [...(options.negative ?? [])],
    positive: [...(options.positive ?? [])],
    value: options.value,
  };
}

export function keyboard(code: string): InputBinding {
  assertId(code, "Keyboard code");
  return { code, device: "keyboard" };
}

export function pointerButton(button: number): InputBinding {
  if (!Number.isInteger(button) || button < 0) {
    throw new SdkError("TN_SDK_INPUT_POINTER_BUTTON_INVALID", "Pointer button must be a non-negative integer.");
  }
  return { button, device: "pointer" };
}

export function pointerAxis(axis: "deltaX" | "deltaY" | "x" | "y"): InputBinding {
  return { axis, device: "pointer" };
}

export function touchControl(control: string, axis?: "x" | "y"): InputBinding {
  assertId(control, "Touch control");
  return { axis, control, device: "touch" };
}

export function gamepad(control: string, options: { required?: boolean } = {}): InputBinding {
  assertId(control, "Gamepad control");
  return { control, device: "gamepad", required: options.required ?? true };
}

export function controlsSettings(options: { profileId?: string; rows: ReadonlyArray<ControlsSettingsRowOptions> }): IControlsSettingsDeclaration {
  const profileId = options.profileId ?? "default";
  assertId(profileId, "Controls settings profile");
  return {
    profileId,
    rows: [...options.rows]
      .map((row) => {
        assertId(row.actionOrAxisId, "Controls settings target");
        if (row.uiNodeId !== undefined) {
          assertId(row.uiNodeId, "Controls settings UI node");
        }
        return {
          ...row,
          captureState: row.captureState ?? "idle",
          defaultBindings: [...(row.defaultBindings ?? [])],
        };
      })
      .sort((left, right) => `${left.kind}:${left.actionOrAxisId}:${left.axisSlot ?? ""}`.localeCompare(`${right.kind}:${right.actionOrAxisId}:${right.axisSlot ?? ""}`)),
  };
}

function sortOverrides(overrides: ReadonlyArray<IPersistedBindingOverrideDeclaration>): IPersistedBindingOverrideDeclaration[] {
  return [...overrides]
    .map((override) => ({
      ...override,
      ...(override.modifiers === undefined ? {} : { modifiers: [...override.modifiers].sort() }),
    }))
    .sort((left, right) => `${left.profileId}\0${left.actionOrAxisId}\0${left.axisSlot ?? ""}\0${left.device}\0${left.control}`.localeCompare(`${right.profileId}\0${right.actionOrAxisId}\0${right.axisSlot ?? ""}\0${right.device}\0${right.control}`));
}

function assertId(value: string, label: string): void {
  if (value.trim() === "") {
    throw new SdkError("TN_SDK_INPUT_ID_EMPTY", `${label} must not be empty.`);
  }
}
