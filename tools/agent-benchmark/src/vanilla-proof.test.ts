import assert from "node:assert/strict";
import test from "node:test";

import { passedProof } from "./proof-contract.js";
import { validateVanillaProof } from "./vanilla-proof.js";
import { type IBenchmarkRunReport } from "./types.js";

test("should fail page-load-only vanilla proof", () => {
  const diagnostics = validateVanillaProof(run({ proof: undefined }));

  assert.equal(diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_PROOF_MISSING"), true);
});

test("should pass movement threshold when implemented", () => {
  const diagnostics = validateVanillaProof(run({ proof: passedProof("collector") }));

  assert.deepEqual(diagnostics, []);
});

function run(options: { proof: IBenchmarkRunReport["proof"] }): IBenchmarkRunReport {
  return {
    artifacts: {},
    candidate: "/tmp/vanilla",
    condition: "vanilla",
    diagnostics: [],
    generatedAt: "2026-07-07T00:00:00.000Z",
    ok: true,
    promptId: "collector",
    proof: options.proof,
    runId: "vanilla-1",
    schema: "threenative.agent-benchmark-run",
    session: {
      condition: "vanilla",
      humanRubric: { playability: 2, visual: 2 },
      iterationCount: 1,
      promptId: "collector",
      runId: "vanilla-1",
      schema: "threenative.agent-benchmark-session",
      stopReason: "claimed-playable",
      tokenCount: 1000,
      version: 2,
    },
    version: 2,
  };
}
