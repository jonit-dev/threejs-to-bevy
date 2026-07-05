import assert from "node:assert/strict";
import test from "node:test";

import type { IUiIr } from "@threenative/ir";

import { traceUiAttachments } from "./ui/attachments.js";

test("should project nameplate above moving entity", () => {
  const ui: IUiIr = {
    schema: "threenative.ui",
    version: "0.1.0",
    root: {
      attachTo: {
        anchor: "top",
        clamp: "screenEdge",
        localOffset: [0, 2, 0],
        target: { kind: "entity", id: "enemy.1" },
      },
      id: "enemy.nameplate",
      kind: "text",
      text: "Scout",
    },
  };
  const camera = { id: "main.camera", viewport: { height: 600, width: 800 } };

  const first = traceUiAttachments(ui, [{ id: "enemy.1", position: [10, 4, 0] }], camera);
  const second = traceUiAttachments(ui, [{ id: "enemy.1", position: [10, 8, 0] }], camera);

  assert.equal(first.projections[0]?.target, "enemy.1");
  assert.equal(first.projections[0]?.screen.x, 410);
  assert.equal(first.projections[0]?.screen.y, 294);
  assert.equal(second.projections[0]?.screen.y, 290);
});
