import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

test("prescriptive fixes resolve to distributed docs without repository implementation paths", () => {
  const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  for (const entry of PRESCRIPTIVE_DIAGNOSTIC_CODES) {
    const fix = entry.fix;
    if (fix.docs !== undefined) {
      assert.equal(existsSync(resolve(repositoryRoot, fix.docs)), true, `${entry.code} docs pointer must exist`);
      assert.equal(fix.docs.startsWith("packages/"), false);
    }
    const serialized = JSON.stringify(fix);
    assert.equal(serialized.includes("packages/"), false, `${entry.code} must not expose package implementation paths`);
  }
});
