import { SdkError } from "./errors.js";

export interface IUnsupportedUiWidgetOptions {
  virtualKeyboard?: boolean;
}

export function validateUiWidgetSupport(options: { unsupported?: IUnsupportedUiWidgetOptions } = {}): void {
  if (options.unsupported?.virtualKeyboard === true) {
    throw new SdkError(
      "TN_SDK_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED",
      "Virtual keyboard widgets are not part of the V9 retained UI widget set.",
    );
  }
}
