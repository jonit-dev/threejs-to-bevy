import assert from "node:assert/strict";
import test from "node:test";
import type { IUiIr, IWorldIr } from "@threenative/ir";

import { createUiAccessibilitySnapshot, createUiDebugOverlayReport } from "./debugOverlay.js";
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

test("should export normalized accessible role name value and state", () => {
  const rendered = renderUi(makeUi(), makeWorld());
  rendered.focus("volume");
  const snapshot = createUiAccessibilitySnapshot(rendered);
  const volume = snapshot.nodes.find((node) => node.id === "volume");

  assert.equal(snapshot.schema, "threenative.ui-accessibility-snapshot");
  assert.equal(snapshot.nodes.find((node) => node.id === "hud")?.role, "group");
  assert.deepEqual(volume, {
    disabled: false,
    focusable: true,
    focused: true,
    id: "volume",
    name: "Volume",
    relationships: { children: [] },
    role: "slider",
    value: "0.5",
  });
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
