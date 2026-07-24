import assert from "node:assert/strict";
import test from "node:test";

import { hasScaffoldProofDiagnostic, isAcceptedScaffoldProofFailure } from "./emittedCommandGate.js";

test("should recognize only structured scaffold proof failures", () => {
  const failedIterate = JSON.stringify({
    code: "TN_ITERATE_FAILED",
    promptCoverage: "fail",
    steps: [{ id: "playtest", status: "pass" }],
    verdicts: { gameplay: "pass", visual: "pass" },
  });
  const unsupportedPlanScaffold = JSON.stringify({
    code: "TN_PLAYTEST_PLAN_ASSERTION_UNSUPPORTED",
    diagnostics: [{
      acceptanceId: "retry-path",
      code: "TN_PLAYTEST_PLAN_ASSERTION_UNSUPPORTED",
      missingCapability: "retry-input",
      severity: "error",
    }],
    filesWritten: [],
    proofEnrollment: {
      enrolledAcceptanceIds: [],
      missingAcceptanceIds: ["retry-path"],
      requiredAcceptanceIds: ["retry-path"],
    },
  });
  assert.equal(isAcceptedScaffoldProofFailure("tn iterate --project . --json", failedIterate), true);
  assert.equal(isAcceptedScaffoldProofFailure("tn playtest --project . --entity player --press KeyW --frames 30 --expect-moved --json", JSON.stringify({ pass: false, schema: "threenative.playtest-summary" })), true);
  assert.equal(isAcceptedScaffoldProofFailure("tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json", unsupportedPlanScaffold), true);
  assert.equal(isAcceptedScaffoldProofFailure("tn build --project . --json", failedIterate), false);
  assert.equal(isAcceptedScaffoldProofFailure("tn playtest scaffold --from-plan artifacts/game-production/plan.json --project . --json", JSON.stringify({ code: "TN_PLAYTEST_PLAN_ASSERTION_UNSUPPORTED" })), false);
  assert.equal(isAcceptedScaffoldProofFailure("tn iterate --project . --json", JSON.stringify({ code: "TN_ITERATE_FAILED", promptCoverage: "fail" })), false);
  assert.equal(isAcceptedScaffoldProofFailure("tn playtest --project . --entity player --press KeyW --frames 30 --expect-moved --json", JSON.stringify({ pass: true, schema: "threenative.playtest-summary" })), false);
  assert.equal(isAcceptedScaffoldProofFailure("tn iterate --project . --json", "not-json"), false);
});

test("should require the quality gate to report proof-theater diagnostics", () => {
  assert.equal(hasScaffoldProofDiagnostic(JSON.stringify({ diagnostics: [{ code: "TN_GAME_EMPTY_SYSTEM_EXPORT" }] })), true);
  assert.equal(hasScaffoldProofDiagnostic(JSON.stringify({ diagnostics: [{ code: "TN_GAMEPLAY_MUTATION_PROOF_MISSING" }] })), true);
  assert.equal(hasScaffoldProofDiagnostic(JSON.stringify({ diagnostics: [{ code: "TN_GAME_UI_STATE_MISSING" }] })), false);
});
