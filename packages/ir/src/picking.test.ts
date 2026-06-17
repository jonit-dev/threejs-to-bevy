import assert from "node:assert/strict";
import test from "node:test";

import { validatePickingIr, type IPickingIr } from "./picking.js";

test("should validate drag picking targets when payload kinds are declared", () => {
  const diagnostics = validatePickingIr({
    dragTargets: [
      {
        draggable: true,
        id: "ui.inventory.item",
        payloadKinds: ["inventory.item"],
        targetKind: "ui",
        zIndex: 20,
      },
      {
        acceptedPayloadKinds: ["inventory.item"],
        dropZone: true,
        id: "mesh.chest",
        targetKind: "mesh",
        zIndex: 0,
      },
    ],
    schema: "threenative.picking",
    version: "0.1.0",
  });

  assert.deepEqual(diagnostics, []);
});

test("should reject drop zone with unsupported payload kind", () => {
  const picking: IPickingIr = {
    dragTargets: [
      {
        draggable: true,
        id: "ui.inventory.coin",
        payloadKinds: ["currency.coin"],
        targetKind: "ui",
      },
      {
        acceptedPayloadKinds: ["inventory.item"],
        dropZone: true,
        id: "mesh.chest",
        targetKind: "mesh",
      },
    ],
    schema: "threenative.picking",
    version: "0.1.0",
  };

  const diagnostics = validatePickingIr(picking);

  assert.equal(diagnostics[0]?.code, "TN_PICKING_DROP_PAYLOAD_UNSUPPORTED");
  assert.equal(diagnostics[0]?.path, "picking.ir.json/dragTargets/1/acceptedPayloadKinds");
  assert.match(diagnostics[0]?.suggestion ?? "", /matching payloadKinds/);
});
