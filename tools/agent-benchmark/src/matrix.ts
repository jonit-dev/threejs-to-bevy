import { type IBenchmarkDiagnostic, type IBenchmarkReport } from "./types.js";

const MIN_REPEATS_PER_CONDITION = 3;
const OFF_RECIPE_GATE_PROMPTS = new Set(["grid-push-puzzle", "wave-defense", "turn-based-tactics"]);

export interface IMatrixValidationOptions {
  requireTypedSpec?: boolean;
}

export interface IMatrixValidationResult {
  diagnostics: IBenchmarkDiagnostic[];
  ok: boolean;
}

export function validateRound5Matrix(report: IBenchmarkReport, options: IMatrixValidationOptions = {}): IMatrixValidationResult {
  const diagnostics: IBenchmarkDiagnostic[] = [];
  if (report.promptSummaries.length === 0) {
    diagnostics.push({
      code: "TN_BENCH_MATRIX_PROMPTS_MISSING",
      message: "Round-5 matrix has no prompt summaries.",
      severity: "error",
      suggestedFix: "Aggregate scored round-5 run reports before validating the matrix.",
    });
  }
  for (const summary of report.promptSummaries) {
    if (summary.repeatCount.threenative < MIN_REPEATS_PER_CONDITION) {
      diagnostics.push(missingRepeatsDiagnostic(
        "TN_BENCH_MATRIX_THREENATIVE_REPEATS_MISSING",
        summary.promptId,
        "direct ThreeNative",
        summary.repeatCount.threenative,
      ));
    }
    if (summary.repeatCount.vanilla < MIN_REPEATS_PER_CONDITION) {
      diagnostics.push(missingRepeatsDiagnostic(
        "TN_BENCH_MATRIX_VANILLA_REPEATS_MISSING",
        summary.promptId,
        "vanilla",
        summary.repeatCount.vanilla,
      ));
    }
    if (options.requireTypedSpec === true && summary.typedSpecTrial.repeatCount < MIN_REPEATS_PER_CONDITION) {
      diagnostics.push(missingRepeatsDiagnostic(
        "TN_BENCH_MATRIX_TYPED_SPEC_REPEATS_MISSING",
        summary.promptId,
        "typed-spec",
        summary.typedSpecTrial.repeatCount,
      ));
    }
    if (summary.proofBar.threenativePassed !== true) {
      diagnostics.push(missingProofDiagnostic("TN_BENCH_MATRIX_THREENATIVE_PROOF_MISSING", summary.promptId, "direct ThreeNative"));
    }
    if (summary.proofBar.vanillaPassed !== true) {
      diagnostics.push(missingProofDiagnostic("TN_BENCH_MATRIX_VANILLA_PROOF_MISSING", summary.promptId, "vanilla"));
    }
    if (options.requireTypedSpec === true && summary.proofBar.typedSpecPassed !== true) {
      diagnostics.push(missingProofDiagnostic("TN_BENCH_MATRIX_TYPED_SPEC_PROOF_MISSING", summary.promptId, "typed-spec"));
    }
    if (OFF_RECIPE_GATE_PROMPTS.has(summary.promptId)) {
      requireBudget(diagnostics, summary.withinEqualProofTokenBudget, "TN_BENCH_MATRIX_RAW_TOKEN_RATIO_FAILED", summary.promptId, "raw token ratio must be <=1.0x vanilla");
      requireBudget(diagnostics, summary.withinCostWeightedTokenBudget, "TN_BENCH_MATRIX_COST_TOKEN_RATIO_FAILED", summary.promptId, "cost-weighted token ratio must be <=1.0x vanilla");
      requireBudget(diagnostics, summary.withinPerRunBudget, "TN_BENCH_MATRIX_PER_RUN_CAP_FAILED", summary.promptId, "one or more sessions exceeded a per-run cap");
      requireBudget(diagnostics, summary.withinFailedCommandBudget, "TN_BENCH_MATRIX_FAILED_COMMAND_MEDIAN_FAILED", summary.promptId, "ThreeNative failed-command median must be zero");
      requireBudget(diagnostics, summary.withinStepBudget, "TN_BENCH_MATRIX_TOOL_STEP_MEDIAN_FAILED", summary.promptId, "ThreeNative tool-step median must be <=15");
      requireBudget(diagnostics, summary.withinRetryChainBudget, "TN_BENCH_MATRIX_RETRY_CHAIN_FAILED", summary.promptId, "ThreeNative retry-chain medians exceeded their limits");
      requireBudget(diagnostics, summary.withinChurnMedianBudget, "TN_BENCH_MATRIX_CHURN_MEDIAN_FAILED", summary.promptId, "ThreeNative engine-source, standalone-verify, and artifact-forensics medians must be zero");
      requireBudget(diagnostics, summary.withinRubricBudget, "TN_BENCH_MATRIX_RUBRIC_FAILED", summary.promptId, "both conditions require playability and visual medians >=2");
    }
  }
  return {
    diagnostics,
    ok: diagnostics.length === 0,
  };
}

function requireBudget(diagnostics: IBenchmarkDiagnostic[], value: boolean | null, code: string, promptId: string, requirement: string): void {
  if (value === true) return;
  diagnostics.push({ code, message: `${promptId}: ${requirement}; observed ${value === null ? "missing data" : "failure"}.`, severity: "error" });
}

function missingRepeatsDiagnostic(code: string, promptId: string, condition: string, actual: number): IBenchmarkDiagnostic {
  return {
    code,
    message: `${promptId}: ${condition} has ${actual} proof-passing repeat(s); ${MIN_REPEATS_PER_CONDITION} required.`,
    severity: "error",
    suggestedFix: `Run fresh ${condition} agent sessions under ROUND-5-PROTOCOL.md and score each candidate.`,
  };
}

function missingProofDiagnostic(code: string, promptId: string, condition: string): IBenchmarkDiagnostic {
  return {
    code,
    message: `${promptId}: ${condition} has no proof-passing run under the round-5 equal-proof contract.`,
    severity: "error",
    suggestedFix: "Fix the candidate or rerun the condition until the prompt proof contract passes.",
  };
}
