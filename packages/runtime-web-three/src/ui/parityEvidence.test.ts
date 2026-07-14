import assert from "node:assert/strict";
import test from "node:test";
import type { IUiIr, IWorldIr } from "@threenative/ir";

import { reportWebUiParityBehavior } from "./parityEvidence.js";

test("should match button slider text value caret responsive and disabled behavior", () => {
  const report = reportWebUiParityBehavior(makeUi(), makeWorld());

  assert.equal(report.ok, true, JSON.stringify(report.diagnostics));
  assert.deepEqual(report.responsive, [
    { rootHeight: 300, rootWidth: 420, target: "desktop" },
    { rootHeight: 520, rootWidth: 340, target: "mobile" },
  ]);
  assert.equal(report.state.disabledActivation, "disabled");
  assert.equal(report.state.valueUpdate, 0.6);
  assert.equal(report.state.textValue, "Nora");
  assert.equal(report.textEdit.frames.at(-1)?.caret, 3);
});

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    focusOrder: ["name", "volume", "apply", "jump"],
    root: {
      id: "settings",
      kind: "column",
      layout: { height: 300, width: 420 },
      responsive: [{ target: "mobile", layout: { height: 520, width: 340 } }],
      children: [
        { id: "name", kind: "textInput", action: "SetName", text: "Nova", navigation: { right: "volume" } },
        { id: "volume", kind: "slider", action: "SetVolume", min: 0, max: 1, value: 0.5, navigation: { right: "apply" } },
        { id: "apply", kind: "button", action: "Apply", label: "Apply" },
        { id: "jump", kind: "touchControl", action: "Jump", label: "Jump" },
      ],
    },
  };
}

function makeWorld(): IWorldIr {
  return { entities: [], schema: "threenative.world", version: "0.1.0" };
}
