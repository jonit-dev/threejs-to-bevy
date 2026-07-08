import { type IBenchmarkDiagnostic, type IBenchmarkReport } from "./types.js";

const MIN_REPEATS_PER_CONDITION = 3;

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
  }
  return {
    diagnostics,
    ok: diagnostics.length === 0,
  };
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
