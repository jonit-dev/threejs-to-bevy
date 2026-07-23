import assert from "node:assert/strict";
import test from "node:test";
import { validateDestructible } from "./physicsValidation.js";
import type { IIrDiagnostic } from "./validate.js";

test("should accept a bounded destructible manifest reference", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateDestructible({ activationBudget: 64, bondStrength: 1.25, cleanupPolicy: "pool", fractureManifest: "fractures/wall.main.json", impactFilter: { layers: ["projectile"], minImpulse: 5 }, maxDepth: 4 }, "world/entities/0/components/Destructible", diagnostics);
  assert.deepEqual(diagnostics, []);
});

test("should reject unsafe references non-finite fields and excessive budgets", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateDestructible({ activationBudget: 257, bondStrength: Number.NaN, cleanupPolicy: "drop", fractureManifest: "../wall.json", impactFilter: { layers: ["bad layer"], minImpulse: -1 }, maxDepth: 9 }, "world/entities/0/components/Destructible", diagnostics);
  assert.deepEqual(new Set(diagnostics.map(({ code }) => code)), new Set([
    "TN_IR_PHYSICS_DESTRUCTIBLE_MANIFEST_INVALID",
    "TN_IR_PHYSICS_DESTRUCTIBLE_BOND_STRENGTH_INVALID",
    "TN_IR_PHYSICS_DESTRUCTIBLE_BUDGET_INVALID",
    "TN_IR_PHYSICS_DESTRUCTIBLE_DEPTH_INVALID",
    "TN_IR_PHYSICS_DESTRUCTIBLE_CLEANUP_INVALID",
    "TN_IR_PHYSICS_DESTRUCTIBLE_IMPACT_FILTER_INVALID",
  ]));
});
