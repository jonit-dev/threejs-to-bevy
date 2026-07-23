import assert from "node:assert/strict";
import test from "node:test";

import { PHYSICS_DEBUG_CATEGORIES, PHYSICS_DEBUG_EVIDENCE_OWNERS } from "@threenative/ir";
import { expectedPhysicsDebugCategories, validateAdvancedPhysicsDebugEvidence, type AdvancedPhysicsDebugEvidence } from "./advancedPhysicsDebugEvidence.js";

const owner = "advanced-physics-wheels";
const complete = (): AdvancedPhysicsDebugEvidence[] => expectedPhysicsDebugCategories(owner).map((category) => ({
  category,
  id: `${category}:fixture`,
  kind: category === "wheel" ? "sphere" : category === "force" || category === "slip" ? "vector" : category === "suspension" ? "line" : "point",
}));

test("physics debug evidence ownership covers every registry category exactly once", () => {
  assert.deepEqual(Object.keys(PHYSICS_DEBUG_EVIDENCE_OWNERS).sort(), [...PHYSICS_DEBUG_CATEGORIES].sort());
  assert.deepEqual(expectedPhysicsDebugCategories("advanced-physics-aerodynamics"), ["aero", "contact"]);
  assert.deepEqual(expectedPhysicsDebugCategories("advanced-physics-joints"), ["joint-load"]);
});

test("paired physics debug evidence accepts matching registry-owned category, id, and kind coverage", () => {
  assert.deepEqual(validateAdvancedPhysicsDebugEvidence(owner, complete(), complete()), []);
});

test("paired physics debug evidence fails closed for a missing registry category", () => {
  const native = complete().filter((entry) => entry.category !== "wheel");
  assert.ok(validateAdvancedPhysicsDebugEvidence(owner, complete(), native).some((entry) => entry.code === "TN_VERIFY_PHYSICS_DEBUG_CATEGORY_MISSING"));
});

test("paired physics debug evidence fails closed for mismatched primitive identity or kind", () => {
  const native = complete();
  native[0] = { ...native[0]!, kind: "box" };
  assert.ok(validateAdvancedPhysicsDebugEvidence(owner, complete(), native).some((entry) => entry.code === "TN_VERIFY_PHYSICS_DEBUG_EVIDENCE_MISMATCH"));
});
