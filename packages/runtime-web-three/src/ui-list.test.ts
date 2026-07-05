import assert from "node:assert/strict";
import test from "node:test";
import type { IUiIr } from "@threenative/ir";

import { traceUiVirtualListRange } from "./ui/list.js";

test("should report deterministic visible item range", () => {
  const ui: IUiIr = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      id: "inventory",
      kind: "column",
      virtualRange: { buffer: 1, itemCount: 200, itemExtent: 24, viewportExtent: 96 },
      children: Array.from({ length: 200 }, (_, index) => ({
        id: `item.${index}`,
        kind: "button",
        label: `Item ${index}`,
        action: "InspectItem",
      })),
    },
  };

  assert.deepEqual(traceUiVirtualListRange(ui, "inventory", 120), {
    endIndex: 9,
    endItem: "item.9",
    node: "inventory",
    startIndex: 4,
    startItem: "item.4",
  });
});
