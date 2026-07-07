import assert from "node:assert/strict";
import test from "node:test";

import { BENCHMARK_PROOF_CONTRACTS, validatePromptProofContracts } from "./proof-contract.js";

test("should require proof assertions for every prompt", async () => {
  const diagnostics = await validatePromptProofContracts({ promptsDir: "prompts" });

  assert.deepEqual(diagnostics, []);
  assert.equal(BENCHMARK_PROOF_CONTRACTS.every((contract) => contract.assertions.length >= 3), true);
});

test("should classify continuity and beyond-one-shot prompts", () => {
  const classifications = new Map(BENCHMARK_PROOF_CONTRACTS.map((contract) => [contract.promptId, contract.classification]));

  assert.equal(classifications.get("collector"), "continuity");
  assert.equal(classifications.get("lane-runner"), "continuity");
  assert.equal(classifications.get("checkpoint-race"), "beyond-one-shot");
  assert.equal(classifications.get("physics-knockdown"), "beyond-one-shot");
});
