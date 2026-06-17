import assert from "node:assert/strict";
import test from "node:test";
import type { IUiIr, IWorldIr } from "@threenative/ir";

import { createUiDebugOverlayReport } from "./debugOverlay.js";
import { renderUi } from "./renderUi.js";

test("debugOverlay should report ui debug overlay nodes with bounds and focus metadata", () => {
  const report = createUiDebugOverlayReport(renderUi(makeUi(), makeWorld()));
  const volume = report.nodes.find((node) => node.id === "volume");
  const frame = report.nodes.find((node) => node.id === "frame");

  assert.deepEqual(volume, {
    accessibleName: "Volume",
    action: "SetVolume",
    bounds: { height: 24, width: 160, x: 12, y: 8 },
    disabled: false,
    focusIndex: 0,
    id: "volume",
    kind: "slider",
    role: "slider",
    widgetState: { max: 1, min: 0, orientation: "horizontal", value: 0.5, valueText: "50 percent" },
    zIndex: 4,
  });
  assert.equal(frame?.imageSource, "assets/ui/frame.png");
  assert.equal(report.gizmos.some((gizmo) => gizmo.id === "volume" && gizmo.kind === "focusRing"), true);
  assert.equal(report.gizmos.some((gizmo) => gizmo.id === "frame" && gizmo.kind === "nineSliceInsets"), true);
});

function makeUi(): IUiIr {
  return {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "hud",
      kind: "column",
      children: [
        {
          id: "volume",
          kind: "slider",
          accessibilityLabel: "Volume",
          action: "SetVolume",
          layout: { height: 24, inset: { left: 12, top: 8 }, width: 160, zIndex: 4 },
          max: 1,
          min: 0,
          orientation: "horizontal",
          value: 0.5,
          valueText: "50 percent",
        },
        {
          id: "frame",
          kind: "image",
          accessibilityLabel: "Inventory frame",
          image: { nineSlice: { bottom: 4, left: 4, right: 4, top: 4 }, sourceSize: { height: 32, width: 64 } },
          src: "assets/ui/frame.png",
        },
      ],
    },
  };
}

function makeWorld(): IWorldIr {
  return { entities: [], resources: {}, schema: "threenative.world", version: "0.1.0" };
}
