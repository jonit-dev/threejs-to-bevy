import assert from "node:assert/strict";
import test from "node:test";
import { validateFractureManifest, type IFractureManifest } from "./fractureManifest.js";

function manifest(): IFractureManifest {
  return {
    bonds: [{ health: 100, id: "bond.0-1", impulseThreshold: 40, pieces: ["piece.0", "piece.1"] }],
    budgets: { maxActivePieces: 2, maxDepth: 1, overflowPolicy: "reject-new" },
    id: "wall.main",
    pieces: [
      { activationDepth: 0, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.0", localPosition: [-0.5, 0, 0], massFraction: 0.5 },
      { activationDepth: 1, collider: { halfExtents: [0.5, 0.5, 0.5], kind: "box" }, id: "piece.1", localPosition: [0.5, 0, 0], massFraction: 0.5 },
    ],
    schema: "threenative.fracture-manifest",
    source: { kind: "primitive", seed: 7, sourceHash: `sha256:${"a".repeat(64)}` },
    version: "0.1.0",
  };
}

test("should accept a bounded connected fracture manifest", () => assert.deepEqual(validateFractureManifest(manifest()), []));

test("should reject disconnected pieces invalid mass fractions and excessive budgets", () => {
  const value = manifest();
  value.bonds = [];
  value.pieces[0]!.massFraction = 0.8;
  value.budgets.maxActivePieces = 300;
  const diagnostics = validateFractureManifest(value);
  assert.deepEqual(new Set(diagnostics.map(({ code }) => code)), new Set(["TN_IR_FRACTURE_MASS_SUM", "TN_IR_FRACTURE_DISCONNECTED", "TN_IR_FRACTURE_BUDGET_INVALID"]));
  assert.ok(diagnostics.every(({ path, suggestion }) => path.length > 0 && suggestion !== undefined));
});
