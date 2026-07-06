import assert from "node:assert/strict";
import test from "node:test";

import { authoringDiagnostic, PRESCRIPTIVE_DIAGNOSTIC_CODES, prescriptiveFixForCode } from "./index.js";

test("prescriptive diagnostic registry entries all provide actionable fixes", () => {
  assert.equal(PRESCRIPTIVE_DIAGNOSTIC_CODES.length, 15);

  for (const entry of PRESCRIPTIVE_DIAGNOSTIC_CODES) {
    const fix = prescriptiveFixForCode(entry.code);
    assert.equal(fix, entry.fix);
    assert.notEqual(entry.evidence.trim(), "");
    assert.notEqual(fix?.instruction.trim(), "");
    if (entry.snippetKind === "json") {
      assert.doesNotThrow(() => JSON.parse(fix?.snippet ?? ""));
    }
    if (entry.snippetKind === "typescript") {
      assert.match(fix?.snippet ?? "", /\b(?:import|export)\b/);
    }
  }
});

test("authoring diagnostics attach registered fixes by code", () => {
  const diagnostic = authoringDiagnostic({
    code: "TN_AUTHORING_REF_MISSING",
    file: "content/scenes/arena.scene.json",
    message: "No entity with id 'player-kartt' exists.",
    path: "/entities/0/components/Camera/target",
    suggestion: "Did you mean 'player-kart'?",
  });

  assert.equal(diagnostic.fix?.instruction.includes("Create the referenced durable declaration"), true);
  assert.equal(diagnostic.fix?.docs, "docs/contracts/authoring-mcp.md");
});
