import assert from "node:assert/strict";
import test from "node:test";

import { renderEditorInspectorPanels } from "./inspector.js";

test("should render inspector panels from structured snapshot data", () => {
  const panels = renderEditorInspectorPanels(
    {
      assetRefs: ["model.player"],
      diagnostics: [],
      editableProperties: [{ document: "world.ir.json", kind: "number", label: "x", path: "/documents/world.ir.json/entities/0/components/Transform/position/0" }],
      hierarchy: [{ children: [], components: ["Transform", "MeshRenderer"], id: "player", label: "player", path: "/documents/world.ir.json/entities/0" }],
      hotReload: [{ invalidationReasons: ["runtime state changes"], policy: "reloadFull" }],
    },
    { connectedGamepads: ["Xbox Controller"], selectedAsset: "model.player" },
  );

  assert.deepEqual(panels.tabs, ["hierarchy", "properties", "sceneViewer", "assetPreview", "gamepadViewer"]);
  assert.equal(panels.hierarchy[0]?.id, "player");
  assert.equal(panels.properties[0]?.path, "/documents/world.ir.json/entities/0/components/Transform/position/0");
  assert.deepEqual(panels.assetPreview, { assets: ["model.player"], selected: "model.player" });
  assert.deepEqual(panels.gamepadViewer, { connected: 1, devices: ["Xbox Controller"] });
});
