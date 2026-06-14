import { SdkError } from "./errors.js";
import { action, axis, defineInputMap, gamepad, keyboard, pointerButton, type IInputMapDeclaration, type InputBinding } from "./input.js";

export interface IControlActionRecipe {
  gamepadControls?: readonly string[];
  id: string;
  keys?: readonly string[];
  pointerButtons?: readonly number[];
}

export interface IControlsOptions {
  actions?: readonly IControlActionRecipe[];
  movement?: "wasd" | IWasdMovementOptions | false;
  unsupported?: IUnsupportedControlOptions;
}

export interface IUnsupportedControlOptions {
  rawInputDevice?: boolean;
  runtimeRebinding?: boolean;
}

export interface IWasdMovementOptions {
  gamepad?: boolean;
  xAxis?: string;
  zAxis?: string;
}

export function defineControls(options: IControlsOptions = {}): IInputMapDeclaration {
  if (options.unsupported?.rawInputDevice === true) {
    throw new SdkError("TN_SDK_CONTROLS_UNSUPPORTED_RAW_INPUT_DEVICE", "Controls recipes cannot bind raw input devices outside the portable input map.");
  }
  if (options.unsupported?.runtimeRebinding === true) {
    throw new SdkError("TN_SDK_CONTROLS_UNSUPPORTED_RUNTIME_REBINDING", "Controls recipes cannot declare runtime rebinding behavior.");
  }

  return defineInputMap({
    actions: (options.actions ?? []).map((item) => action(item.id, actionBindings(item))),
    axes: options.movement === false ? [] : movementAxes(options.movement ?? "wasd"),
  });
}

function movementAxes(options: "wasd" | IWasdMovementOptions) {
  const config = options === "wasd" ? {} : options;
  const xAxis = config.xAxis ?? "MoveX";
  const zAxis = config.zAxis ?? "MoveZ";
  return [
    axis(xAxis, {
      ...(config.gamepad === true ? { value: gamepad("leftStickX", { required: false }) } : {}),
      negative: [keyboard("KeyA")],
      positive: [keyboard("KeyD")],
    }),
    axis(zAxis, {
      ...(config.gamepad === true ? { value: gamepad("leftStickY", { required: false }) } : {}),
      negative: [keyboard("KeyW")],
      positive: [keyboard("KeyS")],
    }),
  ];
}

function actionBindings(recipe: IControlActionRecipe): InputBinding[] {
  return [
    ...(recipe.keys ?? []).map((code) => keyboard(code)),
    ...(recipe.pointerButtons ?? []).map((button) => pointerButton(button)),
    ...(recipe.gamepadControls ?? []).map((control) => gamepad(control, { required: false })),
  ];
}
