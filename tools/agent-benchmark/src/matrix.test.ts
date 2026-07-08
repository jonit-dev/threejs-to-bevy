import assert from "node:assert/strict";
import test from "node:test";

import { validateRound5Matrix } from "./matrix.js";
import { type IBenchmarkReport } from "./types.js";

test("should reject incomplete round-5 matrix", () => {
  const result = validateRound5Matrix(report({
    threenativeRepeats: 0,
    typedSpecRepeats: 1,
    vanillaRepeats: 0,
  }), { requireTypedSpec: true });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_MATRIX_THREENATIVE_REPEATS_MISSING"), true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_MATRIX_VANILLA_REPEATS_MISSING"), true);
  assert.equal(result.diagnostics.some((diagnostic) => diagnostic.code === "TN_BENCH_MATRIX_TYPED_SPEC_REPEATS_MISSING"), true);
});

test("should accept complete round-5 matrix with typed-spec requirement", () => {
  const result = validateRound5Matrix(report({
    threenativeRepeats: 3,
    typedSpecRepeats: 3,
    vanillaRepeats: 3,
  }), { requireTypedSpec: true });

  assert.equal(result.ok, true);
  assert.deepEqual(result.diagnostics, []);
});

function report(options: { threenativeRepeats: number; typedSpecRepeats: number; vanillaRepeats: number }): IBenchmarkReport {
  return {
    diagnostics: [],
    dialectConfusionFailureCount: 0,
    generatedAt: "2026-07-07T00:00:00.000Z",
    promptSummaries: [{
      behaviorMedian: {
        artifactForensicsCommandCount: null,
        discoveryCommandCount: null,
        engineSourceSearchCommandCount: null,
        iterateCommandCount: null,
        standaloneVerifyCommandCount: null,
      },
      costWeightedTokenRatio: null,
      dialectConfusionFailures: { threenative: 0, vanilla: 0 },
      failedCommandMedian: { threenative: null, vanilla: null },
      iterationMedian: { threenative: null, vanilla: null },
      promptClassification: "continuity",
      promptId: "collector",
      proofBar: {
        requiredAssertions: ["keyboard-movement", "pickup-objective", "win-state", "retry-path"],
        threenativePassed: options.threenativeRepeats > 0,
        typedSpecPassed: options.typedSpecRepeats > 0,
        vanillaPassed: options.vanillaRepeats > 0,
      },
      rawTokenRatio: null,
      repeatCount: {
        threenative: options.threenativeRepeats,
        vanilla: options.vanillaRepeats,
      },
      threenativeMedianCachedInputTokens: null,
      threenativeMedianCostWeightedTokens: null,
      threenativeMedianFailedCommandCount: null,
      threenativeMedianInputTokens: null,
      threenativeMedianIterations: null,
      threenativeMedianOutputTokens: null,
      threenativeMedianTokens: null,
      threenativeMedianToolOutputBytes: null,
      threenativeMedianToolStepCount: null,
      threenativeMedianUncachedInputTokens: null,
      toolOutputMedian: { threenative: null, vanilla: null },
      toolStepMedian: { threenative: null, vanilla: null },
      typedSpecTrial: {
        failedCommandDelta: null,
        identicalAssertionRepeatDelta: null,
        maxSameDiagnosticDelta: null,
        rawTokenRatioToThreeNative: null,
        repeatCount: options.typedSpecRepeats,
        status: options.typedSpecRepeats >= 3 ? "default-candidate" : "insufficient-data",
        summary: "",
        typedSpecMedianFailedCommandCount: null,
        typedSpecMedianIdenticalAssertionRepeats: null,
        typedSpecMedianMaxSameDiagnostic: null,
        typedSpecMedianTokens: null,
        withinFailedCommandBudget: null,
        withinRepeatBudget: options.typedSpecRepeats >= 3,
        withinRetryChainBudget: null,
        withinTokenBudget: null,
      },
      vanillaMedianCachedInputTokens: null,
      vanillaMedianCostWeightedTokens: null,
      vanillaMedianFailedCommandCount: null,
      vanillaMedianInputTokens: null,
      vanillaMedianIterations: null,
      vanillaMedianOutputTokens: null,
      vanillaMedianTokens: null,
      vanillaMedianToolOutputBytes: null,
      vanillaMedianToolStepCount: null,
      vanillaMedianUncachedInputTokens: null,
      withinEqualProofTokenBudget: null,
      withinFailedCommandBudget: null,
      withinHalfX: null,
      withinInstructionAdoptionBudget: null,
      withinRepeatBudget: options.threenativeRepeats >= 3 && options.vanillaRepeats >= 3,
      withinRetryChainBudget: null,
      withinStepBudget: null,
    }],
    runCount: options.threenativeRepeats + options.typedSpecRepeats + options.vanillaRepeats,
    schema: "threenative.agent-benchmark-report",
    typedSpecVerdict: {
      status: options.typedSpecRepeats >= 3 ? "default-candidate" : "insufficient-data",
      summary: "",
      threshold: "typed-spec: equal proof repeats >=3; median tokens <= direct ThreeNative; failed commands ==0; retry chains <=1/0",
    },
    verdict: {
      status: options.threenativeRepeats >= 3 && options.vanillaRepeats >= 3 ? "pass" : "insufficient-data",
      summary: "",
      threshold: "equal-proof: continuity <=1.5x vanilla tokens; beyond-one-shot <=1.0x vanilla tokens; repeats >=3; failed commands ==0; retry chains <=1/0",
    },
    version: 2,
  };
}
