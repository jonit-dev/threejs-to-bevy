import assert from "node:assert/strict";
import test from "node:test";

import { HierarchyPanel } from "./HierarchyPanel.js";

test("should select a hierarchy row by string id", () => {
  const calls: string[] = [];
  const element = HierarchyPanel({
    onSelectRow: (id) => calls.push(id),
    rows: [{ access: "sourcePersistable", id: "entity:player", label: "player" }],
  });
  const group = Array.isArray(element.props.children) ? element.props.children[0] : element.props.children;
  const button = group.props.children[0];

  button.props.onClick();

  assert.deepEqual(calls, ["entity:player"]);
});
