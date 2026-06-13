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
}

export function defineInputMap(options: {
  actions?: ReadonlyArray<IInputActionDeclaration>;
  axes?: ReadonlyArray<IInputAxisDeclaration>;
}): IInputMapDeclaration {
  return {
    actions: [...(options.actions ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
    axes: [...(options.axes ?? [])].sort((left, right) => left.id.localeCompare(right.id)),
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

function assertId(value: string, label: string): void {
  if (value.trim() === "") {
    throw new SdkError("TN_SDK_INPUT_ID_EMPTY", `${label} must not be empty.`);
  }
}
