import assert from "node:assert/strict";
import test from "node:test";

import { createWebDragPickingRecognizer, resolveTopPickingTarget, type IWebPickingTarget } from "./drag.js";

const overlappingTargets: IWebPickingTarget[] = [
  { dropZone: true, id: "mesh.chest", targetKind: "mesh", zIndex: 100 },
  { draggable: true, id: "ui.inventory.item", targetKind: "ui", zIndex: 10 },
];

test("should emit drag phases in deterministic order when ui overlaps mesh", () => {
  const recognizer = createWebDragPickingRecognizer({ moveThreshold: 0.01 });

  assert.deepEqual(recognizer.update({
    buttonDown: true,
    candidates: overlappingTargets,
    pointerId: 1,
    screen: { x: 0.1, y: 0.1 },
    timeMs: 0,
  }), []);

  const moveEvents = recognizer.update({
    buttonDown: true,
    candidates: overlappingTargets,
    modifiers: ["Shift"],
    pointerId: 1,
    screen: { x: 0.15, y: 0.15 },
    timeMs: 16,
    worldRay: { direction: { x: 0, y: 0, z: -1 }, origin: { x: 0, y: 0, z: 5 } },
  });
  assert.deepEqual(moveEvents.map((event) => `${event.kind}:${event.currentTargetId ?? ""}`), [
    "dragStart:ui.inventory.item",
    "dragEnter:ui.inventory.item",
    "dragMove:ui.inventory.item",
  ]);

  const dropEvents = recognizer.update({
    buttonDown: false,
    candidates: [{ dropZone: true, id: "mesh.chest", targetKind: "mesh" }],
    pointerId: 1,
    screen: { x: 0.4, y: 0.4 },
    timeMs: 32,
    worldHit: { x: 1, y: 2, z: 3 },
  });
  assert.deepEqual(dropEvents.map((event) => `${event.kind}:${event.currentTargetId ?? ""}`), [
    "drop:mesh.chest",
    "dragEnd:mesh.chest",
  ]);

  const report = recognizer.debugReport();
  assert.equal(report.hoveredTarget, "mesh.chest");
  assert.equal(report.captureOwner, undefined);
  assert.equal(report.pointerRays.length, 1);
  assert.deepEqual(report.eventLog.map((event) => event.kind), ["dragStart", "dragEnter", "dragMove", "drop", "dragEnd"]);
  assert.deepEqual(report.uiBounds, [{ id: "ui.inventory.item", zIndex: 10 }]);
});

test("should pass through retained ui targets that opt out of pointer events", () => {
  const target = resolveTopPickingTarget([
    { draggable: true, id: "ui.tooltip", pointerEvents: "pass-through", targetKind: "ui", zIndex: 100 },
    { id: "mesh.crate", targetKind: "mesh", zIndex: 0 },
  ]);

  assert.equal(target?.id, "mesh.crate");
});
