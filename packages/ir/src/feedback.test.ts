import assert from "node:assert/strict";
import test from "node:test";
import { validateFeedbackPresets } from "./feedback.js";
import type { IIrDiagnostic } from "./validate.js";

test("feedback preset validation rejects unbounded particle counts", () => {
  const diagnostics: IIrDiagnostic[] = [];
  validateFeedbackPresets([{ id: "pickup-sparkle", particles: [{ asset: "fx", command: "burst", count: 257, emitter: "spark" }] }], "systems.ir.json/feedbackPresets", diagnostics);
  assert.equal(diagnostics[0]?.code, "TN_IR_FEEDBACK_PARTICLE_COUNT_INVALID");
});
