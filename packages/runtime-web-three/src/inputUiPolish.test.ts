import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { loadBundle } from "./loadBundle.js";
import { traceInputUiPolish } from "./inputUiPolish.js";

test("should trace input UI polish fixture affordances", async () => {
  const bundle = await loadBundle(resolve(process.cwd(), "../ir/fixtures/conformance/input-ui-polish/game.bundle"));
  assert.ok(bundle.ui);
  const report = traceInputUiPolish(bundle.input, bundle.ui, bundle.world);

  assert.equal(report.schema, "threenative.input-ui-polish");
  assert.equal(report.input.touchStream.length, 4);
  assert.equal(report.input.touchStream[0]?.actionStates.UiConfirm, true);
  assert.equal(report.input.gamepad.connected[0]?.mapping, "standard");
  assert.deepEqual(report.input.gamepad.repairHints, []);
  assert.equal(report.ui.disabledUpdate[0]?.node, "ui.apply");
  assert.equal(report.ui.scroll.map((entry) => `${entry.node}:${entry.axis}`).join(","), "ui.controls:x,ui.settings:y");
  assert.equal(report.ui.focusNarration.map((entry) => entry.text).join(","), "Player name,Look sensitivity,Reset controls");
  assert.deepEqual(report.ui.interactionCoverage.map((entry) => `${entry.kind}:${entry.evidence}`), [
    "activation:ui.navigation.activate",
    "focus:ui.navigation.focus",
    "menuNavigation:ui.navigation.directional-menu",
    "scroll:ui.scroll.trace",
    "touchGamepad:input.touch-stream+gamepad-report",
  ]);
  assert.equal(report.ui.virtualKeyboard.status, "diagnostic-only");
  assert.equal(report.diagnostics.some((diagnostic) => diagnostic.code === "TN_INPUT_UI_NATIVE_ITALIC_DIAGNOSTIC_ONLY"), true);
});
