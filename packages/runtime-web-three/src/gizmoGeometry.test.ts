import assert from "node:assert/strict";
import test from "node:test";

import { buildEditorGizmoOverlay, createAxisGizmo, createWireBoxGizmo, createWireSphereGizmo, gizmoToBufferGeometry } from "./gizmoGeometry.js";

test("gizmoGeometry should emit debug-only line geometry", () => {
  const axis = createAxisGizmo(2);
  assert.equal(axis.debugOnly, true);
  assert.equal(axis.lines.length, 3);
  assert.deepEqual(axis.lines[0], { color: [1, 0, 0], from: [0, 0, 0], to: [2, 0, 0] });

  const box = createWireBoxGizmo([2, 4, 6]);
  assert.equal(box.lines.length, 12);
  assert.deepEqual(box.lines[0]?.from, [-1, -2, -3]);
  assert.deepEqual(box.lines[0]?.to, [1, -2, -3]);

  const sphere = createWireSphereGizmo(1, 4);
  assert.equal(sphere.lines.length, 12);

  const geometry = gizmoToBufferGeometry(axis);
  assert.equal(geometry.getAttribute("position").count, 6);
  assert.equal(geometry.getAttribute("color").count, 6);
});

test("should build editor gizmos for cameras lights bounds and ui nodes", () => {
  const overlay = buildEditorGizmoOverlay({
    bounds: [{ id: "bounds.player", size: [2, 2, 2] }],
    cameras: [{ id: "camera.main" }],
    lights: [{ id: "light.sun", radius: 3 }],
    transforms: [{ id: "transform.player", length: 2 }],
    uiNodes: [{ id: "ui.health", size: [4, 1, 0] }],
  });

  assert.equal(overlay.debugOnly, true);
  assert.deepEqual(overlay.gizmos.map((gizmo) => [gizmo.id, gizmo.role]), [
    ["bounds.player", "bounds"],
    ["camera.main", "camera"],
    ["light.sun", "light"],
    ["transform.player", "transform"],
    ["ui.health", "uiNode"],
  ]);
  assert.deepEqual(overlay.gizmos.find((gizmo) => gizmo.id === "camera.main")?.lines[0]?.color, [0.25, 0.65, 1]);
  assert.deepEqual(overlay.gizmos.find((gizmo) => gizmo.id === "light.sun")?.kind, "wireSphere");
});
