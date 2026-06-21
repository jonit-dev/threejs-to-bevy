import assert from "node:assert/strict";
import test from "node:test";

import { markViewportNonSelectable, markViewportSelectionOwner, resolvePreviewSelection, resolveViewportSelectionOwnerRowId, type IViewportSelectableNode } from "./selectionBridge.js";

test("should map source entity to runtime metadata", () => {
  assert.deepEqual(resolvePreviewSelection("player", { entities: [{ runtimeId: "world:0", sourceEntityId: "player" }] }), {
    runtimeId: "world:0",
    sourceEntityId: "player",
  });
  assert.equal(resolvePreviewSelection("missing", { entities: [{ runtimeId: "world:0", sourceEntityId: "player" }] }), undefined);
});

test("should resolve loaded model children to the owning scene row", () => {
  const root = selectableNode();
  const mesh = selectableNode(root);
  const grandChild = selectableNode(mesh);
  markViewportSelectionOwner(root, "entity:content/scenes/arena.scene.json:tree");

  assert.equal(resolveViewportSelectionOwnerRowId(grandChild), "entity:content/scenes/arena.scene.json:tree");
});

test("should prefer nearest viewport selection owner", () => {
  const root = markViewportSelectionOwner(selectableNode(), "entity:root");
  const child = markViewportSelectionOwner(selectableNode(root), "entity:child");

  assert.equal(resolveViewportSelectionOwnerRowId(child), "entity:child");
});

test("should ignore non-selectable helper geometry", () => {
  const root = markViewportSelectionOwner(selectableNode(), "entity:root");
  const helper = markViewportNonSelectable(selectableNode(root));

  assert.equal(resolveViewportSelectionOwnerRowId(helper), undefined);
});

function selectableNode(parent: IViewportSelectableNode | null = null): IViewportSelectableNode {
  return { parent, userData: {} };
}
