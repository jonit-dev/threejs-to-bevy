import assert from "node:assert/strict";
import test from "node:test";

import type { IUiIr } from "@threenative/ir";

import { traceUiToastQueue } from "./ui/affordances.js";

test("should coalesce duplicate toast queue entries", () => {
  const ui: IUiIr = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: { id: "hud", kind: "column" },
    toastQueues: [
      {
        coalesce: "count",
        durationMs: 2500,
        id: "combat",
        maxVisible: 1,
        stack: "up",
        toasts: [
          { id: "hit.1", key: "hit", priority: 2, text: "Hit!" },
          { id: "hit.2", key: "hit", priority: 2, text: "Hit!" },
        ],
      },
    ],
  };

  assert.deepEqual(traceUiToastQueue(ui, "combat"), {
    coalesced: [{ count: 2, id: "hit.1", text: "Hit!" }],
    queue: "combat",
    visible: [{ count: 2, id: "hit.1", text: "Hit!" }],
  });
});
