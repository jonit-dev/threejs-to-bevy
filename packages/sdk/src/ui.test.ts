import assert from "node:assert/strict";
import test from "node:test";

import { SdkError } from "./errors.js";
import { validateUiWidgetSupport } from "./ui.js";

test("ui should reject virtual keyboard as unsupported in v9 widget set", () => {
  assert.throws(
    () => validateUiWidgetSupport({ unsupported: { virtualKeyboard: true } }),
    (error: unknown) => error instanceof SdkError && error.code === "TN_SDK_UI_WIDGET_VIRTUAL_KEYBOARD_UNSUPPORTED",
  );
});
