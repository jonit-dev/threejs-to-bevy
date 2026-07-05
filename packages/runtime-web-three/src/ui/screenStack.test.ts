import assert from "node:assert/strict";
import test from "node:test";

import type { IUiIr } from "@threenative/ir";

import { traceUiScreenStack } from "./screenStack.js";

test("ui screen stack trace should restore focus after modal pop", () => {
  const ui: IUiIr = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "ui.root",
      kind: "stack",
      children: [
        { id: "pause.panel", kind: "column", children: [{ id: "resume", kind: "button", action: "Resume", label: "Resume" }] },
        { id: "confirm.dialog", kind: "column", children: [{ id: "confirm.cancel", kind: "button", action: "UiCancel", label: "Cancel" }] },
      ],
    },
    screens: [
      { id: "pause", role: "menu", root: "pause.panel", stackPolicy: "push", focusScope: { entry: "resume", inputCapture: "keyboard", restore: "previous" } },
      { id: "confirm", role: "modal", root: "confirm.dialog", stackPolicy: "exclusiveModal", focusScope: { entry: "confirm.cancel", escapeAction: "UiCancel", inputCapture: "modal", restore: "previous", trap: true } },
    ],
    screenStack: { active: ["pause"], policy: "push" },
  };

  const trace = traceUiScreenStack(ui, {
    events: [
      { kind: "push", screen: "confirm" },
      { kind: "pop" },
    ],
    initialFocus: "resume",
  });

  assert.deepEqual(trace, {
    active: ["pause"],
    events: [
      { focus: "confirm.cancel", kind: "push", screen: "confirm" },
      { focus: "resume", kind: "pop", screen: "confirm" },
    ],
    finalFocus: "resume",
    initialFocus: "resume",
  });
});
