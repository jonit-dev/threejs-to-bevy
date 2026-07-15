import assert from "node:assert/strict";
import test from "node:test";

import type { IUiIr } from "@threenative/ir";

import { traceUiEffects } from "./ui/effects.js";

test("should report active selected glow strategy", () => {
  const ui: IUiIr = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      children: [
        {
          effects: [
            {
              color: "#66ccff",
              fallback: "shadow",
              id: "selected.glow",
              kind: "glow",
              radius: 12,
              trigger: "selected",
            },
          ],
          id: "inventory.slot.0",
          kind: "button",
          label: "Crystal Key",
        },
      ],
      id: "inventory",
      kind: "column",
    },
  };

  assert.deepEqual(traceUiEffects(ui, ["selected"]), {
    effects: [
      {
        effect: "selected.glow",
        kind: "glow",
        node: "inventory.slot.0",
        state: "selected",
        strategy: "shadow",
      },
    ],
  });
});
