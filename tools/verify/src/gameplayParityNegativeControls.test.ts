import assert from "node:assert/strict";
import test from "node:test";

import { expectedNegativeControlCodes, runGameplayParityNegativeControls } from "./gameplayParityNegativeControls.js";

test("should catch every intentional gameplay parity drift fixture", () => {
  const result = runGameplayParityNegativeControls();
  const codes = new Set(result.diagnostics.map((diagnostic) => diagnostic.code));

  for (const expectedCode of expectedNegativeControlCodes()) {
    assert.equal(codes.has(expectedCode), true, `missing ${expectedCode}`);
  }
});

test("should keep negative controls out of release artifacts", () => {
  const result = runGameplayParityNegativeControls();
  const artifactText = JSON.stringify(result.releaseArtifactCandidate);

  assert.equal(result.fixturePaths.every((path) => path.startsWith("synthetic://gameplay-parity-negative-controls/")), true);
  assert.equal(artifactText.includes("synthetic://gameplay-parity-negative-controls/"), false);
});
